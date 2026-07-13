# Aperture: Implementation Plan

## Product summary

**Aperture** is an Android-first, local-only high-friction focus tool. A user deliberately starts a session. After a chosen waiting period, defaulting to 10 minutes, Aperture presents an arithmetic release gate in fullscreen immersive mode and plays a random sequence of user-selected local music files. The gate ends when the arithmetic sequence is solved or when its maximum duration expires.

Aperture is explicitly **not** a device-management, app-blocking, or surveillance product. It must work on a normal existing Android phone with no factory reset, root, Device Owner enrollment, Accessibility Service, overlay permission, usage access, account, server, or network dependency.

The strongest optional enforcement available within those constraints is Android **Screen Pinning**. The user enables it in system settings and manually pins Aperture when the gate arrives. Aperture cannot automatically pin or unpin a normal device installation. Screen Pinning is therefore optional friction, not a state Aperture can guarantee or programmatically release.

---

## Product intent

### Primary job

> When I choose to allow a potentially distracting activity for a short period, I want a deliberate, effortful interruption after that period so returning to ordinary phone use requires conscious attention rather than autopilot.

### Success direction

The product optimizes for reduced reliance, not engagement:

- Fewer commitments started over time
- Less cumulative time spent inside release gates
- Fewer automatic gate expiries
- Better awareness of the times of day that trigger use

Never use streaks, XP, badges, leaderboards, productivity scores, celebrations for session volume, or push-notification nagging.

### Non-goals

- Detecting the app that caused distraction
- Blocking individual applications
- Preventing force-stop, uninstall, Home, Recents, or system navigation
- Claiming an unbreakable lock
- Web browsing or YouTube playback in the gate
- Cloud sync or cross-device state in v1

---

## Platform truth and operating modes

### Standard mode

The default. Aperture presents the gate in immersive fullscreen, hides system bars, plays media, and creates cognitive friction. The user can still use Android system controls to leave. This is behavioral friction, not security enforcement.

### Pinned mode

Optional. The user enables Android Screen Pinning and credential-required unpinning in system settings. When the gate begins, Aperture shows a short instruction sheet and calls `startLockTask()` to request the OS pinning flow. The user confirms pinning through Android's system UI or pins the app manually through Overview.

Aperture cannot silently pin or automatically unpin because it is not a Device Owner. At release, Aperture ends its gate but the user must unpin through Android's system gesture and device credential if the app is pinned.

### Critical UX wording

Never say:

```text
Your phone is locked
You cannot leave
Aperture will unlock your phone
```

Say:

```text
Release gate active
Optional: pin Aperture for stronger friction
Complete the sequence to end the gate early
Gate ends automatically at [time]
If pinned, unpin with your device PIN after the gate ends
```

---

## Session contract

A session has a selected waiting duration `W` and selected maximum gate duration `G`.

Defaults:

```text
W = 10 minutes
G = 15 minutes
```

Timeline:

| Event | Deadline |
|---|---|
| User presses Start | `T0` |
| Gate begins | `T0 + W` |
| Gate automatic end | `T0 + W + G` |

The original product behavior is therefore the default `T0 + 10` gate start and `T0 + 25` automatic end. Both values must be persisted at Start and never mutated during an active session.

### Invariants

1. Persist the durable journal start record before scheduling native alarms.
2. Persist active session state before scheduling native alarms.
3. Schedule gate-start and gate-end alarms immediately at Start.
4. Use elapsed realtime for duration enforcement and wall clock only for human-readable journal timestamps.
5. Gate end remains fixed if gate delivery is late.
6. One active session maximum.
7. Gate can end early only through verified arithmetic completion.
8. Gate ends automatically at the persisted absolute gate-end deadline.
9. Any user may leave immersive mode or decline pinning. Record only what is knowable; do not claim that leaving was impossible.
10. Active session fields are not editable.

---

## Screens and navigation

Bottom navigation:

