export const EXPORT_DPI = 300;

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const readUint32 = (bytes: Uint8Array, offset: number): number => new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
const writeUint32 = (bytes: Uint8Array, offset: number, value: number): void => new DataView(bytes.buffer, bytes.byteOffset + offset, 4).setUint32(0, value >>> 0);
const chunkName = (bytes: Uint8Array, offset: number): string => String.fromCharCode(bytes[offset] ?? 0, bytes[offset + 1] ?? 0, bytes[offset + 2] ?? 0, bytes[offset + 3] ?? 0);

export const pixelsPerMeterForDpi = (dpi: number): number => Math.max(1, Math.round(dpi / .0254));

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of bytes) { crc ^= value; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}

function physicalPixelDimensions(dpi: number): Uint8Array {
  const data = new Uint8Array(9), pixelsPerMeter = pixelsPerMeterForDpi(dpi); writeUint32(data, 0, pixelsPerMeter); writeUint32(data, 4, pixelsPerMeter); data[8] = 1;
  const type = new Uint8Array([112, 72, 89, 115]), chunk = new Uint8Array(12 + data.length); writeUint32(chunk, 0, data.length); chunk.set(type, 4); chunk.set(data, 8);
  const crcInput = new Uint8Array(type.length + data.length); crcInput.set(type); crcInput.set(data, type.length); writeUint32(chunk, 8 + data.length, crc32(crcInput)); return chunk;
}

export function setPngDpi(bytes: Uint8Array, dpi = EXPORT_DPI): Uint8Array {
  if (bytes.length < PNG_SIGNATURE.length || PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) throw new Error('The browser returned an invalid PNG.');
  const parts: Uint8Array[] = [bytes.slice(0, 8)], resolution = physicalPixelDimensions(dpi); let offset = 8, inserted = false;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset), end = offset + 12 + length; if (end > bytes.length) throw new Error('The browser returned a truncated PNG.');
    const type = chunkName(bytes, offset + 4); if (type !== 'pHYs') parts.push(bytes.slice(offset, end));
    if (type === 'IHDR' && !inserted) { parts.push(resolution); inserted = true; }
    offset = end; if (type === 'IEND') break;
  }
  if (!inserted) throw new Error('The PNG header is missing.');
  const size = parts.reduce((sum, part) => sum + part.length, 0), result = new Uint8Array(size); let cursor = 0; for (const part of parts) { result.set(part, cursor); cursor += part.length; } return result;
}

export function readPngDpi(bytes: Uint8Array): number | null {
  let offset = 8;
  while (offset + 12 <= bytes.length) { const length = readUint32(bytes, offset), end = offset + 12 + length; if (end > bytes.length) return null; if (chunkName(bytes, offset + 4) === 'pHYs' && length === 9 && bytes[offset + 16] === 1) return readUint32(bytes, offset + 8) * .0254; offset = end; }
  return null;
}

export async function withPngDpi(blob: Blob, dpi = EXPORT_DPI): Promise<Blob> {
  const bytes = setPngDpi(new Uint8Array(await blob.arrayBuffer()), dpi), buffer = new ArrayBuffer(bytes.byteLength); new Uint8Array(buffer).set(bytes); return new Blob([buffer], { type: 'image/png' });
}
