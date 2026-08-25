import { describe, expect, it } from 'vitest';
import { adjustRgb, applyAdjustmentsToImageData } from './colorMath';
import { defaultAdjustments } from '../types/editor';
import { lightingPresetAdjustments } from './lighting';

describe('non-destructive color math', () => {
  it('keeps neutral pixels unchanged', () => expect(adjustRgb({ r: 20, g: 100, b: 220 }, defaultAdjustments())).toEqual({ r: 20, g: 100, b: 220 }));
  it('raises exposure by one stop', () => expect(adjustRgb({ r: 50, g: 60, b: 70 }, { ...defaultAdjustments(), exposure: 1 })).toEqual({ r: 100, g: 120, b: 140 }));
  it('warms red and cools blue', () => { const result = adjustRgb({ r: 128, g: 128, b: 128 }, { ...defaultAdjustments(), temperature: 100 }); expect(result.r).toBeGreaterThan(128); expect(result.b).toBeLessThan(128); });
  it('keeps cyan in shadows and pink in highlights', () => {
    const adjustments = { ...defaultAdjustments(), ...lightingPresetAdjustments('pink-cyan'), keyLightStrength: 0 };
    const shadow = adjustRgb({ r: 45, g: 45, b: 45 }, adjustments), highlight = adjustRgb({ r: 220, g: 220, b: 220 }, adjustments);
    expect(shadow.b).toBeGreaterThan(shadow.r);
    expect(highlight.r).toBeGreaterThan(highlight.g);
    expect(highlight.b).toBeGreaterThan(highlight.g);
  });
  it('applies a directional key light more strongly on its facing side', () => {
    const data = new Uint8ClampedArray([150, 150, 150, 255, 150, 150, 150, 255]);
    const image = { data, width: 2, height: 1, colorSpace: 'srgb' } as ImageData;
    applyAdjustmentsToImageData(image, { ...defaultAdjustments(), ...lightingPresetAdjustments('pink-cyan'), highlightTint: 0, shadowTint: 0, keyLightStrength: 80, keyLightAngle: 0, keyLightSoftness: 10 });
    expect(data[4]).toBeGreaterThan(data[0] ?? 0);
    expect(data[5]).toBeLessThan(data[4] ?? 0);
  });
});
