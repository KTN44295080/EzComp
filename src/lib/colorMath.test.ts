import { describe, expect, it } from 'vitest';
import { adjustRgb } from './colorMath';
import { defaultAdjustments } from '../types/editor';

describe('adjustRgb', () => {
  it('keeps a pixel unchanged with neutral adjustments', () => {
    const result = adjustRgb({ r: 20, g: 100, b: 220 }, defaultAdjustments());
    expect(result).toEqual({ r: 20, g: 100, b: 220 });
  });

  it('raises brightness by one stop', () => {
    const result = adjustRgb(
      { r: 50, g: 60, b: 70 },
      { ...defaultAdjustments(), exposure: 1 },
    );
    expect(result.r).toBeCloseTo(100, 5);
    expect(result.g).toBeCloseTo(120, 5);
    expect(result.b).toBeCloseTo(140, 5);
  });

  it('moves warm temperature toward red and away from blue', () => {
    const result = adjustRgb(
      { r: 128, g: 128, b: 128 },
      { ...defaultAdjustments(), temperature: 100 },
    );
    expect(result.r).toBeGreaterThan(128);
    expect(result.b).toBeLessThan(128);
  });
});
