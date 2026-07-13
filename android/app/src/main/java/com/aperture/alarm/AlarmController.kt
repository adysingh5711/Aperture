package com.aperture.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

class AlarmController(private val context: Context) {
    private val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    companion object {
        private const val TAG = "AlarmController"
        const val START_GATE_ACTION = "com.aperture.action.START_GATE"
        const val END_GATE_ACTION = "com.aperture.action.END_GATE"
        const val REQUEST_CODE_START = 1001
        const val REQUEST_CODE_END = 1002
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

        Log.d(TAG, "Scheduled alarms for session $sessionId: start at $gateAtElapsedMs, end at $endAtElapsedMs")
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

        Log.d(TAG, "Cancelled all scheduled alarms")
    }
}
