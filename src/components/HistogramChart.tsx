import React from 'react';
import { StyleSheet, Text, View, DimensionValue } from 'react-native';
import { spacing, useThemedStyles, ThemeColors } from '../theme';
import { NeoPopCard, SectionLabel } from './neopop';
import { Session } from '../types';

interface HistogramChartProps {
  sessions: Session[];
}

export default function HistogramChart({ sessions }: HistogramChartProps) {
  const styles = useThemedStyles(makeStyles);

  // Initialize 24 hour buckets
  const hourBuckets = Array.from({ length: 24 }, () => 0);

  sessions.forEach(s => {
    try {
      const hour = new Date(s.start).getHours();
      if (hour >= 0 && hour < 24) {
        hourBuckets[hour]++;
      }
    } catch {
      // Ignored malformed dates
    }
  });

  const maxVal = Math.max(...hourBuckets, 1);
  const chartHeight = 100;

  return (
    <NeoPopCard style={styles.container}>
      <SectionLabel style={{ marginBottom: spacing.md }}>Commitments by Hour of Day</SectionLabel>

      <View style={[styles.chartArea, { height: chartHeight }]}>
        {hourBuckets.map((count, hour) => {
          const pctHeight = `${(count / maxVal) * 100}%` as DimensionValue;
          const hourStr = String(hour).padStart(2, '0');
          const isPeak = count > 0 && count === maxVal;

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
                    { height: pctHeight },
                    count === 0 && styles.barFillEmpty,
                    isPeak && styles.barFillPeak,
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
    </NeoPopCard>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      marginTop: spacing.md,
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
      backgroundColor: c.heatNone,
      justifyContent: 'flex-end',
      marginBottom: 4,
    },
    barFill: {
      width: '100%',
      backgroundColor: c.accent,
    },
    barFillEmpty: {
      backgroundColor: c.heatNone,
    },
    barFillPeak: {
      backgroundColor: c.textPrimary,
    },
    barLabel: {
      color: c.textSecondary,
      fontSize: 10,
      fontFamily: 'monospace',
    },
  });