```text
Today | Journal | Patterns | Settings
```

`Gate` is not a tab. It is an application state launched by a native alarm.

### Today

Purpose: operational surface, not dashboard.

Components:

- Date header
- Primary `Start commitment` button
- Default waiting duration shown as `10 min`
- iPhone-style wheel picker sheet for waiting duration
- Optional gate-duration selector in advanced options, default 15 minutes
- Exact gate-start and automatic-end local times before confirmation
- If active: current phase and countdown
- Compact daily timeline
- One neutral insight, only when enough data exists

Example:

```text
Monday, 13 July

[ Start commitment ]

Gate starts in 10 min
Ends automatically 15 min later

Today
2 commitments · 9m 18s in gates
```

### Duration wheel

Use a bottom sheet with a native-looking wheel / drum picker, not a slider.

- Waiting options: 1 through 60 minutes, default 10
- Gate options: 1 through 60 minutes, default 15
- Use snapped integer minutes
- Central selected row is high contrast; adjacent rows fade
- `Cancel` and `Done` actions
- Persist last chosen values as settings, but default first use to 10 and 15

The duration is selected **before Start only**. It cannot be moved after Start, because that would change the commitment contract.

### Start confirmation

Show exact commitment terms:

```text
Gate begins: 10:42 PM
Automatic end: 10:57 PM

Gate starts in 10 minutes.
It will end after 15 minutes unless you complete the sequence earlier.

[ Start commitment ]
```

### Waiting phase

Show:

- Countdown to gate
- Absolute local gate start and end times
- `Cancel commitment` button
- Optional selected gate-music summary

Cancellation is allowed only before gate entry. It writes the actual cancellation time as `end`, with outcome `cancelled_before_gate` derived from timing.

### Gate

Full-screen immersive, intentionally austere.

Components:

- Persistent remaining gate countdown
- `Release gate` label
- Step progress such as `2 / 5`
- One arithmetic question
- Numeric keypad
- Incorrect-answer feedback
- Gate music mini-player, described below
- Optional Screen Pinning callout until user dismisses it

No normal close, cancel, browser, web view, external open, share, queue browsing, or settings actions appear here.

### Journal

A month calendar heatmap plus a selected-day summary.

- Day cell intensity represents total gate minutes, not number of sessions
- No sessions: neutral surface
- Low gate duration: pale accent
- Higher gate duration: stronger accent
- Do not use red/green as the only encoding
- Tap a date to open Day detail
- Provide textual labels/tooltips for accessibility

### Day detail

Show a ledger-style session list:

```text
13 JULY 2026
2 commitments · 9m 18s gate time

22:30  Started
22:40 → 22:47  Solved in 7m 22s

23:48  Started
23:58 → 00:13  Automatic end
```

Each completed record has an overflow action: `Edit end time`.

### Patterns

Do not surface until the user has at least 14 days or 20 completed records.

- 7-day and 30-day gate-minute trend
- 24-hour start-time histogram
- Release pattern: early completion versus automatic end
- Median gate duration
- Neutral insight such as `Most commitments started between 22:00 and 00:00.`

### Settings

Sections:

- Session defaults: waiting and gate duration
- Screen Pinning guide and status acknowledgement
- Gate Sound Library
- Challenge difficulty
- Data: export JSON, import validation later, clear all data
- Privacy: local-only statement
- App version and diagnostic state

---

## Visual system

Aperture should feel like a private, high-quality instrument, not glossy luxury fintech and not a gamified productivity app.

### Direction

- Quiet luxury + personal forensic journal
- Deep ink surfaces: `#101827`
- Near-white background: `#F8FAFC`
- Single action blue: `#004BB8`
- Typography: Inter, Manrope, or system sans; tabular numerals for all times
- Few large surfaces, 16–20 px corner radius, subtle 1 px borders
- No glassmorphism, excessive gradients, neon, confetti, or decorative charts
- Motion only communicates time, selection, or state

