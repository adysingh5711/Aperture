import AudioToolbox
import Foundation
import React
import AVFoundation
import UniformTypeIdentifiers
import UIKit
import UserNotifications

@objc(ApertureNativeModule)
class ApertureNativeModule: NSObject, RCTBridgeModule, UIDocumentPickerDelegate, UNUserNotificationCenterDelegate {

  static func moduleName() -> String! {
    return "ApertureNativeModule"
  }

  static func requiresMainQueueSetup() -> Bool {
    return true
  }

  private var currentPickPromise: RCTPromiseResolveBlock?
  private var currentPickReject: RCTPromiseRejectBlock?

  // Audio Player
  private var player: AVQueuePlayer?
  private var playerLooper: AVPlayerLooper?
  private var audioSession = AVAudioSession.sharedInstance()

  override init() {
    super.init()
    setupNotifications()
  }

  // MARK: - Capabilities & Diagnostics

  @objc func getCapabilities(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve([
      "canScheduleExactAlarms": true,
      "accessibilityServiceEnabled": true, // Stub for UI compatibility
      "usageAccessGranted": true,
      "isIgnoringBatteryOptimizations": true,
      "canDrawOverlays": true,
      "screenPinningInstructionsSeen": true
    ])
  }

  @objc func getDiagnostics(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
    let activeSessionExists = getActiveSessionInternal() != nil

    resolve([
      "version": version,
      "activeSessionExists": activeSessionExists,
      "exactAlarmPermission": true
    ])
  }

  // MARK: - Sessions

  @objc func startSession(_ input: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    if getActiveSessionInternal() != nil {
      reject("ACTIVE_SESSION_EXISTS", "Cancel the current session first", nil)
      return
    }

    let waitMinutes = input["waitingDurationMinutes"] as? Int ?? 0
    let gateMinutes = input["gateDurationMinutes"] as? Int ?? 0
    let waitMs = Int64(waitMinutes * 60_000)
    let gateMs = Int64(gateMinutes * 60_000)

    let now = Date()
    // Epoch millis, not systemUptime: GateScreen.tsx (the enforcement UI on iOS) compares
    // these fields against Date.now(), so they must share the same clock base.
    let nowElapsed = Int64(now.timeIntervalSince1970 * 1000)
    let sessionId = UUID().uuidString

    let session: [String: Any] = [
      "schemaVersion": 1,
      "sessionId": sessionId,
      "status": "waiting_for_gate",
      "waitingDurationMs": waitMs,
      "gateDurationMs": gateMs,
      "startedAtIso": ISO8601DateFormatter().string(from: now),
      "startElapsedMs": nowElapsed,
      "gateAtElapsedMs": nowElapsed + waitMs,
      "endAtElapsedMs": nowElapsed + waitMs + gateMs,
      "challengeSeed": String(abs(Int64.random(in: Int64.min...Int64.max))),
      "operationIndex": 0,
      "queueMediaIds": [],
      "currentMediaIndex": 0
    ]

    addSessionToJournal(sessionId: sessionId, startedAtIso: session["startedAtIso"] as! String, waitMs: waitMs, gateMs: gateMs)
    saveActiveSession(session)

    // Schedule Local Notifications for iOS "Background Locking"
    scheduleGateNotifications(waitMs: waitMs, gateMs: gateMs)

    if let json = serialize(session) {
      resolve(json)
    } else {
      reject("SERIALIZE_FAILED", "Failed to serialize session", nil)
    }
  }

  @objc func cancelWaitingSession(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let session = getActiveSessionInternal(), session["status"] as? String == "waiting_for_gate" else {
      reject("NO_WAITING_SESSION", "No session is currently in the waiting phase", nil)
      return
    }

    finalizeSession(session: session, endIso: ISO8601DateFormatter().string(from: Date()), endSource: "system_cancel")
    clearActiveSession()
    UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
    resolve(nil)
  }

