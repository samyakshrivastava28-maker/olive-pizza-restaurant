import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useManagerStore } from '../store/managerStore';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { fetchApi, getWebSocketUrl } from '../lib/api';
import { NotificationPermissionManager } from '../lib/NotificationPermissionManager';
import { SoundAlertEngine } from '../lib/SoundAlertEngine';
import { NotificationDeduplicator } from '../lib/NotificationDeduplicator';
import { Bell, Volume2, VolumeX, CheckCircle, X, ShoppingBag, Phone, MapPin, AlertTriangle, Navigation, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

// Format raw order data (from FCM, WebSocket, or Firestore) into complete canonical alert model
function formatOrderForAlert(raw: any, id: string) {
  const items = Array.isArray(raw.items) ? raw.items : [];
  const pricing = raw.pricing || {
    subtotal: Number(raw.subtotal || raw.subTotal || 0),
    packagingFee: Number(raw.packagingFee || raw.packaging_fee || 0),
    deliveryFee: Number(raw.deliveryFee || raw.delivery_fee || 0),
    tax: Number(raw.tax || raw.taxAmount || raw.tax_amount || 0),
    discount: Number(raw.discount || raw.discountAmount || raw.discount_amount || 0),
    total: Number(raw.finalTotal || raw.totalAmount || raw.total_amount || raw.total || 0),
  };

  const isPaid = (raw.payment?.status || raw.paymentStatus || raw.payment_status || '').toUpperCase() === 'PAID' ||
                 (raw.payment?.method || raw.paymentMethod || '').toUpperCase() === 'PAID' ||
                 ((raw.payment?.method || raw.paymentMethod || '').toUpperCase() !== 'COD' && (raw.paymentStatus || '').toUpperCase() === 'SUCCESS');

  const grandTotal = Number(pricing.total || raw.finalTotal || raw.totalAmount || 0);
  const cashToCollect = isPaid ? 0 : (raw.payment?.cashToCollect !== undefined ? Number(raw.payment.cashToCollect) : grandTotal);

  const customer = raw.customer || {
    name: raw.customerName || raw.customer_name || 'Customer',
    phone: raw.customerPhone || raw.contactPhone || raw.phone || '',
    address: typeof raw.deliveryAddress === 'string' ? raw.deliveryAddress : (raw.deliveryAddress?.addressLine || 'Pickup / Dine-In'),
    instructions: raw.deliveryInstructions || raw.customerNotes || raw.notes || raw.instructions || '',
    lat: raw.deliveryAddress?.coordinates?.lat || raw.lat || raw.customer?.lat,
    lng: raw.deliveryAddress?.coordinates?.lng || raw.lng || raw.customer?.lng
  };

  return {
    id: id || raw.id || raw.orderId,
    orderNumber: raw.orderNumber || raw.dailyOrderNumber || (id ? id.slice(-6).toUpperCase() : 'NEW'),
    orderType: raw.orderType || raw.order_type || 'delivery',
    customer,
    items,
    pricing,
    payment: {
      method: raw.payment?.method || raw.paymentMethod || 'COD',
      status: isPaid ? 'PAID' : 'PENDING',
      cashToCollect
    },
    timing: raw.timing || raw.orderTiming || 'ASAP',
    timestamp: raw.timestamp || new Date().toISOString()
  };
}

export default function PushNotificationManager() {
  const navigate = useNavigate();
  const { user, managerProfile, activeBranchId, updateOrderStatus } = useManagerStore();
  const [showPromptBanner, setShowPromptBanner] = useState(false);
  const [newOrderAlert, setNewOrderAlert] = useState<any | null>(null);
  const isRegisteredRef = useRef(false);
  const registeredTokenRef = useRef<string | null>(null);

  // Create Android Notification Channels for High-Urgency Orders
  const createChannels = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      // 1. Delete legacy channels to clear any cached silent/corrupted channel settings
      await PushNotifications.deleteChannel({ id: 'olive_order_new' }).catch(() => {});

      // 2. Urgent Incoming Order Channel (v3 Alarm) -> new_order.mp3
      await PushNotifications.createChannel({
        id: 'olive_order_alarm_v3',
        name: 'Urgent Order Alarms (v3)',
        description: 'Hardware-level incoming order alarms. Plays continuous chime through alarm audio stream.',
        importance: 5, // MAX importance (heads-up banner + audio)
        visibility: 1, // Public on lockscreen
        vibration: true,
        sound: 'new_order',
      });

      // 2b. Backward compatibility channel (v2)
      await PushNotifications.createChannel({
        id: 'olive_order_new_v2',
        name: 'New Orders Alarm (v2)',
        description: 'Critical incoming order alerts. Wakes device and sounds kitchen alarm.',
        importance: 5, // MAX importance (heads-up banner + audio)
        visibility: 1, // Public on lockscreen
        vibration: true,
        sound: 'new_order',
      });

      // 3. Order Delivered / Completed Channel (v2) -> order_delivered.mp3
      await PushNotifications.createChannel({
        id: 'olive_order_completed_v2',
        name: 'Order Delivered / Completed (v2)',
        description: 'Delivered and completed order notifications. Plays celebratory chime.',
        importance: 4, // HIGH importance
        visibility: 1,
        vibration: true,
        sound: 'order_delivered',
      });

      // 4. System Announcements Channel
      await PushNotifications.createChannel({
        id: 'olive_system',
        name: 'System Alerts',
        description: 'System announcements and management updates',
        importance: 4,
        visibility: 1,
        vibration: true,
        sound: 'system_alert',
      });
    } catch (e) {
      console.warn('[Restaurant PushManager] Channel creation notice:', e);
    }
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
      if (data.franchiseId && managerProfile.franchiseId && data.franchiseId !== managerProfile.franchiseId) {
        return;
      }
      // Strict Branch Isolation: Ignore alarms from other branches
      const effectiveBranch = activeBranchId || managerProfile.branchId || 'main_branch';
      if (data.branchId && effectiveBranch !== 'all' && data.branchId !== effectiveBranch) {
        return;
      }

      if (data.type === 'START_ALERT') {
        const orderId = data.orderId;
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
            branchId: activeBranchId || managerProfile?.branchId || 'main_branch'
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
                branchId: activeBranchId || managerProfile?.branchId || 'main_branch'
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
            const dedupKey = `NEW_ORDER:${orderId || Date.now()}`;
            if (NotificationDeduplicator.shouldProcess(dedupKey)) {
              SoundAlertEngine.startContinuousAlarm('new_order');
              if (orderId) {
                let parsedFullOrder: any = null;
                if (data.fullOrderJson) {
                  try {
                    parsedFullOrder = typeof data.fullOrderJson === 'string' ? JSON.parse(data.fullOrderJson) : data.fullOrderJson;
                  } catch (err) {
                    console.warn('[Restaurant PushManager] Failed to parse fullOrderJson:', err);
                  }
                }
                const formatted = formatOrderForAlert(parsedFullOrder || data, orderId);
                setNewOrderAlert(formatted);
              }
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
                branchId: activeBranchId || managerProfile?.branchId || 'main_branch'
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
    const branchId = activeBranchId || managerProfile.branchId || 'main_branch';
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

          // Strict Franchise Isolation: Ignore alarms from other franchises
          if (profileFranchiseId && order.franchiseId && order.franchiseId !== profileFranchiseId) {
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

            setNewOrderAlert(formatOrderForAlert(order, order.id));
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
    const branchId = activeBranchId || managerProfile.branchId || 'main_branch';
    const franchiseId = managerProfile.franchiseId || 'default';
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
                  const dedupKey = `NEW_ORDER:${missed.data.orderId}`;
                  if (NotificationDeduplicator.shouldProcess(dedupKey)) {
                    SoundAlertEngine.startContinuousAlarm('new_order');
                    setNewOrderAlert(formatOrderForAlert(missed.data, missed.data.orderId));
                  }
                }
              }
              if (typeof msg.data?.currentSeq === 'number') {
                lastSeq = Math.max(lastSeq, msg.data.currentSeq);
              }
            }

            // Handle live order.created event
            if (msg.type === 'order.created' && msg.data) {
              const dedupKey = `NEW_ORDER:${msg.data.orderId}`;
              if (NotificationDeduplicator.shouldProcess(dedupKey)) {
                SoundAlertEngine.startContinuousAlarm('new_order');
                setNewOrderAlert(formatOrderForAlert(msg.data, msg.data.orderId));
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

  const handleDismissOrderAlert = () => {
    SoundAlertEngine.stopAlarm();
    setNewOrderAlert(null);
  };

  const handleAcknowledgeAlert = async (orderId: string) => {
    SoundAlertEngine.stopAlarm();
    setNewOrderAlert(null);
    try {
      await fetchApi(`/api/orders/${orderId}/acknowledge`, {
        method: 'POST',
        body: JSON.stringify({
          notes: 'Acknowledged from kitchen terminal urgent order alert'
        })
      });
      toast.success('Order alert acknowledged & alarm silenced.');
    } catch {
      // Local silence succeeded even if network had momentary glitch
    }
  };

  const handleAcceptOrderFromAlert = async (orderId: string) => {
    SoundAlertEngine.stopAlarm();
    setNewOrderAlert(null);
    try {
      const res = await updateOrderStatus(orderId, 'accepted');
      if (res && res.success) {
        SoundAlertEngine.playSound('order_accepted');
        toast.success('Order accepted! Sent to Kitchen KDS.');
      } else {
        toast.error(res?.error || 'Failed to accept order.');
      }
    } catch {
      toast.error('Failed to accept order.');
    }
  };

  const handleRejectOrderFromAlert = async (orderId: string) => {
    SoundAlertEngine.stopAlarm();
    setNewOrderAlert(null);
    try {
      const res = await updateOrderStatus(orderId, 'cancelled', 'Rejected from urgent order alert');
      if (res && res.success) {
        SoundAlertEngine.playSound('order_cancelled');
        toast.success('Order rejected and cancelled.');
      } else {
        toast.error(res?.error || 'Failed to reject order.');
      }
    } catch {
      toast.error('Failed to reject order.');
    }
  };

  const handleViewOrderFromAlert = (orderId: string) => {
    SoundAlertEngine.stopAlarm();
    setNewOrderAlert(null);
    navigate(`/live-orders?orderId=${encodeURIComponent(orderId)}`);
  };

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

      {/* Critical Full-Information Order Modal Alert */}
      {newOrderAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg max-h-[92vh] flex flex-col bg-[#0F172A] border-2 border-amber-500 rounded-3xl p-5 sm:p-6 shadow-2xl shadow-amber-500/20 text-white relative overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500 animate-ping" />
                <span className="text-xs font-black tracking-wider uppercase text-amber-400">Incoming Urgent Order</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 uppercase">
                  {newOrderAlert.orderType || 'DELIVERY'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleAcknowledgeAlert(newOrderAlert.id)}
                  title="Silence Alarm"
                  className="p-1.5 rounded-xl text-amber-400 hover:text-white hover:bg-amber-500/20 transition flex items-center gap-1 text-xs font-bold"
                >
                  <VolumeX className="w-4 h-4" />
                </button>
                <button 
                  onClick={handleDismissOrderAlert}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="py-4 space-y-3.5 overflow-y-auto pr-1 flex-1">
              {/* Order Number & Grand Total */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-white tracking-tight">
                    #{newOrderAlert.orderNumber || newOrderAlert.id?.slice(-6).toUpperCase()}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Timing: <strong className="text-white">{newOrderAlert.timing || 'ASAP'}</strong></span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black text-amber-400">
                    ₹{newOrderAlert.pricing?.total || newOrderAlert.finalTotal || newOrderAlert.totalAmount}
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Grand Total</span>
                </div>
              </div>

              {/* Payment Status Banner */}
              <div className={`p-3 rounded-2xl border text-center font-black text-xs tracking-wide flex items-center justify-center gap-2 ${
                newOrderAlert.payment?.status === 'PAID'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-950/40 border-amber-500/40 text-amber-300 animate-pulse'
              }`}>
                {newOrderAlert.payment?.status === 'PAID' ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>ONLINE PAYMENT: PAID IN FULL</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>CASH TO COLLECT: ₹{newOrderAlert.payment?.cashToCollect !== undefined ? newOrderAlert.payment.cashToCollect : (newOrderAlert.pricing?.total || 0)}</span>
                  </>
                )}
              </div>

              {/* Customer Details Card */}
              <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-white text-sm">
                    {newOrderAlert.customer?.name || 'Customer'}
                  </div>
                  {newOrderAlert.customer?.phone && (
                    <a
                      href={`tel:${newOrderAlert.customer.phone}`}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1 hover:bg-emerald-500/30 transition"
                    >
                      <Phone className="w-3 h-3" /> Call {newOrderAlert.customer.phone}
                    </a>
                  )}
                </div>

                <div className="flex items-start justify-between gap-2 text-slate-300 pt-1 border-t border-slate-800/80">
                  <div className="flex items-start gap-1.5 min-w-0">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span className="text-[11px] text-slate-300 leading-snug">
                      {newOrderAlert.customer?.address || 'Pickup / Dine-In'}
                    </span>
                  </div>
                  {(newOrderAlert.customer?.address || newOrderAlert.customer?.lat) && (
                    <a
                      href={newOrderAlert.customer.lat && newOrderAlert.customer.lng 
                        ? `https://www.google.com/maps/search/?api=1&query=${newOrderAlert.customer.lat},${newOrderAlert.customer.lng}`
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(newOrderAlert.customer.address)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2 py-1 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[10px] font-bold flex items-center gap-1 hover:bg-sky-500/30 shrink-0 transition"
                    >
                      <Navigation className="w-3 h-3" /> Open Location
                    </a>
                  )}
                </div>

                {newOrderAlert.customer?.instructions && (
                  <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px] leading-relaxed">
                    <strong className="block text-amber-300 font-bold mb-0.5">⚠️ Customer Instructions:</strong>
                    {newOrderAlert.customer.instructions}
                  </div>
                )}
              </div>

              {/* Full Itemized Order List (NO TRUNCATION) */}
              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2 max-h-44 overflow-y-auto">
                <div className="text-[11px] font-bold text-slate-400 flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
                    <span>Items Ordered ({newOrderAlert.items?.length || 0})</span>
                  </div>
                  <span className="text-[10px] text-slate-500 uppercase">Exact Customizations</span>
                </div>
                {Array.isArray(newOrderAlert.items) && newOrderAlert.items.map((it: any, idx: number) => {
                  const sizeStr = it.size || it.selectedSize;
                  const crustStr = it.crust || it.selectedCrust;
                  const addOns = Array.isArray(it.addOns || it.addons) ? (it.addOns || it.addons) : [];
                  const itemTotal = it.totalPrice || it.totalItemPrice || ((it.price || 0) * (it.quantity || 1));

                  return (
                    <div key={idx} className="border-b border-slate-800/60 pb-1.5 last:border-b-0 last:pb-0">
                      <div className="text-xs font-bold text-white flex justify-between">
                        <span>{it.quantity || 1}× {it.name || it.title}</span>
                        <span className="text-amber-400">₹{itemTotal}</span>
                      </div>
                      {(sizeStr || crustStr) && (
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {[sizeStr ? `Size: ${sizeStr}` : null, crustStr ? `Crust: ${crustStr}` : null].filter(Boolean).join(' • ')}
                        </div>
                      )}
                      {addOns.length > 0 && (
                        <div className="text-[10px] text-emerald-400/90 mt-0.5">
                          + Add-ons: {addOns.map((a: any) => typeof a === 'string' ? a : `${a.name}${a.price ? ` (+₹${a.price})` : ''}`).join(', ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Financial Breakdown */}
              <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 text-xs space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal</span>
                  <span>₹{newOrderAlert.pricing?.subtotal || 0}</span>
                </div>
                {(newOrderAlert.pricing?.packagingFee > 0) && (
                  <div className="flex justify-between text-slate-400">
                    <span>Packaging</span>
                    <span>₹{newOrderAlert.pricing.packagingFee}</span>
                  </div>
                )}
                {(newOrderAlert.pricing?.deliveryFee > 0) && (
                  <div className="flex justify-between text-slate-400">
                    <span>Delivery Fee</span>
                    <span>₹{newOrderAlert.pricing.deliveryFee}</span>
                  </div>
                )}
                {(newOrderAlert.pricing?.tax > 0) && (
                  <div className="flex justify-between text-slate-400">
                    <span>Taxes</span>
                    <span>₹{newOrderAlert.pricing.tax}</span>
                  </div>
                )}
                {(newOrderAlert.pricing?.discount > 0) && (
                  <div className="flex justify-between text-rose-400">
                    <span>Discount</span>
                    <span>-₹{newOrderAlert.pricing.discount}</span>
                  </div>
                )}
                <div className="flex justify-between text-white font-extrabold pt-1 border-t border-slate-800 text-sm">
                  <span>Grand Total</span>
                  <span className="text-amber-400">₹{newOrderAlert.pricing?.total || 0}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="shrink-0 flex flex-col gap-2 pt-2 border-t border-slate-800/80">
              <button
                onClick={() => handleAcceptOrderFromAlert(newOrderAlert.id)}
                className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm tracking-wide transition shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 active:scale-98"
              >
                <CheckCircle className="w-4 h-4" /> ACCEPT ORDER
              </button>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleAcknowledgeAlert(newOrderAlert.id)}
                  className="py-2 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-800/40 text-cyan-300 font-bold text-xs transition flex items-center justify-center gap-1"
                  title="Silence kitchen alarm"
                >
                  <VolumeX className="w-3.5 h-3.5" /> SILENCE
                </button>
                <button
                  onClick={() => handleRejectOrderFromAlert(newOrderAlert.id)}
                  className="py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/40 text-rose-300 font-bold text-xs transition flex items-center justify-center gap-1"
                >
                  <X className="w-3.5 h-3.5" /> REJECT
                </button>
                <button
                  onClick={() => handleViewOrderFromAlert(newOrderAlert.id)}
                  className="py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition flex items-center justify-center gap-1"
                >
                  VIEW
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
