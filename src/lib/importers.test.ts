import { describe, expect, it } from 'vitest';
import { isSupportedImport } from './importers';

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
