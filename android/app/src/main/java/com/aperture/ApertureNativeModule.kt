package com.aperture

import android.app.Activity
import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.provider.OpenableColumns
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.*
import com.aperture.alarm.AlarmController
import com.aperture.data.*
import com.aperture.gate.GateActivity
import com.aperture.gate.SessionFinalizer
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import java.security.SecureRandom
import java.time.OffsetDateTime
import java.util.UUID

class ApertureNativeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val activeRepo = ActiveSessionRepository(reactContext)
    private val logRepo = CommitmentLogRepository(reactContext)
    private val musicRepo = MusicLibraryRepository(reactContext)
    private val settingsRepo = SettingsRepository(reactContext)
    private val alarmController = AlarmController(reactContext)
    private val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    private var currentPickPromise: Promise? = null

    companion object {
        private const val TAG = "ApertureNativeModule"
        private const val PICK_AUDIO_REQUEST = 4202
    }

    init {
        reactContext.addActivityEventListener(object : BaseActivityEventListener() {
            override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
                if (requestCode == PICK_AUDIO_REQUEST) {
                    handleAudioPickResult(resultCode, data)
                }
            }
        })
    }

    override fun getName(): String = "ApertureNativeModule"

    @ReactMethod
    fun getCapabilities(promise: Promise) {
        try {
            val map = Arguments.createMap().apply {
                putBoolean("canScheduleExactAlarms",
                    if (Build.VERSION.SDK_INT >= 31) alarmManager.canScheduleExactAlarms() else true)
                putBoolean("screenPinningInstructionsSeen",
                    runBlocking { settingsRepo.read().screenPinningInstructionsSeen })
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("GET_CAPABILITIES_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun getDiagnostics(promise: Promise) {
        try {
            val packageInfo = reactApplicationContext.packageManager.getPackageInfo(reactApplicationContext.packageName, 0)
            val versionName = packageInfo.versionName ?: "1.0.0"
            val map = Arguments.createMap().apply {
                putString("version", versionName)
                putBoolean("activeSessionExists", runBlocking { activeRepo.read() != null })
                putBoolean("exactAlarmPermission",
                    if (Build.VERSION.SDK_INT >= 31) alarmManager.canScheduleExactAlarms() else true)
            }
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("GET_DIAGNOSTICS_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun startSession(input: ReadableMap, promise: Promise) {
        runBlocking {
            try {
                if (activeRepo.read() != null) {
                    promise.reject("ACTIVE_SESSION_EXISTS", "Cancel the current session first")
                    return@runBlocking
                }

                val waitMinutes = input.getInt("waitingDurationMinutes")
                val gateMinutes = input.getInt("gateDurationMinutes")
                val waitMs = waitMinutes * 60_000L
                val gateMs = gateMinutes * 60_000L

                val now = SystemClock.elapsedRealtime()
                val sessionId = UUID.randomUUID().toString()
                val session = ActiveSession(
                    schemaVersion = 1,
                    sessionId = sessionId,
                    status = "waiting_for_gate",
                    waitingDurationMs = waitMs,
                    gateDurationMs = gateMs,
                    startedAtIso = OffsetDateTime.now().toString(),
                    startElapsedMs = now,
                    gateAtElapsedMs = now + waitMs,
                    endAtElapsedMs = now + waitMs + gateMs,
                    challengeSeed = Math.abs(SecureRandom().nextLong()).toString(),
                    operationIndex = 0,
                    queueMediaIds = emptyList(),
                    currentMediaIndex = 0
                )

                // 1. Add session start to commitment log
                logRepo.addSession(session.sessionId, session.startedAtIso, waitMs, gateMs)

                // 2. Write active session
                activeRepo.write(session)

                // 3. Schedule exact alarms (with rollback if fails)
                try {
                    alarmController.scheduleGateAlarms(session.gateAtElapsedMs, session.endAtElapsedMs, sessionId)
                } catch (e: Exception) {
                    // Rollback
                    logRepo.removeSession(sessionId)
                    activeRepo.clear()
                    promise.reject("ALARM_FAILED", e.message ?: "Failed to schedule alarms")
                    return@runBlocking
                }

                promise.resolve(serializeActiveSession(session))
            } catch (e: Exception) {
                promise.reject("START_SESSION_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun cancelWaitingSession(promise: Promise) {
        runBlocking {
            try {
                val session = activeRepo.read()
                if (session == null || session.status != "waiting_for_gate") {
                    promise.reject("NO_WAITING_SESSION", "No session is currently in the waiting phase")
                    return@runBlocking
                }

                // Finalize session
                SessionFinalizer.finalize(reactApplicationContext, session, OffsetDateTime.now().toString(), "system_cancel")

                // Cancel alarms
                alarmController.cancelAll()

                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("CANCEL_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun getActiveSession(promise: Promise) {
        runBlocking {
            try {
                val session = activeRepo.read()
                if (session != null) {
                    // M2-17: Process death / reboot reconciliation
                    val nowElapsed = SystemClock.elapsedRealtime()
                    if (nowElapsed < session.startElapsedMs) {
                        // Reboot occurred
                        Log.w(TAG, "Reboot detected, finalising active session as interrupted")
                        val start = OffsetDateTime.parse(session.startedAtIso)
                        val contractualEnd = start.plusSeconds((session.waitingDurationMs + session.gateDurationMs) / 1000)
                        SessionFinalizer.finalize(reactApplicationContext, session, contractualEnd.toString(), "interrupted_by_reboot")
                        promise.resolve(null)
                        return@runBlocking
                    } else if (session.status == "gate_active" && nowElapsed >= session.endAtElapsedMs) {
                        // Timeout occurred during background
                        Log.w(TAG, "Timeout detected, finalising active session as system_timeout")
                        val start = OffsetDateTime.parse(session.startedAtIso)
                        val contractualEnd = start.plusSeconds((session.waitingDurationMs + session.gateDurationMs) / 1000)
                        SessionFinalizer.finalize(reactApplicationContext, session, contractualEnd.toString(), "system_timeout")
                        promise.resolve(null)
                        return@runBlocking
                    }
                    promise.resolve(serializeActiveSession(session))
                } else {
                    promise.resolve(null)
                }
            } catch (e: Exception) {
                promise.reject("GET_ACTIVE_SESSION_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun getJournal(promise: Promise) {
        runBlocking {
            try {
                // Read from commitment log
                val file = reactApplicationContext.getFileStreamPath("journal.json")
                if (!file.exists() || file.length() == 0L) {
                    // return empty JSON
                    val tz = java.time.ZoneId.systemDefault().id
                    val emptyJson = JSONObject().apply {
                        put("schemaVersion", 1)
                        put("timezone", tz)
                        put("days", JSONObject())
                    }
                    promise.resolve(emptyJson.toString())
                } else {
                    val bytes = file.readBytes()
                    promise.resolve(String(bytes, Charsets.UTF_8))
                }
            } catch (e: Exception) {
                promise.reject("GET_JOURNAL_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun addManualSession(input: ReadableMap, promise: Promise) {
        runBlocking {
            try {
                val startIso = input.getString("start") ?: throw IllegalArgumentException("Missing start time")
                val endIso = input.getString("end") ?: throw IllegalArgumentException("Missing end time")
                
                val start = OffsetDateTime.parse(startIso)
                val end = OffsetDateTime.parse(endIso)
                
                if (end.isBefore(start)) {
                    promise.reject("INVALID_TIME", "End time must be after start time")
                    return@runBlocking
                }

                val session = Session(
                    id = UUID.randomUUID().toString(),
                    start = startIso,
                    end = endIso,
                    endSource = "manual_entry",
                    originalEnd = null,
                    editedAt = null,
                    waitingDurationMs = null,
                    gateDurationMs = null,
                    kind = "manual"
                )
                logRepo.addManualSession(session)
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("ADD_MANUAL_SESSION_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun updateCompletedEnd(input: ReadableMap, promise: Promise) {
        runBlocking {
            try {
                val sessionId = input.getString("sessionId") ?: throw IllegalArgumentException("Missing sessionId")
                val newEndIso = input.getString("newEnd") ?: throw IllegalArgumentException("Missing newEnd")
                val force = input.getBoolean("force") // User confirmation flag

                val journal = logRepo.read()
                var targetSession: Session? = null
                for ((_, dayLog) in journal.days) {
                    for (s in dayLog.sessions) {
                        if (s.id == sessionId) {
                            targetSession = s
                            break
                        }
                    }
                }

                if (targetSession == null) {
                    promise.reject("SESSION_NOT_FOUND", "Session not found in commitment log")
                    return@runBlocking
                }

                if (targetSession.end == null) {
                    promise.reject("SESSION_ACTIVE", "Active sessions cannot be edited")
                    return@runBlocking
                }

                val start = OffsetDateTime.parse(targetSession.start)
                val newEnd = OffsetDateTime.parse(newEndIso)

                if (newEnd.isBefore(start)) {
                    promise.reject("INVALID_TIME", "New end time must be after start time")
                    return@runBlocking
                }

                // If enforced session, check contractual end constraints
                if (targetSession.kind != "manual") {
                    val waitMs = targetSession.waitingDurationMs ?: 0L
                    val gateMs = targetSession.gateDurationMs ?: 0L
                    val contractEnd = start.plusSeconds((waitMs + gateMs) / 1000)
                    
                    if (newEnd.isAfter(contractEnd) && !force) {
                        promise.reject("OUT_OF_BOUNDS", "New end exceeds contractual session end time")
                        return@runBlocking
                    }
                }

                logRepo.editSessionEnd(
                    sessionId = sessionId,
                    newEndIso = newEndIso,
                    originalEnd = targetSession.originalEnd ?: targetSession.end,
                    editedAt = OffsetDateTime.now().toString()
                )

                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("UPDATE_END_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun pickAndAddMusic(promise: Promise) {
        currentPickPromise = promise
        try {
            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "audio/*"
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
            }
            val activity = reactApplicationContext.currentActivity
            if (activity != null) {
                activity.startActivityForResult(intent, PICK_AUDIO_REQUEST)
            } else {
                promise.reject("NO_ACTIVITY", "Activity is not available to launch picker")
                currentPickPromise = null
            }
        } catch (e: Exception) {
            promise.reject("PICKER_FAILED", e.message, e)
            currentPickPromise = null
        }
    }

    private fun handleAudioPickResult(resultCode: Int, data: Intent?) {
        val promise = currentPickPromise
        currentPickPromise = null
        if (promise == null) return

        if (resultCode == Activity.RESULT_OK && data != null) {
            val uri = data.data
            if (uri != null) {
                try {
                    val takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION
                    reactApplicationContext.contentResolver.takePersistableUriPermission(uri, takeFlags)

                    var displayName = "Unknown Track"
                    reactApplicationContext.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (nameIndex != -1 && cursor.moveToFirst()) {
                            displayName = cursor.getString(nameIndex)
                        }
                    }

                    var durationMs = 0L
                    val retriever = MediaMetadataRetriever()
                    try {
                        retriever.setDataSource(reactApplicationContext, uri)
                        val durStr = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                        if (durStr != null) {
                            durationMs = durStr.toLong()
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to retrieve duration", e)
                    } finally {
                        try {
                            retriever.release()
                        } catch (e: Exception) {}
                    }

                    val item = MusicItem(
                        id = UUID.randomUUID().toString(),
                        displayName = displayName,
                        uri = uri.toString(),
                        mimeType = reactApplicationContext.contentResolver.getType(uri) ?: "audio/*",
                        durationMs = durationMs,
                        enabled = true,
                        addedAt = OffsetDateTime.now().toString()
                    )

                    runBlocking {
                        musicRepo.addMusicItem(item)
                    }

                    promise.resolve(serializeMusicItem(item))
                } catch (e: SecurityException) {
                    promise.reject("PERSIST_FAILED", "Cannot persist access to this file", e)
                } catch (e: Exception) {
                    promise.reject("IMPORT_FAILED", e.message, e)
                }
            } else {
                promise.resolve(null)
            }
        } else {
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun getMusicLibrary(promise: Promise) {
        runBlocking {
            try {
                val lib = musicRepo.read()
                val root = JSONObject().apply {
                    put("schemaVersion", lib.schemaVersion)
                    put("shuffleEnabled", lib.shuffleEnabled)
                    val arr = org.json.JSONArray()
                    for (m in lib.music) {
                        arr.put(JSONObject(serializeMusicItem(m)))
                    }
                    put("music", arr)
                }
                promise.resolve(root.toString())
            } catch (e: Exception) {
                promise.reject("GET_MUSIC_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun updateMusicLibrary(input: ReadableMap, promise: Promise) {
        runBlocking {
            try {
                val enabledMapObj = input.getMap("enabledStates") ?: throw IllegalArgumentException("Missing enabledStates")
                val shuffle = input.getBoolean("shuffleEnabled")

                val enabledMap = mutableMapOf<String, Boolean>()
                val iterator = enabledMapObj.entryIterator
                if (iterator != null) {
                    while (iterator.hasNext()) {
                        val entry = iterator.next()
                        enabledMap[entry.key] = entry.value as Boolean
                    }
                }

                musicRepo.updateMusicLibrary(enabledMap, shuffle)
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("UPDATE_MUSIC_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun removeMusicItem(id: String, promise: Promise) {
        runBlocking {
            try {
                val item = musicRepo.read().music.find { it.id == id }
                musicRepo.removeMusicItem(id)
                if (item != null) {
                    try {
                        reactApplicationContext.contentResolver.releasePersistableUriPermission(
                            Uri.parse(item.uri), Intent.FLAG_GRANT_READ_URI_PERMISSION
                        )
                    } catch (e: SecurityException) {
                        // Permission was already released or never held — nothing to clean up.
                    }
                }
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("REMOVE_MUSIC_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun updateSettings(input: ReadableMap, promise: Promise) {
        runBlocking {
            try {
                val settings = settingsRepo.read()
                var updated = settings

                if (input.hasKey("screenPinningInstructionsSeen")) {
                    updated = updated.copy(screenPinningInstructionsSeen = input.getBoolean("screenPinningInstructionsSeen"))
                }
                if (input.hasKey("difficulty")) {
                    updated = updated.copy(difficulty = input.getString("difficulty") ?: "standard")
                }
                if (input.hasKey("shuffleKeypad")) {
                    updated = updated.copy(shuffleKeypad = input.getBoolean("shuffleKeypad"))
                }
                if (input.hasKey("defaultWaitingDurationMinutes")) {
                    updated = updated.copy(defaultWaitingDurationMinutes = input.getInt("defaultWaitingDurationMinutes"))
                }
                if (input.hasKey("defaultGateDurationMinutes")) {
                    updated = updated.copy(defaultGateDurationMinutes = input.getInt("defaultGateDurationMinutes"))
                }

                settingsRepo.write(updated)
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("UPDATE_SETTINGS_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun getSettings(promise: Promise) {
        runBlocking {
            try {
                val settings = settingsRepo.read()
                val map = Arguments.createMap().apply {
                    putBoolean("screenPinningInstructionsSeen", settings.screenPinningInstructionsSeen)
                    putString("difficulty", settings.difficulty)
                    putBoolean("shuffleKeypad", settings.shuffleKeypad)
                    putInt("defaultWaitingDurationMinutes", settings.defaultWaitingDurationMinutes)
                    putInt("defaultGateDurationMinutes", settings.defaultGateDurationMinutes)
                }
                promise.resolve(map)
            } catch (e: Exception) {
                promise.reject("GET_SETTINGS_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun exportJournal(promise: Promise) {
        getJournal(promise)
    }

    @ReactMethod
    fun clearAllData(promise: Promise) {
        runBlocking {
            try {
                // Cancel Alarms first
                alarmController.cancelAll()
                
                // Clear Repositories
                activeRepo.clear()
                
                val journalFile = reactApplicationContext.getFileStreamPath("journal.json")
                if (journalFile.exists()) journalFile.delete()
                
                val musicFile = reactApplicationContext.getFileStreamPath("music-library.json")
                if (musicFile.exists()) musicFile.delete()
                
                val settingsFile = reactApplicationContext.getFileStreamPath("settings.json")
                if (settingsFile.exists()) settingsFile.delete()

                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("CLEAR_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun resumeGateIfActive(promise: Promise) {
        runBlocking {
            try {
                val session = activeRepo.read()
                if (session != null && session.status == "gate_active" &&
                    SystemClock.elapsedRealtime() < session.endAtElapsedMs) {
                    val intent = Intent(reactApplicationContext, GateActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    reactApplicationContext.startActivity(intent)
                    promise.resolve(true)
                } else {
                    promise.resolve(false)
                }
            } catch (e: Exception) {
                promise.reject("RESUME_FAILED", e.message, e)
            }
        }
    }

    @ReactMethod
    fun openExactAlarmSettings() {
        if (Build.VERSION.SDK_INT >= 31) {
            try {
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactApplicationContext.startActivity(intent)
            } catch (e: Exception) {
                Log.e("ApertureNativeModule", "No exact alarm settings screen on this OEM", e)
            }
        }
    }

    private fun serializeActiveSession(session: ActiveSession): String {
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
        val arr = org.json.JSONArray()
        for (id in session.queueMediaIds) {
            arr.put(id)
        }
        root.put("queueMediaIds", arr)
        root.put("currentMediaIndex", session.currentMediaIndex)
        return root.toString()
    }

    private fun serializeMusicItem(m: MusicItem): String {
        val root = JSONObject()
        root.put("id", m.id)
        root.put("displayName", m.displayName)
        root.put("uri", m.uri)
        root.put("mimeType", m.mimeType)
        root.put("durationMs", m.durationMs)
        root.put("enabled", m.enabled)
        root.put("addedAt", m.addedAt)
        return root.toString()
    }
}
