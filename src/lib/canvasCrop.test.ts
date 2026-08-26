import { describe, expect, it } from 'vitest';
import { cropSizeForRatio, cropSizeWithLockedRatio } from './canvasCrop';

describe('crop-only aspect presets', () => {
  it('crops the sides without enlarging for a narrower ratio', () => expect(cropSizeForRatio(1920, 1080, 1)).toEqual({ width: 1080, height: 1080 }));
  it('crops top and bottom without enlarging for a wider ratio', () => expect(cropSizeForRatio(1200, 1600, 16 / 9)).toEqual({ width: 1200, height: 675 }));
  it('changes both dimensions while preserving a locked mousepad ratio', () => expect(cropSizeWithLockedRatio(4900, 4300, 2450, 'width', 490 / 430)).toEqual({ width: 2450, height: 2150 }));
  it('never enlarges beyond the available canvas', () => expect(cropSizeWithLockedRatio(1920, 1080, 2000, 'height', 500 / 450)).toEqual({ width: 1200, height: 1080 }));
});
