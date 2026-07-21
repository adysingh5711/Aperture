package com.aperture.gate

import android.app.ActivityManager
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.os.CountDownTimer
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.view.animation.CycleInterpolator
import android.view.animation.TranslateAnimation
import android.widget.Button
import android.widget.EditText
import android.widget.SeekBar
import android.widget.TextView
import android.widget.ImageButton
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.content.ContextCompat
import androidx.core.graphics.ColorUtils
import androidx.cardview.widget.CardView
import androidx.core.view.WindowCompat
import com.aperture.R
import com.aperture.alarm.EndGateReceiver
import com.aperture.data.ActiveSession
import com.aperture.data.ActiveSessionRepository
import com.aperture.data.SettingsRepository
import com.aperture.media.PlaybackService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import java.time.Duration
import java.time.OffsetDateTime
import java.util.Collections
import java.util.Random

class GateActivity : AppCompatActivity() {

    private lateinit var tvCountdown: TextView
    private lateinit var tvProgress: TextView
    private lateinit var tvQuestion: TextView
    private lateinit var etAnswer: EditText
    private lateinit var tvTrackTitle: TextView
    private lateinit var btnPlayPause: ImageButton
    private lateinit var btnRepeat: ImageButton
    private lateinit var seekBar: SeekBar
    private lateinit var tvSeekPosition: TextView
    private lateinit var tvSeekDuration: TextView
    private var isSeeking = false

    private var activeSession: ActiveSession? = null
    private var challengeEngine: ChallengeEngine? = null
    private var settingsDifficulty = "standard"
    private var shuffleKeypadSetting = false
    private var autoplayOnGateStart = true

    private var countdownTimer: CountDownTimer? = null
    private val scope = CoroutineScope(Dispatchers.Main)

    private val activeRepo by lazy { ActiveSessionRepository(applicationContext) }
    private val settingsRepo by lazy { SettingsRepository(applicationContext) }

    companion object {
        private const val TAG = "GateActivity"
    }

