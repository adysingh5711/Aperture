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
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
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
    private lateinit var cardPinning: CardView
    private lateinit var tvTrackTitle: TextView
    private lateinit var btnPlayPause: Button

    private var activeSession: ActiveSession? = null
    private var challengeEngine: ChallengeEngine? = null
    private var settingsDifficulty = "standard"
    private var shuffleKeypadSetting = false

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
            tvTrackTitle.text = title
            btnPlayPause.text = if (isPlaying) "⏸" else "▶"
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        if (savedInstanceState != null) {
            savedInstanceState.remove("android:support:fragments")
            savedInstanceState.remove("androidx:lifecycle:saved_state_registry")
        }
        super.onCreate(null)
        
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
        cardPinning = findViewById(R.id.card_pinning)
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
        }

        val session = activeSession
        if (session == null || session.status != "gate_active") {
            Log.w(TAG, "No active gate session found, finishing")
            ScreenPinningController.stopPinning(this)
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
            ScreenPinningController.stopPinning(this)
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

        // 9. Start PlaybackService
        startPlaybackService()

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
                ScreenPinningController.stopPinning(this@GateActivity)
                finish()
                return@launch
            }

            // M2-19: Re-trigger pinning if user returns to activity and it's not pinned
            val settings = settingsRepo.read()
            if (settings.screenPinningInstructionsSeen) {
                ScreenPinningController.requestPinning(this@GateActivity)
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
                val txt = v.text.toString()
                if (txt == "⌫") {
                    val current = etAnswer.text.toString()
                    if (current.isNotEmpty()) {
                        etAnswer.setText(current.substring(0, current.length - 1))
                    }
                } else if (txt == "→") {
                    submitAnswer()
                } else {
                    etAnswer.append(txt)
                }
            }
        }

        val keyIds = listOf(
            R.id.btn_key_0, R.id.btn_key_1, R.id.btn_key_2, R.id.btn_key_3,
            R.id.btn_key_4, R.id.btn_key_5, R.id.btn_key_6, R.id.btn_key_7,
            R.id.btn_key_8, R.id.btn_key_9, R.id.btn_key_backspace, R.id.btn_key_submit
        )

        for (id in keyIds) {
            findViewById<Button>(id).setOnClickListener(clickListener)
        }
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
        etAnswer.setBackgroundColor(0x33FF0000)
        etAnswer.postDelayed({
            etAnswer.setBackgroundColor(android.graphics.Color.TRANSPARENT)
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

        // Stop Pinning (M2-18: Exit pinned mode automatically on release)
        ScreenPinningController.stopPinning(this)
        
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
        cardPinning.visibility = View.GONE
        tvProgress.visibility = View.GONE

        val displayLabel = findViewById<TextView>(R.id.tv_label)
        val tvOutcome = findViewById<TextView>(R.id.tv_release_outcome)
        val tvUnpinHint = findViewById<TextView>(R.id.tv_release_unpin)

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
            displayLabel.setTextColor(0xFF3B82F6.toInt())
        } else {
            tvOutcome.text = "Gate ended automatically"
            displayLabel.text = "TIMEOUT"
            displayLabel.setTextColor(0xFF94A3B8.toInt())
        }

        // Check if pinned and show instruction
        val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val isPinned = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
        } else {
            @Suppress("DEPRECATION")
            am.isInLockTaskMode
        }
        tvUnpinHint.visibility = if (isPinned) View.VISIBLE else View.GONE

        findViewById<Button>(R.id.btn_release_return).setOnClickListener {
            ScreenPinningController.stopPinning(this)
            
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
        // Automatic pinning request if opted-in via settings (M2-19)
        scope.launch {
            val settings = settingsRepo.read()
            val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val isCurrentlyPinned = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
            } else {
                @Suppress("DEPRECATION")
                am.isInLockTaskMode
            }

            if (!isCurrentlyPinned) {
                if (settings.screenPinningInstructionsSeen) {
                    // Auto-trigger system popup for friction
                    ScreenPinningController.requestPinning(this@GateActivity)
                } else {
                    // User hasn't acknowledged settings yet, show educational card
                    cardPinning.visibility = View.VISIBLE
                }
            } else {
                // Already pinned, hide card
                cardPinning.visibility = View.GONE
            }
        }

        findViewById<Button>(R.id.btn_pin_dismiss).setOnClickListener {
            cardPinning.visibility = View.GONE
        }

        findViewById<Button>(R.id.btn_pin_request).setOnClickListener {
            cardPinning.visibility = View.GONE
            ScreenPinningController.requestPinning(this)
        }
    }

    private fun setupMediaControls() {
        val sendCommand = { cmd: String ->
            val controlIntent = Intent(PlaybackService.ACTION_PLAYBACK_CONTROL).apply {
                putExtra(PlaybackService.EXTRA_COMMAND, cmd)
                setPackage(packageName)
            }
            startService(controlIntent)
        }

        findViewById<Button>(R.id.btn_media_shuffle).setOnClickListener { sendCommand("shuffle") }
        findViewById<Button>(R.id.btn_media_rewind).setOnClickListener { sendCommand("rewind") }
        findViewById<Button>(R.id.btn_media_prev).setOnClickListener { sendCommand("prev") }
        btnPlayPause.setOnClickListener { sendCommand("play_pause") }
        findViewById<Button>(R.id.btn_media_next).setOnClickListener { sendCommand("next") }
        findViewById<Button>(R.id.btn_media_forward).setOnClickListener { sendCommand("forward") }
        findViewById<Button>(R.id.btn_media_random).setOnClickListener { sendCommand("random") }
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
