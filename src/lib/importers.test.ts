import { describe, expect, it } from 'vitest';
import { buildPsdStructure, isSupportedImport, normalizePsdOrder } from './importers';

describe('supported imports', () => {
  it.each([
    ['design.psd', ''], ['layer.png', 'image/png'], ['photo.jpg', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'], ['texture.webp', 'image/webp'],
  ])('accepts %s', (name, type) => expect(isSupportedImport({ name, type })).toBe(true));

  it.each([
    ['animation.gif', 'image/gif'], ['vector.svg', 'image/svg+xml'],
    ['renamed.png', 'image/jpeg'], ['notes.txt', 'text/plain'],
  ])('rejects %s', (name, type) => expect(isSupportedImport({ name, type })).toBe(false));
});

describe('PSD structure', () => {
  it('keeps Photoshop top-to-bottom order and nested groups', () => {
    const canvas = { width: 10, height: 10 } as OffscreenCanvas;
    const entries = buildPsdStructure([
      { name: 'Hidden folder', hidden: true, opened: false, children: [
        { name: 'Top child', canvas },
        { name: 'Nested', children: [{ name: 'Deep child', canvas }] },
      ] },
      { name: 'Bottom layer', canvas },
    ]);
    expect(entries.map((entry) => [entry.kind, entry.path.at(-1), entry.depth])).toEqual([
      ['group', 'Hidden folder', 0],
      ['raster', 'Top child', 1],
      ['group', 'Nested', 1],
      ['raster', 'Deep child', 2],
      ['raster', 'Bottom layer', 0],
    ]);
    expect(entries[1]?.parentId).toBe(entries[0]?.id);
    expect(entries[2]?.parentId).toBe(entries[0]?.id);
    expect(entries[3]?.parentId).toBe(entries[2]?.id);
    expect(entries[0]?.layer.hidden).toBe(true);
    expect(entries[0]?.layer.opened).toBe(false);
  });

  it('corrects bottom-first exports when the paper layer is first', () => {
    const canvas = { width: 10, height: 10 } as OffscreenCanvas;
    const normalized = normalizePsdOrder([
      { name: '用紙', canvas },
      { name: 'Folder', children: [{ name: 'Nested', children: [{ name: 'Deep bottom', canvas }, { name: 'Deep top', canvas }] }, { name: 'Top child', canvas }] },
      { name: 'Top layer', canvas },
    ]);
    expect(normalized.map((layer) => layer.name)).toEqual(['Top layer', 'Folder', '用紙']);
    expect(normalized[1]?.children?.map((layer) => layer.name)).toEqual(['Top child', 'Nested']);
    expect(normalized[1]?.children?.[1]?.children?.map((layer) => layer.name)).toEqual(['Deep top', 'Deep bottom']);
  });

  it('leaves standard top-to-bottom PSD order unchanged', () => {
    const canvas = { width: 10, height: 10 } as OffscreenCanvas;
    const normalized = normalizePsdOrder([{ name: 'Top layer', canvas }, { name: 'Background', canvas }]);
    expect(normalized.map((layer) => layer.name)).toEqual(['Top layer', 'Background']);
  });
});