### Gate contrast

The journal should feel calm and satisfying. The gate should feel austere and intentionally inconvenient:

- Near-black background
- Large white numerals
- Blue only for selected and primary state
- No entertaining imagery
- Low-information audio visualizer only if needed
- Persistent countdown

---

## Arithmetic challenge

### Default rules

- Five serial operations
- Operations: `+`, `-`, `×`, `÷`
- 3–5 digit operands in standard mode
- Integer division only
- One operation visible at a time
- Correct answer advances
- Wrong answer provides feedback but does not reset the sequence
- Disable paste, selection, and external intent opening in gate fields

### Difficulty settings

| Mode | Steps | Operand scale | Keypad |
|---|---:|---|---|
| Light | 3 | 2–3 digits | Standard |
| Standard | 5 | 3–5 digits | Standard |
| Hard | 6 | 4–6 digits | Shuffled optional |

Default to Standard. Do not include a punitive mode in v1.

### Native authority

Kotlin owns:

- Secure seed generation
- Deterministic sequence generation
- Correct answer calculation
- Progress persistence
- Deadline check before accepting final answer

React Native only renders the question, keypad, and received progress state.

### Generator approach

Generate a session seed using `SecureRandom`. Build valid operations backwards or validate forward candidates so divisions always divide evenly and intermediate values stay positive and within a configured upper bound.

Pseudo-code:

```text
seed = SecureRandom().nextLong()
state = deterministicGenerator(seed, difficulty)

for each step:
  choose operation
  choose operand
  construct valid integer result
  retain expected answer internally
```

At submit:

```text
if elapsedRealtime >= gateEndElapsed:
    terminalRelease(timeout)
else if submittedAnswer == expectedAnswer[currentStep]:
    advance or terminalRelease(solved)
else:
    show incorrect feedback
```

---

## Timing and native alarms

### Clock model

| Data | Clock | Use |
|---|---|---|
| Journal `start` and `end` | `OffsetDateTime.now()` | Human-readable records |
| Gate and release deadlines | `SystemClock.elapsedRealtime()` | Fixed duration enforcement |

Changing timezone or device wall clock must never change session duration.

### Alarm schedule

When user confirms Start:

```text
startElapsed = elapsedRealtime()
gateAtElapsed = startElapsed + waitingDurationMs
endAtElapsed = gateAtElapsed + gateDurationMs
```

Schedule both now:

```text
START_GATE at gateAtElapsed
END_GATE at endAtElapsed
```

Use `AlarmManager.setExactAndAllowWhileIdle(ELAPSED_REALTIME_WAKEUP, ...)` where exact-alarm access is available. Verify `canScheduleExactAlarms()` before enabling reliable scheduled gate mode. If access is denied, make the state explicit and offer a degraded foreground-only countdown, never pretend it is reliable.

### Receiver logic

`StartGateReceiver`:

```text
read active session
if absent or terminal: no-op
if now >= endAtElapsed: finalise timeout; do not show gate
else if status == waiting_for_gate:
  set status gate_active atomically
  launch GateActivity
```

`EndGateReceiver`:

```text
read active session
if absent or terminal: no-op
request GateActivity terminal timeout release
if activity cannot be reached, persist terminal timeout and stop media service
```

Use idempotent terminal transitions. A duplicate broadcast must not overwrite an existing end.

### Late alarms

If the gate arrives late, gate time is `endAtElapsed - now`, never a fresh configured gate duration. If the start-gate alarm arrives after end deadline, do not open the gate.

### Reboot

Elapsed realtime resets after reboot. For v1, treat reboot during an active session as interrupted. On next app start, safely finalise it at the known wall-clock contractual end where valid, label internal diagnostic `interrupted_by_reboot`, and do not relaunch a gate automatically.

---

## Screen Pinning integration

### User setup guidance

Provide manufacturer-neutral instructions and a Samsung-specific note:

