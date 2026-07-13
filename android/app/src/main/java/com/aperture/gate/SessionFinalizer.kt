package com.aperture.gate

import android.content.Context
import android.util.Log
import com.aperture.data.ActiveSession
import com.aperture.data.ActiveSessionRepository
import com.aperture.data.CommitmentLogRepository
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

object SessionFinalizer {
    private val mutex = Mutex()
    private const val TAG = "SessionFinalizer"

    suspend fun finalize(context: Context, session: ActiveSession, endIso: String, endSource: String) {
        mutex.withLock {
            val logRepo = CommitmentLogRepository(context)
            val activeRepo = ActiveSessionRepository(context)

            val current = activeRepo.read() ?: run {
                Log.d(TAG, "No active session to finalize")
                return
            }
            if (current.sessionId != session.sessionId) {
                Log.d(TAG, "Active session ID ${current.sessionId} does not match target ${session.sessionId}")
                return
            }

            try {
                logRepo.updateSessionEnd(session.sessionId, endIso, endSource)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to update session end in log", e)
            }
            activeRepo.clear()
            Log.d(TAG, "Finalized session ${session.sessionId} with source $endSource")
        }
    }
}
