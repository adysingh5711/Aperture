package com.aperture.alarm

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import com.aperture.MainActivity
import com.aperture.R

class AlarmController(private val context: Context) {
    private val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    companion object {
        private const val TAG = "AlarmController"
        const val START_GATE_ACTION = "com.aperture.action.START_GATE"
        const val END_GATE_ACTION = "com.aperture.action.END_GATE"
        const val REQUEST_CODE_START = 1001
        const val REQUEST_CODE_END = 1002
        private const val COUNTDOWN_CHANNEL_ID = "gate_countdown_channel"
        private const val COUNTDOWN_NOTIFICATION_ID = 8803

        /** Clears the "gate starting soon" notification. Called once the gate actually starts or the commitment is cancelled. */
        fun cancelCountdownNotification(context: Context) {
            (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .cancel(COUNTDOWN_NOTIFICATION_ID)
        }
    }

    fun scheduleGateAlarms(gateAtElapsedMs: Long, endAtElapsedMs: Long, sessionId: String) {
        if (Build.VERSION.SDK_INT >= 31) {
            if (!alarmManager.canScheduleExactAlarms()) {
                throw SecurityException("exact_alarms_denied")
            }
        }

        val startIntent = Intent(context, StartGateReceiver::class.java).apply {
            action = START_GATE_ACTION
            putExtra("sessionId", sessionId)
        }
        val startPendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE_START,
            startIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val endIntent = Intent(context, EndGateReceiver::class.java).apply {
            action = END_GATE_ACTION
            putExtra("sessionId", sessionId)
        }
        val endPendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE_END,
            endIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        alarmManager.setExactAndAllowWhileIdle(
            AlarmManager.ELAPSED_REALTIME_WAKEUP,
            gateAtElapsedMs,
            startPendingIntent
        )

        alarmManager.setExactAndAllowWhileIdle(
            AlarmManager.ELAPSED_REALTIME_WAKEUP,
            endAtElapsedMs,
            endPendingIntent
        )

        postCountdownNotification(gateAtElapsedMs)

        Log.d(TAG, "Scheduled alarms for session $sessionId: start at $gateAtElapsedMs, end at $endAtElapsedMs")
    }

    /**
     * Ongoing notification with a live countdown to gate start, via a custom RemoteViews
     * Chronometer — Notification.setUsesChronometer alone only renders as a small timestamp next
     * to the app name, easy to mistake for a random number. Embedding a large Chronometer in the
     * body itself keeps the "just works" native ticking (no polling/service) while being visible.
     */
    private fun postCountdownNotification(gateAtElapsedMs: Long) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                COUNTDOWN_CHANNEL_ID,
                "Gate Countdown",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows the time remaining until your gate starts"
            }
            context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        val contentIntent = PendingIntent.getActivity(
            context, 0, Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // RemoteViews' Chronometer.setBase() is elapsedRealtime-based, same as our alarms — no
        // wall-clock conversion needed here (unlike Notification.setWhen).
        val countdownView = RemoteViews(context.packageName, R.layout.notification_gate_countdown).apply {
            setChronometer(R.id.chronometer_countdown, gateAtElapsedMs, "Starts in %s", true)
            // setChronometer's own isCountDown arg is silently ignored on this build — force it via
            // the underlying setter directly so the display actually ticks down instead of up.
            setBoolean(R.id.chronometer_countdown, "setCountDown", true)
        }

        val notification = NotificationCompat.Builder(context, COUNTDOWN_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(contentIntent)
            .setCustomContentView(countdownView)
            .setCustomBigContentView(countdownView)
            .setStyle(NotificationCompat.DecoratedCustomViewStyle())
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(COUNTDOWN_NOTIFICATION_ID, notification)
    }

    fun cancelAll() {
        val startIntent = Intent(context, StartGateReceiver::class.java).apply {
            action = START_GATE_ACTION
        }
        val startPendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE_START,
            startIntent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        )
        if (startPendingIntent != null) {
            alarmManager.cancel(startPendingIntent)
            startPendingIntent.cancel()
        }

        val endIntent = Intent(context, EndGateReceiver::class.java).apply {
            action = END_GATE_ACTION
        }
        val endPendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE_END,
            endIntent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        )
        if (endPendingIntent != null) {
            alarmManager.cancel(endPendingIntent)
            endPendingIntent.cancel()
        }

        cancelCountdownNotification(context)

        Log.d(TAG, "Cancelled all scheduled alarms")
    }
}
