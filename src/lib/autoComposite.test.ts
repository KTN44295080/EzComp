import { describe, expect, it } from 'vitest';
import { deriveAutoAdjustments, type ImageStats } from './autoComposite';

const stats = (patch: Partial<ImageStats> = {}): ImageStats => ({ luminance: .5, contrast: .2, saturation: .3, warmth: 0, tint: 0, low: .2, high: .8, pixels: 1000, ...patch });

describe('auto composite adjustment model', () => {
  it('brightens a darker foreground toward its reference', () => {
    const result = deriveAutoAdjustments(stats({ luminance: .2, low: .08, high: .45 }), stats({ luminance: .55 }), 'balanced');
    expect(result.exposure).toBeGreaterThan(0);
    expect(result.shadowOpacity).toBeGreaterThan(0);
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
});
