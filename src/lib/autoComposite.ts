import { getAsset } from './assets';
import { drawComposition } from './renderer';
import { defaultAdjustments, type CompositeDocument, type LayerAdjustments, type RasterLayer } from '../types/editor';

export const autoCompositePresets = ['balanced', 'cinematic', 'soft', 'night', 'vivid'] as const;
export type AutoCompositePreset = (typeof autoCompositePresets)[number];
export type AutoCompositeScope = 'scene' | 'local';
export const autoCompositeLabels: Record<AutoCompositePreset, string> = { balanced: 'Balanced', cinematic: 'Cinematic', soft: 'Soft', night: 'Night', vivid: 'Vivid' };

export interface ImageStats {
  luminance: number;
  contrast: number;
  saturation: number;
  warmth: number;
  tint: number;
  low: number;
  high: number;
  pixels: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function imageStats(imageData: ImageData): ImageStats {
  const histogram = new Float64Array(256);
  let pixels = 0, sumLuminance = 0, sumLuminanceSquared = 0, sumSaturation = 0;
  let neutralPixels = 0, neutralR = 0, neutralG = 0, neutralB = 0;
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = (data[i + 3] ?? 0) / 255; if (alpha < .08) continue;
    const r = (data[i] ?? 0) / 255, g = (data[i + 1] ?? 0) / 255, b = (data[i + 2] ?? 0) / 255;
    const luminance = r * .2126 + g * .7152 + b * .0722, max = Math.max(r, g, b), min = Math.min(r, g, b), saturation = max <= .001 ? 0 : (max - min) / max;
    const neutralWeight = alpha * (.035 + (1 - saturation) ** 4) * (.55 + luminance * .45);
    pixels += alpha; sumLuminance += luminance * alpha; sumLuminanceSquared += luminance * luminance * alpha; sumSaturation += saturation * alpha;
    neutralPixels += neutralWeight; neutralR += r * neutralWeight; neutralG += g * neutralWeight; neutralB += b * neutralWeight;
    histogram[Math.round(luminance * 255)] = (histogram[Math.round(luminance * 255)] ?? 0) + alpha;
  }
  if (pixels < 1) throw new Error('The selected layer or reference has no visible pixels.');
  const luminance = sumLuminance / pixels, channelR = neutralR / Math.max(.001, neutralPixels), channelG = neutralG / Math.max(.001, neutralPixels), channelB = neutralB / Math.max(.001, neutralPixels);
  const percentile = (target: number): number => { let cumulative = 0; for (let i = 0; i < histogram.length; i += 1) { cumulative += histogram[i] ?? 0; if (cumulative >= pixels * target) return i / 255; } return 1; };
  return { luminance, contrast: Math.sqrt(Math.max(0, sumLuminanceSquared / pixels - luminance * luminance)), saturation: sumSaturation / pixels, warmth: channelR - channelB, tint: channelG - (channelR + channelB) / 2, low: percentile(.2), high: percentile(.8), pixels };
}

export function deriveAutoAdjustments(foreground: ImageStats, reference: ImageStats, preset: AutoCompositePreset): LayerAdjustments {
  const settings = {
    balanced: { strength: .9, exposure: 0, contrast: 0, saturation: 0, temperature: 0, shadow: 24 },
    cinematic: { strength: .82, exposure: -.08, contrast: 14, saturation: -8, temperature: -5, shadow: 30 },
    soft: { strength: .72, exposure: .04, contrast: -12, saturation: -7, temperature: 2, shadow: 16 },
    night: { strength: .96, exposure: -.42, contrast: 8, saturation: -14, temperature: -22, shadow: 34 },
    vivid: { strength: .75, exposure: 0, contrast: 10, saturation: 16, temperature: 3, shadow: 22 },
  }[preset];
  const matchExposure = Math.log2((reference.luminance + .018) / (foreground.luminance + .018));
  const exposure = clamp(matchExposure * settings.strength + settings.exposure, -2.5, 2.5), exposureGain = 2 ** exposure;
  const contrastRatio = reference.contrast / Math.max(.025, foreground.contrast);
  const saturationRatio = reference.saturation / Math.max(.035, foreground.saturation);
  const adjustedLow = clamp(foreground.low * exposureGain, 0, 1), adjustedHigh = clamp(foreground.high * exposureGain, 0, 1);
  return {
    ...defaultAdjustments(),
    exposure,
    contrast: clamp((contrastRatio - 1) * 58 * settings.strength + settings.contrast, -55, 55),
    saturation: clamp((saturationRatio - 1) * 62 * settings.strength + settings.saturation, -60, 60),
    temperature: clamp((reference.warmth - foreground.warmth) * 190 * settings.strength + settings.temperature, -70, 70),
    tint: clamp((reference.tint - foreground.tint) * 210 * settings.strength, -65, 65),
    shadows: clamp((reference.low - adjustedLow) * 145 * settings.strength, -65, 65),
    highlights: clamp((reference.high - adjustedHigh) * 120 * settings.strength, -65, 65),
    blur: preset === 'soft' ? .35 : preset === 'night' ? .2 : 0,
    shadowOpacity: settings.shadow,
  };
}

