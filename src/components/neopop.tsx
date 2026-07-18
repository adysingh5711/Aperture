import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  StyleProp,
  useWindowDimensions,
} from 'react-native';
import Svg, { Defs, LinearGradient, Line, Stop } from 'react-native-svg';
import { useTheme, spacing, depth, typography } from '../theme';

type Variant = 'primary' | 'accent' | 'danger' | 'flat';

interface NeoPopButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
  arrow?: boolean;
  style?: StyleProp<ViewStyle>;
}

// Elevated NeoPOP button: flat face sitting on a darker "plunk" plate offset
// down-right; pressing sinks the face onto the plate.
// ponytail: L-shaped plate instead of true mitered bevel faces. Ceiling: corner is square, not 45° — upgrade with skewX'd edge views if fidelity matters
export function NeoPopButton({
  title,
  onPress,
  variant = 'primary',
  disabled,
  arrow,
  style,
}: NeoPopButtonProps) {
  const { colors } = useTheme();
  const sink = useRef(new Animated.Value(0)).current;

  const palette = {
    primary: { face: colors.ctaFace, edge: colors.ctaEdge, text: colors.ctaText },
    accent: { face: colors.accent, edge: colors.accentEdge, text: '#0D0D0D' },
    danger: { face: colors.error, edge: colors.errorEdge, text: '#FFFFFF' },
    flat: { face: 'transparent', edge: 'transparent', text: colors.textSecondary },
  }[variant];

  const elevated = variant !== 'flat';
  const translate = sink.interpolate({ inputRange: [0, 1], outputRange: [0, depth] });

  // Fast press-in, springy release; both native-driven and interruptible.
  const pressIn = () =>
    Animated.timing(sink, { toValue: 1, duration: 70, useNativeDriver: true }).start();
  const pressOut = () =>
    Animated.spring(sink, { toValue: 0, speed: 30, bounciness: 5, useNativeDriver: true }).start();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => elevated && pressIn()}
      onPressOut={() => elevated && pressOut()}
      style={[{ opacity: disabled ? 0.4 : 1 }, style]}
    >
      {({ pressed }) => (
        <View
          style={
            elevated
              ? { backgroundColor: palette.edge, paddingRight: depth, paddingBottom: depth }
              : null
          }
        >
          <Animated.View
            style={[
              styles.face,
              { backgroundColor: palette.face },
              !elevated && { borderWidth: 1, borderColor: colors.border },
              !elevated && pressed && { backgroundColor: colors.surfaceAlt },
              elevated && { transform: [{ translateX: translate }, { translateY: translate }] },
            ]}
          >
            <Text style={[styles.text, { color: palette.text }]}>
              {title}
              {arrow ? '  →' : ''}
            </Text>
          </Animated.View>
        </View>
      )}
    </Pressable>
  );
}

// Flat NeoPOP card: sharp corners, hard 1px border.
export function NeoPopCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// Uppercase wide-tracked eyebrow label.
export function SectionLabel({
  children,
  color,
  style,
}: {
  children: React.ReactNode;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <Text style={[typography.label as object, { color: color ?? colors.textSecondary }, style]}>
      {children}
    </Text>
  );
}

// Decorative background grid: very light lines, strongest at the bottom,
// fading out toward the top. One SVG surface, memoized — costs nothing on
// parent re-renders (e.g. per-second countdown ticks).
export const GridBackground = React.memo(function GridBackground({ cell = 48 }: { cell?: number }) {
  const { width, height } = useWindowDimensions();
  const { isDark } = useTheme();
  const line = isDark ? '#FFFFFF' : '#000000';
  const maxOpacity = 0.06;
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="gridFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={line} stopOpacity="0" />
            <Stop offset="1" stopColor={line} stopOpacity={maxOpacity} />
          </LinearGradient>
        </Defs>
        {Array.from({ length: cols }, (_, i) => (
          <Line
            key={`v${i}`}
            x1={(i + 1) * cell}
            y1={0}
            x2={(i + 1) * cell}
            y2={height}
            stroke="url(#gridFade)"
            strokeWidth={1}
          />
        ))}
        {Array.from({ length: rows }, (_, i) => (
          <Line
            key={`h${i}`}
            x1={0}
            y1={(i + 1) * cell}
            x2={width}
            y2={(i + 1) * cell}
            stroke={line}
            strokeOpacity={(((i + 1) * cell) / height) * maxOpacity}
            strokeWidth={1}
          />
        ))}
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  face: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: typography.button as object,
});
