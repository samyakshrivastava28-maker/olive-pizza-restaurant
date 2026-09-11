package in.olivepizza.manager;

import android.app.Activity;
import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * UrgentOrderAlertActivity — Production Full-Screen Native Order Alert
 *
 * Appears over lock screen, turns screen on, loops audio, and renders
 * Order #, Items, Amount, and Accept / Reject / View buttons.
 */
public class UrgentOrderAlertActivity extends AppCompatActivity {
    private static final String TAG = "UrgentOrderAlert";
    private static final String BACKEND_URL = "https://olivepizza-owner.onrender.com/api/notifications/action";

    private String orderId;
    private String orderNumber;
    private String totalAmount;
    private String itemsSummary;
    private String paymentMethod;
    private int notificationId;
    private MediaPlayer mediaPlayer;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Turn screen on and show over lock screen
        setupWindowFlags();

        setContentView(R.layout.activity_urgent_order_alert);

        // Parse intent extras
        Intent intent = getIntent();
        orderId = intent.getStringExtra("orderId");
        orderNumber = intent.getStringExtra("orderNumber");
        totalAmount = intent.getStringExtra("totalAmount");
        itemsSummary = intent.getStringExtra("itemsSummary");
        paymentMethod = intent.getStringExtra("paymentMethod");
        notificationId = intent.getIntExtra("notificationId", -1);

        if (orderNumber == null || orderNumber.isEmpty()) {
            orderNumber = orderId != null ? "#" + orderId.substring(Math.max(0, orderId.length() - 6)).toUpperCase() : "#NEW";
        }

        // Bind Views
        TextView tvOrderNumber = findViewById(R.id.alert_order_number);
        TextView tvTotalAmount = findViewById(R.id.alert_total_amount);
        TextView tvItems = findViewById(R.id.alert_items_text);
        TextView tvPayment = findViewById(R.id.alert_payment_method);

        Button btnAccept = findViewById(R.id.btn_accept_order);
        Button btnReject = findViewById(R.id.btn_reject_order);
        Button btnView = findViewById(R.id.btn_view_order);

        tvOrderNumber.setText("Order " + orderNumber);
        tvTotalAmount.setText("₹" + (totalAmount != null ? totalAmount : "0"));
        tvItems.setText(itemsSummary != null && !itemsSummary.isEmpty() ? itemsSummary : "Tap 'VIEW ORDER' to inspect cart details");
        tvPayment.setText("PAYMENT: " + (paymentMethod != null ? paymentMethod.toUpperCase() : "COD"));

        // Play continuous alert chime if not already stopped
        startChime();

        // Button Click Handlers
        btnAccept.setOnClickListener(v -> handleAcceptOrder(btnAccept));
        btnReject.setOnClickListener(v -> handleRejectOrder());
        btnView.setOnClickListener(v -> handleViewOrder());
    }

    private void setupWindowFlags() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager keyguardManager = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (keyguardManager != null) {
                keyguardManager.requestDismissKeyguard(this, null);
            }
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            );
        }
    }

    private void startChime() {
        try {
            Uri alarmUri = null;
            int resId = getResources().getIdentifier("new_order", "raw", getPackageName());
            if (resId != 0) {
                alarmUri = Uri.parse("android.resource://" + getPackageName() + "/" + resId);
            }
            if (alarmUri == null) {
                alarmUri = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_ALARM);
            }
            if (alarmUri == null) {
                alarmUri = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION);
            }

            mediaPlayer = new MediaPlayer();
            mediaPlayer.setDataSource(this, alarmUri);
            mediaPlayer.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .build()
            );
            mediaPlayer.setLooping(true);
            mediaPlayer.prepare();
            mediaPlayer.start();
            Log.d(TAG, "Hardware alarm sound playing for urgent order");
        } catch (Exception e) {
            Log.w(TAG, "Audio play notice: " + e.getMessage());
        }
    }

    private void stopChime() {
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) {
                    mediaPlayer.stop();
                }
                mediaPlayer.release();
            } catch (Exception ignored) {}
            mediaPlayer = null;
        }

        // Cancel notification shade item
        if (notificationId != -1) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(notificationId);
        }
    }

    private void handleAcceptOrder(Button btnAccept) {
        stopChime();
        btnAccept.setEnabled(false);
        btnAccept.setText("ACCEPTING...");

        FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
        if (user == null) {
            Toast.makeText(this, "Opening app to authenticate...", Toast.LENGTH_SHORT).show();
            launchMainActivity(true, "accept");
            finish();
            return;
        }

        user.getIdToken(false).addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) {
                String token = task.getResult().getToken();
                executeBackendAction("ACCEPT", token);
            } else {
                launchMainActivity(true, "accept");
                finish();
            }
        });
    }

    private void executeBackendAction(String action, String token) {
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(BACKEND_URL);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Authorization", "Bearer " + token);
                conn.setDoOutput(true);
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(10000);

                JSONObject payload = new JSONObject();
                payload.put("orderId", orderId);
                payload.put("action", action);

                try (OutputStream os = conn.getOutputStream()) {
                    byte[] input = payload.toString().getBytes("utf-8");
                    os.write(input, 0, input.length);
                }

                int code = conn.getResponseCode();
                new Handler(Looper.getMainLooper()).post(() -> {
                    if (code >= 200 && code < 300) {
                        Toast.makeText(this, "Order " + orderNumber + " Accepted!", Toast.LENGTH_LONG).show();
                    } else if (code == 409) {
                        Toast.makeText(this, "Order already processed on another terminal.", Toast.LENGTH_LONG).show();
                    } else if (code == 403) {
                        Toast.makeText(this, "Unauthorized for this order's branch.", Toast.LENGTH_LONG).show();
                    } else {
                        Toast.makeText(this, "Status update code: " + code, Toast.LENGTH_SHORT).show();
                    }
                    launchMainActivity(false, null);
                    finish();
                });
            } catch (Exception e) {
                Log.e(TAG, "Backend call exception:", e);
                new Handler(Looper.getMainLooper()).post(() -> {
                    launchMainActivity(true, "accept");
                    finish();
                });
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private void handleRejectOrder() {
        stopChime();
        // Launch MainActivity and trigger cancellation modal
        launchMainActivity(true, "cancel_order");
        finish();
    }

    private void handleViewOrder() {
        stopChime();
        launchMainActivity(false, null);
        finish();
    }

    private void launchMainActivity(boolean openModal, @Nullable String modalAction) {
        Intent launch = new Intent(this, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (orderId != null) {
            launch.putExtra("orderId", orderId);
            launch.putExtra("url", "/live-orders?orderId=" + orderId);
        }
        if (openModal && modalAction != null) {
            launch.putExtra("openModal", modalAction);
        }
        startActivity(launch);
    }

    @Override
    protected void onDestroy() {
        stopChime();
        super.onDestroy();
    }
}
