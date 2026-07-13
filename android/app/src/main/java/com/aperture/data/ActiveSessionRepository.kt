package com.aperture.data

import android.content.Context
import android.util.AtomicFile
import android.util.Log
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

class ActiveSessionRepository(private val context: Context) {
    private val file = File(context.filesDir, "active-session.json")
    private val atomicFile = AtomicFile(file)

    companion object {
        private val mutex = Mutex()
        private const val TAG = "ActiveSessionRepo"
    }

    suspend fun read(): ActiveSession? = mutex.withLock {
        if (!file.exists() || file.length() == 0L) {
            return@withLock null
        }
        try {
            val bytes = atomicFile.readFully()
            val jsonStr = String(bytes, Charsets.UTF_8)
            return@withLock parseJson(jsonStr)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read or parse active-session.json, treating as null", e)
            return@withLock null
        }
    }

    suspend fun write(session: ActiveSession) = mutex.withLock {
        var fos: FileOutputStream? = null
        try {
            val jsonStr = serializeJson(session)
            val bytes = jsonStr.toByteArray(Charsets.UTF_8)
            fos = atomicFile.startWrite()
            fos.write(bytes)
            atomicFile.finishWrite(fos)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to write active-session.json", e)
            if (fos != null) {
                atomicFile.failWrite(fos)
            }
        }
    }

    suspend fun clear() = mutex.withLock {
        try {
            if (file.exists()) {
                atomicFile.delete()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to delete active-session.json", e)
        }
    }

    private fun parseJson(jsonStr: String): ActiveSession {
        val root = JSONObject(jsonStr)
        val queueArr = root.optJSONArray("queueMediaIds") ?: JSONArray()
        val queueList = mutableListOf<String>()
        for (i in 0 until queueArr.length()) {
            queueList.add(queueArr.getString(i))
        }

        return ActiveSession(
            schemaVersion = root.optInt("schemaVersion", 1),
            sessionId = root.getString("sessionId"),
            status = root.getString("status"),
            waitingDurationMs = root.getLong("waitingDurationMs"),
            gateDurationMs = root.getLong("gateDurationMs"),
            startedAtIso = root.getString("startedAtIso"),
            startElapsedMs = root.getLong("startElapsedMs"),
            gateAtElapsedMs = root.getLong("gateAtElapsedMs"),
            endAtElapsedMs = root.getLong("endAtElapsedMs"),
            challengeSeed = root.getString("challengeSeed"),
            operationIndex = root.getInt("operationIndex"),
            queueMediaIds = queueList,
            currentMediaIndex = root.getInt("currentMediaIndex")
        )
    }

    private fun serializeJson(session: ActiveSession): String {
        val root = JSONObject()
        root.put("schemaVersion", session.schemaVersion)
        root.put("sessionId", session.sessionId)
        root.put("status", session.status)
        root.put("waitingDurationMs", session.waitingDurationMs)
        root.put("gateDurationMs", session.gateDurationMs)
        root.put("startedAtIso", session.startedAtIso)
        root.put("startElapsedMs", session.startElapsedMs)
        root.put("gateAtElapsedMs", session.gateAtElapsedMs)
        root.put("endAtElapsedMs", session.endAtElapsedMs)
        root.put("challengeSeed", session.challengeSeed)
        root.put("operationIndex", session.operationIndex)

        val queueArr = JSONArray()
        for (id in session.queueMediaIds) {
            queueArr.put(id)
        }
        root.put("queueMediaIds", queueArr)
        root.put("currentMediaIndex", session.currentMediaIndex)

        return root.toString()
    }
}
