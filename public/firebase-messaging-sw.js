/**
 * Olive Pizza Restaurant Manager — Firebase Cloud Messaging Service Worker
 */

importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAqkcY-WQrW3WoZWRrv8oo7MTAI_nVrLw4",
  authDomain: "olive-pizza-08.firebaseapp.com",
  projectId: "olive-pizza-08",
  storageBucket: "olive-pizza-08.firebasestorage.app",
  messagingSenderId: "1017239455106",
  appId: "1:1017239455106:web:a7cb9bb285e68e38007b9b"
});

const messaging = firebase.messaging();

const API_BASE = 'https://olivepizza-owner.onrender.com/api';
const BROADCAST = new BroadcastChannel('olive_pizza_notifications');
const ICON = 'https://res.cloudinary.com/dxmlvkff1/image/upload/v1782376898/olive-pizza/brand/logo.png';
const BADGE = 'https://res.cloudinary.com/dxmlvkff1/image/upload/v1782376898/olive-pizza/brand/badge_mono.png';

self.addEventListener('error', (event) => {
  console.error('[SW Safe Mode] Error:', event.message);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[SW Safe Mode] Rejection:', event.reason);
});

messaging.onBackgroundMessage(async (payload) => {
  const data = payload.data || {};
  if (data.action === 'STOP_ALERT' || data.action === 'stop_alert') {
    BROADCAST.postMessage({ type: 'STOP_ALERT', orderId: data.orderId });
    return;
  }

  const tag = data.tag || `notification_${Date.now()}`;
  const notifTitle = payload.notification?.title || data.title || 'Olive Pizza Restaurant & Kitchen';
  const notifBody = payload.notification?.body || data.body || 'New operational update received';
  const orderId = data.orderId || data.order_id;
  const stage = data.stage || 'update';
  const normType = String(data.type || data.notificationType || '').toUpperCase();
  const status = String(data.status || '').toLowerCase();
  const isDelivered = normType === 'ORDER_DELIVERED' || status === 'delivered';
  const targetUrl = orderId ? `/#/live-orders?orderId=${encodeURIComponent(orderId)}` : '/#/live-orders';

  const options = {
    body: notifBody,
    icon: ICON,
    badge: BADGE,
    tag,
    renotify: true,
    requireInteraction: !isDelivered,
    silent: false,
    vibrate: isDelivered ? [200, 100, 200] : [300, 200, 300, 200, 300],
    data: {
      url: targetUrl,
      orderId,
      stage,
      role: 'restaurant_manager'
    },
    timestamp: Date.now()
  };

  if (isDelivered) {
    BROADCAST.postMessage({ type: 'ORDER_DELIVERED', orderId, sound: 'order_delivered' });
  } else {
    BROADCAST.postMessage({ type: 'START_ALERT', orderId, sound: 'new_order' });
  }
  await self.registration.showNotification(notifTitle, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const action = event.action;

  if (action === 'stop_alert') {
    BROADCAST.postMessage({ type: 'STOP_ALERT', orderId: notifData.orderId });
    return;
  }

  const targetUrl = notifData.url || '/#/live-orders';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client && targetUrl) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
