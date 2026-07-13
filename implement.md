# Aperture: Implementation TODOs

> Ponytail full mode. Every step is what you type or build — no meta-tasks like "research X" or "decide approach". Decisions are made inline.

---

## Pre-flight

- [ ] **P-1** Init RN CLI project (not Expo):
  ```bash
  npx -y @react-native-community/cli init Aperture --template react-native-template-typescript
  ```
  Move contents into current dir if needed. Confirm `npx react-native run-android` boots on a connected device/emulator.

- [ ] **P-2** Strip boilerplate: delete `App.tsx` default content, `__tests__/`, sample assets.

- [ ] **P-3** Install only what's needed now:
  ```bash
  npm install @react-navigation/native @react-navigation/bottom-tabs react-native-screens react-native-safe-area-context
  ```
  No state management library — use React context + `useReducer` where needed. No styled-components — use `StyleSheet.create`. No date library — `Intl.DateTimeFormat` and raw timestamps are enough.
  <!-- ponytail: no redux/zustand/mobx — plain context covers this app's shallow state tree. Upgrade path: zustand if >3 screens share non-trivial derived state -->

- [ ] **P-4** Add Inter font via `react-native.config.js` asset linking, or fall back to system sans. Don't burn time on custom font tooling if linking doesn't work in 10 minutes — system font is fine.
  <!-- ponytail: system font fallback. Ceiling: no tabular numerals on some Android system fonts. Upgrade: bundle Inter TTF later -->

- [ ] **P-5** Create the color/spacing/type tokens file:
  ```
  src/theme.ts
  ```
  ```ts
  export const colors = {
    surface: '#101827',
    background: '#F8FAFC',
    action: '#004BB8',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    gateBg: '#0A0F1A',
    border: '#1E293B',
    heatNone: '#1E293B',
    heatLow: '#1E3A5F',
    heatMid: '#1D4ED8',
    heatHigh: '#3B82F6',
  } as const;

  export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
  export const radii = { card: 16, button: 12 } as const;
  ```

---

## M1: App Skeleton & Journal

### Navigation shell

- [ ] **M1-1** Create bottom tab navigator with 4 tabs: `Today`, `Journal`, `Patterns`, `Settings`. Use `@react-navigation/bottom-tabs`.
  - File: `src/navigation/AppNavigator.tsx`
  - Tab icons: use simple Unicode glyphs or minimal SVGs (no icon library dependency).
    <!-- ponytail: unicode tab icons. Ceiling: no filled/outlined variants. Upgrade: react-native-vector-icons -->
  - Tab bar style: `backgroundColor: colors.surface`, no labels on inactive, active tint `colors.action`.

- [ ] **M1-2** Create stub screens (one file each, just a `<View>` with the screen name):
  - `src/screens/TodayScreen.tsx`
  - `src/screens/JournalScreen.tsx`
  - `src/screens/PatternsScreen.tsx`
  - `src/screens/SettingsScreen.tsx`

- [ ] **M1-3** Add a stack navigator nested inside the Journal tab for day-detail drill-down:
  - `JournalScreen` → `DayDetailScreen` (push)
  - File: `src/navigation/JournalStack.tsx`
  - `src/screens/DayDetailScreen.tsx` (stub)

- [ ] **M1-4** Wire `App.tsx`: `NavigationContainer` → `AppNavigator`. Confirm all 4 tabs render and Journal→DayDetail push works.

### Kotlin native module foundation

- [ ] **M1-5** Create the native module package structure:
  ```
  android/app/src/main/java/com/aperture/
  ├── AperturePackage.kt          (ReactPackage)
  ├── ApertureNativeModule.kt     (ReactContextBaseJavaModule)
  └── data/
      ├── CommitmentLogRepository.kt
      └── models.kt
  ```

- [ ] **M1-6** Implement `CommitmentLogRepository`:
  - Uses `android.util.AtomicFile` wrapping `filesDir/journal.json`.
  - Internal schema: `{ schemaVersion: 1, timezone: string, days: { [date]: { sessions: Session[] } } }`.
  - Read method: parse JSON, return the model. If file missing/corrupt, return empty default.
  - Write method: read → mutate in memory → `AtomicFile.startWrite()` → write full JSON → `finishWrite()` / `failWrite()`.
  - Use `kotlinx.coroutines.sync.Mutex` to serialize writes.
  - Edge case: file is 0 bytes or unparseable → log, return empty, don't crash.
  - Edge case: concurrent write from receiver + app → Mutex serializes them.

- [ ] **M1-7** Define `models.kt`:
  ```kotlin
  data class Session(
      val id: String,            // UUID
      val start: String,         // ISO OffsetDateTime
      val end: String?,          // null while active
      val endSource: String?,    // system_solve | system_timeout | system_cancel | manual | manual_entry
      val originalEnd: String?,  // set on manual edit
      val editedAt: String?,     // set on manual edit
      val waitingDurationMs: Long?,  // null for manual_entry
      val gateDurationMs: Long?,     // null for manual_entry
      val kind: String?,         // "enforced" (default) | "manual"
  )
  ```

- [ ] **M1-8** Expose through `ApertureNativeModule`:
  ```kotlin
  @ReactMethod fun getJournal(promise: Promise)
  @ReactMethod fun addManualSession(input: ReadableMap, promise: Promise)
  @ReactMethod fun updateCompletedEnd(input: ReadableMap, promise: Promise)
  ```
  - `getJournal`: returns the entire journal JSON as a string (RN side parses it). Simple, no per-field bridging overhead.
    <!-- ponytail: pass raw JSON string across bridge. Ceiling: no structured bridge types, slight parse overhead. Upgrade: Turbo Modules with codegen if perf matters -->
  - `addManualSession`: validate `end >= start`, generate UUID, insert into correct day bucket (keyed by local date of `start`), atomic write.
  - `updateCompletedEnd`: find session by ID, validate session is terminal (`end != null`), validate new end is `>= start` and `<= contractual end` (if metadata available), set `originalEnd` to old end, set `editedAt`, atomic write.
  - Edge case for `updateCompletedEnd`: session's `waitingDurationMs`/`gateDurationMs` are null (manual entry) → allow any `end >= start` with user confirmation flag in input.
  - Edge case: session not found → reject promise with clear error.
  - Edge case: session `end` is null (still active) → reject, not editable.

