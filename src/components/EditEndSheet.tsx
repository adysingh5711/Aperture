import React, { useState, useEffect } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, Pressable } from 'react-native';
import { alert } from './alert';
import { spacing, useThemedStyles, ThemeColors } from '../theme';
import { WheelTimePicker } from './wheel';
import { NeoPopButton } from './neopop';
import { Session } from '../types';
import ApertureModule from '../native/ApertureModule';

interface EditEndSheetProps {
  visible: boolean;
  session: Session | null;
  onCancel: () => void;
  onSave: () => void;
}

export default function EditEndSheet({ visible, session, onCancel, onSave }: EditEndSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const [endTime, setEndTime] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (visible && session && session.end) {
      setEndTime(new Date(session.end));
      setErrorMsg(null);
    }
  }, [visible, session]);

  if (!session) return null;

  const handleSave = async (force: boolean = false) => {
    const start = new Date(session.start);
    const newEnd = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
      endTime.getHours(),
      endTime.getMinutes()
    );

    if (newEnd.getTime() <= start.getTime()) {
      setErrorMsg('End time must be after start time');
      return;
    }

    // Check contractual end constraints if enforced
    if (session.kind !== 'manual' && session.waitingDurationMs !== null && session.gateDurationMs !== null) {
      const wait = session.waitingDurationMs;
      const gate = session.gateDurationMs;
      const contractEnd = new Date(start.getTime() + wait + gate);

      if (newEnd.getTime() > contractEnd.getTime() && !force) {
        // Exceeds contractual end. Show warning alert.
        alert(
          'Out of Bounds',
          'The selected end time is past the contractual end of this session. Do you want to force save this correction?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Force Save', style: 'destructive', onPress: () => handleSave(true) },
          ]
        );
        return;
      }
    }

    try {
      await ApertureModule.updateCompletedEnd({
        sessionId: session.id,
        newEnd: newEnd.toISOString(),
        force,
      });
      onSave();
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to update end time');
    }
  };

  const formatTimeString = (t: Date) => {
    return t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Edit End Time</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {errorMsg && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            )}

            <Text style={styles.infoText}>
              Original start: {new Date(session.start).toLocaleTimeString()}
            </Text>
            {session.end && (
              <Text style={[styles.infoText, { marginBottom: spacing.md }]}>
                Current end: {new Date(session.end).toLocaleTimeString()}
              </Text>
            )}

            {/* End Time Select */}
            <View style={styles.row}>
              <Text style={styles.rowLabel}>New End Time</Text>
              <TouchableOpacity
                onPress={() => setShowPicker(p => !p)}
                style={[styles.rowValue, showPicker && styles.rowValueActive]}
              >
                <Text style={styles.valueText}>{formatTimeString(endTime)}</Text>
              </TouchableOpacity>
            </View>

            {showPicker && (
              <WheelTimePicker
                value={endTime}
                onChange={d => {
                  setEndTime(d);
                  setErrorMsg(null);
                }}
              />
            )}

            {/* Actions */}
            <View style={styles.btnRow}>
              <NeoPopButton title="Cancel" variant="flat" style={{ flex: 1 }} onPress={onCancel} />
              <NeoPopButton title="Save" arrow style={{ flex: 1 }} onPress={() => handleSave(false)} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      justifyContent: 'flex-end',
    },
    sheetContainer: {
      backgroundColor: c.surface,
      borderRadius: 0,
      paddingBottom: spacing.xl,
      borderTopWidth: 1,
      borderColor: c.border,
    },
    header: {
      padding: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    title: {
      color: c.textPrimary,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    form: {
      padding: spacing.md,
    },
    infoText: {
      color: c.textSecondary,
      fontSize: 13,
      marginBottom: spacing.xs,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    rowLabel: {
      color: c.textSecondary,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    rowValue: {
      backgroundColor: c.surfaceAlt,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: 0,
      borderWidth: 1,
      borderColor: c.border,
    },
    rowValueActive: {
      borderColor: c.accent,
    },
    valueText: {
      color: c.textPrimary,
      fontSize: 14,
      fontWeight: '800',
    },
    errorContainer: {
      backgroundColor: c.surfaceAlt,
      padding: spacing.sm,
      borderRadius: 0,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: c.error,
      borderLeftWidth: 4,
    },
    errorText: {
      color: c.error,
      fontSize: 13,
      fontWeight: '700',
      textAlign: 'center',
    },
    btnRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
  });
