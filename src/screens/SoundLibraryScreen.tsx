import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { alert } from '../components/alert';
import { useFocusEffect } from '@react-navigation/native';
import { spacing, useTheme, useThemedStyles, ThemeColors } from '../theme';
import { NeoPopButton, NeoPopCard, SectionLabel } from '../components/neopop';
import ApertureModule from '../native/ApertureModule';
import { MusicLibrary, MusicItem } from '../types';

function formatTrackDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function SoundLibraryScreen() {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [library, setLibrary] = useState<MusicLibrary | null>(null);

  const switchProps = {
    trackColor: { false: colors.border, true: colors.accent },
    thumbColor: isDark ? colors.textPrimary : '#FFFFFF',
  };

  const load = useCallback(async () => {
    try {
      const json = await ApertureModule.getMusicLibrary();
      setLibrary(JSON.parse(json) as MusicLibrary);
    } catch (e) {
      console.error('Failed to load music library', e);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const music = library?.music || [];

  const persistLibraryState = async (next: MusicItem[], shuffleEnabled: boolean) => {
    const enabledStates: { [id: string]: boolean } = {};
    next.forEach(item => { enabledStates[item.id] = item.enabled; });
    await ApertureModule.updateMusicLibrary({ enabledStates, shuffleEnabled });
  };

  const toggleEnabled = async (id: string) => {
    if (!library) return;
    const next = music.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m);
    setLibrary({ ...library, music: next });
    await persistLibraryState(next, library.shuffleEnabled);
  };

  const toggleShuffle = async () => {
    if (!library) return;
    const nextShuffle = !library.shuffleEnabled;
    setLibrary({ ...library, shuffleEnabled: nextShuffle });
    await persistLibraryState(music, nextShuffle);
  };

  const handleAdd = async () => {
    try {
      const json = await ApertureModule.pickAndAddMusic();
      if (json) load();
    } catch (e: any) {
      if (e.code === 'DUPLICATE') {
        alert('Already added', e.message);
      } else {
        alert('Could not add file', e.message || 'Try a different file');
      }
    }
  };

  const handleRemove = (item: MusicItem) => {
    alert('Remove track', `Remove "${item.displayName}" from the gate sound library?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await ApertureModule.removeMusicItem(item.id);
          load();
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: spacing.xl }}>
      <SectionLabel style={styles.sectionTitle}>Playback</SectionLabel>
      <NeoPopCard>
        <View style={styles.shuffleRow}>
          <Text style={styles.rowLabel}>Shuffle queue</Text>
          <Switch
            value={library?.shuffleEnabled ?? true}
            onValueChange={toggleShuffle}
            {...switchProps}
          />
        </View>
      </NeoPopCard>

      <NeoPopButton
        title="Add music"
        variant="primary"
        style={{ marginVertical: spacing.md }}
        onPress={handleAdd}
      />

      {music.length === 0 ? (
        <Text style={styles.emptyText}>No music added. Gate will use a default tone.</Text>
      ) : (
        <>
          <SectionLabel style={styles.sectionTitle}>Tracks</SectionLabel>
          <View style={styles.list}>
            {music.map((item, i) => (
              <View key={item.id} style={[styles.trackRow, i === music.length - 1 && styles.trackRowLast]}>
                <View style={styles.trackInfo}>
                  <Text style={styles.trackName} numberOfLines={1}>{item.displayName}</Text>
                  <Text style={styles.trackMeta}>{formatTrackDuration(item.durationMs)}</Text>
                </View>
                <Switch
                  value={item.enabled}
                  onValueChange={() => toggleEnabled(item.id)}
                  {...switchProps}
                />
                <TouchableOpacity
                  accessibilityLabel={`Remove ${item.displayName}`}
                  style={styles.deleteBtn}
                  onPress={() => handleRemove(item)}
                >
                  <Text style={styles.deleteText}>REMOVE</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
    },
    sectionTitle: {
      marginBottom: spacing.sm,
    },
    shuffleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    rowLabel: {
      color: c.textPrimary,
      fontSize: 15,
      fontWeight: '600',
    },
    emptyText: {
      color: c.textSecondary,
      fontSize: 12,
      textAlign: 'center',
      marginTop: spacing.xl,
    },
    list: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    trackRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    trackRowLast: {
      borderBottomWidth: 0,
    },
    trackInfo: {
      flex: 1,
      marginRight: spacing.sm,
    },
    trackName: {
      color: c.textPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
    trackMeta: {
      color: c.textSecondary,
      fontSize: 12,
    },
    deleteBtn: {
      marginLeft: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderWidth: 1,
      borderColor: c.error,
    },
    deleteText: {
      color: c.error,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
    },
  });
