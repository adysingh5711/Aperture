import { NativeModules } from 'react-native';

const { ApertureNativeModule } = NativeModules;

if (!ApertureNativeModule) {
  console.error('ApertureNativeModule is not loaded. Please link the native module in Xcode/Android and rebuild. Falling back to in-memory state for timer persistence.');
}

export interface ApertureModuleType {
  getCapabilities(): Promise<{
    canScheduleExactAlarms: boolean;
    accessibilityServiceEnabled: boolean;
    usageAccessGranted: boolean;
    isIgnoringBatteryOptimizations: boolean;
    canDrawOverlays: boolean;
  }>;
  getDiagnostics(): Promise<{
    version: string;
    activeSessionExists: boolean;
    exactAlarmPermission: boolean;
  }>;
  startSession(input: {
    waitingDurationMinutes: number;
    gateDurationMinutes: number;
  }): Promise<string>; // Returns JSON string of ActiveSession
  cancelWaitingSession(): Promise<void>;
  getActiveSession(): Promise<string | null>; // Returns JSON string of ActiveSession or null
  getJournal(): Promise<string>; // Returns JSON string of CommitmentLog
  addManualSession(input: {
    start: string;
    end: string;
  }): Promise<void>;
  updateCompletedEnd(input: {
    sessionId: string;
    newEnd: string;
    force: boolean;
  }): Promise<void>;
  pickAndAddMusic(): Promise<string | null>; // Returns JSON string of MusicItem or null
  getMusicLibrary(): Promise<string>; // Returns JSON string of MusicLibrary
  updateMusicLibrary(input: {
    enabledStates: { [id: string]: boolean };
    shuffleEnabled: boolean;
  }): Promise<void>;
  removeMusicItem(id: string): Promise<void>;
  updateSettings(input: {
    difficulty?: string;
    shuffleKeypad?: boolean;
    defaultWaitingDurationMinutes?: number;
    defaultGateDurationMinutes?: number;
    themeMode?: 'light' | 'dark' | 'system';
    defaultToneEnabled?: boolean;
    autoplayOnGateStart?: boolean;
  }): Promise<void>;
  getSettings(): Promise<{
    difficulty: string;
    shuffleKeypad: boolean;
    defaultWaitingDurationMinutes: number;
    defaultGateDurationMinutes: number;
    themeMode?: 'light' | 'dark' | 'system'; // absent on settings files written before this key existed
    defaultToneEnabled?: boolean; // absent on settings files written before this key existed; defaults true
    autoplayOnGateStart?: boolean; // absent on settings files written before this key existed; defaults true
  }>;
  exportJournal(): Promise<string>;
  clearAllData(): Promise<void>;
  updateOperationIndex(index: number): Promise<void>;
  finalizeSession(endSource: string): Promise<void>;
  resumeGateIfActive(): Promise<boolean>;
  openExactAlarmSettings(): void;
  openAccessibilitySettings(): void;
  openUsageAccessSettings(): void;
  requestIgnoreBatteryOptimizations(): void;
  openOverlaySettings(): void;
  playTick(): void;
  stopPinning(): Promise<void>;
}

// In-memory persistence fallback for when native module isn't loaded
let _mockSession: string | null = null;
let _mockJournal: string = JSON.stringify({
  schemaVersion: 1,
  timezone: 'UTC',
  days: {}
});
let _mockSettings: any = {
  difficulty: 'standard',
  shuffleKeypad: false,
  defaultWaitingDurationMinutes: 10,
  defaultGateDurationMinutes: 15,
  themeMode: 'system',
  defaultToneEnabled: true,
  autoplayOnGateStart: true,
};

