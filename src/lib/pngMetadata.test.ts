import { describe, expect, it } from 'vitest';
import { pixelsPerMeterForDpi, readPngDpi, setPngDpi } from './pngMetadata';

const uint32 = (value: number): number[] => [value >>> 24, value >>> 16 & 255, value >>> 8 & 255, value & 255];
const chunk = (name: string, data: number[] = []): number[] => [...uint32(data.length), ...[...name].map((letter) => letter.charCodeAt(0)), ...data, 0, 0, 0, 0];
const minimalPng = (): Uint8Array => new Uint8Array([137,80,78,71,13,10,26,10, ...chunk('IHDR'), ...chunk('IEND')]);

describe('PNG resolution metadata', () => {
  it('converts 300 DPI to the PNG pixels-per-meter unit', () => expect(pixelsPerMeterForDpi(300)).toBe(11811));
  it('inserts a 300 DPI pHYs chunk without changing pixel data chunks', () => {
    const result = setPngDpi(minimalPng(), 300);
    expect(readPngDpi(result)).toBeCloseTo(300, 2);
    expect(new TextDecoder().decode(result).includes('pHYs')).toBe(true);
    expect(new TextDecoder().decode(result).includes('IEND')).toBe(true);
  });
});
