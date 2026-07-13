import React, { useState, useEffect } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, Pressable, Alert } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { colors, spacing } from '../theme';
import { Session } from '../types';
import ApertureModule from '../native/ApertureModule';

interface EditEndSheetProps {
  visible: boolean;
  session: Session | null;
  onCancel: () => void;
  onSave: () => void;
}

export default function EditEndSheet({ visible, session, onCancel, onSave }: EditEndSheetProps) {
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

  const onTimeChange = (event: DateTimePickerEvent, selectedTime?: Date) => {
    setShowPicker(false);
    if (selectedTime) {
      setEndTime(selectedTime);
      setErrorMsg(null);
    }
  };

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
        Alert.alert(
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
      <Pressable style={styles.overlay} onPress={onCancel}>
        <View style={styles.sheetContainer} onStartShouldSetResponder={() => true}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onCancel} style={styles.btnHeader}>
              <Text style={styles.btnCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Edit End Time</Text>
            <TouchableOpacity onPress={() => handleSave(false)} style={styles.btnHeader}>
              <Text style={styles.btnSaveText}>Save</Text>
            </TouchableOpacity>
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
              <TouchableOpacity onPress={() => setShowPicker(true)} style={styles.rowValue}>
                <Text style={styles.valueText}>{formatTimeString(endTime)}</Text>
              </TouchableOpacity>
            </View>

            {showPicker && (
              <DateTimePicker
                value={endTime}
                mode="time"
                is24Hour={false}
                display="default"
                onChange={onTimeChange}
              />
            )}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  btnHeader: {
    padding: spacing.sm,
  },
  btnCancelText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  btnSaveText: {
    color: colors.action,
    fontSize: 16,
    fontWeight: 'bold',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  form: {
    padding: spacing.md,
  },
  infoText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: spacing.xs,
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
  rowValue: {
    backgroundColor: '#1E293B',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  valueText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: spacing.sm,
    borderRadius: 8,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    textAlign: 'center',
  },
});
