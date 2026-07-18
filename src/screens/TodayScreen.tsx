import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, AppState } from 'react-native';
import { alert } from '../components/alert';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, useTheme, useThemedStyles, ThemeColors } from '../theme';
import { NeoPopButton, NeoPopCard, SectionLabel, GridBackground } from '../components/neopop';
import ApertureModule from '../native/ApertureModule';
import { ActiveSession, CommitmentLog, Session } from '../types';
import { formatDateLong, formatTimeShort, formatDuration, getISODateKey, gateMsForSession, peakHourRangeLabel } from '../utils/formatters';
import DurationPickerSheet from '../components/DurationPickerSheet';
import DailyTimeline from '../components/DailyTimeline';

type ScreenState = 'idle' | 'confirming' | 'waiting' | 'gate_active';

// Isolated so the per-second tick only re-renders this Text, not the screen.
function CountdownText({ targetMs, style }: { targetMs: number; style: object }) {
  const secondsLeft = () => Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
  const [remaining, setRemaining] = useState(secondsLeft);

  useEffect(() => {
    const timer = setInterval(() => {
      const r = secondsLeft();
      setRemaining(r);
      if (r === 0) clearInterval(timer); // App.tsx handles the transition to GateScreen
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMs]);

  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return (
    <Text style={style}>
      {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </Text>
  );
}

export default function TodayScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [screenState, setScreenState] = useState<ScreenState>('idle');
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);

  // Custom durations (defaults loaded from settings)
  const [waitMinutes, setWaitMinutes] = useState(10);
  const [gateMinutes, setGateMinutes] = useState(15);

  // Picker sheet controls
  const [showWaitPicker, setShowWaitPicker] = useState(false);
  const [showGatePicker, setShowGatePicker] = useState(false);

  // Today's stats
  const [todaySessions, setTodaySessions] = useState<Session[]>([]);
  const [totalGateTimeMs, setTotalGateTimeMs] = useState(0);

  // Capabilities
  const [canScheduleAlarms, setCanScheduleAlarms] = useState(true);
  const [accessibilityEnabled, setAccessibilityEnabled] = useState(true);
  const [usageAccessGranted, setUsageAccessGranted] = useState(true);
  const [isIgnoringBattery, setIsIgnoringBattery] = useState(true);
  const [canDrawOverlays, setCanDrawOverlays] = useState(true);

  // Neutral insight (only shown once enough data exists)
  const [insight, setInsight] = useState<string | null>(null);

  // Load settings & active session
  const checkStatus = useCallback(async () => {
    try {
      const caps = await ApertureModule.getCapabilities();
      setCanScheduleAlarms(caps.canScheduleExactAlarms);
      setAccessibilityEnabled(caps.accessibilityServiceEnabled);
      setUsageAccessGranted(caps.usageAccessGranted);
      setIsIgnoringBattery(caps.isIgnoringBatteryOptimizations);
      setCanDrawOverlays(caps.canDrawOverlays);

      const settings = await ApertureModule.getSettings();
      setWaitMinutes(settings.defaultWaitingDurationMinutes);
      setGateMinutes(settings.defaultGateDurationMinutes);

      const sessionJson = await ApertureModule.getActiveSession();
      console.log('Active session response:', sessionJson);
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

  // Refresh when app comes to foreground (M2-20: refresh state after returning from GateActivity)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        checkStatus();
      }
    });
    return () => subscription.remove();
  }, [checkStatus]);

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
        alert('Permission Required', 'Aperture requires exact alarm permissions to enforce timers.');
      } else {
        alert('Error', e.message || 'Failed to start session');
      }
      checkStatus();
    }
  };

  const handleCancelWaiting = async () => {
    alert(
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
              alert('Error', e.message || 'Failed to cancel');
            }
          },
        },
      ]
    );
  };

  // Rendering
  const renderIdle = () => {
    return (
      <NeoPopCard style={styles.stateCard}>
        <SectionLabel style={{ marginBottom: spacing.md }}>New commitment</SectionLabel>
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

        <NeoPopButton title="Start commitment" arrow onPress={handleStartRequest} />
      </NeoPopCard>
    );
  };

  const renderConfirming = () => {
    const gateStart = new Date(Date.now() + waitMinutes * 60000);
    const gateEnd = new Date(gateStart.getTime() + gateMinutes * 60000);

    return (
      <NeoPopCard style={[styles.stateCard, styles.cardConfirm]}>
        <SectionLabel color={colors.textPrimary} style={{ marginBottom: spacing.md }}>
          Commitment terms
        </SectionLabel>

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
          <NeoPopButton
            title="Cancel"
            variant="flat"
            style={{ flex: 1 }}
            onPress={() => setScreenState('idle')}
          />
          <NeoPopButton
            title="Start"
            arrow
            style={{ flex: 1 }}
            onPress={handleConfirmStart}
          />
        </View>
      </NeoPopCard>
    );
  };

  const renderWaiting = () => {
    if (!activeSession) return null;
    const start = new Date(activeSession.startedAtIso).getTime();
    const gateStart = new Date(start + activeSession.waitingDurationMs);
    const gateEnd = new Date(gateStart.getTime() + activeSession.gateDurationMs);

    // ponytail: JS-side countdown from wall clock. Ceiling: wall clock change desyncs display. Upgrade: bridge elapsedRealtime
    return (
      <NeoPopCard style={[styles.stateCard, styles.cardWaiting]}>
        <SectionLabel color={colors.accent}>Waiting for gate</SectionLabel>
        <CountdownText targetMs={gateStart.getTime()} style={styles.waitingCountdown} />

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

        <NeoPopButton
          title="Cancel commitment"
          variant="flat"
          style={{ width: '100%', marginTop: spacing.md }}
          onPress={handleCancelWaiting}
        />
      </NeoPopCard>
    );
  };

  const renderGateActive = () => {
    return (
      <NeoPopCard style={[styles.stateCard, styles.cardActive]}>
        <SectionLabel color={colors.error}>Release gate is active</SectionLabel>
        <Text style={styles.activeText}>
          Solve the arithmetic equations to release the gate. Local music is playing.
        </Text>
        <NeoPopButton title="Open gate screen" arrow onPress={() => ApertureModule.resumeGateIfActive()} />
      </NeoPopCard>
    );
  };

  const permissionBanners: Array<{ visible: boolean; text: string; cta: string; onPress: () => void }> = [
    {
      visible: !canScheduleAlarms,
      text: 'Aperture needs exact alarm permission for reliable gate timing.',
      cta: 'Open Settings',
      onPress: () => ApertureModule.openExactAlarmSettings(),
    },
    {
      visible: !accessibilityEnabled,
      text: 'Accessibility Service is required to enforce the lockout and prevent app switching.',
      cta: 'Enable Service',
      onPress: () => ApertureModule.openAccessibilitySettings(),
    },
    {
      visible: !usageAccessGranted,
      text: 'Usage Access allows Aperture to detect when other apps are opened during a gate.',
      cta: 'Grant Access',
      onPress: () => ApertureModule.openUsageAccessSettings(),
    },
    {
      visible: !isIgnoringBattery,
      text: 'Disable battery optimization to prevent the system from killing Aperture in the background.',
      cta: 'Disable',
      onPress: () => ApertureModule.requestIgnoreBatteryOptimizations(),
    },
    {
      visible: !canDrawOverlays,
      text: 'Overlay permission is required to launch the gate screen over other apps.',
      cta: 'Grant Access',
      onPress: () => ApertureModule.openOverlaySettings(),
    },
  ];

  return (
    <View style={styles.root}>
      <GridBackground />
      <ScrollView
        style={[styles.container, { paddingTop: insets.top }]}
        contentContainerStyle={{ paddingBottom: spacing.xl + insets.bottom }}
      >
      {permissionBanners.filter(b => b.visible).map((b, i) => (
        <View key={i} style={styles.bannerAlert}>
          <Text style={styles.bannerAlertText}>{b.text}</Text>
          <TouchableOpacity style={styles.bannerAlertBtn} onPress={b.onPress}>
            <Text style={styles.bannerAlertBtnText}>{b.cta.toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* Date Header */}
      <View style={styles.header}>
        <SectionLabel>Today</SectionLabel>
        <Text style={styles.dateText}>{formatDateLong(new Date())}</Text>
      </View>

      {/* Dynamic State Machine Card */}
      {screenState === 'idle' && renderIdle()}
      {screenState === 'confirming' && renderConfirming()}
      {screenState === 'waiting' && renderWaiting()}
      {screenState === 'gate_active' && renderGateActive()}

      {/* Daily Summary */}
      <NeoPopCard style={styles.summaryCard}>
        <SectionLabel style={{ marginBottom: spacing.md }}>Summary</SectionLabel>
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
      </NeoPopCard>

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
    dateText: {
      color: c.textPrimary,
      fontSize: 26,
      fontWeight: '900',
      letterSpacing: -0.5,
    },
    bannerAlert: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.error,
      borderLeftWidth: 4,
      padding: spacing.md,
      marginTop: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    bannerAlertText: {
      color: c.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      flex: 1,
      marginRight: spacing.sm,
    },
    bannerAlertBtn: {
      backgroundColor: c.error,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
    },
    bannerAlertBtnText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
    },
    stateCard: {
      marginBottom: spacing.md,
    },
    cardConfirm: {
      borderColor: c.textPrimary,
    },
    cardWaiting: {
      borderColor: c.accent,
      alignItems: 'center',
    },
    cardActive: {
      borderColor: c.error,
    },
    pickerRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    pickerSelector: {
      flex: 1,
      padding: spacing.sm,
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: c.border,
    },
    pickerLabel: {
      color: c.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    pickerValue: {
      color: c.textPrimary,
      fontSize: 20,
      fontWeight: '900',
    },
    termsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
      width: '100%',
    },
    termsLabel: {
      color: c.textSecondary,
      fontSize: 12,
      marginBottom: 2,
    },
    termsValue: {
      color: c.textPrimary,
      fontSize: 20,
      fontWeight: '900',
    },
    confirmText: {
      color: c.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: spacing.md,
    },
    btnRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    waitingCountdown: {
      color: c.textPrimary,
      fontSize: 56,
      fontWeight: '900',
      fontFamily: 'monospace',
      marginVertical: spacing.md,
    },
    activeText: {
      color: c.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginVertical: spacing.md,
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
    insightText: {
      color: c.textSecondary,
      fontSize: 13,
      textAlign: 'center',
      marginTop: spacing.md,
    },
  });
