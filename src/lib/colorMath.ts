import type { LayerAdjustments } from '../types/editor';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const clampByte = (value: number): number => Math.min(255, Math.max(0, value));

export function adjustRgb(rgb: Rgb, adjustments: LayerAdjustments): Rgb {
  const exposure = 2 ** adjustments.exposure;
  const contrast = 1 + adjustments.contrast / 100;
  const saturation = 1 + adjustments.saturation / 100;
  const temperature = adjustments.temperature / 100;
  const tint = adjustments.tint / 100;

  let r = rgb.r * exposure;
  let g = rgb.g * exposure;
  let b = rgb.b * exposure;

  r = (r - 127.5) * contrast + 127.5;
  g = (g - 127.5) * contrast + 127.5;
  b = (b - 127.5) * contrast + 127.5;

  const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
  r = luminance + (r - luminance) * saturation;
  g = luminance + (g - luminance) * saturation;
  b = luminance + (b - luminance) * saturation;

  const temperatureShift = temperature * 34;
  r += temperatureShift;
  b -= temperatureShift;

  const tintShift = tint * 26;
  g += tintShift;
  r -= tintShift * 0.35;
  b -= tintShift * 0.35;

  return {
    r: clampByte(r),
    g: clampByte(g),
    b: clampByte(b),
  };
}

export function applyAdjustmentsToImageData(
  imageData: ImageData,
  adjustments: LayerAdjustments,
): ImageData {
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] ?? 0;
    if (alpha === 0) {
      continue;
    }

    const adjusted = adjustRgb(
      {
        r: data[index] ?? 0,
        g: data[index + 1] ?? 0,
        b: data[index + 2] ?? 0,
      },
      adjustments,
    );

    data[index] = adjusted.r;
    data[index + 1] = adjusted.g;
    data[index + 2] = adjusted.b;
  }

  return imageData;
}

export function hasPixelAdjustments(adjustments: LayerAdjustments): boolean {
  return (
    adjustments.exposure !== 0 ||
    adjustments.contrast !== 0 ||
    adjustments.saturation !== 0 ||
    adjustments.temperature !== 0 ||
    adjustments.tint !== 0
  );
}
