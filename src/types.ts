export interface Session {
  id: string;
  start: string; // ISO OffsetDateTime string
  end: string | null; // null if active
  endSource: 'system_solve' | 'system_timeout' | 'system_cancel' | 'manual' | 'manual_entry' | null;
  originalEnd: string | null;
  editedAt: string | null;
  waitingDurationMs: number | null;
  gateDurationMs: number | null;
  kind: 'enforced' | 'manual' | null;
}

export interface DayLog {
  sessions: Session[];
}

export interface CommitmentLog {
  schemaVersion: number;
  timezone: string;
  days: {
    [date: string]: DayLog;
  };
}

export interface ActiveSession {
  schemaVersion: number;
  sessionId: string;
  status: 'waiting_for_gate' | 'gate_active';
  waitingDurationMs: number;
  gateDurationMs: number;
  startedAtIso: string;
  startElapsedMs: number;
  gateAtElapsedMs: number;
  endAtElapsedMs: number;
  challengeSeed: string;
  operationIndex: number;
  queueMediaIds: string[];
  currentMediaIndex: number;
}

export interface MusicItem {
  id: string;
  displayName: string;
  uri: string;
  mimeType: string;
  durationMs: number;
  enabled: boolean;
  addedAt: string;
}

export interface MusicLibrary {
  schemaVersion: number;
  shuffleEnabled: boolean;
  music: MusicItem[];
}

export interface Capabilities {
  canScheduleExactAlarms: boolean;
  screenPinningInstructionsSeen: boolean;
}

export interface Diagnostics {
  version: string;
  activeSessionExists: boolean;
  exactAlarmPermission: boolean;
}

// Navigation Types
export type JournalStackParamList = {
  JournalHome: undefined;
  DayDetail: { date: string };
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
  SoundLibrary: undefined;
};

export type AppTabParamList = {
  Today: undefined;
  JournalTab: undefined;
  Patterns: undefined;
  SettingsTab: undefined;
};
