import type { LayerAdjustments } from '../types/editor';

export interface Rgb { r: number; g: number; b: number }

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const clampByte = (value: number): number => clamp(value, 0, 255);
const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = clamp((value - edge0) / Math.max(.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

function parseHexColor(value: string, fallback: Rgb): Rgb {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match?.[1]) return fallback;
  const number = Number.parseInt(match[1], 16);
  return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
}

function colorize(rgb: Rgb, color: Rgb, amount: number, brighten = 0): Rgb {
  if (amount <= 0) return rgb;
  const colorLuminance = color.r * .2126 + color.g * .7152 + color.b * .0722;
  const strength = clamp(amount, 0, 1);
  return {
    r: rgb.r + (color.r - colorLuminance) * strength + (255 - rgb.r) * brighten * strength,
    g: rgb.g + (color.g - colorLuminance) * strength + (255 - rgb.g) * brighten * strength,
    b: rgb.b + (color.b - colorLuminance) * strength + (255 - rgb.b) * brighten * strength,
  };
}

function directionalLightFactor(x: number, y: number, width: number, height: number, angle: number, softness: number): number {
  const normalizedX = width <= 1 ? 0 : x / (width - 1) * 2 - 1;
  const normalizedY = height <= 1 ? 0 : y / (height - 1) * 2 - 1;
  const radians = angle * Math.PI / 180;
  const projection = (normalizedX * Math.cos(radians) + normalizedY * Math.sin(radians)) / Math.SQRT2;
  const feather = .04 + clamp(softness, 0, 100) / 100 * .92;
  return smoothstep(-feather, feather, projection);
}

function adjustRgbInternal(rgb: Rgb, a: LayerAdjustments, keyLightMask: number, highlightColor: Rgb, shadowColor: Rgb): Rgb {
  const exposure = 2 ** a.exposure, contrast = 1 + a.contrast / 100, saturation = 1 + a.saturation / 100;
  let r = rgb.r * exposure, g = rgb.g * exposure, b = rgb.b * exposure;
  r = (r - 127.5) * contrast + 127.5; g = (g - 127.5) * contrast + 127.5; b = (b - 127.5) * contrast + 127.5;
  const luminance = r * .2126 + g * .7152 + b * .0722;
  r = luminance + (r - luminance) * saturation; g = luminance + (g - luminance) * saturation; b = luminance + (b - luminance) * saturation;
  const temperature = a.temperature / 100 * 34, tint = a.tint / 100 * 26;
  r += temperature - tint * .35; g += tint; b -= temperature + tint * .35;
  const normalizedLuminance = clamp((r * .2126 + g * .7152 + b * .0722) / 255, 0, 1);
  const tonalDelta = (a.shadows / 100 * 58 * (1 - normalizedLuminance) ** 2) + (a.highlights / 100 * 58 * normalizedLuminance ** 2);
  r += tonalDelta; g += tonalDelta; b += tonalDelta;

  const balancePoint = clamp(.58 - a.lightingBalance / 350, .32, .82);
  const shadowWeight = 1 - smoothstep(balancePoint - .24, balancePoint + .02, normalizedLuminance);
  const highlightWeight = smoothstep(balancePoint - .06, balancePoint + .26, normalizedLuminance);
  ({ r, g, b } = colorize({ r, g, b }, shadowColor, a.shadowTint / 100 * shadowWeight * .45));
  ({ r, g, b } = colorize({ r, g, b }, highlightColor, a.highlightTint / 100 * highlightWeight * .48));
  const directionalAmount = a.keyLightStrength / 100 * keyLightMask * (.05 + highlightWeight * .95);
  ({ r, g, b } = colorize({ r, g, b }, highlightColor, directionalAmount * .5, .08));
  return { r: clampByte(r), g: clampByte(g), b: clampByte(b) };
}

export function adjustRgb(rgb: Rgb, adjustments: LayerAdjustments, keyLightMask = 0): Rgb {
  return adjustRgbInternal(rgb, adjustments, keyLightMask, parseHexColor(adjustments.highlightColor, { r: 255, g: 145, b: 200 }), parseHexColor(adjustments.shadowColor, { r: 101, g: 185, b: 255 }));
}

export function applyAdjustmentsToImageData(imageData: ImageData, adjustments: LayerAdjustments): ImageData {
  const data = imageData.data, width = imageData.width, height = imageData.height;
  const highlightColor = parseHexColor(adjustments.highlightColor, { r: 255, g: 145, b: 200 }), shadowColor = parseHexColor(adjustments.shadowColor, { r: 101, g: 185, b: 255 });
  const hasDirectionalLight = adjustments.keyLightStrength > 0;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) === 0) continue;
    const pixel = i / 4, x = pixel % width, y = Math.floor(pixel / width);
    const keyLightMask = hasDirectionalLight ? directionalLightFactor(x, y, width, height, adjustments.keyLightAngle, adjustments.keyLightSoftness) : 0;
    const adjusted = adjustRgbInternal({ r: data[i] ?? 0, g: data[i + 1] ?? 0, b: data[i + 2] ?? 0 }, adjustments, keyLightMask, highlightColor, shadowColor);
    data[i] = adjusted.r; data[i + 1] = adjusted.g; data[i + 2] = adjusted.b;
  }
  return imageData;
}

export function hasPixelAdjustments(a: LayerAdjustments): boolean {
  return a.exposure !== 0 || a.contrast !== 0 || a.saturation !== 0 || a.temperature !== 0 || a.tint !== 0 || a.shadows !== 0 || a.highlights !== 0 || a.highlightTint !== 0 || a.shadowTint !== 0 || a.keyLightStrength !== 0;
}
