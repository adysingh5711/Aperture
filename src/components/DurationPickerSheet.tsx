import React, { useState, useEffect } from 'react';
import { Modal, StyleSheet, Text, View, Pressable } from 'react-native';
import { spacing, useThemedStyles, ThemeColors } from '../theme';
import { NeoPopButton } from './neopop';
import { Wheel, WheelBand } from './wheel';

const MINUTE_LABELS = Array.from({ length: 60 }, (_, i) => String(i + 1));

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
  const styles = useThemedStyles(makeStyles);
  const [selectedValue, setSelectedValue] = useState(initialValue);

  // Sync initialValue when modal opens
  useEffect(() => {
    if (visible) {
      setSelectedValue(initialValue);
    }
  }, [visible, initialValue]);

  // ponytail: Modal bottom sheet instead of heavy library. Ceiling: no drag-to-dismiss gesture. Upgrade: @gorhom/bottom-sheet
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
            <Text style={styles.title}>{title}</Text>
          </View>

          {/* Wheel */}
          {visible && (
            <View style={styles.wheelWrap}>
              <WheelBand label="MIN" />
              <Wheel
                labels={MINUTE_LABELS}
                index={selectedValue - 1}
                onIndexChange={i => setSelectedValue(i + 1)}
              />
            </View>
          )}

          {/* Actions */}
          <View style={styles.btnRow}>
            <NeoPopButton title="Cancel" variant="flat" style={{ flex: 1 }} onPress={onCancel} />
            <NeoPopButton title="Done" arrow style={{ flex: 1 }} onPress={() => onConfirm(selectedValue)} />
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
      borderTopWidth: 1,
      borderColor: c.border,
      paddingBottom: spacing.xl,
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
    wheelWrap: {
      marginVertical: spacing.md,
    },
    btnRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
    },
  });
