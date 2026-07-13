import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Switch, Alert, Share } from 'react-native';
import { useFocusEffect, useNavigation, NavigationProp } from '@react-navigation/native';
import { colors, spacing, radii } from '../theme';
import ApertureModule from '../native/ApertureModule';
import { SettingsStackParamList, Diagnostics } from '../types';
import DurationPickerSheet from '../components/DurationPickerSheet';

const DIFFICULTIES = ['light', 'standard', 'hard'] as const;

export default function SettingsScreen() {
  const navigation = useNavigation<NavigationProp<SettingsStackParamList>>();

  const [waitMinutes, setWaitMinutes] = useState(10);
  const [gateMinutes, setGateMinutes] = useState(15);
  const [showWaitPicker, setShowWaitPicker] = useState(false);
  const [showGatePicker, setShowGatePicker] = useState(false);

  const [difficulty, setDifficulty] = useState<string>('standard');
  const [pinningAck, setPinningAck] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);

  const load = useCallback(async () => {
    try {
      const settings = await ApertureModule.getSettings();
      setWaitMinutes(settings.defaultWaitingDurationMinutes);
      setGateMinutes(settings.defaultGateDurationMinutes);
      setDifficulty(settings.difficulty);
      setPinningAck(settings.screenPinningInstructionsSeen);
      setDiagnostics(await ApertureModule.getDiagnostics());
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleExport = async () => {
    try {
      const json = await ApertureModule.exportJournal();
      await Share.share({ message: json });
    } catch (e: any) {
      Alert.alert('Export failed', e.message || 'Could not export journal');
    }
  };

  const handleClearAll = () => {
    Alert.alert(
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
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      {/* Session defaults */}
      <Text style={styles.sectionTitle}>Session defaults</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.row} onPress={() => setShowWaitPicker(true)}>
          <Text style={styles.rowLabel}>Waiting duration</Text>
          <Text style={styles.rowValue}>{waitMinutes} min</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={() => setShowGatePicker(true)}>
          <Text style={styles.rowLabel}>Gate duration</Text>
          <Text style={styles.rowValue}>{gateMinutes} min</Text>
        </TouchableOpacity>
      </View>

      {/* Challenge difficulty */}
      <Text style={styles.sectionTitle}>Challenge difficulty</Text>
      <View style={styles.card}>
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
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Screen Pinning */}
      <Text style={styles.sectionTitle}>Screen Pinning</Text>
      <View style={styles.card}>
        <Text style={styles.bodyText}>
          Enable App Pinning in Android Settings, and the option that requires your PIN, pattern, or
          password before unpinning. On Samsung: Settings → Security and privacy → Other security
          settings → Pin app. Aperture cannot verify this setting is on — it can only offer to request
          pinning when the gate begins.
        </Text>
        <View style={[styles.row, styles.rowLast]}>
          <Text style={styles.rowLabel}>I've enabled App Pinning</Text>
          <Switch
            value={pinningAck}
            onValueChange={(val) => {
              setPinningAck(val);
              ApertureModule.updateSettings({ screenPinningInstructionsSeen: val });
            }}
            trackColor={{ true: colors.action, false: colors.border }}
          />
        </View>
      </View>

      {/* Gate Sound Library */}
      <Text style={styles.sectionTitle}>Gate Sound Library</Text>
      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('SoundLibrary')}>
        <View style={[styles.row, styles.rowLast]}>
          <Text style={styles.rowLabel}>Manage local music</Text>
          <Text style={styles.rowChevron}>›</Text>
        </View>
      </TouchableOpacity>

      {/* Data */}
      <Text style={styles.sectionTitle}>Data</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.row} onPress={handleExport}>
          <Text style={styles.rowLabel}>Export journal (JSON)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={handleClearAll}>
          <Text style={[styles.rowLabel, { color: '#EF4444' }]}>Clear all data</Text>
        </TouchableOpacity>
      </View>

      {/* Privacy */}
      <Text style={styles.sectionTitle}>Privacy</Text>
      <View style={styles.card}>
        <Text style={[styles.bodyText, styles.rowLast]}>
          All data stays on this device. Aperture makes no network calls, has no account, and no
          cloud sync.
        </Text>
      </View>

      {/* Diagnostics */}
      <Text style={styles.sectionTitle}>Diagnostics</Text>
      <View style={styles.card}>
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
          <Text style={styles.rowValue}>{diagnostics?.exactAlarmPermission ? 'Granted' : 'Denied'}</Text>
        </View>
      </View>

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
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    color: colors.textPrimary,
    fontSize: 15,
  },
  rowValue: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  rowChevron: {
    color: colors.textSecondary,
    fontSize: 20,
  },
  bodyText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  difficultyPill: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  difficultyPillActive: {
    backgroundColor: colors.action,
    borderColor: colors.action,
  },
  difficultyText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  difficultyTextActive: {
    color: '#F8FAFC',
  },
});