```text
Enable App Pinning in Android Settings.
Also enable the option that requires your PIN, pattern, or password before unpinning.
```

Samsung commonly exposes this under:

```text
Settings → Security and privacy → Other security settings → Pin app
```

Never claim that this setting can be read reliably by the app across OEMs.

### Gate flow

When `GateActivity` opens:

1. Enter immersive UI.
2. Start selected media.
3. Display a one-time callout: `For stronger friction, pin Aperture now.`
4. Offer `Request pinning`.
5. On user tap, call `startLockTask()`.
6. Android shows its system-controlled confirmation flow if applicable.
7. If the user declines, retain immersive gate mode without error.

Alternative manual path: user opens Overview, taps Aperture's icon, then selects Pin.

### Release flow

On solve or gate expiry:

- End Aperture gate state
- Stop media
- Restore system bars
- Navigate to release screen
- If currently pinned, show a factual instruction:

```text
Aperture gate has ended.
Unpin using your Android navigation gesture and device credential.
```

Do not call `stopLockTask()` as a guaranteed unpin mechanism on a normal un-managed device. It may not control user-initiated pinning reliably in the way Device Owner Lock Task does.

---

## Local Gate Sound Library

### Scope

The user may add an unlimited number of local audio files by selecting them through Android's system picker. Store durable access as persisted `content://` URIs. Do not request broad storage permission and do not use filesystem paths.

No YouTube, Spotify, WebView, browser, web link, streaming service, or remote URL is part of v1.

### Adding music

Use `ACTION_OPEN_DOCUMENT` with MIME type `audio/*` and `CATEGORY_OPENABLE`.

Pseudo-code:

```text
launch file picker:
  action = ACTION_OPEN_DOCUMENT
  type = audio/*
  flags = READ_URI_PERMISSION | PERSISTABLE_URI_PERMISSION

on selected(uri):
  takePersistableUriPermission(uri, READ_URI_PERMISSION)
  read display name, size, MIME type, duration if available
  insert music record
```

If persistence cannot be taken, inform the user and offer to import a managed local copy later. Do not silently store an unstable temporary URI.

### Sound-library record

Store in `settings.json` or a dedicated `music-library.json`:

```json
{
  "schemaVersion": 1,
  "shuffleEnabled": true,
  "music": [
    {
      "id": "uuid",
      "displayName": "Low Drone Loop.mp3",
      "uri": "content://com.android.providers.media.documents/document/audio%3A42017",
      "mimeType": "audio/mpeg",
      "durationMs": 242000,
      "enabled": true,
      "addedAt": "2026-07-13T02:00:00+05:30"
    }
  ]
}
```

### Queue and random sequence

At gate start:

1. Read all `enabled` playable records.
2. Shuffle using a Fisher-Yates shuffle seeded from the active session seed.
3. Ensure recently played item is not first if library has more than one item.
4. Build a queue that can cycle for the remaining gate time.
5. Persist selected queue IDs only in active session state if recovery needs it.

When all tracks are consumed, reshuffle, avoiding an immediate repeat of the final prior track.

### Gate music player

Use a native Kotlin foreground `PlaybackService` with AndroidX Media3 / ExoPlayer. React Native can render controls but playback state and ownership remain native.

Gate controls, allowed only in GateActivity:

| Control | Behaviour |
|---|---|
| Play / Pause | Pause or resume current local item |
| Previous | Restart prior queue item or current item if less than 3 seconds played |
| Next | Move to next randomized queue item |
| Back 15 | Seek backward 15 seconds, clamped at zero |
| Forward 15 | Seek forward 15 seconds, clamped at duration |
| Shuffle | Toggle shuffle for next queue generation; persist setting |
| Random | Immediately select a random enabled item distinct from current when possible |

There is no library browsing, file picking, URL opening, share, casting, download, external launch, or volume slider inside the gate.

### Playback failure

If an item cannot be opened, decoded, or persisted permission was revoked:

