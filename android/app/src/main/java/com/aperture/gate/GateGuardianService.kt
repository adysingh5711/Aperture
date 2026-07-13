package com.aperture.gate

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.os.SystemClock
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import com.aperture.data.ActiveSessionRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class GateGuardianService : AccessibilityService() {

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.IO + job)
    private lateinit var activeRepo: ActiveSessionRepository

    companion object {
        private const val TAG = "GateGuardianService"
    }

    override fun onCreate() {
        super.onCreate()
        activeRepo = ActiveSessionRepository(applicationContext)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

        val packageName = event.packageName?.toString() ?: return
        if (packageName == applicationContext.packageName) return
        
        // Don't intercept system UI or launchers if possible, but for hard lockout we usually do
        // Some launchers have specific package names.

        scope.launch {
            val session = activeRepo.read()
            if (session != null && session.status == "gate_active") {
                val now = SystemClock.elapsedRealtime()
                if (now < session.endAtElapsedMs) {
                    Log.d(TAG, "Guardian: Intercepting switch to $packageName. Re-launching Gate.")
                    val intent = Intent(applicationContext, GateActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                    }
                    startActivity(intent)
                }
            }
        }
    }

    override fun onInterrupt() {
        // Required override
    }

    override fun onDestroy() {
        super.onDestroy()
        job.cancel()
    }
}
