import { describe, expect, it } from 'vitest';
import { cropSizeForRatio } from './canvasCrop';

describe('crop-only aspect presets', () => {
  it('crops the sides without enlarging for a narrower ratio', () => expect(cropSizeForRatio(1920, 1080, 1)).toEqual({ width: 1080, height: 1080 }));
  it('crops top and bottom without enlarging for a wider ratio', () => expect(cropSizeForRatio(1200, 1600, 16 / 9)).toEqual({ width: 1200, height: 675 }));
});

