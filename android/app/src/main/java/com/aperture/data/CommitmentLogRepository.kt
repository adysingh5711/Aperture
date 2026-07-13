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
import java.time.ZoneId

class CommitmentLogRepository(private val context: Context) {
    private val file = File(context.filesDir, "journal.json")
    private val atomicFile = AtomicFile(file)

    companion object {
        private val mutex = Mutex()
        private const val TAG = "CommitmentLogRepo"
    }

    suspend fun read(): CommitmentLog = mutex.withLock {
        return@withLock readInternal()
    }

    private fun readInternal(): CommitmentLog {
        if (!file.exists() || file.length() == 0L) {
            return createEmptyLog()
        }
        try {
            val bytes = atomicFile.readFully()
            val jsonStr = String(bytes, Charsets.UTF_8)
            return parseJson(jsonStr)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read or parse journal.json", e)
            return createEmptyLog()
        }
    }

    private fun createEmptyLog(): CommitmentLog {
        val tz = ZoneId.systemDefault().id
        return CommitmentLog(schemaVersion = 1, timezone = tz, days = emptyMap())
    }

    suspend fun write(log: CommitmentLog) = mutex.withLock {
        writeInternal(log)
    }

    private fun writeInternal(log: CommitmentLog) {
        var fos: FileOutputStream? = null
        try {
            val jsonStr = serializeJson(log)
            val bytes = jsonStr.toByteArray(Charsets.UTF_8)
            fos = atomicFile.startWrite()
            fos.write(bytes)
            atomicFile.finishWrite(fos)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to write journal.json", e)
            if (fos != null) {
                atomicFile.failWrite(fos)
            }
        }
    }

    suspend fun addSession(sessionId: String, startIso: String, waitMs: Long, gateMs: Long) {
        val log = readInternal()
        val newSession = Session(
            id = sessionId,
            start = startIso,
            end = null,
            endSource = null,
            originalEnd = null,
            editedAt = null,
            waitingDurationMs = waitMs,
            gateDurationMs = gateMs,
            kind = "enforced"
        )
        val dateKey = if (startIso.length >= 10) startIso.substring(0, 10) else "unknown"

        val currentDayLog = log.days[dateKey] ?: DayLog(emptyList())
        val updatedSessions = currentDayLog.sessions + newSession
        val updatedDays = log.days.toMutableMap()
        updatedDays[dateKey] = DayLog(updatedSessions)

        writeInternal(log.copy(days = updatedDays))
    }

    suspend fun removeSession(sessionId: String) {
        val log = readInternal()
        val updatedDays = log.days.mapValues { (_, dayLog) ->
            DayLog(dayLog.sessions.filter { it.id != sessionId })
        }.filterValues { it.sessions.isNotEmpty() }

        writeInternal(log.copy(days = updatedDays))
    }

    suspend fun updateSessionEnd(sessionId: String, endIso: String, endSource: String) {
        val log = readInternal()
        var found = false
        val updatedDays = log.days.mapValues { (_, dayLog) ->
            DayLog(dayLog.sessions.map { session ->
                if (session.id == sessionId) {
                    found = true
                    session.copy(end = endIso, endSource = endSource)
                } else {
                    session
                }
            })
        }
        if (found) {
            writeInternal(log.copy(days = updatedDays))
        } else {
            throw IllegalArgumentException("Session $sessionId not found in log")
        }
    }

    suspend fun editSessionEnd(sessionId: String, newEndIso: String, originalEnd: String, editedAt: String) {
        val log = readInternal()
        var found = false
        val updatedDays = log.days.mapValues { (_, dayLog) ->
            DayLog(dayLog.sessions.map { session ->
                if (session.id == sessionId) {
                    found = true
                    session.copy(
                        end = newEndIso,
                        endSource = "manual",
                        originalEnd = originalEnd,
                        editedAt = editedAt
                    )
                } else {
                    session
                }
            })
        }
        if (found) {
            writeInternal(log.copy(days = updatedDays))
        } else {
            throw IllegalArgumentException("Session $sessionId not found in log")
        }
    }

    suspend fun addManualSession(session: Session) {
        val log = readInternal()
        val dateKey = if (session.start.length >= 10) session.start.substring(0, 10) else "unknown"
        val currentDayLog = log.days[dateKey] ?: DayLog(emptyList())
        val updatedSessions = currentDayLog.sessions + session
        val updatedDays = log.days.toMutableMap()
        updatedDays[dateKey] = DayLog(updatedSessions)
        writeInternal(log.copy(days = updatedDays))
    }

    private fun parseJson(jsonStr: String): CommitmentLog {
        val root = JSONObject(jsonStr)
        val schemaVer = root.optInt("schemaVersion", 1)
        val tz = root.optString("timezone", ZoneId.systemDefault().id)
        val daysObj = root.optJSONObject("days") ?: JSONObject()

        val daysMap = mutableMapOf<String, DayLog>()
        val keys = daysObj.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            val dayObj = daysObj.getJSONObject(key)
            val sessionsArr = dayObj.optJSONArray("sessions") ?: JSONArray()
            val sessionsList = mutableListOf<Session>()

            for (i in 0 until sessionsArr.length()) {
                val sObj = sessionsArr.getJSONObject(i)
                sessionsList.add(
                    Session(
                        id = sObj.getString("id"),
                        start = sObj.getString("start"),
                        end = if (sObj.isNull("end")) null else sObj.getString("end"),
                        endSource = if (sObj.isNull("endSource")) null else sObj.getString("endSource"),
                        originalEnd = if (sObj.isNull("originalEnd")) null else sObj.getString("originalEnd"),
                        editedAt = if (sObj.isNull("editedAt")) null else sObj.getString("editedAt"),
                        waitingDurationMs = if (sObj.isNull("waitingDurationMs")) null else sObj.getLong("waitingDurationMs"),
                        gateDurationMs = if (sObj.isNull("gateDurationMs")) null else sObj.getLong("gateDurationMs"),
                        kind = if (sObj.isNull("kind")) null else sObj.getString("kind")
                    )
                )
            }
            daysMap[key] = DayLog(sessionsList)
        }

        return CommitmentLog(schemaVersion = schemaVer, timezone = tz, days = daysMap)
    }

    private fun serializeJson(log: CommitmentLog): String {
        val root = JSONObject()
        root.put("schemaVersion", log.schemaVersion)
        root.put("timezone", log.timezone)

        val daysObj = JSONObject()
        for ((date, dayLog) in log.days) {
            val dayObj = JSONObject()
            val sessionsArr = JSONArray()
            for (s in dayLog.sessions) {
                val sObj = JSONObject()
                sObj.put("id", s.id)
                sObj.put("start", s.start)
                sObj.put("end", s.end ?: JSONObject.NULL)
                sObj.put("endSource", s.endSource ?: JSONObject.NULL)
                sObj.put("originalEnd", s.originalEnd ?: JSONObject.NULL)
                sObj.put("editedAt", s.editedAt ?: JSONObject.NULL)
                sObj.put("waitingDurationMs", s.waitingDurationMs ?: JSONObject.NULL)
                sObj.put("gateDurationMs", s.gateDurationMs ?: JSONObject.NULL)
                sObj.put("kind", s.kind ?: JSONObject.NULL)
                sessionsArr.put(sObj)
            }
            dayObj.put("sessions", sessionsArr)
            daysObj.put(date, dayObj)
        }
        root.put("days", daysObj)
        return root.toString()
    }
}
