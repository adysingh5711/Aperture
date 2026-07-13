package com.aperture.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.aperture.data.ActiveSessionRepository
import com.aperture.gate.GateGuardianForegroundService
import com.aperture.gate.SessionFinalizer
import com.aperture.media.PlaybackService
import kotlinx.coroutines.runBlocking
import java.time.OffsetDateTime

class EndGateReceiver : BroadcastReceiver() {
    companion object {
        private const val TAG = "EndGateReceiver"
        const val GATE_TIMEOUT_ACTION = "com.aperture.GATE_TIMEOUT"
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.d(TAG, "EndGateReceiver: alarm triggered")
        val repo = ActiveSessionRepository(context)

        runBlocking {
            val session = repo.read() ?: run {
                Log.d(TAG, "No active session found")
                return@runBlocking
            }
            if (session.status != "gate_active") {
                Log.d(TAG, "Session status is ${session.status}, ignoring end gate")
                return@runBlocking
            }

            // Finalize as timeout
            val start = OffsetDateTime.parse(session.startedAtIso)
            val contractualEnd = start.plusSeconds((session.waitingDurationMs + session.gateDurationMs) / 1000)
            
            SessionFinalizer.finalize(context, session, contractualEnd.toString(), "system_timeout")

            // Broadcast timeout to GateActivity
            val timeoutIntent = Intent(GATE_TIMEOUT_ACTION).apply {
                setPackage(context.packageName)
            }
            context.sendBroadcast(timeoutIntent)
            Log.d(TAG, "Sent com.aperture.GATE_TIMEOUT broadcast")

            // Stop PlaybackService & Guardian Service
            try {
                context.stopService(Intent(context, PlaybackService::class.java))
                context.stopService(Intent(context, GateGuardianForegroundService::class.java))
                Log.d(TAG, "Requested services stop")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to stop services", e)
            }
        }
    }
}
