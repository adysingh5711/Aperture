import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, DimensionValue } from 'react-native';
import { spacing, useThemedStyles, ThemeColors } from '../theme';
import { NeoPopCard, SectionLabel } from './neopop';
import { Session } from '../types';
import { getISODateKey, gateMsForSession } from '../utils/formatters';

interface TrendChartProps {
  sessionsByDay: { [dateKey: string]: Session[] };
}

export default function TrendChart({ sessionsByDay }: TrendChartProps) {
  const styles = useThemedStyles(makeStyles);
  const [daysCount, setDaysCount] = useState<7 | 30>(7);

  // Generate date keys for the last 7 or 30 days
  const data = Array.from({ length: daysCount }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (daysCount - 1 - i));
    const key = getISODateKey(d);

    // Sum gate durations (exclude manual kind)
    const daySessions = sessionsByDay[key] || [];
    const totalGateMs = daySessions.reduce((sum, s) => sum + gateMsForSession(s), 0);

    return {
      date: d,
      dateLabel: d.getDate().toString(),
      key,
      value: totalGateMs / 60000, // minutes
    };
  });

  const maxValue = Math.max(...data.map(d => d.value), 1); // Avoid 0 division
  const chartHeight = 120;

  // ponytail: View-based bar chart. Ceiling: no animation, no touch tooltips. Upgrade: react-native-svg + d3-scale
  return (
    <NeoPopCard style={styles.container}>
      <View style={styles.header}>
        <SectionLabel>Gate Minutes Trend</SectionLabel>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, daysCount === 7 && styles.toggleBtnActive]}
            onPress={() => setDaysCount(7)}
          >
            <Text style={[styles.toggleText, daysCount === 7 && styles.toggleTextActive]}>7D</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, daysCount === 30 && styles.toggleBtnActive]}
            onPress={() => setDaysCount(30)}
          >
            <Text style={[styles.toggleText, daysCount === 30 && styles.toggleTextActive]}>30D</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Bars container */}
      <View style={[styles.chartArea, { height: chartHeight }]}>
        {data.map((item, idx) => {
          const pctHeight = `${(item.value / maxValue) * 100}%` as DimensionValue;
          const isToday = getISODateKey(item.date) === getISODateKey(new Date());

          return (
            <View
              key={idx}
              style={styles.barColumn}
              accessibilityLabel={`${item.date.toDateString()}: ${Math.round(item.value)} gate minutes`}
            >
              {/* Bar */}
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { height: pctHeight },
                    isToday && styles.barFillToday,
                  ]}
                />
              </View>
              {/* Label (only show for all 7D, or sparse for 30D) */}
              {(daysCount === 7 || idx % 5 === 0 || idx === data.length - 1) && (
                <Text style={styles.barLabel}>{item.dateLabel}</Text>
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
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    toggleRow: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: c.border,
    },
    toggleBtn: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
    },
    toggleBtnActive: {
      backgroundColor: c.textPrimary,
    },
    toggleText: {
      color: c.textSecondary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
    },
    toggleTextActive: {
      color: c.background,
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
      width: 6,
      backgroundColor: c.heatNone,
      justifyContent: 'flex-end',
      marginBottom: 4,
    },
    // CRED bar charts: muted bars, one accent highlight (today).
    barFill: {
      width: '100%',
      backgroundColor: c.textMuted,
    },
    barFillToday: {
      backgroundColor: c.accent,
    },
    barLabel: {
      color: c.textSecondary,
      fontSize: 10,
      fontFamily: 'monospace',
    },
  });
