import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Switch, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, radii } from '../theme';
import ApertureModule from '../native/ApertureModule';
import { MusicLibrary, MusicItem } from '../types';

function formatTrackDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function SoundLibraryScreen() {
  const [library, setLibrary] = useState<MusicLibrary | null>(null);

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
      Alert.alert('Could not add file', e.message || 'Try a different file');
    }
  };

  const handleRemove = (item: MusicItem) => {
    Alert.alert('Remove track', `Remove "${item.displayName}" from the gate sound library?`, [
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
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Shuffle queue</Text>
        <Switch
          value={library?.shuffleEnabled ?? true}
          onValueChange={toggleShuffle}
          trackColor={{ true: colors.action, false: colors.border }}
        />
      </View>

      <TouchableOpacity style={styles.btnAdd} onPress={handleAdd}>
        <Text style={styles.btnAddText}>+ Add music</Text>
      </TouchableOpacity>

      {music.length === 0 ? (
        <Text style={styles.emptyText}>No music added. Gate will use a default tone.</Text>
      ) : (
        <View style={styles.list}>
          {music.map(item => (
            <View key={item.id} style={styles.trackRow}>
              <View style={styles.trackInfo}>
                <Text style={styles.trackName} numberOfLines={1}>{item.displayName}</Text>
                <Text style={styles.trackMeta}>{formatTrackDuration(item.durationMs)}</Text>
              </View>
              <Switch
                value={item.enabled}
                onValueChange={() => toggleEnabled(item.id)}
                trackColor={{ true: colors.action, false: colors.border }}
              />
              <TouchableOpacity
                accessibilityLabel={`Remove ${item.displayName}`}
                style={styles.deleteBtn}
                onPress={() => handleRemove(item)}
              >
                <Text style={styles.deleteText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: {
    color: colors.textPrimary,
    fontSize: 16,
  },
  btnAdd: {
    borderWidth: 1,
    borderColor: colors.action,
    borderRadius: radii.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  btnAddText: {
    color: colors.action,
    fontSize: 16,
    fontWeight: '600',
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
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#1E293B',
  },
  trackInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  trackName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  trackMeta: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  deleteBtn: {
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  deleteText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
});
