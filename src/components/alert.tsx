import React, { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { spacing, useThemedStyles, ThemeColors } from '../theme';
import { NeoPopButton } from './neopop';

export interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

interface AlertSpec {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

// ponytail: module-level setter instead of a context provider — one host, one app
let show: (spec: AlertSpec | null) => void = () => {};

// Drop-in themed replacement for Alert.alert — same call signature.
export function alert(title: string, message?: string, buttons?: AlertButton[]) {
  show({ title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] });
}

// Mount once at the app root.
export function AlertHost() {
  const styles = useThemedStyles(makeStyles);
  const [spec, setSpec] = useState<AlertSpec | null>(null);
  show = setSpec;

  if (!spec) return null;

  const press = (b: AlertButton) => {
    setSpec(null);
    b.onPress?.();
  };
  // Android back behaves like the native dialog: triggers the cancel button if present.
  const cancelBtn = spec.buttons.find(b => b.style === 'cancel');

  return (
    <Modal
      transparent
      statusBarTranslucent
      visible
      animationType="fade"
      onRequestClose={() => cancelBtn && press(cancelBtn)}
    >
      <View style={styles.backdrop}>
        <View style={styles.box}>
          <Text style={styles.title}>{spec.title}</Text>
          {spec.message ? <Text style={styles.message}>{spec.message}</Text> : null}
          <View style={spec.buttons.length > 2 ? styles.buttonsColumn : styles.buttonsRow}>
            {spec.buttons.map((b, i) => (
              <NeoPopButton
                key={i}
                title={b.text}
                style={spec.buttons.length > 2 ? null : { flex: 1 }}
                variant={
                  b.style === 'destructive' ? 'danger' : b.style === 'cancel' ? 'flat' : 'primary'
                }
                onPress={() => press(b)}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    box: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      padding: spacing.lg,
    },
    title: {
      color: c.textPrimary,
      fontSize: 16,
      fontWeight: '900',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    message: {
      color: c.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      marginTop: spacing.sm,
    },
    buttonsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
    buttonsColumn: {
      gap: spacing.sm,
      marginTop: spacing.lg,
    },
  });
