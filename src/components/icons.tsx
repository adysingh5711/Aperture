import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

// Geometric NeoPOP icon set: 2px strokes, square caps, mitered joins, no curves
// beyond what the glyph demands. All icons share a 24x24 viewBox.

interface IconProps {
  size?: number;
  color: string;
}

const stroke = (color: string) =>
  ({
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'square',
    strokeLinejoin: 'miter',
    fill: 'none',
  } as const);

export function TimerIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="9" y1="2" x2="15" y2="2" {...stroke(color)} />
      <Line x1="12" y1="2" x2="12" y2="5" {...stroke(color)} />
      <Circle cx="12" cy="14" r="8" {...stroke(color)} />
      <Line x1="12" y1="14" x2="16" y2="10" {...stroke(color)} />
    </Svg>
  );
}

export function JournalIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3" y="4" width="18" height="17" {...stroke(color)} />
      <Line x1="8" y1="1" x2="8" y2="6" {...stroke(color)} />
      <Line x1="16" y1="1" x2="16" y2="6" {...stroke(color)} />
      <Line x1="3" y1="9" x2="21" y2="9" {...stroke(color)} />
      <Rect x="7" y="12" width="3" height="3" fill={color} />
      <Rect x="14" y="12" width="3" height="3" fill={color} />
      <Rect x="7" y="16.5" width="3" height="2.5" fill={color} />
    </Svg>
  );
}

export function ChartIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="4" y="12" width="4" height="9" fill={color} />
      <Rect x="10" y="6" width="4" height="15" fill={color} />
      <Rect x="16" y="9" width="4" height="12" fill={color} />
    </Svg>
  );
}

export function SettingsIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="3" y1="6" x2="21" y2="6" {...stroke(color)} />
      <Line x1="3" y1="12" x2="21" y2="12" {...stroke(color)} />
      <Line x1="3" y1="18" x2="21" y2="18" {...stroke(color)} />
      <Rect x="13" y="4" width="4" height="4" fill={color} />
      <Rect x="6" y="10" width="4" height="4" fill={color} />
      <Rect x="11" y="16" width="4" height="4" fill={color} />
    </Svg>
  );
}

export function ArrowLeftIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="21" y1="12" x2="5" y2="12" {...stroke(color)} />
      <Path d="M11 6 L5 12 L11 18" {...stroke(color)} />
    </Svg>
  );
}

export function ArrowRightIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1="3" y1="12" x2="19" y2="12" {...stroke(color)} />
      <Path d="M13 6 L19 12 L13 18" {...stroke(color)} />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 5 L16 12 L9 19" {...stroke(color)} />
    </Svg>
  );
}

export function BackspaceIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8 5 L2 12 L8 19 H22 V5 Z" {...stroke(color)} />
      <Line x1="11.5" y1="9.5" x2="16.5" y2="14.5" {...stroke(color)} />
      <Line x1="16.5" y1="9.5" x2="11.5" y2="14.5" {...stroke(color)} />
    </Svg>
  );
}

export function DotsIcon({ size = 24, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3" y="10.5" width="3" height="3" fill={color} />
      <Rect x="10.5" y="10.5" width="3" height="3" fill={color} />
      <Rect x="18" y="10.5" width="3" height="3" fill={color} />
    </Svg>
  );
}
