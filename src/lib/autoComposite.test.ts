import { describe, expect, it } from 'vitest';
import { deriveAutoAdjustments, imageStats, pickSharedMatchAdjustments, type ImageStats } from './autoComposite';

const stats = (patch: Partial<ImageStats> = {}): ImageStats => ({ luminance: .5, contrast: .2, saturation: .3, warmth: 0, tint: 0, low: .2, high: .8, pixels: 1000, red: .5, green: .5, blue: .5, ...patch });

describe('auto composite adjustment model', () => {
  it('brightens a darker foreground toward its reference', () => {
    const result = deriveAutoAdjustments(stats({ luminance: .2, low: .08, high: .45 }), stats({ luminance: .55 }), 'balanced');
    expect(result.exposure).toBeGreaterThan(0);
    expect(result.shadowOpacity).toBeGreaterThan(0);
    expect(result.lightWrap).toBeGreaterThan(0);
    expect(result.grain).toBeGreaterThan(0);
  });

  it('carries the sampled environment color into integration effects', () => {
    const result = deriveAutoAdjustments(stats(), stats({ red: .2, green: .45, blue: .75 }), 'balanced');
    expect(result.environmentColor).toBe('#3373bf');
    expect(result.atmosphere).toBeGreaterThan(0);
  });

  it('cools and darkens with the night preset', () => {
    const balanced = deriveAutoAdjustments(stats(), stats(), 'balanced');
    const night = deriveAutoAdjustments(stats(), stats(), 'night');
    expect(night.temperature).toBeLessThan(balanced.temperature);
    expect(night.exposure).toBeLessThan(balanced.exposure);
  });

  it('keeps every generated correction within editor limits', () => {
    const result = deriveAutoAdjustments(stats({ luminance: .01, contrast: .001, saturation: .001, warmth: -.8, tint: -.8 }), stats({ luminance: .99, contrast: .8, saturation: .9, warmth: .8, tint: .8 }), 'vivid');
    expect(result.exposure).toBeLessThanOrEqual(2.5);
    expect(Math.abs(result.contrast)).toBeLessThanOrEqual(55);
    expect(Math.abs(result.temperature)).toBeLessThanOrEqual(70);
  });

  it('estimates illuminant color mostly from neutral pixels instead of saturated costume color', () => {
    const data = new Uint8ClampedArray([
      255, 0, 0, 255,
      128, 128, 128, 255,
      150, 150, 150, 255,
    ]);
    const result = imageStats({ data, width: 3, height: 1, colorSpace: 'srgb' } as ImageData);
    expect(Math.abs(result.warmth)).toBeLessThan(.08);
    expect(Math.abs(result.tint)).toBeLessThan(.08);
  });

  it('reuses one shared scene grade instead of adapting the same preset per character', () => {
    const reference = stats({ luminance: .38, warmth: -.08 });
    const first = deriveAutoAdjustments(stats({ luminance: .25, contrast: .12 }), reference, 'balanced');
    const adaptiveSecond = { ...deriveAutoAdjustments(stats({ luminance: .7, contrast: .3 }), reference, 'balanced'), shadowBlur: 42 };
    const lockedSecond = { ...adaptiveSecond, ...pickSharedMatchAdjustments(first) };
    expect(adaptiveSecond.exposure).not.toBe(first.exposure);
    expect(lockedSecond.exposure).toBe(first.exposure);
    expect(lockedSecond.temperature).toBe(first.temperature);
    expect(lockedSecond.shadowBlur).toBe(adaptiveSecond.shadowBlur);
  });
});
