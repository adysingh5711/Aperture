import { NativeModules } from 'react-native';

const { ApertureNativeModule } = NativeModules;

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
  }): Promise<void>;
  getSettings(): Promise<{
    difficulty: string;
    shuffleKeypad: boolean;
    defaultWaitingDurationMinutes: number;
    defaultGateDurationMinutes: number;
  }>;
  exportJournal(): Promise<string>;
  clearAllData(): Promise<void>;
  resumeGateIfActive(): Promise<boolean>;
  openExactAlarmSettings(): void;
  openAccessibilitySettings(): void;
  openUsageAccessSettings(): void;
  requestIgnoreBatteryOptimizations(): void;
  openOverlaySettings(): void;
  stopPinning(): Promise<void>;
}

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
    activeSessionExists: false,
    exactAlarmPermission: true,
  }),
  startSession: async () => { throw new Error('Not implemented on iOS'); },
  cancelWaitingSession: async () => {},
  getActiveSession: async () => null,
  getJournal: async () => JSON.stringify({ schemaVersion: 1, timezone: 'UTC', days: {} }),
  addManualSession: async () => {},
  updateCompletedEnd: async () => {},
  pickAndAddMusic: async () => null,
  getMusicLibrary: async () => JSON.stringify({ schemaVersion: 1, music: [], shuffleEnabled: false }),
  updateMusicLibrary: async () => {},
  removeMusicItem: async () => {},
  updateSettings: async () => {},
  getSettings: async () => ({
    difficulty: 'standard',
    shuffleKeypad: false,
    defaultWaitingDurationMinutes: 10,
    defaultGateDurationMinutes: 15,
  }),
  exportJournal: async () => '',
  clearAllData: async () => {},
  resumeGateIfActive: async () => false,
  openExactAlarmSettings: () => {},
  openAccessibilitySettings: () => {},
  openUsageAccessSettings: () => {},
  requestIgnoreBatteryOptimizations: () => {},
  openOverlaySettings: () => {},
  stopPinning: async () => {},
};

if (!ApertureNativeModule) {
  console.warn('ApertureNativeModule is null or undefined. Using fallback implementation (likely iOS).');
}

export default (ApertureNativeModule || ApertureModuleFallback) as ApertureModuleType;
