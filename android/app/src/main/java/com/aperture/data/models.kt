package com.aperture.data

data class Session(
    val id: String,
    val start: String, // ISO OffsetDateTime
    val end: String?, // null while active
    val endSource: String?, // system_solve | system_timeout | system_cancel | manual | manual_entry
    val originalEnd: String?,
    val editedAt: String?,
    val waitingDurationMs: Long?,
    val gateDurationMs: Long?,
    val kind: String? // "enforced" | "manual"
)

data class DayLog(
    val sessions: List<Session>
)

data class CommitmentLog(
    val schemaVersion: Int = 1,
    val timezone: String,
    val days: Map<String, DayLog>
)

data class ActiveSession(
    val schemaVersion: Int = 1,
    val sessionId: String,
    val status: String, // "waiting_for_gate" | "gate_active"
    val waitingDurationMs: Long,
    val gateDurationMs: Long,
    val startedAtIso: String,
    val startElapsedMs: Long,
    val gateAtElapsedMs: Long,
    val endAtElapsedMs: Long,
    val challengeSeed: String,
    val operationIndex: Int,
    val queueMediaIds: List<String>,
    val currentMediaIndex: Int
)

data class MusicItem(
    val id: String,
    val displayName: String,
    val uri: String,
    val mimeType: String,
    val durationMs: Long,
    val enabled: Boolean,
    val addedAt: String
)

data class MusicLibrary(
    val schemaVersion: Int = 1,
    val shuffleEnabled: Boolean = true,
    val music: List<MusicItem>
)

data class Settings(
    val schemaVersion: Int = 1,
    val difficulty: String = "standard", // "light" | "standard" | "hard"
    val shuffleKeypad: Boolean = false,
    val defaultWaitingDurationMinutes: Int = 10,
    val defaultGateDurationMinutes: Int = 15,
    val themeMode: String = "system" // "light" | "dark" | "system"
)



