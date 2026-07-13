import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, radii } from '../theme';
import ApertureModule from '../native/ApertureModule';
import { ActiveSession, CommitmentLog, Session } from '../types';
import { formatDateLong, formatTimeShort, formatDuration, getISODateKey, gateMsForSession, peakHourRangeLabel } from '../utils/formatters';
import DurationPickerSheet from '../components/DurationPickerSheet';
import DailyTimeline from '../components/DailyTimeline';

type ScreenState = 'idle' | 'confirming' | 'waiting' | 'gate_active';

export default function TodayScreen() {
  const [screenState, setScreenState] = useState<ScreenState>('idle');
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  
  // Custom durations (defaults loaded from settings)
  const [waitMinutes, setWaitMinutes] = useState(10);
  const [gateMinutes, setGateMinutes] = useState(15);
  
  // Picker sheet controls
  const [showWaitPicker, setShowWaitPicker] = useState(false);
  const [showGatePicker, setShowGatePicker] = useState(false);

  // Countdown timer
  const [countdownRemaining, setCountdownRemaining] = useState(0);
  
  // Today's stats
  const [todaySessions, setTodaySessions] = useState<Session[]>([]);
  const [totalGateTimeMs, setTotalGateTimeMs] = useState(0);
  
  // Capabilities
  const [canScheduleAlarms, setCanScheduleAlarms] = useState(true);

  // Neutral insight (only shown once enough data exists)
  const [insight, setInsight] = useState<string | null>(null);

  // Load settings & active session
  const checkStatus = useCallback(async () => {
    try {
      const caps = await ApertureModule.getCapabilities();
      setCanScheduleAlarms(caps.canScheduleExactAlarms);

      const settings = await ApertureModule.getSettings();
      setWaitMinutes(settings.defaultWaitingDurationMinutes);
      setGateMinutes(settings.defaultGateDurationMinutes);

      const sessionJson = await ApertureModule.getActiveSession();
      if (sessionJson) {
        const session = JSON.parse(sessionJson) as ActiveSession;
        setActiveSession(session);
        if (session.status === 'waiting_for_gate') {
          setScreenState('waiting');
        } else if (session.status === 'gate_active') {
          setScreenState('gate_active');
        }
      } else {
        setActiveSession(null);
        setScreenState('idle');
      }

      // Load journal for today's stats
      const journalJson = await ApertureModule.getJournal();
      const journal = JSON.parse(journalJson) as CommitmentLog;
      const todayKey = getISODateKey(new Date());
      const dayLog = journal.days?.[todayKey];
      const sessions = dayLog?.sessions || [];
      setTodaySessions(sessions);
      setTotalGateTimeMs(sessions.reduce((sum, s) => sum + gateMsForSession(s), 0));

      // Neutral insight: only once there's enough data across the whole journal
      const daysWithData = Object.keys(journal.days || {}).length;
      if (daysWithData >= 7) {
        const enforced = Object.values(journal.days || {})
          .flatMap(d => d.sessions)
          .filter(s => s.kind !== 'manual' && s.end !== null);
        setInsight(enforced.length > 0 ? peakHourRangeLabel(enforced) : null);
      } else {
        setInsight(null);
      }

    } catch (e: any) {
      console.error('Error fetching today screen status', e);
    }
  }, []);

  // Reload when screen gains focus
  useFocusEffect(
    useCallback(() => {
      checkStatus();
      // Resume check if process was killed and reopened
      ApertureModule.resumeGateIfActive();
    }, [checkStatus])
  );

  // Setup JS-side countdown timer for waiting phase
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (screenState === 'waiting' && activeSession) {
      const updateTimer = () => {
        const start = new Date(activeSession.startedAtIso).getTime();
        const gateStart = start + activeSession.waitingDurationMs;
        const remaining = Math.max(0, Math.floor((gateStart - Date.now()) / 1000));
        setCountdownRemaining(remaining);
        
        if (remaining === 0) {
          // Check if native service launched GateActivity
          clearInterval(timer);
          checkStatus();
        }
      };

      updateTimer();
      timer = setInterval(updateTimer, 1000);
    }
    return () => clearInterval(timer);
  }, [screenState, activeSession, checkStatus]);

  // Actions
  const handleStartRequest = () => {
    setScreenState('confirming');
  };

  const handleConfirmStart = async () => {
    try {
      const sessionJson = await ApertureModule.startSession({
        waitingDurationMinutes: waitMinutes,
        gateDurationMinutes: gateMinutes,
      });
      const session = JSON.parse(sessionJson) as ActiveSession;
      setActiveSession(session);
      setScreenState('waiting');
    } catch (e: any) {
      if (e.code === 'ALARM_FAILED') {
        Alert.alert('Permission Required', 'Aperture requires exact alarm permissions to enforce timers.');
      } else {
        Alert.alert('Error', e.message || 'Failed to start session');
      }
      checkStatus();
    }
  };

  const handleCancelWaiting = async () => {
    Alert.alert(
      'Cancel Commitment',
      'Are you sure you want to cancel this commitment before the gate starts?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await ApertureModule.cancelWaitingSession();
              checkStatus();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to cancel');
            }
          },
        },
      ]
    );
  };

  // Rendering
  const renderIdle = () => {
    return (
      <View style={styles.card}>
        <View style={styles.pickerRow}>
          <TouchableOpacity onPress={() => setShowWaitPicker(true)} style={styles.pickerSelector}>
            <Text style={styles.pickerLabel}>Waiting period</Text>
            <Text style={styles.pickerValue}>{waitMinutes} min</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setShowGatePicker(true)} style={styles.pickerSelector}>
            <Text style={styles.pickerLabel}>Gate duration</Text>
            <Text style={styles.pickerValue}>{gateMinutes} min</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.btnAction} onPress={handleStartRequest}>
          <Text style={styles.btnActionText}>Start commitment</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderConfirming = () => {
    const gateStart = new Date(Date.now() + waitMinutes * 60000);
    const gateEnd = new Date(gateStart.getTime() + gateMinutes * 60000);

    return (
      <View style={[styles.card, styles.cardConfirm]}>
        <Text style={styles.confirmTitle}>Commitment Terms</Text>
        
        <View style={styles.termsRow}>
          <View>
            <Text style={styles.termsLabel}>Gate begins</Text>
            <Text style={styles.termsValue}>{formatTimeShort(gateStart)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.termsLabel}>Automatic end</Text>
            <Text style={styles.termsValue}>{formatTimeShort(gateEnd)}</Text>
          </View>
        </View>

        <Text style={styles.confirmText}>
          The gate starts in {waitMinutes} minutes. It will play randomized music and display arithmetic equations. It ends automatically after {gateMinutes} minutes or when solved.
        </Text>

        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.btnConfirm, styles.btnConfirmCancel]}
            onPress={() => setScreenState('idle')}
          >
            <Text style={styles.btnConfirmCancelText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btnConfirm, styles.btnConfirmStart]}
            onPress={handleConfirmStart}
          >
            <Text style={styles.btnConfirmStartText}>Start</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderWaiting = () => {
    if (!activeSession) return null;
    const start = new Date(activeSession.startedAtIso).getTime();
    const gateStart = new Date(start + activeSession.waitingDurationMs);
    const gateEnd = new Date(gateStart.getTime() + activeSession.gateDurationMs);

    const m = Math.floor(countdownRemaining / 60);
    const s = countdownRemaining % 60;
    const countdownStr = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');

    // ponytail: JS-side countdown from wall clock. Ceiling: wall clock change desyncs display. Upgrade: bridge elapsedRealtime
    return (
      <View style={[styles.card, styles.cardWaiting]}>
        <Text style={styles.waitingTitle}>WAITING FOR GATE</Text>
        <Text style={styles.waitingCountdown}>{countdownStr}</Text>

        <View style={styles.termsRow}>
          <View>
            <Text style={styles.termsLabel}>Gate starts</Text>
            <Text style={styles.termsValue}>{formatTimeShort(gateStart)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.termsLabel}>Gate ends</Text>
            <Text style={styles.termsValue}>{formatTimeShort(gateEnd)}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.btnCancel} onPress={handleCancelWaiting}>
          <Text style={styles.btnCancelText}>Cancel commitment</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderGateActive = () => {
    return (
      <View style={[styles.card, styles.cardActive]}>
        <Text style={styles.activeTitle}>RELEASE GATE IS ACTIVE</Text>
        <Text style={styles.activeText}>
          Solve the arithmetic equations to release the gate. Local music is playing.
        </Text>
        <TouchableOpacity style={styles.btnAction} onPress={() => ApertureModule.resumeGateIfActive()}>
          <Text style={styles.btnActionText}>Open gate screen</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      {/* Exact Alarm Permission Banner */}
      {!canScheduleAlarms && (
        <View style={styles.bannerAlert}>
          <Text style={styles.bannerAlertText}>
            Aperture needs exact alarm permission for reliable gate timing.
          </Text>
          <TouchableOpacity
            style={styles.bannerAlertBtn}
            onPress={() => ApertureModule.openExactAlarmSettings()}
          >
            <Text style={styles.bannerAlertBtnText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Date Header */}
      <View style={styles.header}>
        <Text style={styles.dateText}>{formatDateLong(new Date())}</Text>
      </View>

      {/* Dynamic State Machine Card */}
      {screenState === 'idle' && renderIdle()}
      {screenState === 'confirming' && renderConfirming()}
      {screenState === 'waiting' && renderWaiting()}
      {screenState === 'gate_active' && renderGateActive()}

      {/* Daily Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Today</Text>
        <View style={styles.summaryStats}>
          <View>
            <Text style={styles.statVal}>{todaySessions.length}</Text>
            <Text style={styles.statLabel}>commitments</Text>
          </View>
          <View style={styles.statSeparator} />
          <View>
            <Text style={styles.statVal}>{formatDuration(totalGateTimeMs)}</Text>
            <Text style={styles.statLabel}>gate time</Text>
          </View>
        </View>
      </View>

      {/* Daily Timeline */}
      <DailyTimeline sessions={todaySessions} />

      {/* Neutral insight */}
      {insight && <Text style={styles.insightText}>{insight}</Text>}

      {/* Duration Picker Modals */}
      <DurationPickerSheet
        visible={showWaitPicker}
        title="Select Waiting Duration"
        initialValue={waitMinutes}
        onCancel={() => setShowWaitPicker(false)}
        onConfirm={(val) => {
          setWaitMinutes(val);
          setShowWaitPicker(false);
          ApertureModule.updateSettings({ defaultWaitingDurationMinutes: val });
        }}
      />

      <DurationPickerSheet
        visible={showGatePicker}
        title="Select Gate Duration"
        initialValue={gateMinutes}
        onCancel={() => setShowGatePicker(false)}
        onConfirm={(val) => {
          setGateMinutes(val);
          setShowGatePicker(false);
          ApertureModule.updateSettings({ defaultGateDurationMinutes: val });
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
  dateText: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: 'bold',
  },
  bannerAlert: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderRadius: radii.card,
    padding: spacing.md,
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerAlertText: {
    color: '#EF4444',
    fontSize: 12,
    flex: 1,
    marginRight: spacing.sm,
  },
  bannerAlertBtn: {
    backgroundColor: '#EF4444',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 8,
  },
  bannerAlertBtnText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: radii.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  cardConfirm: {
    borderColor: colors.action,
  },
  cardWaiting: {
    borderColor: colors.action,
    alignItems: 'center',
  },
  cardActive: {
    borderColor: '#EF4444',
  },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  pickerSelector: {
    flex: 1,
    padding: spacing.sm,
  },
  pickerLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
  pickerValue: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  btnAction: {
    backgroundColor: colors.action,
    borderRadius: radii.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  btnActionText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
  },
  confirmTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: spacing.md,
  },
  termsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    width: '100%',
  },
  termsLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 2,
  },
  termsValue: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: 'bold',
  },
  confirmText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  btnRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  btnConfirm: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.button,
    alignItems: 'center',
  },
  btnConfirmCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnConfirmCancelText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  btnConfirmStart: {
    backgroundColor: colors.action,
  },
  btnConfirmStartText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: 'bold',
  },
  waitingTitle: {
    color: colors.action,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  waitingCountdown: {
    color: colors.textPrimary,
    fontSize: 48,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    marginVertical: spacing.md,
  },
  btnCancel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
    width: '100%',
    marginTop: spacing.md,
  },
  btnCancelText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  activeTitle: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  activeText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
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
  insightText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
