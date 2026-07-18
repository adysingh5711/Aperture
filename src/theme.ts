import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

// NeoPOP (CRED) design language: sharp corners, hard offset edges ("plunk"),
// high-contrast flat surfaces, bold uppercase labels with wide tracking.

export const darkColors = {
  background: '#0D0D0D',
  surface: '#161616',
  surfaceAlt: '#1F1F1F',
  border: '#2B2B2B',
  textPrimary: '#FFFFFF',
  textSecondary: '#8F8F8F',
  textMuted: '#5A5A5A',
  // Primary CTA: white face + black text is the CRED signature on dark.
  ctaFace: '#FFFFFF',
  ctaEdge: '#B5B5B5',
  ctaText: '#0D0D0D',
  accent: '#06C270',
  accentEdge: '#048F53',
  warning: '#FFB800',
  error: '#EB5757',
  errorEdge: '#B23A3A',
  gateBg: '#0D0D0D',
  heatNone: '#1F1F1F',
  heatLow: '#03482A',
  heatMid: '#058B50',
  heatHigh: '#06C270',
} as const;

export const lightColors: ThemeColors = {
  background: '#F2F2F2',
  surface: '#FFFFFF',
  surfaceAlt: '#FAFAFA',
  border: '#E0E0E0',
  textPrimary: '#0D0D0D',
  textSecondary: '#6F6F6F',
  textMuted: '#ABABAB',
  // Inverted on light: black face + white text.
  ctaFace: '#0D0D0D',
  ctaEdge: '#4A4A4A',
  ctaText: '#FFFFFF',
  accent: '#06A862',
  accentEdge: '#047242',
  warning: '#C78F00',
  error: '#D63C3C',
  errorEdge: '#9E2B2B',
  gateBg: '#F2F2F2',
  heatNone: '#E7E7E7',
  heatLow: '#A8E8CC',
  heatMid: '#3BD495',
  heatHigh: '#06A862',
};

export type ThemeColors = { -readonly [K in keyof typeof darkColors]: string };

export function useTheme(): { colors: ThemeColors; isDark: boolean } {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  return { colors: isDark ? darkColors : lightColors, isDark };
}

// Per-scheme StyleSheet factory: const styles = useThemedStyles(makeStyles)
export function useThemedStyles<T>(make: (c: ThemeColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => make(colors), [make, colors]);
}

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
// NeoPOP is strictly sharp-cornered.
export const radii = { card: 0, button: 0 } as const;
// Plunk depth of elevated NeoPOP surfaces (dp).
export const depth = 4;

// ponytail: system font fallback. Ceiling: no tabular numerals on some Android system fonts. Upgrade: bundle Gilroy/Inter TTF later
export const typography = {
  fontFamily: 'System',
  // Uppercase section/eyebrow labels
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  // Button text
  button: { fontSize: 13, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
} as const;
