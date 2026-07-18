package com.aperture.media

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.aperture.data.ActiveSessionRepository
import com.aperture.data.MusicItem
import com.aperture.data.MusicLibraryRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.util.Random

class PlaybackService : Service(), AudioManager.OnAudioFocusChangeListener {
    private var player: ExoPlayer? = null
    private var audioManager: AudioManager? = null
    private var audioFocusRequest: AudioFocusRequest? = null

    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.Main + serviceJob)

    private var queue = mutableListOf<MusicItem>()
    private var currentIdx = 0
    private var sessionSeed = 0L
    private var consecutiveFailures = 0

    companion object {
        private const val TAG = "PlaybackService"
        private const val CHANNEL_ID = "aperture_playback_channel"
        private const val NOTIFICATION_ID = 2002

        const val ACTION_PLAYBACK_CONTROL = "com.aperture.media.ACTION_CONTROL"
        const val EXTRA_COMMAND = "command"
        const val EXTRA_SEEK_POSITION = "seek_position"
    }

    // Progress ticker so the seek bar tracks playback smoothly.
    private val progressHandler = Handler(Looper.getMainLooper())
    private val progressTicker = object : Runnable {
        override fun run() {
            if (player?.isPlaying == true) broadcastTrackChange()
            progressHandler.postDelayed(this, 500)
        }
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "PlaybackService: onCreate")
        audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification("Aperture gate active", "Initializing music..."))

        progressHandler.postDelayed(progressTicker, 500)
        player = ExoPlayer.Builder(this).build()
        player?.repeatMode = Player.REPEAT_MODE_OFF
        player?.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                super.onPlaybackStateChanged(state)
                if (state == Player.STATE_READY) {
                    consecutiveFailures = 0
                } else if (state == Player.STATE_ENDED) {
                    // Each track plays as a single MediaItem (REPEAT_MODE_OFF), so natural
                    // completion never fires onMediaItemTransition — advance manually here.
                    handleNext()
                }
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                // Fires when buffering actually turns into audible playback (and on
                // pause/focus loss) — the broadcast sent right after play() is too
                // early and always reports isPlaying=false.
                broadcastTrackChange()
                updateNotificationTrack()
            }

            override fun onPlayerError(error: PlaybackException) {
                Log.e(TAG, "ExoPlayer playback error: ${error.message}", error)
                advanceOrFallback()
            }
        })
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        if (action == ACTION_PLAYBACK_CONTROL) {
            val cmd = intent.getStringExtra(EXTRA_COMMAND)
            Log.d(TAG, "Received playback control command: $cmd")
            when (cmd) {
                "play_pause" -> handlePlayPause()
                "prev" -> handlePrev()
                "next" -> handleNext()
                "rewind" -> handleRewind()
                "forward" -> handleForward()
                "shuffle" -> handleShuffleToggle()
                "random" -> handleRandomTrack()
                "seek_to" -> handleSeekTo(intent.getLongExtra(EXTRA_SEEK_POSITION, -1L))
            }
        } else {
            requestAudioFocusAndStart()
        }
        return START_NOT_STICKY
    }

    private fun requestAudioFocusAndStart() {
        var focusGranted = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val playbackAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build()
            audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(playbackAttributes)
                .setAcceptsDelayedFocusGain(true)
                .setOnAudioFocusChangeListener(this)
                .build()
            val res = audioManager?.requestAudioFocus(audioFocusRequest!!)
            if (res == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                focusGranted = true
            }
        } else {
            @Suppress("DEPRECATION")
            val res = audioManager?.requestAudioFocus(this, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
            if (res == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                focusGranted = true
            }
        }

        if (focusGranted) {
            loadQueueAndPlay()
        } else {
            Log.w(TAG, "Audio focus denied, stopping service")
            stopSelf()
        }
    }

    private fun loadQueueAndPlay() {
        serviceScope.launch {
            val activeRepo = ActiveSessionRepository(applicationContext)
            val musicRepo = MusicLibraryRepository(applicationContext)
            val session = activeRepo.read()
            sessionSeed = session?.challengeSeed?.toLongOrNull() ?: SystemClock.elapsedRealtime()

            val library = musicRepo.read()
            val enabledMusic = library.music.filter { it.enabled }

            if (enabledMusic.isEmpty()) {
                playFallbackDrone()
                return@launch
            }

            queue = MusicQueueBuilder.buildQueue(enabledMusic, sessionSeed).toMutableList()
            currentIdx = 0

            if (session != null) {
                activeRepo.write(session.copy(
                    queueMediaIds = queue.map { it.id },
                    currentMediaIndex = currentIdx
                ))
            }

            playCurrentItem()
        }
    }

    private fun playCurrentItem() {
        val player = player ?: return
        if (queue.isEmpty()) {
            playFallbackDrone()
            return
        }

        val item = queue[currentIdx]
        try {
            val uri = Uri.parse(item.uri)
            val mediaItem = MediaItem.fromUri(uri)
            player.setMediaItem(mediaItem)
            player.prepare()
            player.play()
            updateNotificationTrack()
            broadcastTrackChange()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to play item ${item.displayName}", e)
            advanceOrFallback()
        }
    }

    private fun playFallbackDrone() {
        val player = player ?: return
        try {
            val fallbackUri = Uri.parse("android.resource://${packageName}/raw/fallback_tone")
            val mediaItem = MediaItem.fromUri(fallbackUri)
            player.setMediaItem(mediaItem)
            player.repeatMode = Player.REPEAT_MODE_ONE
            player.prepare()
            player.play()
            updateNotification("Aperture gate active", "Playing default tone loop")

            val intent = Intent("com.aperture.media.TRACK_CHANGE").apply {
                putExtra("title", "Default Tone Loop")
                putExtra("isPlaying", true)
                setPackage(packageName)
            }
            sendBroadcast(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to play fallback drone", e)
        }
    }

    private fun handlePlayPause() {
        player?.let {
            if (it.isPlaying) {
                it.pause()
                updateNotificationTrack(isPaused = true)
            } else {
                it.play()
                updateNotificationTrack(isPaused = false)
            }
            broadcastTrackChange()
        }
    }

    private fun handlePrev() {
        player?.let {
            if (it.currentPosition > 3000 || queue.isEmpty()) {
                it.seekTo(0)
            } else {
                currentIdx = if (currentIdx > 0) currentIdx - 1 else queue.size - 1
                updateActiveSessionIndex()
                playCurrentItem()
            }
        }
    }

    private fun handleNext() {
        if (queue.isEmpty()) return
        if (currentIdx + 1 >= queue.size) {
            reshuffleQueue()
        } else {
            currentIdx++
        }
        updateActiveSessionIndex()
        playCurrentItem()
    }

    /** Reshuffles the full queue when exhausted, avoiding an immediate repeat of the last track. */
    private fun reshuffleQueue() {
        val lastPlayed = queue.getOrNull(currentIdx)?.id
        val newSeed = sessionSeed + SystemClock.elapsedRealtime()
        queue = MusicQueueBuilder.buildQueue(queue, newSeed, lastPlayed).toMutableList()
        currentIdx = 0
    }

    /** On repeated playback failure, fall back to the bundled tone instead of looping forever. */
    private fun advanceOrFallback() {
        consecutiveFailures++
        if (queue.isEmpty() || consecutiveFailures >= queue.size) {
            Log.w(TAG, "All queue items failed, falling back to default tone")
            playFallbackDrone()
            return
        }
        handleNext()
    }

    private fun handleSeekTo(positionMs: Long) {
        if (positionMs < 0) return
        player?.let {
            it.seekTo(positionMs.coerceIn(0L, if (it.duration > 0) it.duration else positionMs))
            broadcastTrackChange()
        }
    }

    private fun handleRewind() {
        player?.let {
            val pos = Math.max(0L, it.currentPosition - 15000)
            it.seekTo(pos)
            broadcastTrackChange()
        }
    }

    private fun handleForward() {
        player?.let {
            val pos = Math.min(it.duration, it.currentPosition + 15000)
            it.seekTo(pos)
            broadcastTrackChange()
        }
    }

    private fun handleShuffleToggle() {
        serviceScope.launch {
            val musicRepo = MusicLibraryRepository(applicationContext)
            val library = musicRepo.read()
            val newShuffle = !library.shuffleEnabled
            musicRepo.write(library.copy(shuffleEnabled = newShuffle))

            if (queue.isNotEmpty()) {
                val currentTrack = queue[currentIdx]
                val otherTracks = queue.filter { it.id != currentTrack.id }
                val newSeed = sessionSeed + SystemClock.elapsedRealtime()
                val shuffledOthers = MusicQueueBuilder.buildQueue(otherTracks, newSeed)

                queue.clear()
                queue.add(currentTrack)
                queue.addAll(shuffledOthers)
                currentIdx = 0
                updateActiveSessionIndex()
                broadcastTrackChange()
            }
        }
    }

    private fun handleRandomTrack() {
        if (queue.size <= 1) return
        val otherIndices = queue.indices.filter { it != currentIdx }
        currentIdx = otherIndices[Random().nextInt(otherIndices.size)]
        updateActiveSessionIndex()
        playCurrentItem()
    }

    private fun updateActiveSessionIndex() {
        serviceScope.launch {
            val activeRepo = ActiveSessionRepository(applicationContext)
            val session = activeRepo.read() ?: return@launch
            activeRepo.write(session.copy(currentMediaIndex = currentIdx))
        }
    }

    private fun broadcastTrackChange() {
        val player = player ?: return
        val title = if (queue.isNotEmpty() && currentIdx < queue.size) queue[currentIdx].displayName else "Default Tone Loop"
        val intent = Intent("com.aperture.media.TRACK_CHANGE").apply {
            putExtra("title", title)
            putExtra("isPlaying", player.isPlaying)
            putExtra("position", player.currentPosition)
            putExtra("duration", player.duration)
            setPackage(packageName)
        }
        sendBroadcast(intent)
    }

    private fun updateNotificationTrack(isPaused: Boolean = false) {
        val title = if (queue.isNotEmpty() && currentIdx < queue.size) queue[currentIdx].displayName else "Default Tone Loop"
        val state = if (isPaused || player?.isPlaying == false) "Paused" else "Playing"
        updateNotification("Aperture gate active", "$state: $title")
    }

    private fun updateNotification(title: String, text: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, buildNotification(title, text))
    }

    private fun buildNotification(title: String, text: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val name = "Aperture Playback Service"
            val desc = "Notification channel for Aperture local music playback"
            val importance = NotificationManager.IMPORTANCE_LOW
            val channel = NotificationChannel(CHANNEL_ID, name, importance).apply {
                description = desc
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    override fun onAudioFocusChange(focusChange: Int) {
        when (focusChange) {
            AudioManager.AUDIOFOCUS_LOSS, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
                player?.pause()
                updateNotificationTrack(isPaused = true)
                broadcastTrackChange()
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                player?.play()
                updateNotificationTrack(isPaused = false)
                broadcastTrackChange()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "PlaybackService: onDestroy")
        progressHandler.removeCallbacks(progressTicker)
        serviceJob.cancel()
        player?.release()
        player = null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
            audioManager?.abandonAudioFocusRequest(audioFocusRequest!!)
        } else {
            @Suppress("DEPRECATION")
            audioManager?.abandonAudioFocus(this)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
