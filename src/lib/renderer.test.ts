import { describe, expect, it } from 'vitest';
import { isLayerEffectivelyVisible, pngFileName } from './renderer';
import { defaultAdjustments, defaultTransform, type RasterLayer } from '../types/editor';
describe('PNG export naming', () => {
  it('uses the document name', () => expect(pngFileName('Composite 01')).toBe('Composite 01.png'));
  it('falls back for an empty name', () => expect(pngFileName('  ')).toBe('ezcomp.png'));
});

const layer = (id: string, patch: Partial<RasterLayer> = {}): RasterLayer => ({
  id, assetId: id, kind: 'raster', name: id, width: 10, height: 10, visible: true, locked: false,
  opacity: 100, blendMode: 'source-over', transform: defaultTransform(), adjustments: defaultAdjustments(), ...patch,
});

describe('layer visibility inheritance', () => {
  it('hides a visible child when an ancestor group is hidden', () => {
    const group = layer('group', { kind: 'group', assetId: '', visible: false });
    const child = layer('child', { parentId: group.id, visible: true });
    expect(isLayerEffectivelyVisible(child, [child, group])).toBe(false);
    expect(child.visible).toBe(true);
  });

  it('keeps independently hidden children hidden after a group is shown', () => {
    const group = layer('group', { kind: 'group', assetId: '', visible: true });
    const child = layer('child', { parentId: group.id, visible: false });
    expect(isLayerEffectivelyVisible(child, [child, group])).toBe(false);
  });
});
