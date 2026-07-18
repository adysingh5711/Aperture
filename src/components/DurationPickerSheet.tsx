import React, { useState, useEffect } from 'react';
import { Modal, StyleSheet, Text, View, Pressable } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { spacing, useTheme, useThemedStyles, ThemeColors } from '../theme';
import { NeoPopButton } from './neopop';

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
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
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
            <Text style={styles.title}>{title}</Text>
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
                  color={colors.textPrimary}
                />
              ))}
            </Picker>
          </View>

          {/* Actions */}
          <View style={styles.btnRow}>
            <NeoPopButton title="Cancel" variant="flat" style={{ flex: 1 }} onPress={onCancel} />
            <NeoPopButton title="Done" arrow style={{ flex: 1 }} onPress={() => onConfirm(selectedValue)} />
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
    pickerContainer: {
      paddingVertical: spacing.md,
      justifyContent: 'center',
      alignItems: 'center',
    },
    picker: {
      width: '100%',
      color: c.textPrimary,
    },
    pickerItem: {
      color: c.textPrimary,
      fontSize: 18,
    },
    btnRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
    },
  });
