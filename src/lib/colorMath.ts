import type { LayerAdjustments } from '../types/editor';
export interface Rgb { r: number; g: number; b: number }
const clampByte = (value: number): number => Math.min(255, Math.max(0, value));
export function adjustRgb(rgb: Rgb, a: LayerAdjustments): Rgb {
  const exposure = 2 ** a.exposure, contrast = 1 + a.contrast / 100, saturation = 1 + a.saturation / 100;
  let r = rgb.r * exposure, g = rgb.g * exposure, b = rgb.b * exposure;
  r = (r - 127.5) * contrast + 127.5; g = (g - 127.5) * contrast + 127.5; b = (b - 127.5) * contrast + 127.5;
  const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
  r = luminance + (r - luminance) * saturation; g = luminance + (g - luminance) * saturation; b = luminance + (b - luminance) * saturation;
  const temperature = a.temperature / 100 * 34, tint = a.tint / 100 * 26;
  r += temperature - tint * 0.35; g += tint; b -= temperature + tint * 0.35;
  return { r: clampByte(r), g: clampByte(g), b: clampByte(b) };
}
export function applyAdjustmentsToImageData(imageData: ImageData, adjustments: LayerAdjustments): ImageData {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) === 0) continue;
    const adjusted = adjustRgb({ r: data[i] ?? 0, g: data[i + 1] ?? 0, b: data[i + 2] ?? 0 }, adjustments);
    data[i] = adjusted.r; data[i + 1] = adjusted.g; data[i + 2] = adjusted.b;
  }
  return imageData;
}
export function hasPixelAdjustments(a: LayerAdjustments): boolean {
  return a.exposure !== 0 || a.contrast !== 0 || a.saturation !== 0 || a.temperature !== 0 || a.tint !== 0;
}