  @objc func getActiveSession(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    if var session = getActiveSessionInternal() {
      let nowElapsed = Int64(Date().timeIntervalSince1970 * 1000)

      // Reboot reconciliation
      if nowElapsed < (session["startElapsedMs"] as? Int64 ?? 0) {
        let startIso = session["startedAtIso"] as? String ?? ""
        finalizeSession(session: session, endIso: startIso, endSource: "interrupted_by_reboot")
        clearActiveSession()
        resolve(nil)
        return
      }

      // Waiting -> gate transition. iOS has no background alarm/service to flip this
      // proactively (unlike Android's StartGateReceiver), so it's reconciled lazily here,
      // on every read.
      if (session["status"] as? String == "waiting_for_gate") && (nowElapsed >= (session["gateAtElapsedMs"] as? Int64 ?? 0)) {
        session["status"] = "gate_active"
        saveActiveSession(session)
        startPlayback()
        DispatchQueue.main.async {
          UIApplication.shared.isIdleTimerDisabled = true
        }
      }

      // Timeout reconciliation
      if (session["status"] as? String == "gate_active") && (nowElapsed >= (session["endAtElapsedMs"] as? Int64 ?? 0)) {
        finalizeSession(session: session, endIso: ISO8601DateFormatter().string(from: Date()), endSource: "system_timeout")
        clearActiveSession()
        stopPlayback()
        resolve(nil)
        return
      }

      resolve(serialize(session))
    } else {
      resolve(nil)
    }
  }

  // MARK: - Journal

  @objc func getJournal(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let journal = readJournal()
    if let json = serialize(journal) {
      resolve(json)
    } else {
      reject("READ_FAILED", "Failed to read journal", nil)
    }
  }

  @objc func exportJournal(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    getJournal(resolve, rejecter: reject)
  }

  @objc func addManualSession(_ input: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let startIso = input["start"] as? String, let endIso = input["end"] as? String else {
      reject("INVALID_INPUT", "Missing start or end", nil)
      return
    }

    var journal = readJournal()
    var days = journal["days"] as? [String: [String: Any]] ?? [:]
    let todayKey = String(startIso.prefix(10))

    var dayLog = days[todayKey] ?? ["sessions": []]
    var sessions = dayLog["sessions"] as? [[String: Any]] ?? []

    let newSession: [String: Any] = [
      "id": UUID().uuidString,
      "start": startIso,
      "end": endIso,
      "endSource": "manual_entry",
      "originalEnd": NSNull(),
      "editedAt": NSNull(),
      "waitingDurationMs": NSNull(),
      "gateDurationMs": NSNull(),
      "kind": "manual"
    ]

    sessions.append(newSession)
    dayLog["sessions"] = sessions
    days[todayKey] = dayLog
    journal["days"] = days

    saveJournal(journal)
    resolve(nil)
  }

  @objc func updateCompletedEnd(_ input: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let sessionId = input["sessionId"] as? String, let newEnd = input["newEnd"] as? String else {
      reject("INVALID_INPUT", "Missing sessionId or newEnd", nil)
      return
    }

    var journal = readJournal()
    var days = journal["days"] as? [String: [String: Any]] ?? [:]
    var found = false

    for (dateKey, var dayLog) in days {
      var sessions = dayLog["sessions"] as? [[String: Any]] ?? []
      for i in 0..<sessions.count {
        if sessions[i]["id"] as? String == sessionId {
          var s = sessions[i]
          s["originalEnd"] = s["originalEnd"] is NSNull ? s["end"] : s["originalEnd"]
          s["end"] = newEnd
          s["editedAt"] = ISO8601DateFormatter().string(from: Date())
          sessions[i] = s
          found = true
          break
        }
      }
      if found {
        dayLog["sessions"] = sessions
        days[dateKey] = dayLog
        break
      }
    }

    if found {
      journal["days"] = days
      saveJournal(journal)
      resolve(nil)
    } else {
      reject("NOT_FOUND", "Session not found", nil)
    }
  }

  // MARK: - Music

  @objc func pickAndAddMusic(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    self.currentPickPromise = resolve
    self.currentPickReject = reject

    DispatchQueue.main.async {
      let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.audio])
      picker.delegate = self
      picker.allowsMultipleSelection = false

