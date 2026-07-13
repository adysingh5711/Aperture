import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, radii } from '../theme';
import ApertureModule from '../native/ApertureModule';
import { CommitmentLog, Session } from '../types';
import { formatDuration, peakHourRangeLabel } from '../utils/formatters';
import TrendChart from '../components/TrendChart';
import HistogramChart from '../components/HistogramChart';

const MIN_DAYS = 14;
const MIN_COMPLETED = 20;
const MIN_INSIGHT_SAMPLE = 20;

export default function PatternsScreen() {
  const [sessionsByDay, setSessionsByDay] = useState<{ [dateKey: string]: Session[] }>({});
  const [enforced, setEnforced] = useState<Session[]>([]);
  const [daysWithData, setDaysWithData] = useState(0);

  const load = useCallback(async () => {
    try {
      const json = await ApertureModule.getJournal();
      const journal = JSON.parse(json) as CommitmentLog;
      setSessionsByDay(journal.days ? Object.fromEntries(
        Object.entries(journal.days).map(([k, v]) => [k, v.sessions])
      ) : {});
      setDaysWithData(Object.keys(journal.days || {}).length);

      const flat = Object.values(journal.days || {}).flatMap(d => d.sessions);
      setEnforced(flat.filter(s => s.kind !== 'manual' && s.end !== null));
    } catch (e) {
      console.error('Failed to load patterns', e);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const hasEnoughData = daysWithData >= MIN_DAYS || enforced.length >= MIN_COMPLETED;

  if (!hasEnoughData) {
    return (
      <View style={styles.placeholderContainer}>
        <Text style={styles.placeholderText}>
          Patterns will appear after more data is collected.
        </Text>
      </View>
    );
  }

  const solvedCount = enforced.filter(s => {
    const gateStart = new Date(s.start).getTime() + (s.waitingDurationMs || 0);
    return new Date(s.end as string).getTime() < gateStart + (s.gateDurationMs || 0);
  }).length;
  const solvedPct = enforced.length > 0 ? Math.round((solvedCount / enforced.length) * 100) : 0;
  const timeoutPct = 100 - solvedPct;

  const gateDurations = enforced.map(s => s.gateDurationMs || 0).sort((a, b) => a - b);
  const medianGateMs = gateDurations.length > 0
    ? gateDurations[Math.floor(gateDurations.length / 2)]
    : 0;

  // Neutral insight: peak 2-hour start-time bucket
  const insight = enforced.length >= MIN_INSIGHT_SAMPLE ? peakHourRangeLabel(enforced) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      <View style={styles.header}>
        <Text style={styles.title}>Patterns</Text>
      </View>

      <TrendChart sessionsByDay={sessionsByDay} />
      <HistogramChart sessions={enforced} />

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>{solvedPct}%</Text>
          <Text style={styles.statLabel}>Solved early</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>{timeoutPct}%</Text>
          <Text style={styles.statLabel}>Automatic end</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>{formatDuration(medianGateMs)}</Text>
          <Text style={styles.statLabel}>Median gate</Text>
        </View>
      </View>

      {insight && <Text style={styles.insightText}>{insight}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  header: {
    paddingVertical: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: 'bold',
  },
  placeholderContainer: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  placeholderText: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  statVal: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  insightText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
