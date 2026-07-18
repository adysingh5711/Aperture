import React from 'react';
import { StyleSheet, Text, View, DimensionValue } from 'react-native';
import { spacing, useTheme, useThemedStyles, ThemeColors, radii } from '../theme';
import { SectionLabel } from './neopop';
import { Session } from '../types';

interface DailyTimelineProps {
  sessions: Session[];
}

export default function DailyTimeline({ sessions }: DailyTimelineProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // Convert ISO timestamp to minutes since midnight (0 to 1440)
  const getMinutesSinceMidnight = (dateStr: string): number => {
    const d = new Date(dateStr);
    return d.getHours() * 60 + d.getMinutes();
  };

  // Determine outcome and color: accent for enforced/active sessions,
  // muted tokens for manual entries and pre-gate cancellations.
  const getSessionColor = (s: Session) => {
    if (s.kind === 'manual') return colors.border;
    if (s.end === null) return colors.accent; // in progress

    const start = new Date(s.start).getTime();
    const end = new Date(s.end).getTime();
    const wait = s.waitingDurationMs || 0;
    const gateStart = start + wait;

    if (end < gateStart) {
      return colors.textMuted; // cancelled before gate
    }
    return colors.accent; // enforced (solved or automatic end)
  };

  return (
    <View style={styles.container}>
      <SectionLabel style={{ marginBottom: spacing.sm }}>Daily timeline</SectionLabel>

      {/* 24h Timeline bar */}
      <View style={styles.barContainer}>
        <View style={styles.timelineBar}>
          {sessions.map((s) => {
            const startMin = getMinutesSinceMidnight(s.start);
            const waitMs = s.waitingDurationMs || 0;
            const gateMs = s.gateDurationMs || 15 * 60 * 1000;

            // Total duration represented in timeline: wait + gate duration (in minutes)
            const durationMin = (waitMs + gateMs) / 60000;

            const leftPct = `${(startMin / 1440) * 100}%` as DimensionValue;
            const widthPct = `${Math.max(1.5, (durationMin / 1440) * 100)}%` as DimensionValue; // Min width 1.5% to ensure it is visible

            const color = getSessionColor(s);

            return (
              <View
                key={s.id}
                style={[
                  styles.sessionBlock,
                  {
                    left: leftPct,
                    width: widthPct,
                    backgroundColor: color,
                  },
                ]}
                accessibilityLabel={`Session started at ${new Date(s.start).toLocaleTimeString()}`}
              />
            );
          })}
        </View>
      </View>

      {/* Timeline Labels */}
      <View style={styles.labelsRow}>
        <Text style={styles.label}>00:00</Text>
        <Text style={styles.label}>06:00</Text>
        <Text style={styles.label}>12:00</Text>
        <Text style={styles.label}>18:00</Text>
        <Text style={styles.label}>24:00</Text>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: c.surface,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.card,
      marginTop: spacing.md,
    },
    barContainer: {
      height: 24,
      justifyContent: 'center',
    },
    timelineBar: {
      height: 8,
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: c.border,
      position: 'relative',
      flexDirection: 'row',
    },
    sessionBlock: {
      position: 'absolute',
      height: 14,
      top: -4,
    },
    labelsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: spacing.xs,
    },
    label: {
      color: c.textSecondary,
      fontSize: 10,
      fontFamily: 'monospace',
      textTransform: 'uppercase',
    },
  });
