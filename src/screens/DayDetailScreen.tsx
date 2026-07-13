import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { colors, spacing, radii } from '../theme';
import ApertureModule from '../native/ApertureModule';
import { CommitmentLog, JournalStackParamList, Session } from '../types';
import { formatDuration, formatTimeShort, deriveOutcome, gateMsForSession } from '../utils/formatters';
import EditEndSheet from '../components/EditEndSheet';

const OUTCOME_LABEL: Record<string, string> = {
  cancelled_before_gate: 'Cancelled before gate',
  solved: 'Solved',
  timed_out: 'Automatic end',
  manual: 'Manual entry',
  in_progress: 'In progress',
};

export default function DayDetailScreen() {
  const route = useRoute<RouteProp<JournalStackParamList, 'DayDetail'>>();
  const { date } = route.params;

  const [sessions, setSessions] = useState<Session[]>([]);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const journalJson = await ApertureModule.getJournal();
      const journal = JSON.parse(journalJson) as CommitmentLog;
      const daySessions = (journal.days?.[date]?.sessions || [])
        .slice()
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      setSessions(daySessions);
    } catch (e) {
      console.error('Failed to load day detail', e);
    }
  }, [date]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalGateMs = sessions.reduce((sum, s) => sum + gateMsForSession(s), 0);

  const renderRow = (s: Session) => {
    const outcome = deriveOutcome(s);
    const start = new Date(s.start);
    const canEdit = s.end !== null;

    let secondLine: string;
    if (s.end === null) {
      secondLine = OUTCOME_LABEL[outcome];
    } else if (outcome === 'solved' || outcome === 'timed_out') {
      const gateStartMs = start.getTime() + (s.waitingDurationMs || 0);
      const durationLabel = formatDuration(Math.max(0, new Date(s.end).getTime() - gateStartMs));
      secondLine = `${formatTimeShort(new Date(gateStartMs))} → ${formatTimeShort(new Date(s.end))}  ${
        outcome === 'solved' ? `Solved in ${durationLabel}` : 'Automatic end'
      }`;
    } else {
      secondLine = `${formatTimeShort(new Date(s.end))}  ${OUTCOME_LABEL[outcome]}`;
    }

    return (
      <View key={s.id} style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.startText}>{formatTimeShort(start)}  Started</Text>
          <Text style={styles.detailText}>{secondLine}</Text>
        </View>
        {canEdit && (
          <TouchableOpacity
            accessibilityLabel="Session options"
            style={styles.overflowBtn}
            onPress={() => setOpenMenuId(openMenuId === s.id ? null : s.id)}
          >
            <Text style={styles.overflowText}>⋯</Text>
          </TouchableOpacity>
        )}
        {openMenuId === s.id && (
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {
              setOpenMenuId(null);
              setEditingSession(s);
            }}
          >
            <Text style={styles.menuItemText}>Edit end time</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      <View style={styles.header}>
        <Text style={styles.summaryText}>
          {sessions.length} commitment{sessions.length === 1 ? '' : 's'} · {formatDuration(totalGateMs)} gate time
        </Text>
      </View>

      {sessions.length === 0 ? (
        <Text style={styles.emptyText}>No commitments this day</Text>
      ) : (
        <View style={styles.list}>{sessions.map(renderRow)}</View>
      )}

      <EditEndSheet
        visible={editingSession !== null}
        session={editingSession}
        onCancel={() => setEditingSession(null)}
        onSave={() => {
          setEditingSession(null);
          load();
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
  summaryText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  list: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#1E293B',
  },
  rowText: {
    flex: 1,
  },
  startText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  detailText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  overflowBtn: {
    padding: spacing.xs,
  },
  overflowText: {
    color: colors.textSecondary,
    fontSize: 20,
  },
  menuItem: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.lg,
    backgroundColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  menuItemText: {
    color: colors.action,
    fontSize: 14,
    fontWeight: '600',
  },
});
