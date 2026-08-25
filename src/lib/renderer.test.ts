import { describe, expect, it } from 'vitest';
import { pngFileName } from './renderer';
describe('PNG export naming', () => {
  it('uses the document name', () => expect(pngFileName('Composite 01')).toBe('Composite 01.png'));
  it('falls back for an empty name', () => expect(pngFileName('  ')).toBe('ezcomp.png'));
});
