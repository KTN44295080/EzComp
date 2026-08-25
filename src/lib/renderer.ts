import { getAsset } from './assets';
import { applyAdjustmentsToImageData, hasPixelAdjustments } from './colorMath';
import type { CompositeDocument, RasterLayer } from '../types/editor';

interface CachedRaster {
  key: string;
  canvas: HTMLCanvasElement;
}

const rasterCache = new Map<string, CachedRaster>();
let checkerPatternCanvas: HTMLCanvasElement | undefined;

function adjustmentKey(layer: RasterLayer): string {
  const a = layer.adjustments;
  return [
    layer.assetId,
    a.exposure,
    a.contrast,
    a.saturation,
    a.temperature,
    a.tint,
    a.blur,
  ].join(':');
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function getAdjustedRaster(layer: RasterLayer): CanvasImageSource | undefined {
  const asset = getAsset(layer.assetId);
  if (!asset) {
    return undefined;
  }

  const hasColorAdjustments = hasPixelAdjustments(layer.adjustments);
  const hasBlur = layer.adjustments.blur > 0;
  if (!hasColorAdjustments && !hasBlur) {
    return asset.source;
  }

  const key = adjustmentKey(layer);
  const cached = rasterCache.get(layer.id);
  if (cached?.key === key) {
    return cached.canvas;
  }

  const working = createCanvas(layer.width, layer.height);
  const context = working.getContext('2d', { willReadFrequently: hasColorAdjustments });
  if (!context) {
    return asset.source;
  }
  context.drawImage(asset.source, 0, 0, layer.width, layer.height);

  if (hasColorAdjustments) {
    const imageData = context.getImageData(0, 0, working.width, working.height);
    context.putImageData(applyAdjustmentsToImageData(imageData, layer.adjustments), 0, 0);
  }

  let result = working;
  if (hasBlur) {
    const blurred = createCanvas(layer.width, layer.height);
    const blurContext = blurred.getContext('2d');
    if (blurContext) {
      blurContext.filter = `blur(${layer.adjustments.blur}px)`;
      blurContext.drawImage(working, 0, 0);
      result = blurred;
    }
  }

  rasterCache.set(layer.id, { key, canvas: result });
  return result;
}

export function clearRasterCache(): void {
  rasterCache.clear();
}

export function drawComposition(
  context: CanvasRenderingContext2D,
  documentModel: CompositeDocument,
  layers: RasterLayer[],
): void {
  if (documentModel.background !== 'transparent') {
    context.save();
    context.fillStyle = documentModel.background === 'black' ? '#000000' : '#ffffff';
    context.fillRect(0, 0, documentModel.width, documentModel.height);
    context.restore();
  }

  context.save();
  context.beginPath();
  context.rect(0, 0, documentModel.width, documentModel.height);
  context.clip();

  for (const layer of layers) {
    if (!layer.visible || layer.opacity <= 0) {
      continue;
    }
    const source = getAdjustedRaster(layer);
    if (!source) {
      continue;
    }
    const { transform } = layer;
    const centerX = transform.x + (layer.width * transform.scaleX) / 2;
    const centerY = transform.y + (layer.height * transform.scaleY) / 2;

    context.save();
    context.globalAlpha = layer.opacity / 100;
    context.globalCompositeOperation = layer.blendMode;
    context.translate(centerX, centerY);
    context.rotate((transform.rotation * Math.PI) / 180);
    context.scale(transform.scaleX, transform.scaleY);
    context.drawImage(source, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
    context.restore();
  }

  context.restore();
}

function getCheckerCanvas(): HTMLCanvasElement {
  if (checkerPatternCanvas) {
    return checkerPatternCanvas;
  }
  const canvas = createCanvas(32, 32);
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = '#f2f2f2';
    context.fillRect(0, 0, 32, 32);
    context.fillStyle = '#d8d8d8';
    context.fillRect(0, 0, 16, 16);
    context.fillRect(16, 16, 16, 16);
  }
  checkerPatternCanvas = canvas;
  return canvas;
}

export function drawDocumentSurface(
  context: CanvasRenderingContext2D,
  documentModel: CompositeDocument,
): void {
  context.save();
  context.shadowColor = 'rgba(0, 0, 0, 0.45)';
  context.shadowBlur = 24;
  context.shadowOffsetY = 8;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, documentModel.width, documentModel.height);
  context.restore();

  const pattern = context.createPattern(getCheckerCanvas(), 'repeat');
  if (pattern) {
    context.fillStyle = pattern;
    context.fillRect(0, 0, documentModel.width, documentModel.height);
  }
}

export function renderDocumentToCanvas(
  documentModel: CompositeDocument,
  layers: RasterLayer[],
): HTMLCanvasElement {
  const canvas = createCanvas(documentModel.width, documentModel.height);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D is unavailable in this browser.');
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawComposition(context, documentModel, layers);
  return canvas;
}

export async function exportPng(
  documentModel: CompositeDocument,
  layers: RasterLayer[],
): Promise<void> {
  const canvas = renderDocumentToCanvas(documentModel, layers);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) {
        resolve(value);
      } else {
        reject(new Error('PNG export failed.'));
      }
    }, 'image/png');
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${documentModel.name || 'ezcomp'}.png`;
  anchor.click();
  URL.revokeObjectURL(url);
}
