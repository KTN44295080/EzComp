export const PDF_EXPORT_DPI = 300;

export interface RasterPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const encoder = new TextEncoder();
const text = (value: string): Uint8Array => encoder.encode(value);

function concatenate(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
  return output;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return bytes;
  const buffer = new ArrayBuffer(bytes.byteLength); new Uint8Array(buffer).set(bytes);
  const stream = new Blob([buffer]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const number = (value: number): string => Number(value.toFixed(4)).toString();

export function pdfPageSizePoints(width: number, height: number, dpi = PDF_EXPORT_DPI): { width: number; height: number } {
  if (width < 1 || height < 1 || dpi <= 0) throw new Error('PDF dimensions and DPI must be positive.');
  return { width: width * 72 / dpi, height: height * 72 / dpi };
}

function streamObject(dictionary: string, bytes: Uint8Array, compressed = false): Uint8Array {
  const filter = compressed ? ' /Filter /FlateDecode' : '';
  return concatenate([text(`<< ${dictionary}${filter} /Length ${bytes.byteLength} >>\nstream\n`), bytes, text('\nendstream')]);
}

export async function createRasterPdf(raster: RasterPixels, dpi = PDF_EXPORT_DPI): Promise<Uint8Array> {
  const { width, height, data } = raster;
  if (data.byteLength !== width * height * 4) throw new Error('Invalid RGBA pixel buffer.');
  const rgb = new Uint8Array(width * height * 3), alpha = new Uint8Array(width * height);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const rgbaOffset = pixel * 4, rgbOffset = pixel * 3;
    rgb[rgbOffset] = data[rgbaOffset] ?? 0; rgb[rgbOffset + 1] = data[rgbaOffset + 1] ?? 0; rgb[rgbOffset + 2] = data[rgbaOffset + 2] ?? 0; alpha[pixel] = data[rgbaOffset + 3] ?? 0;
  }
  const canCompress = typeof CompressionStream !== 'undefined';
  const [rgbStream, alphaStream] = await Promise.all([deflate(rgb), deflate(alpha)]);
  const page = pdfPageSizePoints(width, height, dpi), pageWidth = number(page.width), pageHeight = number(page.height);
  const content = text(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`);
  const objects = [
    text('<< /Type /Catalog /Pages 2 0 R >>'),
    text('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    text(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`),
    streamObject('', content),
    streamObject(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask 6 0 R`, rgbStream, canCompress),
    streamObject(`/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8`, alphaStream, canCompress),
    text('<< /Creator (EzComp) /Producer (EzComp browser compositor) >>'),
  ];
  const chunks: Uint8Array[] = [text('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')], offsets = [0];
  let cursor = chunks[0]!.byteLength;
  objects.forEach((object, index) => { offsets.push(cursor); const wrapped = concatenate([text(`${index + 1} 0 obj\n`), object, text('\nendobj\n')]); chunks.push(wrapped); cursor += wrapped.byteLength; });
  const xrefOffset = cursor, xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n', ...offsets.slice(1).map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`), `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`].join('');
  chunks.push(text(xref)); return concatenate(chunks);
}

