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
  if (!data || Object.keys(data).length === 0) {
    console.warn('[SW Safe Mode] Discarding background message: empty operational payload');
    return;
  }

  if (data.action === 'STOP_ALERT' || data.action === 'stop_alert') {
    BROADCAST.postMessage({ type: 'STOP_ALERT', orderId: data.orderId });
    return;
  }

  // STRICT APP ISOLATION: Discard customer or delivery notifications in restaurant service worker
  const targetApp = String(data.targetApp || data.target_app || data.appName || '').toLowerCase().trim();
  if (targetApp === 'customer' || targetApp === 'delivery' || data.category === 'order_update') {
    return;
  }

  const orderId = data.orderId || data.order_id;
  // Synthetic / Test order safeguard
  if (orderId && (String(orderId).startsWith('test_') || String(orderId).startsWith('mock_') || String(orderId).startsWith('synthetic_'))) {
    return;
  }

  const notifTitle = payload.notification?.title || data.title;
  const notifBody = payload.notification?.body || data.body;
  if (!notifTitle && !notifBody) {
    console.warn('[SW Safe Mode] Discarding background message: missing title and body');
    return;
  }

  const tag = data.tag || (orderId ? `order_${orderId}` : `notification_${Date.now()}`);
  const stage = data.stage || 'update';
  const normType = String(data.type || data.notificationType || '').toUpperCase();
  const status = String(data.status || '').toLowerCase();
  const isDelivered = normType === 'ORDER_DELIVERED' || status === 'delivered';
  const isNewOrder = normType === 'NEW_ORDER' || normType === 'ORDER_CREATED' || normType === 'RESTAURANT_NEW_ORDER_ALARM' || status === 'pending' || status === 'pending_acceptance';
  const targetUrl = orderId ? `/#/live-orders?orderId=${encodeURIComponent(orderId)}` : '/#/live-orders';

  const options = {
    body: notifBody || 'New operational update received',
    icon: ICON,
    badge: BADGE,
    tag,
    renotify: true,
    requireInteraction: isNewOrder,
    silent: false,
    vibrate: isDelivered ? [200, 100, 200] : (isNewOrder ? [300, 200, 300, 200, 300] : [100]),
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
  } else if (isNewOrder) {
    BROADCAST.postMessage({ type: 'START_ALERT', orderId, sound: 'new_order' });
  }
  await self.registration.showNotification(notifTitle || 'Olive Pizza Restaurant & Kitchen', options);
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
