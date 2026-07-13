import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, Pressable, Platform } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { colors, spacing } from '../theme';
import ApertureModule from '../native/ApertureModule';

interface ManualEntrySheetProps {
  visible: boolean;
  onCancel: () => void;
  onSave: () => void;
}

export default function ManualEntrySheet({ visible, onCancel, onSave }: ManualEntrySheetProps) {
  const [date, setDate] = useState(new Date());
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date());

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  const onStartChange = (event: DateTimePickerEvent, selectedTime?: Date) => {
    setShowStartPicker(false);
    if (selectedTime) {
      setStartTime(selectedTime);
      setErrorMsg(null);
    }
  };

  const onEndChange = (event: DateTimePickerEvent, selectedTime?: Date) => {
    setShowEndPicker(false);
    if (selectedTime) {
      setEndTime(selectedTime);
      setErrorMsg(null);
    }
  };

  const handleSave = async () => {
    // Construct start and end dates by combining selected date and selected times
    const startDateTime = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      startTime.getHours(),
      startTime.getMinutes()
    );

    const endDateTime = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      endTime.getHours(),
      endTime.getMinutes()
    );

    if (endDateTime.getTime() <= startDateTime.getTime()) {
      setErrorMsg('End time must be strictly after start time');
      return;
    }

    try {
      await ApertureModule.addManualSession({
        start: startDateTime.toISOString(),
        end: endDateTime.toISOString(),
      });
      onSave();
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to save manual session');
    }
  };

  const formatDateString = (d: Date) => {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTimeString = (t: Date) => {
    return t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  // ponytail: no notes field. Ceiling: no qualitative data. Upgrade: add optional text field + schema migration
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
            <Text style={styles.title}>Manual Entry</Text>
            <TouchableOpacity onPress={handleSave} style={styles.btnHeader}>
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

            {/* Date Select */}
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Date</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.rowValue}>
                <Text style={styles.valueText}>{formatDateString(date)}</Text>
              </TouchableOpacity>
            </View>

            {/* Start Time Select */}
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Start Time</Text>
              <TouchableOpacity onPress={() => setShowStartPicker(true)} style={styles.rowValue}>
                <Text style={styles.valueText}>{formatTimeString(startTime)}</Text>
              </TouchableOpacity>
            </View>

            {/* End Time Select */}
            <View style={styles.row}>
              <Text style={styles.rowLabel}>End Time</Text>
              <TouchableOpacity onPress={() => setShowEndPicker(true)} style={styles.rowValue}>
                <Text style={styles.valueText}>{formatTimeString(endTime)}</Text>
              </TouchableOpacity>
            </View>

            {/* Picker triggers */}
            {showDatePicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display="default"
                onChange={onDateChange}
              />
            )}
            {showStartPicker && (
              <DateTimePicker
                value={startTime}
                mode="time"
                is24Hour={false}
                display="default"
                onChange={onStartChange}
              />
            )}
            {showEndPicker && (
              <DateTimePicker
                value={endTime}
                mode="time"
                is24Hour={false}
                display="default"
                onChange={onEndChange}
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
