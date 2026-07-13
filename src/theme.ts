export const colors = {
  surface: '#101827',
  background: '#F8FAFC',
  action: '#004BB8',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  gateBg: '#0A0F1A',
  border: '#1E293B',
  heatNone: '#1E293B',
  heatLow: '#1E3A5F',
  heatMid: '#1D4ED8',
  heatHigh: '#3B82F6',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radii = { card: 16, button: 12 } as const;

// ponytail: system font fallback. Ceiling: no tabular numerals on some Android system fonts. Upgrade: bundle Inter TTF later
export const typography = {
  fontFamily: 'System',
} as const;
