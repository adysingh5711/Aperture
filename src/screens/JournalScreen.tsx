import React, { useState, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { useFocusEffect, useNavigation, NavigationProp } from '@react-navigation/native';
import { colors, spacing, radii } from '../theme';
import ApertureModule from '../native/ApertureModule';
import { CommitmentLog, JournalStackParamList } from '../types';
import { formatDuration, gateMsForSession } from '../utils/formatters';
import CalendarHeatmap from '../components/CalendarHeatmap';
import ManualEntrySheet from '../components/ManualEntrySheet';

export default function JournalScreen() {
  const navigation = useNavigation<NavigationProp<JournalStackParamList>>();
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
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      <View style={styles.header}>
        <Text style={styles.title}>Journal</Text>
      </View>

      {/* Heatmap */}
      <CalendarHeatmap journal={journal} onDayPress={handleDayPress} />

      {/* Monthly Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>This Month</Text>
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
      </View>

      {/* Add session manually button */}
      <TouchableOpacity
        style={styles.btnManual}
        onPress={() => setShowManualEntry(true)}
        accessibilityLabel="Add session manually"
        accessibilityRole="button"
      >
        <Text style={styles.btnManualText}>+ Add session manually</Text>
      </TouchableOpacity>

      <ManualEntrySheet
        visible={showManualEntry}
        onCancel={() => setShowManualEntry(false)}
        onSave={() => {
          setShowManualEntry(false);
          loadJournal();
        }}
      />
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
  summaryCard: {
    backgroundColor: '#1E293B',
    borderRadius: radii.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
  },
  summaryTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  summaryStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statVal: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  statSeparator: {
    width: 1,
    height: 30,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  btnManual: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  btnManualText: {
    color: colors.action,
    fontSize: 16,
    fontWeight: '600',
  },
});
