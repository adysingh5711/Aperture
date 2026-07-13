import React, { useState, useEffect } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, Pressable } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { colors, spacing } from '../theme';

interface DurationPickerSheetProps {
  visible: boolean;
  title: string;
  initialValue: number;
  onCancel: () => void;
  onConfirm: (value: number) => void;
}

export default function DurationPickerSheet({
  visible,
  title,
  initialValue,
  onCancel,
  onConfirm,
}: DurationPickerSheetProps) {
  const [selectedValue, setSelectedValue] = useState(initialValue);

  // Sync initialValue when modal opens
  useEffect(() => {
    if (visible) {
      setSelectedValue(initialValue);
    }
  }, [visible, initialValue]);

  // Generate 1-60 list
  const pickerItems = Array.from({ length: 60 }, (_, i) => i + 1);

  // ponytail: Modal bottom sheet instead of heavy library. Ceiling: no drag-to-dismiss gesture. Upgrade: @gorhom/bottom-sheet
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
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={() => onConfirm(selectedValue)} style={styles.btnHeader}>
              <Text style={styles.btnDoneText}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Picker */}
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={selectedValue}
              onValueChange={(itemValue) => setSelectedValue(itemValue)}
              style={styles.picker}
              itemStyle={styles.pickerItem}
              dropdownIconColor={colors.textPrimary}
            >
              {pickerItems.map((val) => (
                <Picker.Item
                  key={val}
                  label={`${val} minute${val > 1 ? 's' : ''}`}
                  value={val}
                />
              ))}
            </Picker>
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
  btnDoneText: {
    color: colors.action,
    fontSize: 16,
    fontWeight: 'bold',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  pickerContainer: {
    paddingVertical: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  picker: {
    width: '100%',
    color: colors.textPrimary,
  },
  pickerItem: {
    color: colors.textPrimary,
    fontSize: 18,
  },
});
