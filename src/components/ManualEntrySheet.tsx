import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, Pressable } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { spacing, useThemedStyles, ThemeColors } from '../theme';
import { NeoPopButton } from './neopop';
import ApertureModule from '../native/ApertureModule';

interface ManualEntrySheetProps {
  visible: boolean;
  onCancel: () => void;
  onSave: () => void;
}

export default function ManualEntrySheet({ visible, onCancel, onSave }: ManualEntrySheetProps) {
  const styles = useThemedStyles(makeStyles);
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
            <Text style={styles.title}>Manual Entry</Text>
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

            {/* Actions */}
            <View style={styles.btnRow}>
              <NeoPopButton title="Cancel" variant="flat" style={{ flex: 1 }} onPress={onCancel} />
              <NeoPopButton title="Save" arrow style={{ flex: 1 }} onPress={handleSave} />
            </View>
          </View>
        </View>
      </Pressable>
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
