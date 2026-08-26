import { describe, expect, it } from 'vitest';
import { applyContentTransform } from './contentTransform';
import { defaultAdjustments, defaultDepthOfField, defaultTransform, type RasterLayer } from '../types/editor';

const layer: RasterLayer = { id: 'layer', assetId: 'asset', kind: 'raster', name: 'Layer', width: 200, height: 100, visible: true, locked: false, opacity: 100, blendMode: 'source-over', transform: { ...defaultTransform(), x: 400, y: 450 }, adjustments: defaultAdjustments(), depthOfField: defaultDepthOfField() };

describe('whole-composition transform', () => {
  it('scales a layer around the canvas center and preserves its rotation', () => {
    const result = applyContentTransform({ ...layer, transform: { ...layer.transform, rotation: 17 } }, { width: 1000, height: 1000 }, { scale: 1, x: 0, y: 0 }, { scale: 2, x: 0, y: 0 });
    expect(result.transform).toEqual({ x: 300, y: 400, scaleX: 2, scaleY: 2, rotation: 17 });
  });
  it('applies position as a group and can return to its previous state', () => {
    const moved = applyContentTransform(layer, { width: 1000, height: 1000 }, { scale: 1, x: 0, y: 0 }, { scale: 1.5, x: 80, y: -40 });
    const restored = applyContentTransform(moved, { width: 1000, height: 1000 }, { scale: 1.5, x: 80, y: -40 }, { scale: 1, x: 0, y: 0 });
    expect(restored.transform.x).toBeCloseTo(layer.transform.x); expect(restored.transform.y).toBeCloseTo(layer.transform.y); expect(restored.transform.scaleX).toBeCloseTo(1);
  });
});