1. Mark it unavailable locally.
2. Skip to next valid item.
3. If none remain, use bundled fallback neutral loop.
4. Never allow playback failure to prevent solve or automatic gate end.

### Audio focus

Request audio focus during gate playback and relinquish it on every terminal path. The notification for a foreground playback service must not become a route to browsing or changing settings.

---

## Journal and manual entry

### Durable journal schema

Keep records grouped by local date of **start**, including sessions ending after midnight.

```json
{
  "schemaVersion": 1,
  "timezone": "Asia/Kolkata",
  "days": {
    "2026-07-13": {
      "sessions": [
        {
          "id": "uuid",
          "start": "2026-07-13T22:30:14+05:30",
          "end": "2026-07-13T22:47:36+05:30",
          "endSource": "system_solve"
        }
      ]
    }
  }
}
```

### End values

- Start: write immediately on Start with `end: null`.
- Solve: actual wall-clock release timestamp, `endSource: system_solve`.
- Automatic end: contractual time `start + waitingDuration + gateDuration`, `endSource: system_timeout`, not the possibly late receiver dispatch time.
- Pre-gate cancellation: actual cancellation timestamp, `endSource: system_cancel`.
- Manual correction: manually entered timestamp, `endSource: manual`; preserve `originalEnd` and `editedAt`.
- Manual session: `endSource: manual_entry`.

### Editing a completed session

User can edit `end` only after a session is terminal. An edit modifies the historical journal, never a live deadline or current gate.

For records created by the enforcement flow, validate:

```text
start <= end <= contractual session end
```

The contractual end is the original `start + waitingDuration + gateDuration` held in internal metadata while active. If that metadata no longer exists for a historical record, use a default/max policy or mark the edit as unconstrained manual correction with an explicit confirmation.

### Full manual entry

Provide `Add session manually` from Journal:

```text
Date
Start time
End time
Optional note (defer from v1 if simplicity preferred)

[ Save session ]
```

Manual records can have any valid `end >= start`; they are journal-only and must not be used to infer gate success, timeout rate, or enforcement reliability. Store a `kind: manual` or `endSource: manual_entry` field.

### Derived display state

For enforced sessions, derive without mutating permanent data:

```text
gateStart = start + waitingDuration
gateEnd = start + waitingDuration + gateDuration
outcome:
  end < gateStart => cancelled_before_gate
  gateStart <= end < gateEnd => solved
  end == gateEnd => timed_out
```

For manual entries, show `Manual entry`, not solved/timed-out classifications.

### Atomic JSON writes

All writes use `android.util.AtomicFile`:

```text
read current file
modify immutable-in-memory model
write complete new content to AtomicFile temp target
finishWrite on success
failWrite on error
```

Use a coroutine `Mutex` in the repository to serialize writes. On terminal transition, write durable journal end before cancelling alarms or clearing active session.

---

## Internal active session schema

`active-session.json` is temporary and deleted only after terminal cleanup.

```json
{
  "schemaVersion": 1,
  "sessionId": "uuid",
  "status": "gate_active",
  "waitingDurationMs": 600000,
  "gateDurationMs": 900000,
  "startedAtIso": "2026-07-13T22:30:14+05:30",
  "startElapsedMs": 829234991,
  "gateAtElapsedMs": 829834991,
  "endAtElapsedMs": 830734991,
  "challengeSeed": "635028940827155393",
  "operationIndex": 2,
  "queueMediaIds": ["uuid-a", "uuid-b"],
  "currentMediaIndex": 0
}
```

Allowed statuses: `waiting_for_gate`, `gate_active`. Terminal states belong in the durable journal and are not retained as an active session.

---

## React Native / Kotlin architecture

Use React Native CLI with TypeScript and Kotlin native Android modules. Expo Go is unsuitable because the product needs exact alarms, broadcast receivers, foreground media playback, Screen Pinning invocation, persisted URI permissions, and native file persistence.

