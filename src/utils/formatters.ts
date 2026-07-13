/**
 * Formatting utilities for Aperture.
 * Uses native Intl APIs to keep bundle size small and avoid dependencies.
 */
import { Session } from '../types';

export function formatDateLong(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

export function formatTimeShort(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatDateMonthYear(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) {
    return `${s}s`;
  }
  return `${m}m ${s}s`;
}

export function getISODateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Gate minutes actually spent, clamped to the gate window. 0 for manual/in-progress sessions. */
export function gateMsForSession(s: Session): number {
  if (s.kind === 'manual' || s.end === null) return 0;
  const start = new Date(s.start).getTime();
  const end = new Date(s.end).getTime();
  const gateStart = start + (s.waitingDurationMs || 0);
  const gateEnd = gateStart + (s.gateDurationMs || 0);
  const actualEnd = Math.min(gateEnd, Math.max(gateStart, end));
  return Math.max(0, actualEnd - gateStart);
}

/** Neutral "busiest time of day" insight — never streaks/scores, just awareness. */
export function peakHourRangeLabel(sessions: Session[]): string {
  const bucketCounts = Array.from({ length: 12 }, () => 0); // 12 buckets of 2 hours
  sessions.forEach(s => {
    const hour = new Date(s.start).getHours();
    bucketCounts[Math.floor(hour / 2)]++;
  });
  const peakBucket = bucketCounts.indexOf(Math.max(...bucketCounts));
  const startHour = peakBucket * 2;
  const endHour = (startHour + 2) % 24;
  return `Most commitments started between ${String(startHour).padStart(2, '0')}:00 and ${String(endHour).padStart(2, '0')}:00.`;
}

export type SessionOutcome = 'cancelled_before_gate' | 'solved' | 'timed_out' | 'manual' | 'in_progress';

/** Derived display outcome per plan.md — never mutates stored data. */
export function deriveOutcome(s: Session): SessionOutcome {
  if (s.kind === 'manual') return 'manual';
  if (s.end === null) return 'in_progress';
  const start = new Date(s.start).getTime();
  const end = new Date(s.end).getTime();
  const gateStart = start + (s.waitingDurationMs || 0);
  const gateEnd = gateStart + (s.gateDurationMs || 0);
  if (end < gateStart) return 'cancelled_before_gate';
  if (end >= gateEnd) return 'timed_out';
  return 'solved';
}