      if let root = RCTPresentedViewController() {
        root.present(picker, animated: true)
      } else {
        reject("NO_UI", "Could not present picker", nil)
        self.currentPickPromise = nil
        self.currentPickReject = nil
      }
    }
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    guard let url = urls.first, let resolve = currentPickPromise else { return }
    let rejecter = currentPickReject
    currentPickPromise = nil
    currentPickReject = nil

    let shouldStopAccessing = url.startAccessingSecurityScopedResource()
    defer { if shouldStopAccessing { url.stopAccessingSecurityScopedResource() } }

    let fileName = url.lastPathComponent
    let existingItems = readMusicLibrary()["music"] as? [[String: Any]] ?? []
    if existingItems.contains(where: { ($0["displayName"] as? String) == fileName }) {
      rejecter?("DUPLICATE", "\"\(fileName)\" is already in your library", nil)
      return
    }
    let destUrl = getMusicDir().appendingPathComponent(UUID().uuidString + "_" + fileName)

    do {
      if !FileManager.default.fileExists(atPath: getMusicDir().path) {
        try FileManager.default.createDirectory(at: getMusicDir(), withIntermediateDirectories: true)
      }
      try FileManager.default.copyItem(at: url, to: destUrl)

      let asset = AVAsset(url: destUrl)
      let duration = CMTimeGetSeconds(asset.duration) * 1000

      let item: [String: Any] = [
        "id": UUID().uuidString,
        "displayName": fileName,
        "uri": destUrl.absoluteString,
        "mimeType": "audio/*",
        "durationMs": Int64(duration),
        "enabled": true,
        "addedAt": ISO8601DateFormatter().string(from: Date())
      ]

      var lib = readMusicLibrary()
      var items = lib["music"] as? [[String: Any]] ?? []
      items.append(item)
      lib["music"] = items
      saveMusicLibrary(lib)

      resolve(serialize(item))
    } catch {
      rejecter?("IMPORT_FAILED", error.localizedDescription, error)
    }
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    currentPickPromise?(nil)
    currentPickPromise = nil
    currentPickReject = nil
  }

  @objc func getMusicLibrary(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let lib = readMusicLibrary()
    resolve(serialize(lib))
  }

  @objc func updateMusicLibrary(_ input: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    var lib = readMusicLibrary()
    if let enabledStates = input["enabledStates"] as? [String: Bool] {
      var items = lib["music"] as? [[String: Any]] ?? []
      for i in 0..<items.count {
        if let id = items[i]["id"] as? String, let state = enabledStates[id] {
          items[i]["enabled"] = state
        }
      }
      lib["music"] = items
    }
    if let shuffle = input["shuffleEnabled"] as? Bool {
      lib["shuffleEnabled"] = shuffle
    }
    saveMusicLibrary(lib)
    resolve(nil)
  }

  @objc func removeMusicItem(_ id: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    var lib = readMusicLibrary()
    var items = lib["music"] as? [[String: Any]] ?? []

    if let index = items.firstIndex(where: { ($0["id"] as? String) == id }) {
      let item = items[index]
      if let uriStr = item["uri"] as? String, let url = URL(string: uriStr) {
        try? FileManager.default.removeItem(at: url)
      }
      items.remove(at: index)
      lib["music"] = items
      saveMusicLibrary(lib)
    }
    resolve(nil)
  }

  // MARK: - Settings & Maintenance

  @objc func updateSettings(_ input: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    var settings = readSettings()
    if let diff = input["difficulty"] as? String { settings["difficulty"] = diff }
    if let shuffle = input["shuffleKeypad"] as? Bool { settings["shuffleKeypad"] = shuffle }
    if let wait = input["defaultWaitingDurationMinutes"] as? Int { settings["defaultWaitingDurationMinutes"] = wait }
    if let gate = input["defaultGateDurationMinutes"] as? Int { settings["defaultGateDurationMinutes"] = gate }
    if let mode = input["themeMode"] as? String { settings["themeMode"] = mode }
    saveSettings(settings)
    resolve(nil)
  }

  @objc func getSettings(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(readSettings())
  }

  @objc func clearAllData(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    try? FileManager.default.removeItem(at: getJournalPath())
    try? FileManager.default.removeItem(at: getActiveSessionPath())
    try? FileManager.default.removeItem(at: getSettingsPath())
    try? FileManager.default.removeItem(at: getMusicLibraryPath())
    try? FileManager.default.removeItem(at: getMusicDir())
    stopPlayback()
    resolve(nil)
  }

  @objc func updateOperationIndex(_ index: Int, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    if var session = getActiveSessionInternal() {
      session["operationIndex"] = index
      saveActiveSession(session)
      resolve(nil)
    } else {
      reject("NO_SESSION", "No active session to update", nil)
    }
  }

  @objc func finalizeSession(_ endSource: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    if let session = getActiveSessionInternal() {
      finalizeSession(session: session, endIso: ISO8601DateFormatter().string(from: Date()), endSource: endSource)
      clearActiveSession()
      stopPlayback()
      DispatchQueue.main.async {
        UIApplication.shared.isIdleTimerDisabled = false
      }
      UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
      resolve(nil)
    } else {
      reject("NO_SESSION", "No active session to finalize", nil)
    }
  }

  @objc func resumeGateIfActive(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    if let session = getActiveSessionInternal(), session["status"] as? String == "gate_active" {
      DispatchQueue.main.async {
        UIApplication.shared.isIdleTimerDisabled = true
      }
      startPlayback()
      resolve(true)
    } else {
      resolve(false)
    }
  }

  // MARK: - Native Playback Logic

  private func startPlayback() {
    let lib = readMusicLibrary()
    let items = lib["music"] as? [[String: Any]] ?? []
    let enabledItems = items.filter { ($0["enabled"] as? Bool) ?? true }

    if enabledItems.isEmpty { return }

    let playerItems = enabledItems.compactMap { item -> AVPlayerItem? in
      guard let uriStr = item["uri"] as? String, let url = URL(string: uriStr) else { return nil }
      return AVPlayerItem(url: url)
    }

    if playerItems.isEmpty { return }

    do {
      try audioSession.setCategory(.playback, mode: .default, options: [])
      try audioSession.setActive(true)
    } catch {
      print("Failed to set audio session category")
    }

    player = AVQueuePlayer(items: playerItems)
    player?.play()
  }

  private func stopPlayback() {
    player?.pause()
    player = nil
    try? audioSession.setActive(false)
  }

  // MARK: - Notifications & Background Detection

  private func setupNotifications() {
    UNUserNotificationCenter.current().delegate = self
    NotificationCenter.default.addObserver(self, selector: #selector(appDidEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
  }

  // Without this, iOS silently drops local notifications fired while the app is foregrounded
  // (e.g. the "gate closing in 1 minute" warning while the user is sitting on the gate screen).
  func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
    completionHandler([.banner, .sound, .list])
  }

  @objc private func appDidEnterBackground() {
    if let session = getActiveSessionInternal(), session["status"] as? String == "gate_active" {
      // User left the app during a gate.
      sendImmediateReturnNotification()
    }
  }

  private func sendImmediateReturnNotification() {
    let content = UNMutableNotificationContent()
    content.title = "Aperture Lock Active"
    content.body = "Return to the app immediately to complete your commitment."
    content.sound = .default
    content.interruptionLevel = .timeSensitive

    let request = UNNotificationRequest(identifier: "RETURN_TO_APP", content: content, trigger: nil)
    UNUserNotificationCenter.current().add(request)
  }

  private func scheduleGateNotifications(waitMs: Int64, gateMs: Int64) {
    let center = UNUserNotificationCenter.current()
    center.requestAuthorization(options: [.alert, .sound]) { granted, _ in }

    // 1. Notification for when gate starts
    let startContent = UNMutableNotificationContent()
    startContent.title = "Gate Active"
    startContent.body = "Your commitment gate has opened. Solve the equations now."
    startContent.sound = .default

    let startTrigger = UNTimeIntervalNotificationTrigger(timeInterval: Double(waitMs) / 1000, repeats: false)
    center.add(UNNotificationRequest(identifier: "GATE_START", content: startContent, trigger: startTrigger))

    // 2. Notification for when gate is about to end
    let endContent = UNMutableNotificationContent()
    endContent.title = "Gate Closing"
    endContent.body = "The gate will close automatically in 1 minute."

    let endTriggerTime = Double(waitMs + gateMs - 60_000) / 1000
    if endTriggerTime > 0 {
      let endTrigger = UNTimeIntervalNotificationTrigger(timeInterval: endTriggerTime, repeats: false)
      center.add(UNNotificationRequest(identifier: "GATE_END_WARNING", content: endContent, trigger: endTrigger))
    }
  }

  // MARK: - Private Helpers

  private func getDocumentsDir() -> URL {
    return FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
  }

  private func getJournalPath() -> URL { return getDocumentsDir().appendingPathComponent("journal.json") }
  private func getActiveSessionPath() -> URL { return getDocumentsDir().appendingPathComponent("active_session.json") }
  private func getSettingsPath() -> URL { return getDocumentsDir().appendingPathComponent("settings.json") }
  private func getMusicLibraryPath() -> URL { return getDocumentsDir().appendingPathComponent("music-library.json") }
  private func getMusicDir() -> URL { return getDocumentsDir().appendingPathComponent("music") }

  private func readJournal() -> [String: Any] {
    if let data = try? Data(contentsOf: getJournalPath()),
       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      return json
    }
    return ["schemaVersion": 1, "timezone": TimeZone.current.identifier, "days": [:]]
  }

  private func saveJournal(_ journal: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: journal, options: .prettyPrinted) {
      try? data.write(to: getJournalPath())
    }
  }

  private func addSessionToJournal(sessionId: String, startedAtIso: String, waitMs: Int64, gateMs: Int64) {
    var journal = readJournal()
    var days = journal["days"] as? [String: [String: Any]] ?? [:]
    let todayKey = String(startedAtIso.prefix(10))
    var dayLog = days[todayKey] ?? ["sessions": []]
    var sessions = dayLog["sessions"] as? [[String: Any]] ?? []

    sessions.append([
      "id": sessionId, "start": startedAtIso, "end": NSNull(), "endSource": NSNull(),
      "originalEnd": NSNull(), "editedAt": NSNull(), "waitingDurationMs": waitMs,
      "gateDurationMs": gateMs, "kind": "enforced"
    ])

    dayLog["sessions"] = sessions
    days[todayKey] = dayLog
    journal["days"] = days
    saveJournal(journal)
  }

  private func getActiveSessionInternal() -> [String: Any]? {
    if let data = try? Data(contentsOf: getActiveSessionPath()),
       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      return json
    }
    return nil
  }

  private func saveActiveSession(_ session: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: session, options: .prettyPrinted) {
      try? data.write(to: getActiveSessionPath())
    }
  }

  private func clearActiveSession() {
    try? FileManager.default.removeItem(at: getActiveSessionPath())
  }

  private func finalizeSession(session: [String: Any], endIso: String, endSource: String) {
    let sessionId = session["sessionId"] as? String ?? ""
    let startedAtIso = session["startedAtIso"] as? String ?? ""
    var journal = readJournal()
    var days = journal["days"] as? [String: [String: Any]] ?? [:]
    let todayKey = String(startedAtIso.prefix(10))

    if var dayLog = days[todayKey], var sessions = dayLog["sessions"] as? [[String: Any]] {
      if let index = sessions.firstIndex(where: { ($0["id"] as? String) == sessionId }) {
        var s = sessions[index]
        s["end"] = endIso
        s["endSource"] = endSource
        sessions[index] = s
      }
      dayLog["sessions"] = sessions
      days[todayKey] = dayLog
      journal["days"] = days
      saveJournal(journal)
    }
  }

  private func readSettings() -> [String: Any] {
    if let data = try? Data(contentsOf: getSettingsPath()),
       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      return json
    }
    return ["difficulty": "standard", "shuffleKeypad": false, "defaultWaitingDurationMinutes": 10, "defaultGateDurationMinutes": 15, "themeMode": "system"]
  }

  private func saveSettings(_ settings: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: settings, options: .prettyPrinted) {
      try? data.write(to: getSettingsPath())
    }
  }

  private func readMusicLibrary() -> [String: Any] {
    if let data = try? Data(contentsOf: getMusicLibraryPath()),
       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      return json
    }
    return ["schemaVersion": 1, "shuffleEnabled": true, "music": []]
  }

  private func saveMusicLibrary(_ lib: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: lib, options: .prettyPrinted) {
      try? data.write(to: getMusicLibraryPath())
    }
  }

  private func serialize(_ obj: Any) -> String? {
    if let data = try? JSONSerialization.data(withJSONObject: obj, options: []) {
      return String(data: data, encoding: .utf8)
    }
    return nil
  }

  @objc func openExactAlarmSettings() {}
  @objc func openAccessibilitySettings() {}
  @objc func openUsageAccessSettings() {}
  @objc func requestIgnoreBatteryOptimizations() {}
  @objc func playTick() {
    AudioServicesPlaySystemSound(1104) // keyboard tick
  }

  @objc func openOverlaySettings() {}
  @objc func stopPinning(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) { resolve(nil) }
}
