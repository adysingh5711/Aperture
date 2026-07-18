# Aperture

A commitment device for your phone. You pledge a block of focused time, Aperture waits, and when the moment comes it locks you into a full-screen **gate** that can only be dismissed by solving math challenges — or by waiting out the timer you committed to. No accounts, no network, no tracking: everything lives on your device.

Built with React Native and native Kotlin/Swift modules, styled with inspiration from CRED's [NeoPOP design system](https://playground.cred.club) with full dark/light theming.

## How it works

1. **Commit** — pick a waiting duration and a gate duration on the Today screen and start the session.
2. **Wait** — the waiting period runs in the background with exact alarms; you can cancel during this phase (that's the point — friction, not punishment).
3. **Gate** — when the wait ends, a full-screen native activity takes over. Leaving requires solving a chain of arithmetic challenges (Light / Standard / Hard) on a NeoPOP keypad, or letting the committed time elapse.
4. **Reflect** — completed sessions land in the Journal; the Patterns screen turns them into trends, histograms, and neutral insights once enough data exists.

### Features

- **Enforced sessions** — epoch-based timing survives reboots and process death; an accessibility "guardian" service and foreground services keep the gate in front.
- **Gate music** — bring your own local audio (SAF picker, duplicate-safe), with shuffle, seek, and media-session playback via ExoPlayer/media3.
- **Journal** — automatic session logging plus manual entries, with editable end times and JSON export.
- **Patterns** — gate-minutes trend (7/30 days), start-time histogram, calendar heatmap, and summary stats.
- **NeoPOP UI** — sharp corners, plunk-elevated buttons, hairline strokes, serif display numerals, wheel pickers with haptic-style tick sounds, and a background grid — in both dark and light mode, mirrored in the native gate through day/night resources.
- **Private by design** — no network calls, no accounts, no analytics. `exportJournal` and `Share` are the only ways data leaves the app.

## Getting started

Prerequisites: a working [React Native environment](https://reactnative.dev/docs/set-up-your-environment) (Node ≥ 20, JDK 17, Android SDK; Xcode for iOS).

```sh
git clone git@github.com:adysingh5711/Aperture.git
cd Aperture
npm install

# Android
npm run android

# iOS
bundle install && bundle exec pod install --project-directory=ios
npm run ios
```

Start Metro on its own with `npm start`; run checks with `npm run lint` and `npm test`.

> **Note:** Android is the primary platform — enforcement (gate activity, guardian service, exact alarms) is fully native there. The iOS module implements session state, settings, and the music library, but OS restrictions make hard enforcement weaker.

### Android permissions

Aperture asks for several sensitive permissions; all are used solely for enforcement and are optional-but-recommended (the Today screen shows what's missing and why):

| Permission | Why |
|---|---|
| Exact alarms | Fire the gate at the committed moment |
| Accessibility service | Re-surface the gate if you navigate away |
| Usage access | Detect foreground apps during a session |
| Ignore battery optimizations | Keep timers alive on aggressive OEMs |
| Display over other apps | Bring the gate back to the front |

## Project structure

```
src/
  components/    # NeoPOP primitives (buttons, cards, grid), alert host,
                 # wheel pickers, charts, bottom sheets
  navigation/    # Bottom tabs + stacks
  screens/       # Today, Journal, Patterns, Settings, Gate (JS fallback)
  native/        # Typed bridge to the native module (+ in-memory mock)
  theme.ts       # NeoPOP tokens: palettes, spacing, radii, plunk depth
android/
  .../aperture/  # Kotlin: native module, GateActivity, PlaybackService,
                 # guardian services, alarm receivers, repositories
ios/Aperture/    # Swift native module
```

Design tokens follow the NeoPOP primitives (popBlack/popWhite scales, `#06C270` green, 3px plunk). If you touch UI, keep corners sharp and strokes hairline — no rounded corners, no soft shadows.

## Contributing

Contributions are welcome — bug reports, fixes, and focused features.

1. Fork the repo and create a branch from `main`.
2. Make your change. Match the existing style: minimal diffs, root-cause fixes, and theme tokens instead of hardcoded colors.
3. Verify before opening a PR:
   ```sh
   npx tsc --noEmit
   npm run lint
   cd android && ./gradlew :app:assembleDebug   # if you touched native code
   ```
4. Open a pull request describing **what** changed and **why**. Screenshots (dark **and** light) for UI changes are appreciated.

Good first contributions: iOS enforcement parity, accessibility labels, translations, and additional Patterns insights. For anything large, open an issue first so we can agree on the approach.

Please keep the privacy contract intact: no PR that adds network calls, analytics, or third-party data collection will be merged.

## License

[MIT](LICENSE) © 2026 Aditya Singh
