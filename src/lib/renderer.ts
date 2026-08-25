import { getAsset } from './assets';
import { applyAdjustmentsToImageData, hasPixelAdjustments } from './colorMath';
import type { CompositeDocument, RasterLayer } from '../types/editor';

const rasterCache = new Map<string, { key: string; canvas: HTMLCanvasElement }>();
let checker: HTMLCanvasElement | undefined;
const createCanvas = (w: number, h: number) => { const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(w)); canvas.height = Math.max(1, Math.round(h)); return canvas; };
function adjustedRaster(layer: RasterLayer): CanvasImageSource | undefined {
  const asset = getAsset(layer.assetId); if (!asset) return undefined;
  const color = hasPixelAdjustments(layer.adjustments), blur = layer.adjustments.blur > 0;
  if (!color && !blur) return asset.source;
  const key = `${layer.assetId}:${Object.values(layer.adjustments).join(':')}`, cached = rasterCache.get(layer.id);
  if (cached?.key === key) return cached.canvas;
  const working = createCanvas(layer.width, layer.height), context = working.getContext('2d', { willReadFrequently: color });
  if (!context) return asset.source; context.drawImage(asset.source, 0, 0, layer.width, layer.height);
  if (color) { const data = context.getImageData(0, 0, working.width, working.height); context.putImageData(applyAdjustmentsToImageData(data, layer.adjustments), 0, 0); }
  let result = working;
  if (blur) { const blurred = createCanvas(layer.width, layer.height), blurContext = blurred.getContext('2d'); if (blurContext) { blurContext.filter = `blur(${layer.adjustments.blur}px)`; blurContext.drawImage(working, 0, 0); result = blurred; } }
  rasterCache.set(layer.id, { key, canvas: result }); return result;
}
export function clearRasterCache(): void { rasterCache.clear(); }
export function drawComposition(context: CanvasRenderingContext2D, documentModel: CompositeDocument, layers: RasterLayer[]): void {
  if (documentModel.background !== 'transparent') { context.save(); context.fillStyle = documentModel.background; context.fillRect(0, 0, documentModel.width, documentModel.height); context.restore(); }
  context.save(); context.beginPath(); context.rect(0, 0, documentModel.width, documentModel.height); context.clip();
  for (const layer of layers) {
    if (!layer.visible || layer.opacity <= 0) continue; const source = adjustedRaster(layer); if (!source) continue;
    const { transform } = layer, centerX = transform.x + layer.width * transform.scaleX / 2, centerY = transform.y + layer.height * transform.scaleY / 2;
    context.save(); context.globalAlpha = layer.opacity / 100; context.globalCompositeOperation = layer.blendMode; context.translate(centerX, centerY); context.rotate(transform.rotation * Math.PI / 180); context.scale(transform.scaleX, transform.scaleY); context.drawImage(source, -layer.width / 2, -layer.height / 2, layer.width, layer.height); context.restore();
  }
  context.restore();
}
function checkerCanvas(): HTMLCanvasElement { if (checker) return checker; checker = createCanvas(32, 32); const c = checker.getContext('2d'); if (c) { c.fillStyle = '#eceef2'; c.fillRect(0, 0, 32, 32); c.fillStyle = '#d3d6dc'; c.fillRect(0, 0, 16, 16); c.fillRect(16, 16, 16, 16); } return checker; }
export function drawDocumentSurface(context: CanvasRenderingContext2D, documentModel: CompositeDocument): void { context.save(); context.shadowColor = 'rgba(0,0,0,.55)'; context.shadowBlur = 28; context.shadowOffsetY = 10; context.fillStyle = '#fff'; context.fillRect(0, 0, documentModel.width, documentModel.height); context.restore(); const pattern = context.createPattern(checkerCanvas(), 'repeat'); if (pattern) { context.fillStyle = pattern; context.fillRect(0, 0, documentModel.width, documentModel.height); } }
export function renderDocumentToCanvas(documentModel: CompositeDocument, layers: RasterLayer[]): HTMLCanvasElement { const canvas = createCanvas(documentModel.width, documentModel.height), context = canvas.getContext('2d'); if (!context) throw new Error('Canvas 2D is unavailable in this browser.'); drawComposition(context, documentModel, layers); return canvas; }
export function pngFileName(name: string): string { return `${name.trim() || 'ezcomp'}.png`; }
export async function exportPng(documentModel: CompositeDocument, layers: RasterLayer[]): Promise<void> { const canvas = renderDocumentToCanvas(documentModel, layers); const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG export failed.')), 'image/png')); const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = pngFileName(documentModel.name); anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }
