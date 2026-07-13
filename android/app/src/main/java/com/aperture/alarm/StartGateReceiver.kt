package com.aperture.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.util.Log
import com.aperture.data.ActiveSessionRepository
import com.aperture.gate.GateActivity
import com.aperture.gate.GateGuardianForegroundService
import com.aperture.gate.SessionFinalizer
import kotlinx.coroutines.runBlocking
import java.time.OffsetDateTime
import android.app.AppOpsManager
import android.os.Build

class StartGateReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "StartGateReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "StartGateReceiver: alarm triggered")
        val repo = ActiveSessionRepository(context)

        runBlocking {
            val session = repo.read() ?: run {
                Log.d(TAG, "No active session found")
                return@runBlocking
            }
            if (session.status != "waiting_for_gate") {
                Log.d(TAG, "Session status is ${session.status}, ignoring start gate")
                return@runBlocking
            }

            val now = SystemClock.elapsedRealtime()
            if (now >= session.endAtElapsedMs) {
                Log.w(TAG, "Gate start arrived after end deadline. Finalizing timeout.")
                SessionFinalizer.finalize(context, session, OffsetDateTime.now().toString(), "system_timeout")
                return@runBlocking
            }

            // Move state to active
            repo.write(session.copy(status = "gate_active"))

            // Launch GateActivity aggressively
            val gateIntent = Intent(context, GateActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or 
                         Intent.FLAG_ACTIVITY_CLEAR_TOP or 
                         Intent.FLAG_ACTIVITY_SINGLE_TOP or
                         Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            }
            context.startActivity(gateIntent)
            Log.d(TAG, "Launched GateActivity")

            // Start Usage Access Guardian if permitted
            if (isUsageAccessGranted(context)) {
                val guardianIntent = Intent(context, GateGuardianForegroundService::class.java)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(guardianIntent)
                } else {
                    context.startService(guardianIntent)
                }
            }
        }
    }

    private fun isUsageAccessGranted(context: Context): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), context.packageName)
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), context.packageName)
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }
}