    // Broadcast receiver for time out from EndGateReceiver
    private val timeoutReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            Log.d(TAG, "timeoutReceiver: received GATE_TIMEOUT")
            showReleaseScreen(isSolved = false)
        }
    }

    // Broadcast receiver for track changes from PlaybackService
    private val trackReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val title = intent.getStringExtra("title") ?: "No Track Playing"
            val isPlaying = intent.getBooleanExtra("isPlaying", false)
            val repeatOne = intent.getBooleanExtra("repeatOne", false)
            tvTrackTitle.text = title
            btnPlayPause.setImageResource(if (isPlaying) R.drawable.ic_pause else R.drawable.ic_play)
            btnRepeat.setImageResource(if (repeatOne) R.drawable.ic_repeat_one else R.drawable.ic_repeat)
            updateSeekUi(intent.getLongExtra("position", 0L), intent.getLongExtra("duration", 0L))
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        if (savedInstanceState != null) {
            savedInstanceState.remove("android:support:fragments")
            savedInstanceState.remove("androidx:lifecycle:saved_state_registry")
        }
        super.onCreate(null)

        // Follow the app's theme setting so day/night resources resolve correctly
        delegate.localNightMode = when (runBlocking { settingsRepo.read().themeMode }) {
            "light" -> AppCompatDelegate.MODE_NIGHT_NO
            "dark" -> AppCompatDelegate.MODE_NIGHT_YES
            else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        }

        // Ensure activity shows over lockscreen and turns screen on
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            keyguardManager.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }

        setContentView(R.layout.activity_gate)
        Log.d(TAG, "GateActivity: onCreate")

        // 1. Enter Immersive Mode
        enterImmersiveMode()

        // 2. Initialize Views
        tvCountdown = findViewById(R.id.tv_countdown)
        tvProgress = findViewById(R.id.tv_progress)
        tvQuestion = findViewById(R.id.tv_question)
        etAnswer = findViewById(R.id.et_answer)
        tvTrackTitle = findViewById(R.id.tv_track_title)
        btnPlayPause = findViewById(R.id.btn_media_play_pause)

        // Prevent copying / long press on EditText
        etAnswer.customSelectionActionModeCallback = object : android.view.ActionMode.Callback {
            override fun onCreateActionMode(mode: android.view.ActionMode?, menu: android.view.Menu?): Boolean = false
            override fun onPrepareActionMode(mode: android.view.ActionMode?, menu: android.view.Menu?): Boolean = false
            override fun onActionItemClicked(mode: android.view.ActionMode?, item: android.view.MenuItem?): Boolean = false
            override fun onDestroyActionMode(mode: android.view.ActionMode?) {}
        }

        // 3. Load Session & Settings
        runBlocking {
            activeSession = activeRepo.read()
            val settings = settingsRepo.read()
            settingsDifficulty = settings.difficulty
            shuffleKeypadSetting = settings.shuffleKeypad
            autoplayOnGateStart = settings.autoplayOnGateStart
        }

        val session = activeSession
        if (session == null || session.status != "gate_active") {
            Log.w(TAG, "No active gate session found, finishing")
            finish()
            return
        }

        // Verify deadline is not exceeded
        val nowElapsed = SystemClock.elapsedRealtime()
        val remainingMs = session.endAtElapsedMs - nowElapsed
        if (remainingMs <= 0) {
            Log.w(TAG, "Deadline exceeded before launch, finalizing timeout")
            runBlocking {
                val start = OffsetDateTime.parse(session.startedAtIso)
                val contractualEnd = start.plusSeconds((session.waitingDurationMs + session.gateDurationMs) / 1000)
                SessionFinalizer.finalize(applicationContext, session, contractualEnd.toString(), "system_timeout")
            }
            finish()
            return
        }

        // 4. Initialize Engine deterministically
        val seed = session.challengeSeed.toLongOrNull() ?: 0L
        challengeEngine = ChallengeEngine(seed, settingsDifficulty)

        // 5. Start Countdown
        startCountdown(remainingMs)

        // 6. Setup Custom Keypad
        setupKeypad()

        // 7. Setup Pinning Callout UI
        setupPinningCallout()

        // 8. Setup Media Controls
        setupMediaControls()

        // 9. Start PlaybackService (unless the user disabled autoplay in the sound library)
        if (autoplayOnGateStart) {
            startPlaybackService()
        }

        // 10. Display current step
        displayCurrentStep()

        // Register Broadcast Receivers
        val filterTimeout = IntentFilter(EndGateReceiver.GATE_TIMEOUT_ACTION)
        val filterTrack = IntentFilter("com.aperture.media.TRACK_CHANGE")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(timeoutReceiver, filterTimeout, RECEIVER_NOT_EXPORTED)
            registerReceiver(trackReceiver, filterTrack, RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(timeoutReceiver, filterTimeout)
            registerReceiver(trackReceiver, filterTrack)
        }
    }

    override fun onResume() {
        super.onResume()
        enterImmersiveMode()

        // Recheck active session in case it was terminated while backgrounded
        scope.launch {
            val current = activeRepo.read()
            if (current == null) {
                Log.d(TAG, "Session cleared, finishing GateActivity")
                finish()
                return@launch
            }
        }
    }

    private fun enterImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            or View.SYSTEM_UI_FLAG_FULLSCREEN
                    )
        }
    }

    private fun startCountdown(durationMs: Long) {
        countdownTimer = object : CountDownTimer(durationMs, 1000) {
            override fun onTick(millisUntilFinished: Long) {
                val seconds = millisUntilFinished / 1000
                val m = seconds / 60
                val s = seconds % 60
                tvCountdown.text = String.format("%02d:%02d", m, s)
            }

            override fun onFinish() {
                tvCountdown.text = "00:00"
                // Timeout is handled primarily by EndGateReceiver, which will broadcast GATE_TIMEOUT.
                // We also call finalize here as a backup.
                val session = activeSession ?: return
                runBlocking {
                    val start = OffsetDateTime.parse(session.startedAtIso)
                    val contractualEnd = start.plusSeconds((session.waitingDurationMs + session.gateDurationMs) / 1000)
                    SessionFinalizer.finalize(applicationContext, session, contractualEnd.toString(), "system_timeout")
                }
                showReleaseScreen(isSolved = false)
            }
        }.start()
    }

    private fun displayCurrentStep() {
        val session = activeSession ?: return
        val engine = challengeEngine ?: return

        val stepIndex = session.operationIndex
        if (stepIndex >= engine.totalSteps) {
            // Already solved
            handleAllSolved()
            return
        }

        tvProgress.text = "Step ${stepIndex + 1} / ${engine.totalSteps}"
        val step = engine.getStep(stepIndex)
        if (step != null) {
            tvQuestion.text = "${step.operandA} ${step.operation} ${step.operandB}"
        }
        etAnswer.setText("")

        // Shuffle keypad if HARD difficulty and setting is enabled
        if (settingsDifficulty.lowercase() == "hard" && shuffleKeypadSetting) {
            shuffleKeypad(seedOffset = stepIndex)
        } else {
            resetKeypadOrder()
        }
    }

    private fun setupKeypad() {
        val clickListener = View.OnClickListener { v ->
            if (v is Button) {
                etAnswer.append(v.text.toString())
            }
        }

        val keyIds = listOf(
            R.id.btn_key_0, R.id.btn_key_1, R.id.btn_key_2, R.id.btn_key_3,
            R.id.btn_key_4, R.id.btn_key_5, R.id.btn_key_6, R.id.btn_key_7,
            R.id.btn_key_8, R.id.btn_key_9
        )

        for (id in keyIds) {
            findViewById<Button>(id).setOnClickListener(clickListener)
        }

        findViewById<View>(R.id.btn_key_backspace).setOnClickListener {
            val current = etAnswer.text.toString()
            if (current.isNotEmpty()) {
                etAnswer.setText(current.substring(0, current.length - 1))
            }
        }
        findViewById<View>(R.id.btn_key_submit).setOnClickListener { submitAnswer() }
    }

    private fun resetKeypadOrder() {
        val digitIds = listOf(
            R.id.btn_key_0, R.id.btn_key_1, R.id.btn_key_2, R.id.btn_key_3,
            R.id.btn_key_4, R.id.btn_key_5, R.id.btn_key_6, R.id.btn_key_7,
            R.id.btn_key_8, R.id.btn_key_9
        )
        for (i in 0..9) {
            findViewById<Button>(digitIds[i]).text = i.toString()
        }
    }

    private fun shuffleKeypad(seedOffset: Int) {
        val digitIds = listOf(
            R.id.btn_key_0, R.id.btn_key_1, R.id.btn_key_2, R.id.btn_key_3,
            R.id.btn_key_4, R.id.btn_key_5, R.id.btn_key_6, R.id.btn_key_7,
            R.id.btn_key_8, R.id.btn_key_9
        )
        val digits = (0..9).toMutableList()
        val session = activeSession
        val baseSeed = session?.challengeSeed?.toLongOrNull() ?: 0L
        val random = Random(baseSeed + seedOffset)

        // Fisher-Yates Shuffle
        for (i in digits.size - 1 downTo 1) {
            val j = random.nextInt(i + 1)
            val temp = digits[i]
            digits[i] = digits[j]
            digits[j] = temp
        }

        for (i in 0..9) {
            findViewById<Button>(digitIds[i]).text = digits[i].toString()
        }
    }

    private fun submitAnswer() {
        val session = activeSession ?: return
        val engine = challengeEngine ?: return

        // 1. Verify deadline
        if (SystemClock.elapsedRealtime() >= session.endAtElapsedMs) {
            Log.w(TAG, "Submit blocked: deadline exceeded")
            showReleaseScreen(isSolved = false)
            return
        }

        val answerStr = etAnswer.text.toString()
        val submitted = answerStr.toLongOrNull()
        if (submitted == null) {
            shakeAnswerField()
            return
        }

        val stepIndex = session.operationIndex
        val isCorrect = engine.checkAnswer(stepIndex, submitted)

        if (isCorrect) {
            val nextStep = stepIndex + 1
            if (nextStep >= engine.totalSteps) {
                handleAllSolved()
            } else {
                scope.launch {
                    val updated = session.copy(operationIndex = nextStep)
                    activeRepo.write(updated)
                    activeSession = updated
                    displayCurrentStep()
                }
            }
        } else {
            shakeAnswerField()
            etAnswer.setText("")
        }
    }

    private fun shakeAnswerField() {
        val shake = TranslateAnimation(0f, 15f, 0f, 0f).apply {
            duration = 500
            interpolator = CycleInterpolator(4f)
        }
        etAnswer.startAnimation(shake)
        etAnswer.setBackgroundColor(ColorUtils.setAlphaComponent(ContextCompat.getColor(this, R.color.np_error), 0x33))
        etAnswer.postDelayed({
            etAnswer.setBackgroundResource(R.drawable.neopop_panel)
        }, 300)
    }

    private fun handleAllSolved() {
        val session = activeSession ?: return
        runBlocking {
            SessionFinalizer.finalize(applicationContext, session, OffsetDateTime.now().toString(), "system_solve")
        }
        stopPlaybackService()
        stopGuardianService()
        showReleaseScreen(isSolved = true)
    }

    private fun stopGuardianService() {
        try {
            stopService(Intent(this, GateGuardianForegroundService::class.java))
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop GuardianService", e)
        }
    }

    private fun showReleaseScreen(isSolved: Boolean) {
        countdownTimer?.cancel()
        countdownTimer = null

        // Aggressively exit immersive mode to show navigation
        WindowCompat.setDecorFitsSystemWindows(window, true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.show(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
        }
        try {
            unregisterReceiver(timeoutReceiver)
            unregisterReceiver(trackReceiver)
        } catch (e: Exception) {
            // Already unregistered
        }

        // Stop music if timeout
        if (!isSolved) {
            stopPlaybackService()
            stopGuardianService()
        }

        // Change layout visibility to Release state
        findViewById<View>(R.id.layout_challenge).visibility = View.GONE
        findViewById<View>(R.id.layout_keypad).visibility = View.GONE
        findViewById<View>(R.id.layout_media).visibility = View.GONE
        tvProgress.visibility = View.GONE

        val displayLabel = findViewById<TextView>(R.id.tv_label)
        val tvOutcome = findViewById<TextView>(R.id.tv_release_outcome)

        if (isSolved) {
            val session = activeSession
            var timeSpentStr = "successfully"
            if (session != null) {
                val start = OffsetDateTime.parse(session.startedAtIso)
                val duration = Duration.between(start, OffsetDateTime.now())
                val waitSeconds = session.waitingDurationMs / 1000
                val gateSeconds = Math.max(0, duration.seconds - waitSeconds)
                val m = gateSeconds / 60
                val s = gateSeconds % 60
                timeSpentStr = String.format("in %dm %ds", m, s)
            }
            tvOutcome.text = "Solved $timeSpentStr!"
            displayLabel.text = "RELEASED"
            displayLabel.setTextColor(ContextCompat.getColor(this, R.color.np_accent))
        } else {
            tvOutcome.text = "Gate ended automatically"
            displayLabel.text = "TIMEOUT"
            displayLabel.setTextColor(ContextCompat.getColor(this, R.color.np_text_secondary))
        }

        findViewById<Button>(R.id.btn_release_return).setOnClickListener {
            // Navigate back to the dashboard/homepage
            val intent = Intent(this, com.aperture.MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            startActivity(intent)
            finish()
        }
        findViewById<View>(R.id.layout_release).visibility = View.VISIBLE
    }

    private fun setupPinningCallout() {
        // Pinning UI completely removed
    }

    private fun formatClock(ms: Long): String =
        String.format("%d:%02d", ms / 60000, (ms / 1000) % 60)

    private fun updateSeekUi(positionMs: Long, durationMs: Long) {
        if (isSeeking) return
        if (durationMs > 0) {
            seekBar.isEnabled = true
            seekBar.max = (durationMs / 1000).toInt().coerceAtLeast(1)
            seekBar.setProgress((positionMs / 1000).toInt(), true)
            tvSeekDuration.text = formatClock(durationMs)
        } else {
            seekBar.isEnabled = false
            seekBar.max = 1
            seekBar.progress = 0
            tvSeekDuration.text = "0:00"
        }
        tvSeekPosition.text = formatClock(positionMs.coerceAtLeast(0L))
    }

    private fun setupMediaControls() {
        seekBar = findViewById(R.id.seek_playback)
        tvSeekPosition = findViewById(R.id.tv_seek_position)
        tvSeekDuration = findViewById(R.id.tv_seek_duration)
        seekBar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar, progress: Int, fromUser: Boolean) {
                // Live label while dragging; playback position is applied on release.
                if (fromUser) tvSeekPosition.text = formatClock(progress * 1000L)
            }

            override fun onStartTrackingTouch(sb: SeekBar) {
                isSeeking = true
            }

            override fun onStopTrackingTouch(sb: SeekBar) {
                isSeeking = false
                val seekIntent = Intent(this@GateActivity, PlaybackService::class.java).apply {
                    action = PlaybackService.ACTION_PLAYBACK_CONTROL
                    putExtra(PlaybackService.EXTRA_COMMAND, "seek_to")
                    putExtra(PlaybackService.EXTRA_SEEK_POSITION, sb.progress * 1000L)
                }
                startService(seekIntent)
            }
        })

        val sendCommand = { cmd: String ->
            // Must be explicit: the service has no intent-filter, so an action-only
            // intent never resolves and commands silently vanish.
            val controlIntent = Intent(this, PlaybackService::class.java).apply {
                action = PlaybackService.ACTION_PLAYBACK_CONTROL
                putExtra(PlaybackService.EXTRA_COMMAND, cmd)
            }
            startService(controlIntent)
        }

        btnRepeat = findViewById(R.id.btn_media_repeat)

        findViewById<View>(R.id.btn_media_shuffle).setOnClickListener { sendCommand("shuffle") }
        findViewById<View>(R.id.btn_media_rewind).setOnClickListener { sendCommand("rewind") }
        findViewById<View>(R.id.btn_media_prev).setOnClickListener { sendCommand("prev") }
        btnPlayPause.setOnClickListener { sendCommand("play_pause") }
        findViewById<View>(R.id.btn_media_next).setOnClickListener { sendCommand("next") }
        findViewById<View>(R.id.btn_media_forward).setOnClickListener { sendCommand("forward") }
        btnRepeat.setOnClickListener { sendCommand("repeat_toggle") }
    }

    private fun startPlaybackService() {
        try {
            val serviceIntent = Intent(this, PlaybackService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent)
            } else {
                startService(serviceIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start PlaybackService", e)
        }
    }

    private fun stopPlaybackService() {
        try {
            stopService(Intent(this, PlaybackService::class.java))
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop PlaybackService", e)
        }
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        // ponytail: intentional no-op
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        // M2-19: Re-launch immediately if user tries to leave via Home button
        val session = activeSession ?: return
        if (session.status == "gate_active") {
            val intent = Intent(this, GateActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            }
            startActivity(intent)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "GateActivity: onDestroy")
        countdownTimer?.cancel()
        scope.cancel()
        try {
            unregisterReceiver(timeoutReceiver)
            unregisterReceiver(trackReceiver)
        } catch (e: Exception) {
            // Already unregistered
        }
    }
}
