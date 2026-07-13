import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, spacing } from '../theme';
import { CommitmentLog } from '../types';
import { formatDateMonthYear, getISODateKey } from '../utils/formatters';

interface CalendarHeatmapProps {
  journal: CommitmentLog | null;
  onDayPress: (dateStr: string) => void;
}

export default function CalendarHeatmap({ journal, onDayPress }: CalendarHeatmapProps) {
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();

  // Navigation
  const prevMonth = () => {
    setCurrentMonthDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonthDate(new Date(year, month + 1, 1));
  };

  // Grid calculations
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  // JS getDay(): Sun = 0, Mon = 1, ..., Sat = 6.
  // We want Mon = 0, Tue = 1, ..., Sun = 6.
  const rawFirstDayIdx = firstDayOfMonth.getDay();
  const startOffset = rawFirstDayIdx === 0 ? 6 : rawFirstDayIdx - 1;

  const totalDays = lastDayOfMonth.getDate();

  // Generate days array: empty offsets + day numbers
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) {
    cells.push(null);
  }
  for (let d = 1; d <= totalDays; d++) {
    cells.push(new Date(year, month, d));
  }

  // Group cells into weeks (rows of 7)
  const rows: (Date | null)[][] = [];
  let currentRow: (Date | null)[] = [];
  cells.forEach((cell, idx) => {
    currentRow.push(cell);
    if (currentRow.length === 7 || idx === cells.length - 1) {
      while (currentRow.length < 7) {
        currentRow.push(null);
      }
      rows.push(currentRow);
      currentRow = [];
    }
  });

  // Calculate day stats
  const getDayStats = (date: Date) => {
    const key = getISODateKey(date);
    const dayLog = journal?.days?.[key];
    const sessions = dayLog?.sessions || [];
    
    // Sum gate durations (exclude manual kind)
    let totalGateMs = 0;
    let enforcedCount = 0;

    sessions.forEach(s => {
      if (s.kind !== 'manual' && s.end !== null) {
        const start = new Date(s.start).getTime();
        const end = new Date(s.end).getTime();
        const waitMs = s.waitingDurationMs || 0;
        const gateStart = start + waitMs;
        const gateDuration = s.gateDurationMs || 0;
        const gateEnd = gateStart + gateDuration;
        
        // Actual gate end clamped between gateStart and gateEnd
        const actualEnd = Math.min(gateEnd, Math.max(gateStart, end));
        totalGateMs += Math.max(0, actualEnd - gateStart);
        enforcedCount++;
      }
    });

    const totalMinutes = totalGateMs / 60000;
    return {
      minutes: totalMinutes,
      count: sessions.length,
      enforcedCount,
    };
  };

  const getHeatColor = (minutes: number) => {
    if (minutes === 0) return colors.heatNone;
    if (minutes <= 5) return colors.heatLow;
    if (minutes <= 15) return colors.heatMid;
    return colors.heatHigh;
  };

  const todayKey = getISODateKey(new Date());
  const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <View style={styles.container}>
      {/* Month Selector Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={prevMonth} style={styles.navButton} accessibilityLabel="Previous month">
          <Text style={styles.navText}>◀</Text>
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{formatDateMonthYear(currentMonthDate)}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.navButton} accessibilityLabel="Next month">
          <Text style={styles.navText}>▶</Text>
        </TouchableOpacity>
      </View>

      {/* Weekday Names */}
      <View style={styles.weekdaysRow}>
        {weekdays.map((w, i) => (
          <Text key={i} style={styles.weekdayLabel}>
            {w}
          </Text>
        ))}
      </View>

      {/* Grid */}
      <View style={styles.grid}>
        {rows.map((row, rIdx) => (
          <View key={rIdx} style={styles.row}>
            {row.map((cell, cIdx) => {
              if (!cell) {
                return <View key={cIdx} style={styles.cellEmpty} />;
              }

              const stats = getDayStats(cell);
              const color = getHeatColor(stats.minutes);
              const cellKey = getISODateKey(cell);
              const isToday = cellKey === todayKey;

              const label = `${cell.getDate()} ${formatDateMonthYear(cell)}, ${stats.count} sessions, ${Math.round(stats.minutes)} minutes gate time`;

              return (
                <TouchableOpacity
                  key={cIdx}
                  style={[
                    styles.cell,
                    { backgroundColor: color },
                    isToday && styles.cellToday,
                  ]}
                  onPress={() => onDayPress(cellKey)}
                  accessibilityLabel={label}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.cellText,
                      { color: stats.minutes > 0 ? '#F8FAFC' : colors.textSecondary },
                    ]}
                  >
                    {cell.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  navButton: {
    padding: spacing.sm,
  },
  navText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  monthTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  weekdayLabel: {
    width: '12%',
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  grid: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cell: {
    width: '12%',
    aspectRatio: 1,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellEmpty: {
    width: '12%',
    aspectRatio: 1,
  },
  cellToday: {
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },
  cellText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
