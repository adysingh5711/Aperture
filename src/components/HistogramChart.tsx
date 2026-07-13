import React from 'react';
import { StyleSheet, Text, View, DimensionValue } from 'react-native';
import { colors, spacing } from '../theme';
import { Session } from '../types';

interface HistogramChartProps {
  sessions: Session[];
}

export default function HistogramChart({ sessions }: HistogramChartProps) {
  // Initialize 24 hour buckets
  const hourBuckets = Array.from({ length: 24 }, () => 0);

  sessions.forEach(s => {
    try {
      const hour = new Date(s.start).getHours();
      if (hour >= 0 && hour < 24) {
        hourBuckets[hour]++;
      }
    } catch (e) {
      // Ignored malformed dates
    }
  });

  const maxVal = Math.max(...hourBuckets, 1);
  const chartHeight = 100;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Commitments by Hour of Day</Text>

      <View style={[styles.chartArea, { height: chartHeight }]}>
        {hourBuckets.map((count, hour) => {
          const pctHeight = `${(count / maxVal) * 100}%` as DimensionValue;
          const hourStr = String(hour).padStart(2, '0');

          return (
            <View
              key={hour}
              style={styles.barColumn}
              accessibilityLabel={`Hour ${hourStr}:00: ${count} commitments`}
            >
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      height: pctHeight,
                      backgroundColor: count > 0 ? colors.action : colors.border,
                    },
                  ]}
                />
              </View>
              {/* Show sparse labels to avoid clutter */}
              {hour % 4 === 0 && (
                <Text style={styles.barLabel}>{hourStr}</Text>
              )}
            </View>
          );
        })}
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
    marginBottom: spacing.md,
  },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  barColumn: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barTrack: {
    flex: 1,
    width: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  barFill: {
    width: '100%',
    borderRadius: 2,
  },
  barLabel: {
    color: colors.textSecondary,
    fontSize: 9,
    fontFamily: 'monospace',
  },
});
