import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useManagerStore } from '../store/managerStore';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { fetchApi, getWebSocketUrl } from '../lib/api';
import { NotificationPermissionManager } from '../lib/NotificationPermissionManager';
import { SoundAlertEngine } from '../lib/SoundAlertEngine';
import { NotificationDeduplicator } from '../lib/NotificationDeduplicator';
import { Bell, Volume2, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

// ── SYNTHETIC / TEST ORDER SAFEGUARD ──────────────────────────────────
// Prevent test/mock/synthetic orders from ever sounding sirens or popping alerts
function isSyntheticOrder(orderId?: string, data?: any): boolean {
  const id = String(orderId || data?.id || data?.orderId || '').toLowerCase();
  if (
    id.startsWith('test_') ||
    id.startsWith('mock_') ||
    id.startsWith('synthetic_') ||
    id.startsWith('dummy_') ||
    id.startsWith('online_test_') ||
    id.startsWith('ord_test_')
  ) {
    return true;
  }
  if (data?.isTest === true) return true;
  if (data?.customerName && /^(test|mock|synthetic|dummy|fake|archival test|idempotency test)/i.test(data.customerName)) return true;
  if (data?.orderNumber && /test/i.test(String(data.orderNumber))) return true;
  if (data?.orderSource && /test|mock/i.test(String(data.orderSource))) return true;
  return false;
}

export default function PushNotificationManager() {
  const navigate = useNavigate();
  const { user, managerProfile, activeBranchId } = useManagerStore();
  const [showPromptBanner, setShowPromptBanner] = useState(false);
  const isRegisteredRef = useRef(false);
  const registeredTokenRef = useRef<string | null>(null);

  // Create Android Notification Channels for High-Urgency Orders
  const createChannels = useCallback(async () => {
    await SoundAlertEngine.initAndroidNotificationChannels();
  }, []);

  // 1. Evaluate Permission State on Auth
  useEffect(() => {
    if (!user || !managerProfile) return;

    NotificationPermissionManager.checkPermission().then((info) => {
      if (info.state === 'NOT_DETERMINED') {
        setShowPromptBanner(true);
      } else if (info.state === 'GRANTED') {
        registerToken();
      }
    });
  }, [user, managerProfile]);

  // BroadcastChannel listener for Service Worker background alerts
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    if (!user || !managerProfile) return;

    const channel = new BroadcastChannel('olive_pizza_notifications');
    channel.onmessage = (event) => {
      if (!user || !managerProfile) return;
      const data = event.data || {};

      // Strict Franchise Isolation: Ignore alarms from other franchises
      const normF = (id?: string) => (id || '').trim().toLowerCase().replace(/^fra_/, '');
      if (data.franchiseId && managerProfile.franchiseId && normF(data.franchiseId) !== normF(managerProfile.franchiseId) && managerProfile.franchiseId !== 'all') {
        return;
      }
      // Strict Branch Isolation: Ignore alarms from other branches
      const effectiveBranch = activeBranchId || managerProfile.branchId || '';
      if (data.branchId && effectiveBranch !== 'all' && data.branchId !== effectiveBranch) {
        return;
      }

      if (data.type === 'START_ALERT') {
        const orderId = data.orderId;
        if (isSyntheticOrder(orderId, data)) return;
        const dedupKey = `NEW_ORDER:${orderId || Date.now()}`;
        if (!orderId || NotificationDeduplicator.shouldProcess(dedupKey)) {
          SoundAlertEngine.startContinuousAlarm('new_order');
        }
      } else if (data.type === 'ORDER_DELIVERED') {
        const orderId = data.orderId;
        const dedupKey = `ORDER_DELIVERED:${orderId || Date.now()}`;
        if (!orderId || NotificationDeduplicator.shouldProcess(dedupKey)) {
          SoundAlertEngine.playOrderDelivered();
        }
      } else if (data.type === 'STOP_ALERT') {
        SoundAlertEngine.stopAlarm();
      }
    };
    return () => {
      channel.close();
    };
  }, [user, managerProfile, activeBranchId]);

  // 2. Token Registration (Idempotent, role & branch scoped)
  const registerToken = useCallback(async () => {
    if (isRegisteredRef.current || !user) return;
    try {
      // Check if Electron
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const electronToken = `desktop_electron_${user.uid}_${navigator.userAgent.slice(0, 20)}`;
        await fetchApi('/api/notifications/token', {
          method: 'POST',
          body: JSON.stringify({
            token: electronToken,
            deviceId: `electron_${user.uid}`,
            platform: 'electron',
            browser: 'electron',
            deviceName: 'Restaurant Management Desktop (Electron)',
            appName: 'restaurant',
            role: 'restaurant_manager',
            branchId: activeBranchId || managerProfile?.branchId || '',
            franchiseId: managerProfile?.franchiseId || ''
          })
        });
        registeredTokenRef.current = electronToken;
        isRegisteredRef.current = true;
        return;
      }

      // Native Capacitor on Android / iOS
      if (Capacitor.isNativePlatform()) {
        await createChannels();

        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt' || permStatus.receive === ('prompt-with-rationale' as any)) {
          permStatus = await PushNotifications.requestPermissions();
        }
        if (permStatus.receive !== 'granted') {
          console.warn('[Restaurant PushManager] Native push permission not granted');
          return;
        }

        await PushNotifications.removeAllListeners();

        PushNotifications.addListener('registration', async (pushToken) => {
          if (pushToken.value) {
            await fetchApi('/api/notifications/token', {
              method: 'POST',
              body: JSON.stringify({
                token: pushToken.value,
                platform: Capacitor.getPlatform(),
                deviceName: `${Capacitor.getPlatform().toUpperCase()} Kitchen Terminal`,
                appName: 'restaurant',
                role: 'restaurant_manager',
                branchId: activeBranchId || managerProfile?.branchId || '',
                franchiseId: managerProfile?.franchiseId || ''
              })
            }).catch(() => {});
            registeredTokenRef.current = pushToken.value;
            isRegisteredRef.current = true;
          }
        });

        PushNotifications.addListener('registrationError', (error) => {
          console.error('[Restaurant PushManager] Registration error:', error);
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('[Restaurant PushManager] Push received in foreground:', notification);
          const data = (notification.data || {}) as Record<string, any>;
          const normType = String(data.type || data.notificationType || '').toUpperCase();
          const orderId = String(data.orderId || data.order_id || data.id || '');
          const status = String(data.status || '').toLowerCase();

          if (normType === 'ORDER_DELIVERED' || status === 'delivered') {
            const dedupKey = `ORDER_DELIVERED:${orderId || Date.now()}`;
            if (NotificationDeduplicator.shouldProcess(dedupKey)) {
              SoundAlertEngine.playOrderDelivered();
              toast.success(notification.body || notification.title || 'Order Delivered Successfully!');
            }
          } else if (
            normType === 'NEW_ORDER' ||
            normType === 'ORDER_CREATED' ||
            status === 'pending' ||
            status === 'pending_acceptance' ||
            (!normType && !status)
          ) {
            if (isSyntheticOrder(orderId, data)) return;
            const dedupKey = `NEW_ORDER:${orderId || Date.now()}`;
            if (NotificationDeduplicator.shouldProcess(dedupKey)) {
              SoundAlertEngine.startContinuousAlarm('new_order');
              toast.success(`🍕 New incoming order #${orderId ? orderId.slice(-6).toUpperCase() : 'NEW'}!`, {
                duration: 5000,
                id: orderId ? `toast-${orderId}` : undefined
              });
            }
          } else {
            SoundAlertEngine.playSound('soft_pop');
          }
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          console.log('[Restaurant PushManager] Notification tapped:', action);
          SoundAlertEngine.stopAlarm();
          const data = (action.notification?.data || {}) as Record<string, any>;
          const orderId = data.orderId || data.order_id || data.id;
          if (orderId) {
            navigate(`/live-orders?orderId=${encodeURIComponent(orderId)}`);
          } else {
            navigate('/live-orders');
          }
        });

        await PushNotifications.register();
        return;
      }

      // Web Push via Service Worker & Firebase Messaging
      if ('serviceWorker' in navigator && 'Notification' in window && Notification.permission === 'granted') {
        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(() => null);
        const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
        const { app } = await import('../lib/firebase');
        const supported = await isSupported().catch(() => false);
        if (supported) {
          const messaging = getMessaging(app);
          const currentToken = await getToken(messaging, {
            vapidKey: 'BDfxvZSqSw6Es3dvXz4VZMwjNFKMCCfRSgdCVty3rfqqBZ6AAWFlZ2EwWQR8ltp6DRMTUKOmH9Rlu0fjCziOKDk',
            serviceWorkerRegistration: swReg || undefined
          }).catch(() => null);

          if (currentToken) {
            await fetchApi('/api/notifications/token', {
              method: 'POST',
              body: JSON.stringify({
                token: currentToken,
                platform: 'web',
                browser: navigator.userAgent,
                deviceName: navigator.platform || 'Web Browser',
                appName: 'restaurant',
                role: 'restaurant_manager',
                branchId: activeBranchId || managerProfile?.branchId || '',
                franchiseId: managerProfile?.franchiseId || ''
              })
            });
            registeredTokenRef.current = currentToken;
            isRegisteredRef.current = true;
          }
        }
      }
    } catch (err: any) {
      console.warn('[Restaurant PushManager] Token registration warning:', err.message);
    }
  }, [user, activeBranchId, managerProfile, createChannels]);

  // Handle Electron desktop notification tap to deep link directly to order
  useEffect(() => {
    const desktop = (window as any).restaurantDesktop || (window as any).electronAPI;
    if (desktop && typeof desktop.onNotificationClick === 'function') {
      const unsub = desktop.onNotificationClick((data: any) => {
        console.log('[Restaurant PushManager] Desktop native notification clicked:', data);
        SoundAlertEngine.stopAlarm();
        const orderId = data?.orderId;
        if (orderId) {
          navigate(`/live-orders?orderId=${encodeURIComponent(orderId)}`);
        } else {
          navigate('/live-orders');
        }
      });
      return () => {
        if (typeof unsub === 'function') unsub();
      };
    }
  }, [navigate]);

  // Deregister token on logout
  useEffect(() => {
    if (!user && isRegisteredRef.current) {
      const token = registeredTokenRef.current;
      if (token) {
        fetchApi('/api/notifications/token/deregister', {
          method: 'POST',
          body: JSON.stringify({ token })
        }).catch(() => {});
      }
      registeredTokenRef.current = null;
      isRegisteredRef.current = false;
    }
  }, [user]);

  // 3. User clicks "Enable Kitchen Alerts"
  const handleEnablePermission = async () => {
    SoundAlertEngine.unlockAudio();
    SoundAlertEngine.playSound('test');
    const res = await NotificationPermissionManager.requestPermission();
    setShowPromptBanner(false);

    if (res.state === 'GRANTED') {
      toast.success('Kitchen alert notifications & sound enabled!');
      await registerToken();
    } else if (res.state === 'BLOCKED') {
      toast.error('Notifications blocked by browser. Please enable them in browser settings.');
    }
  };

  // 4. Realtime Listener for New Orders in this branch
  useEffect(() => {
    if (!user || !managerProfile) {
      SoundAlertEngine.stopAlarm();
      return;
    }
    const branchId = activeBranchId || managerProfile.branchId || '';
    const profileFranchiseId = managerProfile.franchiseId;

    const q = query(
      collection(db, 'orders'),
      where('branchId', '==', branchId),
      where('status', 'in', ['pending', 'pending_acceptance'])
    );

    let isInitialSnapshot = true;
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (isInitialSnapshot) {
        isInitialSnapshot = false;
        snapshot.docs.forEach((doc) => {
          NotificationDeduplicator.record(`NEW_ORDER:${doc.id}`);
        });
        return;
      }
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const order = { id: change.doc.id, ...change.doc.data() } as any;

          // ── SYNTHETIC / TEST ORDER SAFEGUARD ──────────────────────────────────
          if (isSyntheticOrder(order.id, order)) {
            return;
          }

          // Strict Franchise Isolation: Ignore alarms from other franchises
          const normF = (id?: string) => (id || '').trim().toLowerCase().replace(/^fra_/, '');
          if (profileFranchiseId && order.franchiseId && normF(order.franchiseId) !== normF(profileFranchiseId) && profileFranchiseId !== 'all') {
            return;
          }

          const eventId = `NEW_ORDER:${order.id}`;

          // Check deduplication
          if (NotificationDeduplicator.shouldProcess(eventId)) {
            // Trigger emergency audio chime loop
            SoundAlertEngine.startContinuousAlarm('new_order');

            // Trigger Electron native notification if available
            if (typeof window !== 'undefined' && (window as any).electronAPI?.showNativeNotification) {
              (window as any).electronAPI.showNativeNotification({
                title: `🍕 NEW ORDER #${order.dailyOrderNumber || order.orderNumber || order.id.slice(-6).toUpperCase()}`,
                body: `₹${order.finalTotal || order.totalAmount} • ${order.items?.length || 1} items • ${order.paymentMethod || 'COD'}`,
                orderId: order.id
              });
            }

            toast.success(`🍕 New incoming order #${order.dailyOrderNumber || order.orderNumber || order.id.slice(-6).toUpperCase()}!`, {
              duration: 5000,
              id: `toast-${order.id}`
            });
          }
        }
      });
    }, (err) => {
      console.warn('[Restaurant PushManager] Realtime listener error:', err);
    });

    return () => {
      SoundAlertEngine.stopAlarm();
      unsubscribe();
    };
  }, [user, managerProfile, activeBranchId]);

  // 4b. Resilient WebSocket listener with Monotonic Sequence Sync for dropped Wi-Fi
  useEffect(() => {
    if (!user || !managerProfile) return;
    const branchId = activeBranchId || managerProfile.branchId || '';
    const franchiseId = managerProfile.franchiseId || '';
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let isDisposed = false;
    let lastSeq = 0;

    function connect() {
      if (isDisposed) return;
      try {
        const wsUrl = `${getWebSocketUrl()}?branchId=${encodeURIComponent(branchId)}&franchiseId=${encodeURIComponent(franchiseId)}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('[Restaurant PushManager] WS connected for critical order alerts');
          // Register branch
          ws?.send(JSON.stringify({
            type: 'register_branch',
            branchId,
            franchiseId
          }));
          // If we reconnected with an existing sequence number, request missed events
          if (lastSeq > 0) {
            ws?.send(JSON.stringify({
              type: 'sync_request',
              branchId,
              franchiseId,
              lastSequence: lastSeq
            }));
          }
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.seq && typeof msg.seq === 'number') {
              lastSeq = Math.max(lastSeq, msg.seq);
            }

            // Handle sync_response replay
            if (msg.type === 'sync_response' && Array.isArray(msg.data?.missedEvents)) {
              for (const missed of msg.data.missedEvents) {
                if (missed.type === 'order.created' && missed.data) {
                  if (isSyntheticOrder(missed.data.orderId, missed.data)) continue;
                  const dedupKey = `NEW_ORDER:${missed.data.orderId}`;
                  if (NotificationDeduplicator.shouldProcess(dedupKey)) {
                    SoundAlertEngine.startContinuousAlarm('new_order');
                    toast.success(`🍕 New incoming order #${missed.data.orderId.slice(-6).toUpperCase()}!`, {
                      duration: 5000,
                      id: `toast-${missed.data.orderId}`
                    });
                  }
                }
              }
              if (typeof msg.data?.currentSeq === 'number') {
                lastSeq = Math.max(lastSeq, msg.data.currentSeq);
              }
            }

            // Handle live order.created event
            if (msg.type === 'order.created' && msg.data) {
              if (!isSyntheticOrder(msg.data.orderId, msg.data)) {
                const dedupKey = `NEW_ORDER:${msg.data.orderId}`;
                if (NotificationDeduplicator.shouldProcess(dedupKey)) {
                  SoundAlertEngine.startContinuousAlarm('new_order');
                  toast.success(`🍕 New incoming order #${msg.data.orderId.slice(-6).toUpperCase()}!`, {
                    duration: 5000,
                    id: `toast-${msg.data.orderId}`
                  });
                }
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          if (!isDisposed) {
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch (err) {
        if (!isDisposed) {
          reconnectTimeout = setTimeout(connect, 5000);
        }
      }
    }

    connect();

    return () => {
      isDisposed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, [user, managerProfile, activeBranchId]);

  if (!user || !managerProfile) {
    return null;
  }

  return (
    <>
      {/* Educational Permission Banner */}
      {showPromptBanner && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 bg-slate-900/95 backdrop-blur-md border border-amber-500/40 rounded-2xl p-4 shadow-2xl shadow-amber-500/10 text-white animate-in slide-in-from-bottom-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-amber-300">Enable Urgent Kitchen Alerts</h4>
                <button 
                  onClick={() => setShowPromptBanner(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Allow notifications and audio so your kitchen never misses an incoming order during peak rush.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handleEnablePermission}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
                >
                  <Volume2 className="w-3.5 h-3.5" /> Enable Sound & Alerts
                </button>
                <button
                  onClick={() => setShowPromptBanner(false)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
