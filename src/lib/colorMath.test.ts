import { describe, expect, it } from 'vitest';
import { adjustRgb } from './colorMath';
import { defaultAdjustments } from '../types/editor';

describe('non-destructive color math', () => {
  it('keeps neutral pixels unchanged', () => expect(adjustRgb({ r: 20, g: 100, b: 220 }, defaultAdjustments())).toEqual({ r: 20, g: 100, b: 220 }));
  it('raises exposure by one stop', () => expect(adjustRgb({ r: 50, g: 60, b: 70 }, { ...defaultAdjustments(), exposure: 1 })).toEqual({ r: 100, g: 120, b: 140 }));
  it('warms red and cools blue', () => { const result = adjustRgb({ r: 128, g: 128, b: 128 }, { ...defaultAdjustments(), temperature: 100 }); expect(result.r).toBeGreaterThan(128); expect(result.b).toBeLessThan(128); });
});
