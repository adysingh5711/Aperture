import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { useFocusEffect, useNavigation, NavigationProp } from '@react-navigation/native';
import { spacing, useThemedStyles, ThemeColors } from '../theme';
import { NeoPopButton, NeoPopCard, SectionLabel, GridBackground } from '../components/neopop';
import ApertureModule from '../native/ApertureModule';
import { CommitmentLog, JournalStackParamList } from '../types';
import { formatDuration, gateMsForSession } from '../utils/formatters';
import CalendarHeatmap from '../components/CalendarHeatmap';
import ManualEntrySheet from '../components/ManualEntrySheet';

export default function JournalScreen() {
  const navigation = useNavigation<NavigationProp<JournalStackParamList>>();
  const styles = useThemedStyles(makeStyles);
  const [journal, setJournal] = useState<CommitmentLog | null>(null);

  // Monthly totals
  const [totalCommitments, setTotalCommitments] = useState(0);
  const [totalGateTimeMs, setTotalGateTimeMs] = useState(0);

  // Manual entry modal
  const [showManualEntry, setShowManualEntry] = useState(false);

  const loadJournal = useCallback(async () => {
    try {
      const journalJson = await ApertureModule.getJournal();
      const parsed = JSON.parse(journalJson) as CommitmentLog;
      setJournal(parsed);

      // Calculate totals for the current month
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth(); // 0-11

      let count = 0;
      let gateTimeMs = 0;

      Object.entries(parsed.days || {}).forEach(([dateKey, dayLog]) => {
        const parts = dateKey.split('-');
        if (parts.length === 3) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10) - 1; // JS month

          if (y === currentYear && m === currentMonth) {
            dayLog.sessions.forEach(s => {
              count++;
              gateTimeMs += gateMsForSession(s);
            });
          }
        }
      });

      setTotalCommitments(count);
      setTotalGateTimeMs(gateTimeMs);

    } catch (e) {
      console.error('Failed to load journal', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadJournal();
    }, [loadJournal])
  );

  const handleDayPress = (dateStr: string) => {
    navigation.navigate('DayDetail', { date: dateStr });
  };

  return (
    <View style={styles.root}>
      <GridBackground />
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      <View style={styles.header}>
        <SectionLabel>Journal</SectionLabel>
        <Text style={styles.title}>History</Text>
      </View>

      {/* Heatmap */}
      <CalendarHeatmap journal={journal} onDayPress={handleDayPress} />

      {/* Monthly Summary */}
      <NeoPopCard style={styles.summaryCard}>
        <SectionLabel style={{ marginBottom: spacing.md }}>This month</SectionLabel>
        <View style={styles.summaryStats}>
          <View>
            <Text style={styles.statVal}>{totalCommitments}</Text>
            <Text style={styles.statLabel}>commitments</Text>
          </View>
          <View style={styles.statSeparator} />
          <View>
            <Text style={styles.statVal}>{formatDuration(totalGateTimeMs)}</Text>
            <Text style={styles.statLabel}>gate time</Text>
          </View>
        </View>
      </NeoPopCard>

      {/* Add session manually button */}
      <NeoPopButton
        title="+ Add session manually"
        variant="flat"
        style={styles.btnManual}
        onPress={() => setShowManualEntry(true)}
      />

      <ManualEntrySheet
        visible={showManualEntry}
        onCancel={() => setShowManualEntry(false)}
        onSave={() => {
          setShowManualEntry(false);
          loadJournal();
        }}
      />
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
    summaryCard: {
      marginTop: spacing.md,
    },
    summaryStats: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    statVal: {
      color: c.textPrimary,
      fontSize: 28,
      fontWeight: '900',
    },
    statLabel: {
      color: c.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginTop: 2,
    },
    statSeparator: {
      width: 1,
      height: 34,
      backgroundColor: c.border,
      marginHorizontal: spacing.lg,
    },
    btnManual: {
      marginTop: spacing.md,
    },
  });