const ApertureModuleFallback: ApertureModuleType = {
  getCapabilities: async () => ({
    canScheduleExactAlarms: true,
    accessibilityServiceEnabled: true,
    usageAccessGranted: true,
    isIgnoringBatteryOptimizations: true,
    canDrawOverlays: true,
  }),
  getDiagnostics: async () => ({
    version: '1.0.0-mock',
    activeSessionExists: _mockSession !== null,
    exactAlarmPermission: true,
  }),
  startSession: async (input) => {
    const waitMs = input.waitingDurationMinutes * 60_000;
    const gateMs = input.gateDurationMinutes * 60_000;
    const now = Date.now();
    const session = {
      schemaVersion: 1,
      sessionId: 'mock-' + Math.random().toString(36).substring(2, 9),
      status: 'waiting_for_gate',
      waitingDurationMs: waitMs,
      gateDurationMs: gateMs,
      startedAtIso: new Date().toISOString(),
      startElapsedMs: now,
      gateAtElapsedMs: now + waitMs,
      endAtElapsedMs: now + waitMs + gateMs,
      challengeSeed: Math.random().toString(),
      operationIndex: 0,
      queueMediaIds: [],
      currentMediaIndex: 0
    };
    _mockSession = JSON.stringify(session);
    return _mockSession;
  },
  cancelWaitingSession: async () => {
    _mockSession = null;
  },
  getActiveSession: async () => {
    if (!_mockSession) return null;
    const session = JSON.parse(_mockSession);
    const now = Date.now();

    // Auto-transition status for mock environment
    if (session.status === 'waiting_for_gate' && now >= session.gateAtElapsedMs) {
      session.status = 'gate_active';
      _mockSession = JSON.stringify(session);
    } else if (session.status === 'gate_active' && now >= session.endAtElapsedMs) {
      // Auto-finalize on timeout in mock
      const journal = JSON.parse(_mockJournal);
      const today = new Date().toISOString().split('T')[0];
      if (!journal.days[today]) journal.days[today] = { sessions: [] };
      journal.days[today].sessions.push({
        id: session.sessionId,
        start: session.startedAtIso,
        end: new Date().toISOString(),
        endSource: 'system_timeout',
        kind: 'enforced',
        waitingDurationMs: session.waitingDurationMs,
        gateDurationMs: session.gateDurationMs
      });
      _mockJournal = JSON.stringify(journal);
      _mockSession = null;
      return null;
    }

    return _mockSession;
  },
  getJournal: async () => _mockJournal,
  addManualSession: async (input) => {
    const journal = JSON.parse(_mockJournal);
    const today = input.start.split('T')[0];
    if (!journal.days[today]) journal.days[today] = { sessions: [] };
    journal.days[today].sessions.push({
      id: 'manual-' + Math.random(),
      start: input.start,
      end: input.end,
      endSource: 'manual',
      kind: 'manual'
    });
    _mockJournal = JSON.stringify(journal);
  },
  updateCompletedEnd: async () => {},
  pickAndAddMusic: async () => null,
  getMusicLibrary: async () => JSON.stringify({ schemaVersion: 1, music: [], shuffleEnabled: false }),
  updateMusicLibrary: async () => {},
  removeMusicItem: async () => {},
  updateSettings: async (input) => {
    _mockSettings = { ..._mockSettings, ...input };
  },
  getSettings: async () => _mockSettings,
  exportJournal: async () => _mockJournal,
  clearAllData: async () => {
    _mockSession = null;
    _mockJournal = JSON.stringify({ schemaVersion: 1, timezone: 'UTC', days: {} });
  },
  updateOperationIndex: async (index: number) => {
    if (_mockSession) {
      const session = JSON.parse(_mockSession);
      session.operationIndex = index;
      _mockSession = JSON.stringify(session);
    }
  },
  finalizeSession: async (endSource: string) => {
    if (_mockSession) {
      const session = JSON.parse(_mockSession);
      const journal = JSON.parse(_mockJournal);
      const today = new Date().toISOString().split('T')[0];
      if (!journal.days[today]) journal.days[today] = { sessions: [] };
      journal.days[today].sessions.push({
        id: session.sessionId,
        start: session.startedAtIso,
        end: new Date().toISOString(),
        endSource: endSource,
        kind: 'enforced',
        waitingDurationMs: session.waitingDurationMs,
        gateDurationMs: session.gateDurationMs
      });
      _mockJournal = JSON.stringify(journal);
    }
    _mockSession = null;
  },
  resumeGateIfActive: async () => {
    if (_mockSession) {
      const session = JSON.parse(_mockSession);
      return session.status === 'gate_active';
    }
    return false;
  },
  openExactAlarmSettings: () => {},
  openAccessibilitySettings: () => {},
  openUsageAccessSettings: () => {},
  requestIgnoreBatteryOptimizations: () => {},
  openOverlaySettings: () => {},
  playTick: () => {},
  stopPinning: async () => {},
};

export default (ApertureNativeModule || ApertureModuleFallback) as ApertureModuleType;
