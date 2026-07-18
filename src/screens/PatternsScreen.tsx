import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { spacing, useThemedStyles, ThemeColors, radii } from '../theme';
import { SectionLabel, GridBackground } from '../components/neopop';
import ApertureModule from '../native/ApertureModule';
import { CommitmentLog, Session } from '../types';
import { formatDuration, peakHourRangeLabel } from '../utils/formatters';
import TrendChart from '../components/TrendChart';
import HistogramChart from '../components/HistogramChart';

const MIN_DAYS = 14;
const MIN_COMPLETED = 20;
const MIN_INSIGHT_SAMPLE = 20;

export default function PatternsScreen() {
  const styles = useThemedStyles(makeStyles);
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
        <GridBackground />
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
    <View style={styles.root}>
      <GridBackground />
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      <View style={styles.header}>
        <SectionLabel>Insights</SectionLabel>
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
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: c.background,
    },
    container: {
      flex: 1,
      paddingHorizontal: spacing.md,
    },
    header: {
      paddingVertical: spacing.lg,
      gap: spacing.xs,
    },
    title: {
      color: c.textPrimary,
      fontSize: 28,
      fontFamily: 'serif',
      fontWeight: '700',
    },
    placeholderContainer: {
      flex: 1,
      backgroundColor: c.background,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
    },
    placeholderText: {
      color: c.textSecondary,
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
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radii.card,
      padding: spacing.md,
      alignItems: 'center',
    },
    // Serif display numerals, like CRED's big stats.
    statVal: {
      color: c.textPrimary,
      fontSize: 22,
      fontFamily: 'serif',
      fontWeight: '700',
    },
    statLabel: {
      color: c.textSecondary,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginTop: 4,
      textAlign: 'center',
    },
    insightText: {
      color: c.textSecondary,
      fontSize: 13,
      textAlign: 'center',
      marginTop: spacing.lg,
    },
  });