```text
React Native TypeScript
  ├── Today, Journal, Day Detail, Patterns, Settings UI
  ├── duration wheel presentation
  ├── chart rendering and derived analytics
  └── narrow native-module calls

Kotlin native layer
  ├── CommitmentLogRepository (AtomicFile JSON)
  ├── ActiveSessionRepository
  ├── SettingsRepository / MusicLibraryRepository
  ├── AlarmController
  ├── StartGateReceiver
  ├── EndGateReceiver
  ├── GateActivity
  ├── ChallengeEngine
  ├── PlaybackService (Media3)
  ├── ScreenPinningController
  └── ApertureNativeModule
```

### Native module surface

Expose only capabilities and safe user actions:

```ts
getCapabilities(): Promise<{
  canScheduleExactAlarms: boolean;
  screenPinningInstructionsSeen: boolean;
}>;

startSession(input: {
  waitingDurationMinutes: number;
  gateDurationMinutes: number;
  difficulty: "light" | "standard" | "hard";
}): Promise<SessionStartResult>;

cancelWaitingSession(): Promise<void>;
getActiveSession(): Promise<ActiveSession | null>;
getJournal(): Promise<CommitmentLog>;
updateCompletedEnd(input): Promise<void>;
addManualSession(input): Promise<void>;
pickAndAddMusic(): Promise<MusicItem | null>;
updateMusicLibrary(input): Promise<void>;
exportJournal(): Promise<string>;
requestScreenPinning(): Promise<void>;
```

Do not expose native functions that can bypass active gate state, such as `releaseGate`, `setDeadline`, `setCorrectAnswer`, or a generic native `stopLockTask` escape method.

---

## Permissions and manifest

Avoid all broad or invasive permissions.

Required or conditional:

```xml
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

Core components:

```xml
<receiver android:name=".alarm.StartGateReceiver" android:exported="false" />
<receiver android:name=".alarm.EndGateReceiver" android:exported="false" />
<activity android:name=".gate.GateActivity" android:exported="false" />
<service
  android:name=".media.PlaybackService"
  android:foregroundServiceType="mediaPlayback"
  android:exported="false" />
```

Do not add:

```text
SYSTEM_ALERT_WINDOW
BIND_ACCESSIBILITY_SERVICE
PACKAGE_USAGE_STATS
Device Admin receiver
Root / ADB-only production dependencies
Broad MANAGE_EXTERNAL_STORAGE
```

The Storage Access Framework grants access to individual user-selected files through `content://` URIs, so broad storage permission is unnecessary.

---

## Resilience and edge cases

| Scenario | Required handling |
|---|---|
| User declines exact-alarm access | Explain reduced reliability; permit foreground-only experimental mode or disable scheduled sessions |
| User declines pinning | Continue immersive gate without error |
| User unpins or leaves gate | On resume, restore gate if still before fixed end time; never claim lock is unbreakable |
| Gate alarm late | Only show remaining time to fixed end |
| Gate alarm after fixed end | Do not open gate; finalise timeout |
| Solve at exact boundary | Timeout wins |
| Duplicate receiver delivery | Idempotent terminal transition |
| Process death before gate | Reconcile active state on app launch |
| Process death during gate | Relaunch gate only if still before end; restore challenge from seed/progress |
| Media permission revoked | Skip item; use next or bundled fallback |
| No music selected | Use bundled fallback or silent gate according to setting |
| Phone reboot | Treat active session as safely interrupted; do not hard-relaunch gate automatically |
| Manual edit race | Only completed records are editable; serialize writes |
| Multiple Start requests | Reject if active session exists |

---

## Test plan

### Core timing

- Start writes record with `end: null` before alarm scheduling.
- Default Start creates gate at T0+10 and end at T0+25.
- Custom wheel values produce correct fixed deadlines.
- Wall-clock change does not alter countdown.
- Gate delivery late at T0+W+G-1 minute gives one minute remaining.
- Gate delivery after end does not show gate.

