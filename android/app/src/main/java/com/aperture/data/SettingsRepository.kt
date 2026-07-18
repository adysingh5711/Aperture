package com.aperture.data

import android.content.Context
import android.util.AtomicFile
import android.util.Log
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

class SettingsRepository(private val context: Context) {
    private val file = File(context.filesDir, "settings.json")
    private val atomicFile = AtomicFile(file)

    companion object {
        private val mutex = Mutex()
        private const val TAG = "SettingsRepo"
    }

    suspend fun read(): Settings = mutex.withLock {
        return@withLock readInternal()
    }

    private fun readInternal(): Settings {
        if (!file.exists() || file.length() == 0L) {
            return Settings()
        }
        try {
            val bytes = atomicFile.readFully()
            val jsonStr = String(bytes, Charsets.UTF_8)
            val root = JSONObject(jsonStr)
            return Settings(
                schemaVersion = root.optInt("schemaVersion", 1),
                difficulty = root.optString("difficulty", "standard"),
                shuffleKeypad = root.optBoolean("shuffleKeypad", false),
                defaultWaitingDurationMinutes = root.optInt("defaultWaitingDurationMinutes", 10),
                defaultGateDurationMinutes = root.optInt("defaultGateDurationMinutes", 15),
                themeMode = root.optString("themeMode", "system")
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read settings.json", e)
            return Settings()
        }
    }

    suspend fun write(settings: Settings) = mutex.withLock {
        writeInternal(settings)
    }

    private fun writeInternal(settings: Settings) {
        var fos: FileOutputStream? = null
        try {
            val root = JSONObject()
            root.put("schemaVersion", settings.schemaVersion)
            root.put("difficulty", settings.difficulty)
            root.put("shuffleKeypad", settings.shuffleKeypad)
            root.put("defaultWaitingDurationMinutes", settings.defaultWaitingDurationMinutes)
            root.put("defaultGateDurationMinutes", settings.defaultGateDurationMinutes)
            root.put("themeMode", settings.themeMode)

            val jsonStr = root.toString()
            val bytes = jsonStr.toByteArray(Charsets.UTF_8)
            fos = atomicFile.startWrite()
            fos.write(bytes)
            atomicFile.finishWrite(fos)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to write settings.json", e)
            if (fos != null) {
                atomicFile.failWrite(fos)
            }
        }
    }

    suspend fun setDifficulty(diff: String) = mutex.withLock {
        val current = readInternal()
        writeInternal(current.copy(difficulty = diff))
    }

    suspend fun setShuffleKeypad(shuffle: Boolean) = mutex.withLock {
        val current = readInternal()
        writeInternal(current.copy(shuffleKeypad = shuffle))
    }

    suspend fun setDurations(waiting: Int, gate: Int) = mutex.withLock {
        val current = readInternal()
        writeInternal(current.copy(defaultWaitingDurationMinutes = waiting, defaultGateDurationMinutes = gate))
    }
}
