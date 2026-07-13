package com.aperture.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.util.Log
import com.aperture.data.ActiveSessionRepository
import com.aperture.gate.GateActivity
import com.aperture.gate.SessionFinalizer
import kotlinx.coroutines.runBlocking
import java.time.OffsetDateTime

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

            // Launch GateActivity
            val gateIntent = Intent(context, GateActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            context.startActivity(gateIntent)
            Log.d(TAG, "Launched GateActivity")
        }
    }
}
