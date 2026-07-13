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

export default ApertureNativeModule as ApertureModuleType;
