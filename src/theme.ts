import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

// NeoPOP (playground.cred.club) design language: sharp corners, 3px mitered
// "plunk" edges at 45°, flat surfaces with hairline strokes (never soft
// shadows), popBlack/popWhite scales, CAPS labels, serif display headings.

export const darkColors = {
  background: '#0D0D0D', // popBlack.500
  surface: '#121212', // popBlack.400 — containerCard.background
  surfaceAlt: '#161616', // popBlack.300
  border: 'rgba(255,255,255,0.1)', // containerCard.stroke
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.7)', // FontOpacity.SUB_HEADING
  textMuted: 'rgba(255,255,255,0.3)', // FontOpacity.BODY_TEXT_LIGHTER
  // Primary CTA on dark: white face + black text (NeoPOP dark/secondary spec).
  ctaFace: '#FFFFFF',
  ctaEdge: '#8A8A8A', // popBlack.100
  ctaText: '#0D0D0D',
  accent: '#06C270', // mainColors.green
  accentEdge: '#048F53',
  warning: '#F08D32', // mainColors.yellow
  error: '#EE4D37', // mainColors.red
  errorEdge: '#B23A29',
  gateBg: '#0D0D0D',
  heatNone: '#1F1F1F',
  heatLow: '#03482A',
  heatMid: '#058B50',
  heatHigh: '#06C270',
} as const;

export const lightColors: ThemeColors = {
  background: '#EFEFEF', // popWhite.300
  surface: '#FFFFFF',
  surfaceAlt: '#FBFBFB', // popWhite.400
  border: 'rgba(0,0,0,0.1)',
  textPrimary: '#0D0D0D',
  textSecondary: 'rgba(13,13,13,0.7)',
  textMuted: 'rgba(13,13,13,0.3)',
  // Inverted on light: black face + white text (NeoPOP dark/primary edges).
  ctaFace: '#0D0D0D',
  ctaEdge: '#3D3D3D', // black.70
  ctaText: '#FFFFFF',
  accent: '#06C270',
  accentEdge: '#048F53',
  warning: '#F08D32',
  error: '#EE4D37',
  errorEdge: '#B23A29',
  gateBg: '#EFEFEF',
  heatNone: '#E0E0E0',
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
export const radii = { card: 0, sheet: 0, chip: 0, button: 0 } as const;
// Plunk edge width (PlunkProps.WIDTH = 3).
export const depth = 3;

// ponytail: system font fallback. Ceiling: no tabular numerals on some Android system fonts. Upgrade: bundle Gilroy/Inter TTF later
export const typography = {
  fontFamily: 'System',
  // Uppercase section/eyebrow labels
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  // Button text
  button: { fontSize: 13, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  // Serif display numerals/headlines ("₹4,286.97", "pay your bills…")
  display: { fontFamily: 'serif', fontWeight: '700' },
} as const;
