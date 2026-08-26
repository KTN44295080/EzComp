import { defaultAdjustments, type LayerAdjustments } from '../types/editor';

export const lightingPresetKeys = ['pink-cyan', 'neon', 'sunset', 'moonlight'] as const;
export type LightingPreset = (typeof lightingPresetKeys)[number];

export const lightingPresetLabels: Record<LightingPreset, string> = {
  'pink-cyan': 'Pink × Cyan',
  neon: 'Neon Split',
  sunset: 'Sunset',
  moonlight: 'Moonlight',
};

const presets: Record<LightingPreset, Pick<LayerAdjustments, 'highlightColor' | 'highlightTint' | 'shadowColor' | 'shadowTint' | 'lightingBalance' | 'keyLightStrength' | 'keyLightAngle' | 'keyLightSoftness' | 'upperBodyLight' | 'rimLight'>> = {
  'pink-cyan': { highlightColor: '#f2b9d2', highlightTint: 68, shadowColor: '#88b7dc', shadowTint: 18, lightingBalance: -14, keyLightStrength: 44, keyLightAngle: 315, keyLightSoftness: 84, upperBodyLight: 22, rimLight: 18 },
  neon: { highlightColor: '#ff58dc', highlightTint: 42, shadowColor: '#416dff', shadowTint: 34, lightingBalance: 2, keyLightStrength: 48, keyLightAngle: 330, keyLightSoftness: 58, upperBodyLight: 16, rimLight: 34 },
  sunset: { highlightColor: '#ffad73', highlightTint: 36, shadowColor: '#6551b8', shadowTint: 24, lightingBalance: 5, keyLightStrength: 42, keyLightAngle: 300, keyLightSoftness: 68, upperBodyLight: 18, rimLight: 20 },
  moonlight: { highlightColor: '#c7e7ff', highlightTint: 25, shadowColor: '#315ba5', shadowTint: 32, lightingBalance: -8, keyLightStrength: 28, keyLightAngle: 270, keyLightSoftness: 80, upperBodyLight: 10, rimLight: 22 },
};

export const lightingAdjustmentKeys = ['highlightColor', 'highlightTint', 'shadowColor', 'shadowTint', 'lightingBalance', 'keyLightStrength', 'keyLightAngle', 'keyLightSoftness', 'upperBodyLight', 'rimLight'] as const;

export function lightingPresetAdjustments(preset: LightingPreset): Partial<LayerAdjustments> {
  return { ...presets[preset] };
}

export function resetLightingAdjustments(): Partial<LayerAdjustments> {
  const defaults = defaultAdjustments();
  return Object.fromEntries(lightingAdjustmentKeys.map((key) => [key, defaults[key]])) as Partial<LayerAdjustments>;
}

export function pickLightingAdjustments(adjustments: LayerAdjustments): Partial<LayerAdjustments> {
  return Object.fromEntries(lightingAdjustmentKeys.map((key) => [key, adjustments[key]])) as Partial<LayerAdjustments>;
}
