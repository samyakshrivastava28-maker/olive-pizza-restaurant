package in.olivepizza.manager;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.HashMap;
import java.util.Map;

/**
 * RestaurantMessagingService — Handles background and killed-state urgent orders
 * Dispatches UrgentOrderAlertActivity as full-screen intent when device is locked/sleeping.
 */
public class RestaurantMessagingService extends MessagingService {
    private static final String TAG = "RestaurantMessaging";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Log.d(TAG, "Incoming FCM message from: " + remoteMessage.getFrom());

        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wakeLock = null;
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "OliveManager::NotificationWakeLock");
            wakeLock.acquire(15000); // 15s max
        }

        try {
            Map<String, String> data = new HashMap<>(remoteMessage.getData());
            RemoteMessage.Notification notif = remoteMessage.getNotification();
            if (notif != null) {
                if (!data.containsKey("title") && notif.getTitle() != null) data.put("title", notif.getTitle());
                if (!data.containsKey("body") && notif.getBody() != null) data.put("body", notif.getBody());
            }

            String eventType = data.get("eventType");
            String type = data.get("type");
            String stage = data.get("stage");
            String action = data.get("action");

            boolean isNewOrder = "NEW_ORDER".equalsIgnoreCase(eventType) ||
                                 "NEW_ORDER".equalsIgnoreCase(type) ||
                                 "new_order".equalsIgnoreCase(stage) ||
                                 "alarm_actionable".equalsIgnoreCase(data.get("category"));

            if ("stop_alert".equalsIgnoreCase(action)) {
                String orderId = data.get("orderId");
                if (orderId != null) {
                    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) nm.cancel(orderId.hashCode());
                }
            } else if (isNewOrder) {
                wakeScreen(powerManager);
                showUrgentAlertNotification(data);
            } else {
                showStandardNotification(data);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error processing incoming FCM message:", e);
        } finally {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        }
    }

    private void wakeScreen(PowerManager powerManager) {
        if (powerManager == null) return;
        try {
            @SuppressWarnings("deprecation")
            PowerManager.WakeLock screenLock = powerManager.newWakeLock(
                PowerManager.FULL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                "OliveManager::EmergencyScreenWakeLock"
            );
            screenLock.acquire(10000);
            Log.d(TAG, "⚡ Screen woke up for urgent new order!");
        } catch (Exception e) {
            Log.w(TAG, "Could not acquire screen wake lock: " + e.getMessage());
        }
    }

    private void showUrgentAlertNotification(Map<String, String> data) {
        String orderId = data.get("orderId");
        String orderNumber = data.get("orderNumber");
        String totalAmount = data.get("totalAmount");
        String itemsSummary = data.get("itemsSummary");
        String paymentMethod = data.get("paymentMethod");
        String title = data.get("title");
        String body = data.get("body");

        if (orderNumber == null || orderNumber.isEmpty()) {
            orderNumber = orderId != null ? "#" + orderId.substring(Math.max(0, orderId.length() - 6)).toUpperCase() : "#NEW";
        }
        if (title == null) title = "🔔 NEW ORDER " + orderNumber;
        if (body == null) body = "₹" + (totalAmount != null ? totalAmount : "0") + " • " + (paymentMethod != null ? paymentMethod : "COD");

        int notifId = orderId != null ? orderId.hashCode() : (int) (System.currentTimeMillis() & 0x7fffffff);
        String channelId = "olive_order_new_v2";

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        ensureChannelExists(nm, channelId, "Olive New Orders Alarm (v2)", true, "new_order");

        // Intent for UrgentOrderAlertActivity (full-screen intent)
        Intent fullScreenIntent = new Intent(this, UrgentOrderAlertActivity.class);
        fullScreenIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        fullScreenIntent.putExtra("orderId", orderId);
        fullScreenIntent.putExtra("orderNumber", orderNumber);
        fullScreenIntent.putExtra("totalAmount", totalAmount);
        fullScreenIntent.putExtra("itemsSummary", itemsSummary);
        fullScreenIntent.putExtra("paymentMethod", paymentMethod);
        fullScreenIntent.putExtra("notificationId", notifId);

        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
            this,
            notifId,
            fullScreenIntent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        // Content Intent for normal tap
        Intent contentIntent = new Intent(this, MainActivity.class);
        contentIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (orderId != null) {
            contentIntent.putExtra("orderId", orderId);
            contentIntent.putExtra("url", "/live-orders?orderId=" + orderId);
        }
        PendingIntent contentPendingIntent = PendingIntent.getActivity(
            this,
            notifId + 1,
            contentIntent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        // Accept Action Intent
        Intent acceptIntent = new Intent(this, UrgentOrderAlertActivity.class);
        acceptIntent.putExtra("orderId", orderId);
        acceptIntent.putExtra("orderNumber", orderNumber);
        acceptIntent.putExtra("notificationId", notifId);
        acceptIntent.putExtra("autoAccept", true);
        PendingIntent acceptPendingIntent = PendingIntent.getActivity(
            this,
            notifId + 2,
            acceptIntent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Uri soundUri = resolveSoundUri("new_order");

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
            .setSmallIcon(getSmallIconResId())
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(contentPendingIntent)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setColor(0xFFF59E0B)
            .setSound(soundUri)
            .addAction(0, "ACCEPT ORDER", acceptPendingIntent)
            .addAction(0, "VIEW ORDER", contentPendingIntent);

        // Attach Full Screen Intent if supported and allowed
        boolean canFullScreen = true;
        if (Build.VERSION.SDK_INT >= 34) {
            canFullScreen = nm != null && nm.canUseFullScreenIntent();
        }

        if (canFullScreen) {
            builder.setFullScreenIntent(fullScreenPendingIntent, true);
        }

        Notification notification = builder.build();
        notification.flags |= Notification.FLAG_INSISTENT; // Loop alarm sound continuously

        if (nm != null) {
            nm.notify(notifId, notification);
            Log.i(TAG, "📢 Urgent order alert notification posted: id=" + notifId + " canFullScreen=" + canFullScreen);
        }
    }

    private void showStandardNotification(Map<String, String> data) {
        String title = data.get("title") != null ? data.get("title") : "Olive Pizza Manager";
        String body = data.get("body") != null ? data.get("body") : "You have an order update.";
        String sound = data.get("sound");
        String channelId = "olive_order_completed_v2";

        int notifId = (int) (System.currentTimeMillis() & 0x7fffffff);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        ensureChannelExists(nm, channelId, "Olive Order Status", false, sound != null ? sound : "order_delivered");

        Intent contentIntent = new Intent(this, MainActivity.class);
        contentIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentPendingIntent = PendingIntent.getActivity(
            this,
            notifId,
            contentIntent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
            .setSmallIcon(getSmallIconResId())
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(contentPendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setSound(resolveSoundUri(sound != null ? sound : "order_delivered"));

        if (nm != null) nm.notify(notifId, builder.build());
    }

    private void ensureChannelExists(NotificationManager nm, String channelId, String name, boolean isAlarm, String soundName) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || nm == null) return;
        if (nm.getNotificationChannel(channelId) != null) return;

        int importance = isAlarm ? NotificationManager.IMPORTANCE_MAX : NotificationManager.IMPORTANCE_HIGH;
        NotificationChannel channel = new NotificationChannel(channelId, name, importance);
        channel.enableVibration(true);
        channel.setShowBadge(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

        Uri soundUri = resolveSoundUri(soundName);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(isAlarm ? AudioAttributes.USAGE_ALARM : AudioAttributes.USAGE_NOTIFICATION)
            .build();
        channel.setSound(soundUri, audioAttributes);

        if (isAlarm && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                channel.setBypassDnd(true);
            } catch (Exception ignored) {}
        }

        nm.createNotificationChannel(channel);
    }

    private Uri resolveSoundUri(String soundName) {
        if (soundName != null && !soundName.isEmpty()) {
            String cleanName = soundName.contains(".") ? soundName.split("\\.")[0] : soundName;
            int resId = getResources().getIdentifier(cleanName, "raw", getPackageName());
            if (resId != 0) {
                return Uri.parse("android.resource://" + getPackageName() + "/" + resId);
            }
        }
        return android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION);
    }

    private int getSmallIconResId() {
        int resId = getResources().getIdentifier("ic_stat_icon_config_sample", "drawable", getPackageName());
        if (resId == 0) resId = getApplicationInfo().icon;
        if (resId == 0) resId = android.R.drawable.ic_dialog_info;
        return resId;
    }
}
