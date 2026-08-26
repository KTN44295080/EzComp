import { describe, expect, it } from 'vitest';
import { createRasterPdf, pdfPageSizePoints } from './pdfExport';

describe('raster PDF export', () => {
  it('converts pixel dimensions to a 300 DPI page without resampling', () => {
    expect(pdfPageSizePoints(3000, 1500)).toEqual({ width: 720, height: 360 });
  });

  it('writes a valid PDF with an RGB image and alpha soft mask', async () => {
    const bytes = await createRasterPdf({ width: 1, height: 1, data: new Uint8ClampedArray([12, 34, 56, 128]) });
    const ascii = new TextDecoder('latin1').decode(bytes);
    expect(ascii.startsWith('%PDF-1.4')).toBe(true);
    expect(ascii).toContain('/MediaBox [0 0 0.24 0.24]');
    expect(ascii).toContain('/SMask 6 0 R');
    expect(ascii).toContain('%%EOF');
  });
});

