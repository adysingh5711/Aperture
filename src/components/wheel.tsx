import React, { useEffect, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { spacing, useThemedStyles, ThemeColors } from '../theme';
import ApertureModule from '../native/ApertureModule';

export const WHEEL_ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5;
const PAD = WHEEL_ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2);
export const WHEEL_HEIGHT = WHEEL_ITEM_HEIGHT * VISIBLE_ROWS;

// Sharp NeoPOP selection band. Render as a sibling before the Wheel(s) inside
// a relative container so one band spans all columns.
export function WheelBand({ label }: { label?: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View pointerEvents="none" style={styles.centerBand}>
      {label ? <Text style={styles.centerUnit}>{label}</Text> : null}
    </View>
  );
}

interface WheelProps {
  labels: string[];
  index: number;
  onIndexChange: (index: number) => void;
  style?: StyleProp<ViewStyle>;
}

// iOS-style snap wheel column with system tick sound per detent.
// ponytail: ScrollView + snapToInterval instead of a wheel-picker dependency
export function Wheel({ labels, index, onIndexChange, style }: WheelProps) {
  const styles = useThemedStyles(makeStyles);
  const scrollRef = useRef<ScrollView>(null);
  const [centerIdx, setCenterIdx] = useState(index);
  const centerRef = useRef(index);

  const setCenter = (i: number) => {
    centerRef.current = i;
    setCenterIdx(i);
  };

  // Follow external index changes (e.g. day clamped after month switch).
  useEffect(() => {
    if (index !== centerRef.current) {
      setCenter(index);
      scrollRef.current?.scrollTo({ y: index * WHEEL_ITEM_HEIGHT, animated: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.min(
      labels.length - 1,
      Math.max(0, Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM_HEIGHT)),
    );
    if (idx !== centerRef.current) {
      setCenter(idx);
      ApertureModule.playTick();
      onIndexChange(idx);
    }
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={[{ height: WHEEL_HEIGHT }, style]}
      contentContainerStyle={{ paddingVertical: PAD }}
      showsVerticalScrollIndicator={false}
      snapToInterval={WHEEL_ITEM_HEIGHT}
      decelerationRate="fast"
      onScroll={handleScroll}
      scrollEventThrottle={16}
      onLayout={() =>
        scrollRef.current?.scrollTo({ y: centerRef.current * WHEEL_ITEM_HEIGHT, animated: false })
      }
    >
      {labels.map((label, i) => {
        const d = Math.abs(i - centerIdx);
        return (
          <Text
            key={i}
            style={[
              styles.wheelItem,
              d === 0 ? styles.wheelItemActive : d === 1 ? styles.wheelItemNear : null,
            ]}
          >
            {label}
          </Text>
        );
      })}
    </ScrollView>
  );
}

const HOURS_12 = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'];
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const MERIDIEM = ['AM', 'PM'];

// Clock: hour / minute / AM-PM wheels. Keeps the date part of `value` intact.
export function WheelTimePicker({
  value,
  onChange,
}: {
  value: Date;
  onChange: (d: Date) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const hourIdx = value.getHours() % 12;
  const minuteIdx = value.getMinutes();
  const meridiemIdx = value.getHours() < 12 ? 0 : 1;

  const update = (h: number, m: number, mer: number) => {
    const d = new Date(value);
    d.setHours(h + (mer === 1 ? 12 : 0), m); // h index 0 = "12" = hour 0/12
    onChange(d);
  };

  return (
    <View style={styles.pickerRow}>
      <WheelBand />
      <Wheel
        labels={HOURS_12}
        index={hourIdx}
        onIndexChange={i => update(i, minuteIdx, meridiemIdx)}
        style={styles.flex1}
      />
      <Text style={styles.separator}>:</Text>
      <Wheel
        labels={MINUTES}
        index={minuteIdx}
        onIndexChange={i => update(hourIdx, i, meridiemIdx)}
        style={styles.flex1}
      />
      <Wheel
        labels={MERIDIEM}
        index={meridiemIdx}
        onIndexChange={i => update(hourIdx, minuteIdx, i)}
        style={styles.flex1}
      />
    </View>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

// Calendar: month / day / year wheels. Keeps the time part of `value` intact.
export function WheelDatePicker({
  value,
  onChange,
  yearsBack = 2,
}: {
  value: Date;
  onChange: (d: Date) => void;
  yearsBack?: number;
}) {
  const styles = useThemedStyles(makeStyles);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: yearsBack + 1 }, (_, i) => currentYear - yearsBack + i);

  const monthIdx = value.getMonth();
  const yearIdx = Math.max(0, years.indexOf(value.getFullYear()));
  const dayCount = daysInMonth(value.getFullYear(), monthIdx);
  const dayIdx = Math.min(value.getDate(), dayCount) - 1;
  const days = Array.from({ length: dayCount }, (_, i) => String(i + 1));

  const update = (m: number, d: number, y: number) => {
    const year = years[y];
    const day = Math.min(d + 1, daysInMonth(year, m)); // clamp e.g. Jan 31 -> Feb 28
    const next = new Date(value);
    next.setFullYear(year, m, day);
    onChange(next);
  };

  return (
    <View style={styles.pickerRow}>
      <WheelBand />
      <Wheel
        labels={MONTHS}
        index={monthIdx}
        onIndexChange={i => update(i, dayIdx, yearIdx)}
        style={styles.flex1}
      />
      <Wheel
        labels={days}
        index={dayIdx}
        onIndexChange={i => update(monthIdx, i, yearIdx)}
        style={styles.flex1}
      />
      <Wheel
        labels={years.map(String)}
        index={yearIdx}
        onIndexChange={i => update(monthIdx, dayIdx, i)}
        style={styles.flex1}
      />
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: spacing.sm,
    },
    flex1: {
      flex: 1,
    },
    separator: {
      color: c.textPrimary,
      fontSize: 20,
      fontWeight: '900',
      marginHorizontal: 2,
    },
    centerBand: {
      position: 'absolute',
      top: PAD,
      left: spacing.lg,
      right: spacing.lg,
      height: WHEEL_ITEM_HEIGHT,
      backgroundColor: c.surfaceAlt,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: c.border,
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingRight: spacing.md,
    },
    centerUnit: {
      color: c.textSecondary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 2,
    },
    wheelItem: {
      height: WHEEL_ITEM_HEIGHT,
      lineHeight: WHEEL_ITEM_HEIGHT,
      textAlign: 'center',
      color: c.textMuted,
      fontSize: 14,
      fontWeight: '600',
    },
    wheelItemNear: {
      color: c.textSecondary,
      fontSize: 16,
      fontWeight: '700',
    },
    wheelItemActive: {
      color: c.textPrimary,
      fontSize: 20,
      fontWeight: '900',
    },
  });
