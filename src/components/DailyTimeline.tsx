import React from 'react';
import { StyleSheet, Text, View, DimensionValue } from 'react-native';
import { colors, spacing } from '../theme';
import { Session } from '../types';

interface DailyTimelineProps {
  sessions: Session[];
}

export default function DailyTimeline({ sessions }: DailyTimelineProps) {
  // Convert ISO timestamp to minutes since midnight (0 to 1440)
  const getMinutesSinceMidnight = (dateStr: string): number => {
    const d = new Date(dateStr);
    return d.getHours() * 60 + d.getMinutes();
  };

  // Determine outcome and color
  const getSessionColor = (s: Session) => {
    if (s.kind === 'manual') return colors.border;
    if (s.end === null) return colors.action; // in progress

    const start = new Date(s.start).getTime();
    const end = new Date(s.end).getTime();
    const wait = s.waitingDurationMs || 0;
    const gateStart = start + wait;
    const gateDuration = s.gateDurationMs || 0;
    const gateEnd = gateStart + gateDuration;

    if (end < gateStart) {
      return '#475569'; // cancelled before gate (dark gray)
    } else if (end >= gateEnd) {
      return '#334155'; // automatic end / timeout (slate gray)
    } else {
      return colors.action; // solved (blue)
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Daily Timeline</Text>
      
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
  },
  title: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  barContainer: {
    height: 24,
    justifyContent: 'center',
  },
  timelineBar: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    position: 'relative',
    flexDirection: 'row',
  },
  sessionBlock: {
    position: 'absolute',
    height: 14,
    top: -3,
    borderRadius: 3,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 10,
    fontFamily: 'monospace',
  },
});
