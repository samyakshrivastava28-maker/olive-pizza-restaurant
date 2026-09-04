import { useEffect, useState, useCallback, useRef } from 'react';
import { useManagerStore } from '../store/managerStore';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { fetchApi } from '../lib/api';
import { NotificationPermissionManager } from '../lib/NotificationPermissionManager';
import { SoundAlertEngine } from '../lib/SoundAlertEngine';
import { NotificationDeduplicator } from '../lib/NotificationDeduplicator';
import { Bell, Volume2, CheckCircle, X, ShoppingBag } from 'lucide-react';
import toast from 'react-hot-toast';

import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

export default function PushNotificationManager() {
  const { user, managerProfile, activeBranchId, updateOrderStatus } = useManagerStore();
  const [showPromptBanner, setShowPromptBanner] = useState(false);
  const [newOrderAlert, setNewOrderAlert] = useState<any | null>(null);
  const isRegisteredRef = useRef(false);

  // Create Android Notification Channels for High-Urgency Orders
  const createChannels = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await PushNotifications.createChannel({
        id: 'olive_order_new',
        name: 'New Orders',
        description: 'Critical incoming order alerts. Wakes device and sounds kitchen alarm.',
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: 'order_alert',
      });
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
    const channel = new BroadcastChannel('olive_pizza_notifications');
    channel.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === 'START_ALERT') {
        SoundAlertEngine.startContinuousAlarm('new_order');
      } else if (data.type === 'STOP_ALERT') {
        SoundAlertEngine.stopAlarm();
      }
    };
    return () => {
      channel.close();
    };
  }, []);

  // 2. Token Registration (Idempotent, role & branch scoped)
  const registerToken = useCallback(async () => {
    if (isRegisteredRef.current || !user) return;
    try {
      // Check if Electron
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        await fetchApi('/api/notifications/token', {
          method: 'POST',
          body: JSON.stringify({
            token: `desktop_electron_${user.uid}_${navigator.userAgent.slice(0, 20)}`,
            platform: 'electron',
            browser: 'electron',
            deviceName: 'Restaurant Management Desktop (Electron)',
            appName: 'restaurant',
            branchId: activeBranchId || managerProfile?.branchId || 'main_branch'
          })
        });
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
            isRegisteredRef.current = true;
          }
        });

        PushNotifications.addListener('registrationError', (error) => {
          console.error('[Restaurant PushManager] Registration error:', error);
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('[Restaurant PushManager] Push received in foreground:', notification);
          SoundAlertEngine.startContinuousAlarm('new_order');
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
            isRegisteredRef.current = true;
          }
        }
      }
    } catch (err: any) {
      console.warn('[Restaurant PushManager] Token registration warning:', err.message);
    }
  }, [user, activeBranchId, managerProfile, createChannels]);

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
    if (!user || !managerProfile) return;
    const branchId = activeBranchId || managerProfile.branchId || 'main_branch';

    const q = query(
      collection(db, 'orders'),
      where('branchId', '==', branchId),
      where('status', 'in', ['pending', 'pending_acceptance'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const order = { id: change.doc.id, ...change.doc.data() } as any;
          const eventId = `new_order:${order.id}:${order.version || 1}`;

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

            setNewOrderAlert(order);
          }
        }
      });
    }, (err) => {
      console.warn('[Restaurant PushManager] Realtime listener error:', err);
    });

    return () => unsubscribe();
  }, [user, managerProfile, activeBranchId]);

  const handleDismissOrderAlert = () => {
    SoundAlertEngine.stopAlarm();
    setNewOrderAlert(null);
  };

  const handleAcceptOrderFromAlert = async (orderId: string) => {
    SoundAlertEngine.stopAlarm();
    setNewOrderAlert(null);
    try {
      const ok = await updateOrderStatus(orderId, 'accepted');
      if (ok) {
        SoundAlertEngine.playSound('order_accepted');
        toast.success('Order accepted! Sent to Kitchen KDS.');
      } else {
        toast.error('Failed to accept order.');
      }
    } catch {
      toast.error('Failed to accept order.');
    }
  };

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

      {/* High-Priority Urgent Order Modal Alert */}
      {newOrderAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#0F172A] border-2 border-amber-500 rounded-3xl p-6 shadow-2xl shadow-amber-500/20 text-white relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-amber-500 animate-ping" />
                <span className="text-xs font-extrabold tracking-wider uppercase text-amber-400">Incoming Urgent Order</span>
              </div>
              <button 
                onClick={handleDismissOrderAlert}
                className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-white">
                    #{newOrderAlert.dailyOrderNumber || newOrderAlert.orderNumber || newOrderAlert.id?.slice(-6).toUpperCase()}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Customer: <span className="text-white font-semibold">{newOrderAlert.customerName || 'Customer'}</span>
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-amber-400">
                    ₹{newOrderAlert.finalTotal || newOrderAlert.totalAmount}
                  </div>
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 uppercase">
                    {newOrderAlert.paymentMethod || 'COD'}
                  </span>
                </div>
              </div>

              {/* Items Preview */}
              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1.5 max-h-40 overflow-y-auto">
                <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
                  <span>Items Ordered ({newOrderAlert.items?.length || 0})</span>
                </div>
                {Array.isArray(newOrderAlert.items) && newOrderAlert.items.map((it: any, idx: number) => (
                  <div key={idx} className="text-xs text-slate-200 flex justify-between">
                    <span>{it.quantity || 1}× {it.name}</span>
                    <span className="text-slate-400">₹{(it.price || 0) * (it.quantity || 1)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => handleAcceptOrderFromAlert(newOrderAlert.id)}
                className="flex-1 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm tracking-wide transition shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" /> Accept Order
              </button>
              <button
                onClick={handleDismissOrderAlert}
                className="px-5 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition"
              >
                Silence Alarm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