### Gate

- Correct sequence releases early.
- Wrong answer does not reset all progress.
- Final answer at deadline results in timeout.
- Timeout stops playback and restores immersive UI state.
- Recreated activity restores exact step and remaining time.

### Pinning

- Screen Pinning instructions work on Samsung and Pixel.
- User can choose manual pinning route.
- Declining pin does not break gate.
- On terminal release, pinned mode shows unpin instruction and does not make unsupported automatic-unpin claim.

### Music

- Add hundreds of local files without broad storage permission.
- Persisted URI remains available after app restart.
- Queue randomization avoids immediate repeat when possible.
- Every control works: play/pause, previous, next, +/-15 seconds, shuffle, random.
- Invalid URI is skipped.
- Fallback works when no playable entries remain.
- Playback stops in solve, timeout, cancellation, and crash recovery paths.

### Journal and visuals

- Sessions group by start date, including midnight crossings.
- Manual end correction preserves original end and audit fields.
- Full manual entries do not distort enforcement outcome charts.
- Calendar tooltip and chart values have text equivalents.
- Lower gate-time trend is presented neutrally, not as a score.

---

## Milestones

### M1: App skeleton and journal

- React Native CLI setup
- Navigation and visual tokens
- Atomic JSON repositories
- Today, Journal, Day Detail screens
- Manual session creation and editing

### M2: Session timing

- Native active session state
- Wheel selection
- Exact alarm permission UX
- Start, cancel, gate start, gate end lifecycle
- Foreground-only fallback

### M3: Gate mechanics

- GateActivity immersive UI
- Native challenge engine and deterministic recovery
- Early solve and timeout terminal paths

### M4: Local music

- SAF picker and persisted URI records
- Media3 PlaybackService
- Random queue and gate player controls
- Fallback audio

### M5: Optional pinning

- Screen Pinning onboarding
- Request-pinning action in Gate
- Device-specific Samsung and Pixel QA

### M6: Insight layer

- Day timeline
- Calendar heatmap
- 7/30-day trend
- Time-of-day histogram
- Local JSON export

### M7: Hardening

- Alarm and lifecycle race tests
- Process-death recovery
- Accessibility review
- Battery and Doze testing
- Privacy review and crash diagnostics

---

## Definition of done

Aperture v1 is done when:

1. It installs and works on a normal Android phone with no root, Device Owner enrollment, factory reset, Accessibility Service, overlay permission, or broad storage permission.
2. The user can choose wait and gate durations with a wheel picker, defaulting to 10 and 15 minutes.
3. Start is journaled atomically before scheduling.
4. Gate starts at the selected waiting deadline and ends at selected waiting plus gate duration.
5. Gate can end early only after native arithmetic validation.
6. Gate ends automatically at its fixed deadline.
7. Gate operates safely without Screen Pinning, and supports optional user-confirmed Screen Pinning.
8. The user can maintain an unlimited local audio library via Android document picker.
9. Gate media supports randomized sequences and required playback controls.
10. Completed end times are editable, and fully manual historical sessions can be created.
11. Journal, calendar, day detail, and patterns render from local data without a backend.
12. Every failure path preserves device usability and no feature claims to create an unbreakable lock.

---

## Reference links

- Android Screen Pinning help: https://support.google.com/android/answer/9455138
- Samsung Pin app instructions: https://www.samsung.com/sg/support/mobile-devices/pin-an-app-to-your-phone-screen-so-that-it-cant-be-closed/
- Android exact alarms: https://developer.android.com/develop/background-work/services/alarms
- Android 14 exact-alarm access: https://developer.android.com/about/versions/14/changes/schedule-exact-alarms
- Storage Access Framework: https://developer.android.com/training/data-storage/shared/documents-files
- Media3 / ExoPlayer: https://developer.android.com/media/media3/exoplayer
- Immersive mode: https://developer.android.com/develop/ui/views/layout/immersive