- [ ] **M1-9** Register module: `AperturePackage.kt` returns `ApertureNativeModule` in `createNativeModules`. Add package to `MainApplication.kt`'s `getPackages()`.

- [ ] **M1-10** Create TS bridge wrapper:
  ```
  src/native/ApertureModule.ts
  ```
  ```ts
  import { NativeModules } from 'react-native';
  const { ApertureNativeModule } = NativeModules;
  export default ApertureNativeModule as ApertureModuleType;
  ```
  Define `ApertureModuleType` interface with all methods and their TS signatures. Type the `Session`, `CommitmentLog` etc. in `src/types.ts`.

### Today screen (pre-session state only for M1)

- [ ] **M1-11** Build `TodayScreen.tsx`:
  - Date header: `Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long' })`.
  - "Start commitment" button — disabled/placeholder for M1 (session logic is M2).
  - `Gate starts in 10 min` / `Ends automatically 15 min later` — static text showing defaults.
  - Daily summary at bottom: fetch journal for today's date, compute `commitments count` and `total gate time` (sum of `end - max(start + waitingDurationMs, start)` for sessions that reached gate).
  - Use `useFocusEffect` to reload journal on tab focus.

- [ ] **M1-12** Style Today screen per visual system: dark background `colors.surface`, large white date header, blue action button with `radii.button`, card-style summary with `radii.card` and 1px `colors.border`.

### Journal screen

- [ ] **M1-13** Build calendar heatmap in `src/components/CalendarHeatmap.tsx`:
  - Show one month at a time, swipeable (or month-nav arrows — simpler).
    <!-- ponytail: arrows not swipe. Ceiling: less fluid. Upgrade: FlatList horizontal paging -->
  - 7-column grid (Mon–Sun), day cells are `View` with background color mapped by gate-minutes.
  - Intensity mapping: 0 → `heatNone`, 1–5min → `heatLow`, 5–15min → `heatMid`, >15min → `heatHigh`. These are arbitrary starting thresholds, adjustable later.
  - Tap a day cell → navigate to `DayDetail` with the date param.
  - Accessibility: each cell has `accessibilityLabel` like `"July 13, 2 sessions, 9 minutes gate time"`.
  - Edge case: month with no data → all neutral cells, no error.
  - Edge case: session crossing midnight → grouped under start date, so it shows on the correct day.

- [ ] **M1-14** Build `JournalScreen.tsx`:
  - Render `CalendarHeatmap` at top.
  - Below: summary of selected/current month (`X commitments, Ym Zs total gate time`).
  - FAB or text button: "Add session manually" → modal/sheet for manual entry.
  - Load journal from native module on mount + focus.

- [ ] **M1-15** Build manual session entry UI in `src/components/ManualEntrySheet.tsx`:
  - Fields: date picker, start time picker, end time picker.
  - Use RN's built-in `DateTimePicker` from `@react-native-community/datetimepicker` (install it).
  - Validate: `end >= start`. Show inline error if not.
  - On save: call `ApertureModule.addManualSession(...)`, dismiss sheet, refresh journal.
  - No notes field in v1.
    <!-- ponytail: no notes field. Ceiling: no qualitative data. Upgrade: add optional text field + schema migration -->

### Day detail screen

