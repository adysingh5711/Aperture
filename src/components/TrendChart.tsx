import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, DimensionValue } from 'react-native';
import { colors, spacing } from '../theme';
import { Session } from '../types';
import { getISODateKey, gateMsForSession } from '../utils/formatters';

interface TrendChartProps {
  sessionsByDay: { [dateKey: string]: Session[] };
}

export default function TrendChart({ sessionsByDay }: TrendChartProps) {
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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Gate Minutes Trend</Text>
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
                    {
                      height: pctHeight,
                      backgroundColor: isToday ? colors.action : colors.heatHigh,
                    },
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    borderRadius: 8,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
  },
  toggleBtnActive: {
    backgroundColor: '#1E293B',
  },
  toggleText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: 'bold',
  },
  toggleTextActive: {
    color: colors.textPrimary,
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
    backgroundColor: colors.border,
    borderRadius: 3,
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  barFill: {
    width: '100%',
    borderRadius: 3,
  },
  barLabel: {
    color: colors.textSecondary,
    fontSize: 9,
    fontFamily: 'monospace',
  },
});
