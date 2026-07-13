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

class MusicLibraryRepository(private val context: Context) {
    private val file = File(context.filesDir, "music-library.json")
    private val atomicFile = AtomicFile(file)

    companion object {
        private val mutex = Mutex()
        private const val TAG = "MusicLibraryRepo"
    }

    suspend fun read(): MusicLibrary = mutex.withLock {
        return@withLock readInternal()
    }

    private fun readInternal(): MusicLibrary {
        if (!file.exists() || file.length() == 0L) {
            return createEmptyLibrary()
        }
        try {
            val bytes = atomicFile.readFully()
            val jsonStr = String(bytes, Charsets.UTF_8)
            return parseJson(jsonStr)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read or parse music-library.json", e)
            return createEmptyLibrary()
        }
    }

    private fun createEmptyLibrary(): MusicLibrary {
        return MusicLibrary(schemaVersion = 1, shuffleEnabled = true, music = emptyList())
    }

    suspend fun write(library: MusicLibrary) = mutex.withLock {
        writeInternal(library)
    }

    private fun writeInternal(library: MusicLibrary) {
        var fos: FileOutputStream? = null
        try {
            val jsonStr = serializeJson(library)
            val bytes = jsonStr.toByteArray(Charsets.UTF_8)
            fos = atomicFile.startWrite()
            fos.write(bytes)
            atomicFile.finishWrite(fos)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to write music-library.json", e)
            if (fos != null) {
                atomicFile.failWrite(fos)
            }
        }
    }

    suspend fun addMusicItem(item: MusicItem) = mutex.withLock {
        val lib = readInternal()
        val updatedMusic = lib.music + item
        writeInternal(lib.copy(music = updatedMusic))
    }

    suspend fun updateMusicLibrary(enabledMap: Map<String, Boolean>, shuffle: Boolean) = mutex.withLock {
        val lib = readInternal()
        val updatedMusic = lib.music.map { item ->
            val isEnabled = enabledMap[item.id] ?: item.enabled
            item.copy(enabled = isEnabled)
        }
        writeInternal(lib.copy(shuffleEnabled = shuffle, music = updatedMusic))
    }

    suspend fun removeMusicItem(id: String) = mutex.withLock {
        val lib = readInternal()
        val updatedMusic = lib.music.filter { it.id != id }
        writeInternal(lib.copy(music = updatedMusic))
    }

    private fun parseJson(jsonStr: String): MusicLibrary {
        val root = JSONObject(jsonStr)
        val schemaVer = root.optInt("schemaVersion", 1)
        val shuffle = root.optBoolean("shuffleEnabled", true)
        val musicArr = root.optJSONArray("music") ?: JSONArray()
        val musicList = mutableListOf<MusicItem>()

        for (i in 0 until musicArr.length()) {
            val mObj = musicArr.getJSONObject(i)
            musicList.add(
                MusicItem(
                    id = mObj.getString("id"),
                    displayName = mObj.getString("displayName"),
                    uri = mObj.getString("uri"),
                    mimeType = mObj.getString("mimeType"),
                    durationMs = mObj.getLong("durationMs"),
                    enabled = mObj.getBoolean("enabled"),
                    addedAt = mObj.getString("addedAt")
                )
            )
        }
        return MusicLibrary(schemaVersion = schemaVer, shuffleEnabled = shuffle, music = musicList)
    }

    private fun serializeJson(lib: MusicLibrary): String {
        val root = JSONObject()
        root.put("schemaVersion", lib.schemaVersion)
        root.put("shuffleEnabled", lib.shuffleEnabled)

        val musicArr = JSONArray()
        for (m in lib.music) {
            val mObj = JSONObject()
            mObj.put("id", m.id)
            mObj.put("displayName", m.displayName)
            mObj.put("uri", m.uri)
            mObj.put("mimeType", m.mimeType)
            mObj.put("durationMs", m.durationMs)
            mObj.put("enabled", m.enabled)
            mObj.put("addedAt", m.addedAt)
            musicArr.put(mObj)
        }
        root.put("music", musicArr)
        return root.toString()
    }
}