- [ ] **M1-16** Build `DayDetailScreen.tsx`:
  - Receives `date` param from navigation.
  - Header: formatted date + summary line (`2 commitments · 9m 18s gate time`).
  - List of sessions for that day, sorted by start time.
  - Each session row shows:
    - Start time.
    - Gate window (derived: `start + waitingDurationMs` → `end`), or just start→end for manual entries.
    - Outcome label: derive from timing (see plan's derived display state):
      - `end < gateStart` → "Cancelled before gate"
      - `gateStart <= end < gateEnd` → "Solved in Xm Ys"
      - `end == gateEnd` → "Automatic end"
      - `kind == 'manual'` → "Manual entry"
    - Overflow menu (three-dot or long press) on completed sessions: "Edit end time".
  - Edge case: no sessions for day → "No commitments this day" message.
  - Edge case: session with `end: null` → show as "In progress" if it exists for today.

- [ ] **M1-17** Build edit-end-time sheet in `src/components/EditEndSheet.tsx`:
  - Pre-populate with current end time.
  - Time picker constrained: `>= start`, `<= contractual end` (compute from `start + waitingDurationMs + gateDurationMs`).
  - Edge case: `waitingDurationMs`/`gateDurationMs` null (manual entry) → only constrain `end >= start`.
  - On save: call `ApertureModule.updateCompletedEnd(...)`, refresh.

- [ ] **M1-18** Verify M1 end-to-end:
  - App boots, 4 tabs render.
  - Journal shows empty calendar.
  - Add manual session → appears in calendar heatmap and day detail.
  - Edit end time on that session → `originalEnd` preserved, new end shown.
  - Today shows daily summary from journal data.

---

## M2: Session Timing

### Active session Kotlin layer

- [ ] **M2-1** Create `ActiveSessionRepository.kt`:
  - File: `filesDir/active-session.json`, also using `AtomicFile`.
  - Schema per plan: `schemaVersion`, `sessionId`, `status`, `waitingDurationMs`, `gateDurationMs`, `startedAtIso`, `startElapsedMs`, `gateAtElapsedMs`, `endAtElapsedMs`, `challengeSeed`, `operationIndex`, `queueMediaIds`, `currentMediaIndex`.
  - `read()`: parse or return null if absent/corrupt.
  - `write(session)`: atomic write.
  - `clear()`: delete the file.
  - Edge case: file exists but JSON is garbage → treat as null (no active session), log the anomaly.

- [ ] **M2-2** Create `AlarmController.kt`:
  - `scheduleGateAlarms(gateAtElapsedMs, endAtElapsedMs, sessionId)`:
    - Check `AlarmManager.canScheduleExactAlarms()` (API 31+). If false, reject with `exact_alarms_denied`.
    - Schedule `START_GATE` alarm: `AlarmManager.setExactAndAllowWhileIdle(ELAPSED_REALTIME_WAKEUP, gateAtElapsedMs, startGatePendingIntent)`.
    - Schedule `END_GATE` alarm: same clock type, `endAtElapsedMs`, endGatePendingIntent.
    - PendingIntents use `FLAG_IMMUTABLE | FLAG_UPDATE_CURRENT`, explicit intents to the receivers, extras carry `sessionId`.
  - `cancelAll()`: cancel both pending intents.
  - Edge case: API < 31 → `canScheduleExactAlarms` doesn't exist, exact alarms are available by default → skip the check.

- [ ] **M2-3** Create `StartGateReceiver.kt`:
  ```kotlin
  class StartGateReceiver : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
          val repo = ActiveSessionRepository(context)
          val session = repo.read() ?: return  // absent → no-op
          if (session.status != "waiting_for_gate") return  // already active or terminal
          val now = SystemClock.elapsedRealtime()
          if (now >= session.endAtElapsedMs) {
              // Gate start arrived after end deadline → finalize as timeout, don't show gate
              finalizeTimeout(context, session)
              return
          }
          repo.write(session.copy(status = "gate_active"))
          // Launch GateActivity
          val gateIntent = Intent(context, GateActivity::class.java).apply {
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
          }
          context.startActivity(gateIntent)
      }
  }
  ```
  - `finalizeTimeout`: write journal end = contractual end time (wall clock), endSource = `system_timeout`, clear active session. (Extract to shared `SessionFinalizer` object.)

- [ ] **M2-4** Create `EndGateReceiver.kt`:
  ```kotlin
  class EndGateReceiver : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
          val repo = ActiveSessionRepository(context)
          val session = repo.read() ?: return
          if (session.status != "gate_active") return  // no-op if not in gate
          finalizeTimeout(context, session)
          // Try to tell GateActivity to dismiss
          LocalBroadcastManager.getInstance(context)
              .sendBroadcast(Intent("GATE_TIMEOUT"))
          // Stop PlaybackService if running
          context.stopService(Intent(context, PlaybackService::class.java))
      }
  }
  ```
  - Edge case: duplicate delivery → `finalizeTimeout` is idempotent (checks if already terminal before writing).

- [ ] **M2-5** Create `SessionFinalizer.kt` (shared object):
  ```kotlin
  object SessionFinalizer {
      private val mutex = Mutex()
      suspend fun finalize(context: Context, session: ActiveSession, endIso: String, endSource: String) {
          mutex.withLock {
              val logRepo = CommitmentLogRepository(context)
              val activeRepo = ActiveSessionRepository(context)
              // Idempotent: check session still exists
              val current = activeRepo.read() ?: return
              if (current.sessionId != session.sessionId) return
              logRepo.updateSessionEnd(session.sessionId, endIso, endSource)
              activeRepo.clear()
          }
      }
  }
  ```
  - For receiver context (no coroutine scope), use `runBlocking` with a short timeout.
    <!-- ponytail: runBlocking in receiver. Ceiling: blocks receiver thread briefly. Upgrade: goAsync() + coroutine if >100ms writes observed -->

- [ ] **M2-6** Wire `startSession` in `ApertureNativeModule`:
  ```kotlin
  @ReactMethod
  fun startSession(input: ReadableMap, promise: Promise) {
      val activeRepo = ActiveSessionRepository(reactApplicationContext)
      if (activeRepo.read() != null) {
          promise.reject("ACTIVE_SESSION_EXISTS", "Cancel the current session first")
          return
      }
      val waitMs = input.getInt("waitingDurationMinutes") * 60_000L
      val gateMs = input.getInt("gateDurationMinutes") * 60_000L
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
          challengeSeed = SecureRandom().nextLong().toString(),
          operationIndex = 0,
          queueMediaIds = emptyList(),
          currentMediaIndex = 0,
      )
      // Invariant: persist journal start BEFORE scheduling alarms
      commitmentLogRepo.addSession(session.sessionId, session.startedAtIso, waitMs, gateMs)
      activeRepo.write(session)
      try {
          alarmController.scheduleGateAlarms(session.gateAtElapsedMs, session.endAtElapsedMs, sessionId)
      } catch (e: Exception) {
          // Rollback: remove from journal + active
          commitmentLogRepo.removeSession(sessionId)
          activeRepo.clear()
          promise.reject("ALARM_FAILED", e.message)
          return
      }
      promise.resolve(sessionToMap(session))
  }
  ```
  - Edge case: `canScheduleExactAlarms()` false → `alarmController` throws → rollback.
  - Edge case: active session already exists → reject immediately.

- [ ] **M2-7** Wire `cancelWaitingSession` in `ApertureNativeModule`:
  - Read active session. If null or status != `waiting_for_gate`, reject.
  - Finalize: write journal end = now wall clock, endSource = `system_cancel`.
  - Cancel alarms.
  - Clear active session.

- [ ] **M2-8** Wire `getActiveSession` in `ApertureNativeModule`:
  - Return active session JSON or null.

- [ ] **M2-9** Wire `getCapabilities` in `ApertureNativeModule`:
  ```kotlin
  @ReactMethod
  fun getCapabilities(promise: Promise) {
      val map = Arguments.createMap()
      map.putBoolean("canScheduleExactAlarms",
          if (Build.VERSION.SDK_INT >= 31) alarmManager.canScheduleExactAlarms() else true)
      map.putBoolean("screenPinningInstructionsSeen",
          settingsRepo.getPinningInstructionsSeen())
      promise.resolve(map)
  }
  ```

- [ ] **M2-10** Update `AndroidManifest.xml`:
  ```xml
  <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
  <uses-permission android:name="android.permission.WAKE_LOCK" />
  <receiver android:name=".alarm.StartGateReceiver" android:exported="false" />
  <receiver android:name=".alarm.EndGateReceiver" android:exported="false" />
  ```

### Duration wheel picker

- [ ] **M2-11** Install picker dependency:
  ```bash
  npm install @react-native-picker/picker
  ```
  <!-- ponytail: @react-native-picker/picker gives native wheel on Android. Ceiling: styling options are limited. Upgrade: custom scroll-snap FlatList wheel -->

- [ ] **M2-12** Build `DurationPickerSheet.tsx` in `src/components/`:
  - Bottom sheet (use a simple `Modal` with `animationType="slide"` — no sheet library).
    <!-- ponytail: RN Modal as bottom sheet. Ceiling: no drag-to-dismiss gesture. Upgrade: @gorhom/bottom-sheet if gesture needed -->
  - Two modes: "Waiting duration" and "Gate duration".
  - `Picker` component with items 1–60 (integer minutes).
  - Defaults: waiting=10, gate=15.
  - `Cancel` / `Done` buttons.
  - Selected value passed back via callback.
  - Persist last-used values: call native `updateSettings` or store in AsyncStorage.
    <!-- ponytail: AsyncStorage for RN-side prefs. Ceiling: two sources of truth (native settings JSON + AsyncStorage). Upgrade: route all settings through native module -->
  - Style: dark modal background, high-contrast selected row (Picker handles this natively on Android).

### Today screen — session flow

- [ ] **M2-13** Expand `TodayScreen.tsx` state machine:
  - States: `idle` | `confirming` | `waiting` | `gate_active`
  - On mount + focus: call `getActiveSession()`. If session exists:
    - `waiting_for_gate` → show waiting UI.
    - `gate_active` → show "Gate is active" message (gate itself is native GateActivity).
  - `idle`: show start button + duration display + daily summary.
  - `confirming`: show confirmation card with exact times.
  - `waiting`: show countdown + cancel button.

- [ ] **M2-14** Build start confirmation card:
  - Compute gate start time: `new Date(Date.now() + waitMinutes * 60000)`.
  - Compute automatic end: `gateStart + gateMinutes * 60000`.
  - Format with `Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' })`.
  - Show:
    ```
    Gate begins: 10:42 PM
    Automatic end: 10:57 PM
    Gate starts in 10 minutes. It will end after 15 minutes unless you complete the sequence earlier.
    [Start commitment]
    ```
  - On confirm: call `ApertureModule.startSession(...)`. On success → transition to `waiting` state.
  - On error: if `ACTIVE_SESSION_EXISTS` → refresh state. If `ALARM_FAILED` → show exact-alarm permission guidance.

- [ ] **M2-15** Build waiting phase UI:
  - Countdown timer: compute locally.
    - Store the wall-clock time the gate should start (`Date.now() + waitMs` at start time) as a local JS state and count down to it.
      <!-- ponytail: JS-side countdown from wall clock. Ceiling: wall clock change could desync the countdown display (not the actual alarm). Upgrade: bridge elapsedRealtime and compute diff natively -->
  - Show gate-start and gate-end absolute times.
  - `Cancel commitment` button → call `cancelWaitingSession()`, transition to `idle`.
  - Edge case: user backgrounds app during wait, comes back → `useFocusEffect` re-checks active session.

- [ ] **M2-16** Exact alarm permission UX:
  - On app start (or before first session start), call `getCapabilities()`.
  - If `canScheduleExactAlarms === false`:
    - Show a banner on Today: "Aperture needs exact alarm permission for reliable gate timing."
    - Button: "Open settings" → open exact alarm settings page.
      ```kotlin
      @ReactMethod fun openExactAlarmSettings() {
          val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          reactApplicationContext.startActivity(intent)
      }
      ```
    - If user still declines: just warn and let them try; the alarm scheduling will fail and they'll see the error.
      <!-- ponytail: just warn, don't build a foreground-only countdown mode in M2. Ceiling: sessions won't fire gate if permission denied. Upgrade: foreground countdown service as fallback in M7 -->

- [ ] **M2-17** Process death / app restart reconciliation:
  - In `TodayScreen` mount, call `getActiveSession()`.
  - Add to `ApertureNativeModule.getActiveSession()`: if session exists, compare current `elapsedRealtime()` to stored values. If current elapsed < `startElapsedMs` (reboot happened), finalize as `interrupted_by_reboot` and return null.
  - Edge case: session status is `gate_active` but elapsed is past `endAtElapsedMs` → finalize as `system_timeout`, return null.

- [ ] **M2-18** Verify M2 end-to-end:
  - Start session with default 10/15 → confirmation shows correct times → waiting countdown runs.
  - Cancel during wait → journal shows cancelled session.
  - Let wait expire → gate alarm fires (GateActivity is stub for now, just log or toast).
  - Start with exact alarm permission revoked → error message shown.
  - Kill app during wait, reopen → waiting state restored.
  - Reboot during wait, reopen → session finalized as interrupted.

---

## M3: Gate Mechanics

### GateActivity (native Kotlin Activity)

- [ ] **M3-1** Create `gate/GateActivity.kt`:
  - Extends `AppCompatActivity` (not `ReactActivity` — this is fully native UI).
    <!-- ponytail: native Activity, not RN screen. Reason: plan says GateActivity needs immersive mode, paste blocking, no external intents — easier to enforce natively. The plan's architecture diagram shows GateActivity in Kotlin layer. -->
  - `onCreate`:
    - Enter immersive mode: hide status bar + nav bar with `SYSTEM_UI_FLAG_IMMERSIVE_STICKY | SYSTEM_UI_FLAG_FULLSCREEN | SYSTEM_UI_FLAG_HIDE_NAVIGATION` (or WindowInsetsController on API 30+).
    - Read active session from `ActiveSessionRepository`.
    - If null or status != `gate_active` → finish immediately.
    - Compute remaining gate time: `endAtElapsedMs - SystemClock.elapsedRealtime()`. If <= 0 → finalize timeout, finish.
    - Start countdown timer (Android `CountDownTimer`).
    - Initialize `ChallengeEngine` with stored seed and `operationIndex`.
    - Display first (or resumed) challenge.
    - Register `LocalBroadcastReceiver` for `GATE_TIMEOUT` action.
  - Layout: built in XML.
    <!-- ponytail: XML layout. Ceiling: verbose. Upgrade: Jetpack Compose -->

- [ ] **M3-2** Build gate layout `res/layout/activity_gate.xml`:
  - `ConstraintLayout` with black background (`#0A0F1A`).
  - Top: countdown `TextView` — large white text, monospace/tabular digits.
  - Center: "Release gate" label, step progress "2 / 5", question `TextView` (e.g. "4,271 + 893 = ?").
  - Answer: `EditText` — styled, no paste/selection (set `android:longClickable="false"`, `android:textIsSelectable="false"`, custom `ActionMode.Callback` that returns true for all actions to block context menu).
  - Numeric keypad: custom grid of buttons (0-9, backspace, submit). Avoid system keyboard to prevent paste/autocomplete.
    - 4×3 grid: `[1][2][3] / [4][5][6] / [7][8][9] / [⌫][0][→]`
    - Style: dark buttons with white text, blue submit button.
  - Bottom area: music player mini-controls (placeholder for M4).
  - Screen Pinning callout: a dismissible `CardView` overlay (for M5).

- [ ] **M3-3** Create `ChallengeEngine.kt`:
  ```kotlin
  class ChallengeEngine(seed: Long, difficulty: Difficulty) {
      private val random = Random(seed)
      private val steps: List<ChallengeStep> = generateSteps()

      data class ChallengeStep(
          val operandA: Long,
          val operation: Char,  // +, -, ×, ÷
          val operandB: Long,
          val correctAnswer: Long,
      )

      enum class Difficulty(val stepCount: Int, val digitRange: IntRange) {
          LIGHT(3, 2..3),
          STANDARD(5, 3..5),
          HARD(6, 4..6),
      }
  }
  ```
  - `generateSteps()`:
    - For each step, pick a random operation.
    - For `+` and `-`: generate two operands in digit range, compute answer. For `-`, ensure `a >= b` (swap if needed) so result is positive.
    - For `×`: generate two operands in lower digit range to keep result reasonable. Cap result at configured upper bound (e.g. 999_999).
    - For `÷`: generate answer and divisor in digit range, compute dividend = answer × divisor. This guarantees integer division.
    - Edge case: intermediate overflow → use `Long`, cap at 6-digit results max.
    - Validate all results are positive.
  - `getStep(index: Int): ChallengeStep` — returns the challenge at that index.
  - `checkAnswer(index: Int, submitted: Long): Boolean` — compares to `correctAnswer`.
  - `totalSteps: Int` — returns step count for difficulty.
  - The engine is deterministic: same seed + difficulty always produces same sequence. This enables recovery after process death.

- [ ] **M3-4** Wire challenge flow in `GateActivity`:
  - State: `currentStep` (loaded from `activeSession.operationIndex`).
  - Display: show `steps[currentStep]` question.
  - On submit button tap:
    1. Check `SystemClock.elapsedRealtime() >= endAtElapsedMs` → if yes, finalize timeout, don't accept answer.
    2. Parse user input as Long. If unparseable, show "Enter a number".
    3. Call `engine.checkAnswer(currentStep, submitted)`.
    4. Correct → increment `currentStep`, persist to active session, show next question.
    5. If `currentStep == totalSteps` → all solved → finalize as `system_solve`:
       - Write journal end = `OffsetDateTime.now().toString()`, endSource = `system_solve`.
       - Clear active session.
       - Stop media (M4).
       - Exit immersive mode.
       - Show release screen / finish activity.
    6. Wrong → show brief red flash / shake animation on answer field, clear input. Do NOT reset progress.
  - Edge case: solve at exact boundary → check deadline BEFORE accepting final answer. Timeout wins per plan.

- [ ] **M3-5** Countdown timer in `GateActivity`:
  - Compute `remainingMs = endAtElapsedMs - SystemClock.elapsedRealtime()`.
  - Use `CountDownTimer(remainingMs, 1000)`:
    - `onTick`: update countdown text — format as `MM:SS`.
    - `onFinish`: finalize timeout if not already finalized (idempotent).
  - Edge case: timer finishes but `EndGateReceiver` also fires → both call finalize → Mutex + idempotent check.

- [ ] **M3-6** Handle `GATE_TIMEOUT` broadcast in `GateActivity`:
  - On receive: show "Gate ended — time expired", disable keypad, stop media, after 2-second delay → finish or navigate to release screen.

- [ ] **M3-7** Handle activity recreation (config change, process death):
  - On `onCreate`, re-read active session from file.
  - If `status != gate_active` → finish.
  - Re-init `ChallengeEngine` with same `challengeSeed` → deterministic, produces same steps.
  - Resume from `operationIndex`.
  - Recompute countdown from elapsed realtime.
  - Re-enter immersive mode.
  - Edge case: process death during gate, alarm fires `EndGateReceiver` → receiver finalizes. On next app start, active session is null → Today shows idle.

- [ ] **M3-8** Gate release screen:
  - After solve or timeout, transition to a simple view (could be a new layout in GateActivity or a fragment):
    - "Gate has ended" message.
    - Solve: "Solved in Xm Ys".
    - Timeout: "Gate ended automatically".
    - "Return" button → finish activity, user lands back in RN app.
    - If pinned: show unpin instruction (M5, placeholder for now).

- [ ] **M3-9** Prevent unintended escape from GateActivity:
  - Override `onBackPressed` → no-op (don't finish).
  - The user can still use Home/Recents — this is intentional per plan. We don't claim it's unbreakable.
  - If user leaves and comes back: `onResume` → re-check active session, restore state.

- [ ] **M3-10** Shuffled keypad for Hard mode:
  - If difficulty is `HARD` and shuffle-keypad setting is enabled:
    - On each new question, shuffle the positions of digits 0-9 in the keypad grid.
    - Use Fisher-Yates shuffle seeded per-question (session seed + step index) for determinism.
  - Default: standard keypad layout.

- [ ] **M3-11** Verify M3 end-to-end:
  - Start session → wait expires → GateActivity launches in immersive mode.
  - Countdown ticks correctly.
  - Solve all arithmetic → gate ends early, journal shows `system_solve` with correct time.
  - Let timer expire → gate ends, journal shows `system_timeout`.
  - Wrong answers show feedback, don't reset progress.
  - Kill app during gate → reopen → if still before deadline, gate resumes with correct step.
  - Submit answer at exact deadline → timeout wins.

---

## M4: Local Music

### SAF picker + library

- [ ] **M4-1** Create `data/MusicLibraryRepository.kt`:
  - File: `filesDir/music-library.json`.
  - Schema: `{ schemaVersion: 1, shuffleEnabled: true, music: MusicItem[] }`.
  - `MusicItem`: `id`, `displayName`, `uri`, `mimeType`, `durationMs`, `enabled`, `addedAt`.
  - Standard AtomicFile + Mutex pattern (same as journal).

- [ ] **M4-2** Wire `pickAndAddMusic` in `ApertureNativeModule`:
  ```kotlin
  @ReactMethod
  fun pickAndAddMusic(promise: Promise) {
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "audio/*"
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
      }
      currentPickPromise = promise
      currentActivity?.startActivityForResult(intent, PICK_AUDIO_REQUEST)
  }
  ```
  - In `onActivityResult`:
    - Take persistable URI permission: `contentResolver.takePersistableUriPermission(uri, FLAG_GRANT_READ_URI_PERMISSION)`.
    - If `takePersistableUriPermission` throws `SecurityException` → reject promise with "Cannot persist access to this file".
    - Query `displayName`, `size`, `mimeType` from `contentResolver.query(uri, ...)`.
    - Query duration via `MediaMetadataRetriever` (try/catch — not all files have duration metadata).
    - Insert `MusicItem` into library, atomic write.
    - Resolve promise with the new item.
  - Edge case: user cancels picker → `RESULT_CANCELED` → resolve with null.
  - Edge case: `takePersistableUriPermission` fails → inform user, don't store unstable URI.

- [ ] **M4-3** Wire `getMusicLibrary` and `updateMusicLibrary` in native module:
  - `getMusicLibrary`: return JSON string.
  - `updateMusicLibrary`: accepts updated `enabled` states and `shuffleEnabled`. Does not accept URI changes (security).
  - `removeMusicItem(id)`: remove from library, release persistable permission if possible.

### Music queue builder

- [ ] **M4-4** Create `media/MusicQueueBuilder.kt`:
  - Input: list of enabled `MusicItem`s, session seed.
  - Fisher-Yates shuffle seeded from session seed.
  - If > 1 item and last-played ID is available, ensure it's not first in new shuffle.
  - Return ordered list of `MusicItem` for playback.
  - When queue is exhausted mid-gate: reshuffle (with incremented seed suffix), avoid repeating final track.

### PlaybackService

- [ ] **M4-5** Add Media3 dependency in `android/app/build.gradle`:
  ```groovy
  implementation "androidx.media3:media3-exoplayer:1.3.1"
  implementation "androidx.media3:media3-session:1.3.1"
  ```

- [ ] **M4-6** Create `media/PlaybackService.kt`:
  - Extends `Service`, runs as foreground service with type `mediaPlayback`.
  - Uses `ExoPlayer` instance.
  - On `startService`: receives queue (list of content URIs) via Intent extras or reads from active session file.
  - Builds `MediaItem` list from URIs.
  - Starts playback.
  - Creates foreground notification (minimal — just "Aperture gate active", no browsing/settings actions, play/pause only).
  - Audio focus: request `AUDIOFOCUS_GAIN` on start, release on stop.
  - Binder or `LocalBroadcastManager` for GateActivity to send play/pause/next/prev/seek commands.
  - On destroy / stop: release player, relinquish audio focus.

- [ ] **M4-7** Handle playback failures in `PlaybackService`:
  - ExoPlayer error listener:
    - Mark current item as unavailable (in-memory flag, don't modify library file during gate).
    - Skip to next valid item.
    - If no valid items remain: play bundled fallback.
  - Edge case: persistable URI permission was revoked between library add and gate start → ExoPlayer will throw on prepare → skip.

- [ ] **M4-8** Bundle a fallback audio file:
  - Add a short neutral drone/tone loop to `android/app/src/main/res/raw/fallback_tone.ogg`.
  - If all library items fail, play this on loop.
  - Keep the file small (< 500KB).

- [ ] **M4-9** Wire gate music controls in `GateActivity`:
  - Add control buttons to gate layout (below the challenge area):
    - Play/Pause toggle
    - Previous (restart current if < 3s played, else previous track)
    - Next (next in queue)
    - Back 15s / Forward 15s
    - Shuffle toggle (persists setting)
    - Random (jump to random different track)
  - Each button sends command to `PlaybackService` via bound service or broadcast.
  - Display current track name (truncated) and playback position.
  - No library browsing, file picking, or volume slider in gate.
  - Edge case: service not running (crashed) → re-bind / restart if gate is still active.

- [ ] **M4-10** Start music on gate entry:
  - In `GateActivity.onCreate` (after confirming gate_active):
    - Read music library, filter enabled items.
    - Build queue via `MusicQueueBuilder`.
    - Start `PlaybackService` with the queue.
  <!-- ponytail: start music in GateActivity.onCreate only. Ceiling: ~200ms delay between alarm and music. Upgrade: start service in receiver -->

- [ ] **M4-11** Stop music on all terminal paths:
  - Solve → stop service.
  - Timeout → stop service (EndGateReceiver already does this).
  - GateActivity destroyed without terminal (process death) → service may keep running briefly. EndGateReceiver will stop it at deadline.
  - App force-stopped → Android kills service automatically.

### Settings — Gate Sound Library UI

- [ ] **M4-12** Build `src/screens/SoundLibraryScreen.tsx` (or section within Settings):
  - List all music items from `getMusicLibrary()`.
  - Each row: display name, duration, enabled toggle.
  - "Add music" button → call `pickAndAddMusic()`.
  - Swipe-to-delete or delete button → `removeMusicItem(id)`.
  - Shuffle toggle at top.
  - On toggle/delete: call `updateMusicLibrary(...)`.
  - Edge case: empty library → show message "No music added. Gate will use a default tone."

- [ ] **M4-13** Verify M4 end-to-end:
  - Add several audio files via picker.
  - Start session → gate → music plays in shuffled order.
  - All controls work: play/pause, prev, next, ±15s, shuffle, random.
  - Remove all music → gate uses fallback tone.
  - Add a file, revoke its access externally, start gate → file skipped, next plays.
  - Kill app during gate → music stops at gate deadline via EndGateReceiver.

---

## M5: Optional Screen Pinning

- [ ] **M5-1** Create `gate/ScreenPinningController.kt`:
  ```kotlin
  object ScreenPinningController {
      fun requestPinning(activity: Activity) {
          activity.startLockTask()
      }
  }
  ```
  That's it. No state tracking, no Device Owner logic. The OS handles confirmation.
  <!-- ponytail: 3-line controller. Ceiling: no way to know if user actually pinned. Upgrade: track via onResume heuristic if needed -->

- [ ] **M5-2** Add pinning callout to gate UI:
  - In `activity_gate.xml`, add a dismissible card overlay:
    ```
    For stronger friction, pin Aperture now.
    [Request pinning]  [Dismiss]
    ```
  - Show only once per session (track `pinningCalloutDismissed` in activity state).
  - On "Request pinning" → call `ScreenPinningController.requestPinning(this)`.
  - On "Dismiss" → hide card, don't show again for this gate.
  - If user declines Android's pin confirmation → gate continues without error.

- [ ] **M5-3** Add pinning instructions to Settings:
  - In `SettingsScreen.tsx`, add "Screen Pinning" section:
    - Explanation text per plan's wording.
    - Samsung-specific instructions.
    - "I've enabled App Pinning" acknowledgment toggle → persisted via native `settingsRepo`.

- [ ] **M5-4** Release screen pinning instruction:
  - In gate release screen (M3-8), check if currently pinned:
    ```kotlin
    val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    if (am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE) {
        // Show unpin instruction
    }
    ```
    <!-- ponytail: lockTaskModeState check. Ceiling: may not detect user-initiated pinning on all OEMs. Upgrade: always show instruction if pinning was requested this session -->
  - Show: "Aperture gate has ended. Unpin using your Android navigation gesture and device credential."

- [ ] **M5-5** Verify M5:
  - Enable Screen Pinning in device settings.
  - Start gate → callout appears → tap "Request pinning" → Android pin UI shows.
  - After pinning, solve gate → release screen shows unpin instructions.
  - Decline pinning → gate works normally.
  - Dismiss callout → doesn't reappear this session.

---

## M6: Insight Layer

### Today — daily timeline

- [ ] **M6-1** Build `src/components/DailyTimeline.tsx`:
  - Compact horizontal bar showing today's sessions as time blocks.
  - Each block: colored by outcome (blue for solved, gray for timeout, light for cancelled).
  - Width proportional to gate duration.
  <!-- ponytail: simple colored rects. Ceiling: no zoom, no scroll. Upgrade: SVG or canvas timeline -->

- [ ] **M6-2** Add neutral insight to Today:
  - Only show if enough data (≥ 7 days with sessions).
  - Compute one stat: "Most commitments started between X:00 and Y:00" (find the peak 2-hour bucket).
  - Display as muted text below the daily summary.
  - Never use streaks, XP, or celebratory language.

### Calendar heatmap polish

- [ ] **M6-3** Refine `CalendarHeatmap.tsx` from M1-13:
  - Ensure accessibility labels on every cell.
  - Add month/year header with left/right navigation arrows.
  - Highlight today's cell with a subtle ring.
  - Edge case: months with 28/29/30/31 days → correct first-day-of-week offset.

### Patterns screen

- [ ] **M6-4** Gate Patterns behind data threshold:
  - In `PatternsScreen.tsx`, call `getJournal()`, count distinct days with sessions and total completed sessions.
  - If < 14 days OR < 20 completed sessions → show placeholder: "Patterns will appear after more data is collected."

- [ ] **M6-5** Build 7/30-day gate-minute trend in `src/components/TrendChart.tsx`:
  - Simple bar chart: one bar per day, height = gate minutes that day.
  - Two views: "7 days" / "30 days" toggle.
  - Use plain `View` elements with computed heights — no charting library.
    <!-- ponytail: View-based bars. Ceiling: no animation, no touch tooltips. Upgrade: react-native-svg + d3-scale -->
  - Accessibility: each bar has `accessibilityLabel` with day + value.

- [ ] **M6-6** Build 24-hour start-time histogram in `src/components/HistogramChart.tsx`:
  - 24 bars, one per hour.
  - Height = number of sessions started in that hour bucket.
  - Same View-based approach.

- [ ] **M6-7** Build release pattern breakdown:
  - Simple stat cards:
    - "Solved early: X%" (sessions with `endSource = system_solve` / total enforced sessions).
    - "Automatic end: Y%".
    - "Median gate duration: Z min".
  - Exclude manual entries from these stats.

- [ ] **M6-8** Neutral insight on Patterns:
  - "Most commitments started between 22:00 and 00:00" (or whatever the data says).
  - Only show if sample size ≥ 20.

### Export

- [ ] **M6-9** Wire `exportJournal` in native module:
  - Read journal JSON, return as string.
  - RN side: use `Share.share({ message: jsonString })`.
    <!-- ponytail: Share API for export. Ceiling: user gets raw JSON text. Upgrade: write to Downloads via SAF and share the file URI -->

- [ ] **M6-10** Add export button to Settings screen.

- [ ] **M6-11** Verify M6:
  - Today shows timeline with real session data.
  - Calendar heatmap navigates months correctly.
  - Patterns shows placeholder with < 14 days data.
  - Manually seed enough data → patterns charts render.
  - Export produces valid JSON.

---

## M7: Hardening

### Alarm and lifecycle

- [ ] **M7-1** Test rapid start/cancel cycles: start session → immediately cancel → start again. Verify no stale alarms fire.

- [ ] **M7-2** Test Doze mode: set alarm for 10 min, let device sleep. Verify `setExactAndAllowWhileIdle` fires.

- [ ] **M7-3** Test battery optimization: ensure Aperture is not battery-optimized (or handle gracefully). Add a Settings hint: "For reliable alarms, disable battery optimization for Aperture."

- [ ] **M7-4** Test duplicate receiver delivery: if both `EndGateReceiver` and `CountDownTimer.onFinish` fire for the same session, verify only one journal write occurs (Mutex + idempotent finalize).

- [ ] **M7-5** Test time zone change during session: change TZ in device settings while waiting → alarm fires at correct elapsed time.

- [ ] **M7-6** Test wall-clock change during session: advance device clock → elapsed-realtime alarms unaffected.

### Process death recovery

- [ ] **M7-7** Test kill during wait:
  - Start session → force stop → reopen → Today shows waiting state with correct remaining time.

- [ ] **M7-8** Test kill during gate:
  - GateActivity open → force stop → reopen app.
  - If before deadline: auto-launch `GateActivity` via native module.
    ```kotlin
    @ReactMethod fun resumeGateIfActive(promise: Promise) {
        val session = activeRepo.read()
        if (session != null && session.status == "gate_active" &&
            SystemClock.elapsedRealtime() < session.endAtElapsedMs) {
            val intent = Intent(reactApplicationContext, GateActivity::class.java)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } else {
            promise.resolve(false)
        }
    }
    ```

- [ ] **M7-9** Test reboot during active session:
  - Reboot → reopen → session finalized as interrupted (elapsed realtime check in M2-17).

### Accessibility

- [ ] **M7-10** Audit all screens with TalkBack:
  - All buttons have `accessibilityLabel`.
  - Calendar cells have descriptive labels.
  - Gate countdown is live-region.
  - Chart bars have value labels.
  - Keypad buttons have digit labels.

- [ ] **M7-11** Ensure no red/green-only encoding:
  - Heatmap uses blue intensity scale.
  - Charts use single-hue scale.

### Device-specific QA

- [ ] **M7-12** Test on Samsung (OneUI): Screen Pinning, alarm reliability, immersive mode.

- [ ] **M7-13** Test on Pixel (stock Android): same.

- [ ] **M7-14** Test on Android 12, 13, 14:
  - API 31: `SCHEDULE_EXACT_ALARM` auto-granted for apps targeting < 33.
  - API 33+: requires user grant or `USE_EXACT_ALARM`.
  - Foreground service type `mediaPlayback` must be declared.

### Privacy and diagnostics

- [ ] **M7-15** Verify no network calls: airplane mode, full flow works.

- [ ] **M7-16** Verify no broad permissions: inspect merged manifest.

- [ ] **M7-17** Wrap all native module methods in try/catch, return meaningful errors.

- [ ] **M7-18** Settings: display app version + diagnostic state (active session? alarms? exact alarm permission?).
  ```kotlin
  @ReactMethod fun getDiagnostics(promise: Promise) {
      val map = Arguments.createMap()
      map.putString("version", BuildConfig.VERSION_NAME)
      map.putBoolean("activeSessionExists", activeRepo.read() != null)
      map.putBoolean("exactAlarmPermission",
          if (Build.VERSION.SDK_INT >= 31) alarmManager.canScheduleExactAlarms() else true)
      promise.resolve(map)
  }
  ```

- [ ] **M7-19** Settings: "Clear all data" → delete journal.json, active-session.json, music-library.json, settings. Confirm with alert dialog.

---

## File Structure

```
Aperture/
├── src/
│   ├── App.tsx
│   ├── theme.ts
│   ├── types.ts
│   ├── native/
│   │   └── ApertureModule.ts
│   ├── navigation/
│   │   ├── AppNavigator.tsx
│   │   └── JournalStack.tsx
│   ├── screens/
│   │   ├── TodayScreen.tsx
│   │   ├── JournalScreen.tsx
│   │   ├── DayDetailScreen.tsx
│   │   ├── PatternsScreen.tsx
│   │   ├── SettingsScreen.tsx
│   │   └── SoundLibraryScreen.tsx
│   ├── components/
│   │   ├── CalendarHeatmap.tsx
│   │   ├── DailyTimeline.tsx
│   │   ├── DurationPickerSheet.tsx
│   │   ├── ManualEntrySheet.tsx
│   │   ├── EditEndSheet.tsx
│   │   ├── TrendChart.tsx
│   │   └── HistogramChart.tsx
│   └── utils/
│       └── formatters.ts
├── android/app/src/main/
│   ├── java/com/aperture/
│   │   ├── AperturePackage.kt
│   │   ├── ApertureNativeModule.kt
│   │   ├── data/
│   │   │   ├── models.kt
│   │   │   ├── CommitmentLogRepository.kt
│   │   │   ├── ActiveSessionRepository.kt
│   │   │   ├── MusicLibraryRepository.kt
│   │   │   └── SettingsRepository.kt
│   │   ├── alarm/
│   │   │   ├── AlarmController.kt
│   │   │   ├── StartGateReceiver.kt
│   │   │   └── EndGateReceiver.kt
│   │   ├── gate/
│   │   │   ├── GateActivity.kt
│   │   │   ├── ChallengeEngine.kt
│   │   │   ├── ScreenPinningController.kt
│   │   │   └── SessionFinalizer.kt
│   │   └── media/
│   │       ├── PlaybackService.kt
│   │       └── MusicQueueBuilder.kt
│   ├── res/
│   │   ├── layout/activity_gate.xml
│   │   └── raw/fallback_tone.ogg
│   └── AndroidManifest.xml
└── package.json
```

## Dependencies (total: 8)

| Package | Why |
|---|---|
| `@react-navigation/native` | Tab + stack nav |
| `@react-navigation/bottom-tabs` | Tab bar |
| `react-native-screens` | Nav perf |
| `react-native-safe-area-context` | Insets |
| `@react-native-picker/picker` | Wheel picker |
| `@react-native-community/datetimepicker` | Date/time for manual entry |
| `androidx.media3:media3-exoplayer` | Audio playback (Gradle) |
| `androidx.media3:media3-session` | Media session (Gradle) |

No state management, no charting library, no icon library, no animation library, no styling library.

<!-- ponytail: 8 total dependencies. Every one earns its place. -->
