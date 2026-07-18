import React, { useCallback, useState } from 'react';
import { Appearance, StyleSheet, Text, View, TouchableOpacity, ScrollView, Share } from 'react-native';
import { alert } from '../components/alert';
import { useFocusEffect, useNavigation, NavigationProp } from '@react-navigation/native';
import { spacing, useTheme, useThemedStyles, ThemeColors } from '../theme';
import { NeoPopButton, NeoPopCard, SectionLabel, GridBackground } from '../components/neopop';
import { ChevronRightIcon } from '../components/icons';
import ApertureModule from '../native/ApertureModule';
import { SettingsStackParamList, Diagnostics } from '../types';
import DurationPickerSheet from '../components/DurationPickerSheet';

const DIFFICULTIES = ['light', 'standard', 'hard'] as const;
const THEME_MODES = ['light', 'dark', 'system'] as const;
type ThemeMode = (typeof THEME_MODES)[number];

export default function SettingsScreen() {
  const navigation = useNavigation<NavigationProp<SettingsStackParamList>>();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [waitMinutes, setWaitMinutes] = useState(10);
  const [gateMinutes, setGateMinutes] = useState(15);
  const [showWaitPicker, setShowWaitPicker] = useState(false);
  const [showGatePicker, setShowGatePicker] = useState(false);

  const [difficulty, setDifficulty] = useState<string>('standard');
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);

  const load = useCallback(async () => {
    try {
      const settings = await ApertureModule.getSettings();
      setWaitMinutes(settings.defaultWaitingDurationMinutes);
      setGateMinutes(settings.defaultGateDurationMinutes);
      setDifficulty(settings.difficulty);
      setThemeMode(settings.themeMode ?? 'system');
      setDiagnostics(await ApertureModule.getDiagnostics());
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  }, []);

  const handleThemeMode = (mode: ThemeMode) => {
    setThemeMode(mode);
    Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
    ApertureModule.updateSettings({ themeMode: mode });
  };

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleExport = async () => {
    try {
      const json = await ApertureModule.exportJournal();
      await Share.share({ message: json });
    } catch (e: any) {
      alert('Export failed', e.message || 'Could not export journal');
    }
  };

  const handleClearAll = () => {
    alert(
      'Clear all data',
      'This permanently deletes your journal, active session, and music library. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear everything',
          style: 'destructive',
          onPress: async () => {
            await ApertureModule.clearAllData();
            load();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.root}>
      <GridBackground />
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      {/* Appearance */}
      <SectionLabel style={styles.sectionTitle}>Appearance</SectionLabel>
      <NeoPopCard style={styles.card}>
        <View style={[styles.row, styles.rowLast, { paddingVertical: spacing.sm }]}>
          {THEME_MODES.map(mode => (
            <TouchableOpacity
              key={mode}
              accessibilityLabel={`Use ${mode} theme`}
              style={[styles.difficultyPill, themeMode === mode && styles.difficultyPillActive]}
              onPress={() => handleThemeMode(mode)}
            >
              <Text style={[styles.difficultyText, themeMode === mode && styles.difficultyTextActive]}>
                {mode.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </NeoPopCard>

      {/* Session defaults */}
      <SectionLabel style={styles.sectionTitle}>Session defaults</SectionLabel>
      <NeoPopCard style={styles.card}>
        <TouchableOpacity style={styles.row} onPress={() => setShowWaitPicker(true)}>
          <Text style={styles.rowLabel}>Waiting duration</Text>
          <Text style={styles.rowValue}>{waitMinutes} min</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={() => setShowGatePicker(true)}>
          <Text style={styles.rowLabel}>Gate duration</Text>
          <Text style={styles.rowValue}>{gateMinutes} min</Text>
        </TouchableOpacity>
      </NeoPopCard>

      {/* Challenge difficulty */}
      <SectionLabel style={styles.sectionTitle}>Challenge difficulty</SectionLabel>
      <NeoPopCard style={styles.card}>
        <View style={[styles.row, styles.rowLast, { paddingVertical: spacing.sm }]}>
          {DIFFICULTIES.map(d => (
            <TouchableOpacity
              key={d}
              style={[styles.difficultyPill, difficulty === d && styles.difficultyPillActive]}
              onPress={() => {
                setDifficulty(d);
                ApertureModule.updateSettings({ difficulty: d });
              }}
            >
              <Text style={[styles.difficultyText, difficulty === d && styles.difficultyTextActive]}>
                {d.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </NeoPopCard>

      {/* Gate Sound Library */}
      <SectionLabel style={styles.sectionTitle}>Gate sound library</SectionLabel>
      <TouchableOpacity onPress={() => navigation.navigate('SoundLibrary')}>
        <NeoPopCard style={styles.card}>
          <View style={[styles.row, styles.rowLast]}>
            <Text style={styles.rowLabel}>Manage local music</Text>
            <ChevronRightIcon size={16} color={colors.textMuted} />
          </View>
        </NeoPopCard>
      </TouchableOpacity>

      {/* Data */}
      <SectionLabel style={styles.sectionTitle}>Data</SectionLabel>
      <NeoPopCard style={styles.card}>
        <NeoPopButton title="Export journal (JSON)" variant="flat" onPress={handleExport} />
        <NeoPopButton
          title="Clear all data"
          variant="danger"
          style={{ marginTop: spacing.sm }}
          onPress={handleClearAll}
        />
      </NeoPopCard>

      {/* Privacy */}
      <SectionLabel style={styles.sectionTitle}>Privacy</SectionLabel>
      <NeoPopCard style={styles.card}>
        <Text style={styles.bodyText}>
          All data stays on this device. Aperture makes no network calls, has no account, and no
          cloud sync.
        </Text>
      </NeoPopCard>

      {/* Diagnostics */}
      <SectionLabel style={styles.sectionTitle}>Diagnostics</SectionLabel>
      <NeoPopCard style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Version</Text>
          <Text style={styles.rowValue}>{diagnostics?.version ?? '—'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Active session</Text>
          <Text style={styles.rowValue}>{diagnostics?.activeSessionExists ? 'Yes' : 'None'}</Text>
        </View>
        <View style={[styles.row, styles.rowLast]}>
          <Text style={styles.rowLabel}>Exact alarm permission</Text>
          <View style={[styles.badge, diagnostics?.exactAlarmPermission ? styles.badgeOn : styles.badgeOff]}>
            <Text style={diagnostics?.exactAlarmPermission ? styles.badgeTextOn : styles.badgeTextOff}>
              {diagnostics?.exactAlarmPermission ? 'GRANTED' : 'DENIED'}
            </Text>
          </View>
        </View>
      </NeoPopCard>

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
    sectionTitle: {
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    card: {
      paddingVertical: spacing.xs,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm + 2,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    rowLabel: {
      color: c.textPrimary,
      fontSize: 15,
      fontWeight: '600',
    },
    rowValue: {
      color: c.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    bodyText: {
      color: c.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      paddingVertical: spacing.sm,
    },
    difficultyPill: {
      flex: 1,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      marginHorizontal: 2,
      borderWidth: 1,
      borderColor: c.border,
    },
    difficultyPillActive: {
      backgroundColor: c.accent,
      borderColor: c.accent,
    },
    difficultyText: {
      color: c.textSecondary,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.5,
    },
    difficultyTextActive: {
      color: '#0D0D0D',
    },
    badge: {
      borderWidth: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    badgeOn: {
      borderColor: c.accent,
    },
    badgeOff: {
      borderColor: c.error,
    },
    badgeTextOn: {
      color: c.accent,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
    },
    badgeTextOff: {
      color: c.error,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
    },
  });