function scaledCanvas(width: number, height: number, maxSize = 480): { canvas: HTMLCanvasElement; scale: number } {
  const scale = Math.min(1, maxSize / Math.max(width, height)), canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale)); return { canvas, scale };
}

function statsForLayer(layer: RasterLayer): ImageStats {
  const asset = getAsset(layer.assetId); if (!asset) throw new Error('The selected layer image is not available in browser memory.');
  const { canvas } = scaledCanvas(layer.width, layer.height), context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) throw new Error('Canvas analysis is unavailable.');
  context.drawImage(asset.source, 0, 0, canvas.width, canvas.height); return imageStats(context.getImageData(0, 0, canvas.width, canvas.height));
}

function referenceStats(documentModel: CompositeDocument, layers: RasterLayer[], selected: RasterLayer, referenceId: string, scope: AutoCompositeScope): ImageStats {
  const selectedIndex = layers.findIndex((layer) => layer.id === selected.id);
  const allowed = new Set(referenceId === 'below' ? layers.slice(0, selectedIndex).filter((layer) => layer.kind !== 'group').map((layer) => layer.id) : [referenceId]);
  const referenceLayers = layers.filter((layer) => layer.kind === 'group' || allowed.has(layer.id));
  if (!referenceLayers.some((layer) => layer.kind !== 'group')) throw new Error('Place a visible background below this layer or choose a reference layer.');
  const { canvas, scale } = scaledCanvas(documentModel.width, documentModel.height), context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) throw new Error('Canvas analysis is unavailable.');
  context.scale(scale, scale); drawComposition(context, documentModel, referenceLayers); context.setTransform(1, 0, 0, 1, 0, 0);
  const scene = imageStats(context.getImageData(0, 0, canvas.width, canvas.height));
  if (scope === 'scene') return scene;
  const padding = Math.max(12, Math.round(Math.min(canvas.width, canvas.height) * .04)), x = Math.floor(selected.transform.x * scale) - padding, y = Math.floor(selected.transform.y * scale) - padding;
  const width = Math.ceil(selected.width * Math.abs(selected.transform.scaleX) * scale) + padding * 2, height = Math.ceil(selected.height * Math.abs(selected.transform.scaleY) * scale) + padding * 2;
  const left = clamp(x, 0, canvas.width - 1), top = clamp(y, 0, canvas.height - 1), right = clamp(x + width, left + 1, canvas.width), bottom = clamp(y + height, top + 1, canvas.height);
  try { const local = imageStats(context.getImageData(left, top, right - left, bottom - top)); if (local.pixels > 24) return local; } catch { /* fall back to the complete reference */ }
  return scene;
}

export function autoCompositeLayer(documentModel: CompositeDocument, layers: RasterLayer[], selected: RasterLayer, preset: AutoCompositePreset, referenceId = 'below', scope: AutoCompositeScope = 'scene'): LayerAdjustments {
  if (selected.kind === 'group') throw new Error('Choose a raster layer to auto composite.');
  const adjustments = deriveAutoAdjustments(statsForLayer(selected), referenceStats(documentModel, layers, selected, referenceId, scope), preset);
  const subjectSize = Math.max(1, Math.min(selected.width * Math.abs(selected.transform.scaleX), selected.height * Math.abs(selected.transform.scaleY)));
  adjustments.shadowBlur = clamp(subjectSize * .012, 6, 54); adjustments.shadowOffsetY = clamp(subjectSize * .009, 4, 38); adjustments.shadowOffsetX = 0;
  return adjustments;
}
