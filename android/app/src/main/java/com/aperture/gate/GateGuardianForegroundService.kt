package com.aperture.gate

import android.app.*
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import com.aperture.R
import com.aperture.data.ActiveSessionRepository
import kotlinx.coroutines.*

class GateGuardianForegroundService : Service() {

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + job)
    private lateinit var activeRepo: ActiveSessionRepository

    companion object {
        private const val TAG = "GateGuardianFS"
        private const val NOTIFICATION_ID = 8802
        private const val CHANNEL_ID = "guardian_channel"
        private const val POLL_INTERVAL_MS = 2000L
    }

    override fun onCreate() {
        super.onCreate()
        activeRepo = ActiveSessionRepository(applicationContext)
        createNotificationChannel()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, createNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, createNotification())
        }
        startMonitoring()
    }

    private fun startMonitoring() {
        scope.launch {
            // Initial delay to let StartGateReceiver finish its work
            delay(1000)
            while (isActive) {
                val session = activeRepo.read()
                if (session != null && session.status == "gate_active") {
                    val now = SystemClock.elapsedRealtime()
                    if (now < session.endAtElapsedMs) {
                        val foregroundApp = getForegroundApp()
                        if (foregroundApp != null && foregroundApp != packageName) {
                            Log.d(TAG, "GuardianFS: Detected $foregroundApp. Re-launching.")
                            relaunchGate()
                        }
                    } else {
                        stopSelf()
                        break
                    }
                } else {
                    stopSelf()
                    break
                }
                delay(POLL_INTERVAL_MS)
            }
        }
    }

    private fun getForegroundApp(): String? {
        val usm = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val time = System.currentTimeMillis()
        // Query for a 1-minute window
        val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, time - 1000 * 60, time)
        if (stats != null && stats.isNotEmpty()) {
            return stats.maxByOrNull { it.lastTimeUsed }?.packageName
        }
        return null
    }

    private fun relaunchGate() {
        try {
            val intent = Intent(this, GateActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or 
                         Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                         Intent.FLAG_ACTIVITY_NO_ANIMATION)
            }
            startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to relaunch GateActivity", e)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Gate Guardian",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Monitors app usage to enforce focus gate"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val intent = Intent(this, GateActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Aperture Lockout Active")
            .setContentText("Enforcing focus commitment...")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setFullScreenIntent(pendingIntent, true)
            .build()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }
}
