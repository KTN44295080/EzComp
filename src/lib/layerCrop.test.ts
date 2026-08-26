import { describe, expect, it } from 'vitest';
import { layerCropKey, layerCropRect, normalizeLayerCrop } from './layerCrop';

describe('layer crop', () => {
  it('keeps a missing crop backward compatible', () => {
    expect(normalizeLayerCrop(undefined, 100, 50)).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
    expect(layerCropRect({ width: 100, height: 50 })).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  it('clamps source-pixel insets without allowing an empty crop', () => {
    const crop = normalizeLayerCrop({ left: 80, right: 80, top: -4, bottom: 99 }, 100, 50);
    expect(crop).toEqual({ left: 80, top: 0, right: 19, bottom: 49 });
    expect(layerCropRect({ width: 100, height: 50, crop })).toEqual({ x: 80, y: 0, width: 1, height: 1 });
  });

  it('uses normalized crop values in cache keys', () => {
    expect(layerCropKey({ width: 100, height: 50, crop: { left: 10.4, top: 5.6, right: 2, bottom: 3 } })).toBe('10:6:2:3');
  });
});
