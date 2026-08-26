import { getAsset } from './assets';
import { applyAdjustmentsToImageData, hasPixelAdjustments } from './colorMath';
import type { CompositeDocument, RasterLayer } from '../types/editor';

const rasterCache = new Map<string, { key: string; canvas: HTMLCanvasElement }>();
const shadowCache = new Map<string, HTMLCanvasElement>();
const wrapCache = new Map<string, HTMLCanvasElement>();
const boundsCache = new Map<string, { left: number; top: number; right: number; bottom: number }>();
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
function shadowRaster(layer: RasterLayer): HTMLCanvasElement | undefined {
  const cached = shadowCache.get(layer.assetId); if (cached) return cached;
  const asset = getAsset(layer.assetId); if (!asset) return undefined;
  const scale = Math.min(1, 1024 / Math.max(layer.width, layer.height)), canvas = createCanvas(layer.width * scale, layer.height * scale), context = canvas.getContext('2d'); if (!context) return undefined;
  context.drawImage(asset.source, 0, 0, canvas.width, canvas.height); context.globalCompositeOperation = 'source-in'; context.fillStyle = '#000'; context.fillRect(0, 0, canvas.width, canvas.height);
  shadowCache.set(layer.assetId, canvas); return canvas;
}
function wrapRaster(layer: RasterLayer): HTMLCanvasElement | undefined {
  const key = `${layer.assetId}:${layer.adjustments.environmentColor}`, cached = wrapCache.get(key); if (cached) return cached;
  const mask = shadowRaster(layer); if (!mask) return undefined;
  const canvas = createCanvas(mask.width, mask.height), context = canvas.getContext('2d'); if (!context) return undefined;
  context.drawImage(mask, 0, 0); context.globalCompositeOperation = 'source-in'; context.fillStyle = layer.adjustments.environmentColor; context.fillRect(0, 0, canvas.width, canvas.height);
  wrapCache.set(key, canvas); return canvas;
}
function visibleBounds(layer: RasterLayer): { left: number; top: number; right: number; bottom: number } | undefined {
  const cached = boundsCache.get(layer.assetId); if (cached) return cached;
  const raster = shadowRaster(layer), context = raster?.getContext('2d', { willReadFrequently: true }); if (!raster || !context) return undefined;
  const data = context.getImageData(0, 0, raster.width, raster.height).data;
  let minX = raster.width, minY = raster.height, maxX = -1, maxY = -1;
  for (let y = 0; y < raster.height; y += 1) for (let x = 0; x < raster.width; x += 1) if ((data[(y * raster.width + x) * 4 + 3] ?? 0) > 16) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  if (maxX < minX || maxY < minY) return undefined;
  const scaleX = layer.width / raster.width, scaleY = layer.height / raster.height;
  const bounds = { left: minX * scaleX, top: minY * scaleY, right: (maxX + 1) * scaleX, bottom: (maxY + 1) * scaleY };
  boundsCache.set(layer.assetId, bounds); return bounds;
}
export function clearRasterCache(): void { rasterCache.clear(); shadowCache.clear(); wrapCache.clear(); boundsCache.clear(); }
export function isLayerEffectivelyVisible(layer: RasterLayer, layers: RasterLayer[]): boolean {
  if (!layer.visible) return false;
  const byId = new Map(layers.map((candidate) => [candidate.id, candidate]));
  const visited = new Set<string>();
  let parentId = layer.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    if (!parent.visible) return false;
    parentId = parent.parentId;
  }
  return true;
}
export function drawComposition(context: CanvasRenderingContext2D, documentModel: CompositeDocument, layers: RasterLayer[]): void {
  if (documentModel.background !== 'transparent') { context.save(); context.fillStyle = documentModel.background; context.fillRect(0, 0, documentModel.width, documentModel.height); context.restore(); }
  context.save(); context.beginPath(); context.rect(0, 0, documentModel.width, documentModel.height); context.clip();
  for (const layer of layers) {
    if (layer.kind === 'group' || !isLayerEffectivelyVisible(layer, layers) || layer.opacity <= 0) continue; const source = adjustedRaster(layer); if (!source) continue;
    const { transform } = layer, centerX = transform.x + layer.width * transform.scaleX / 2, centerY = transform.y + layer.height * transform.scaleY / 2;
    if (layer.adjustments.shadowOpacity > 0) {
      const shadow = shadowRaster(layer), bounds = visibleBounds(layer);
      if (shadow) { context.save(); context.globalAlpha = layer.opacity / 100 * layer.adjustments.shadowOpacity / 100 * .28; context.globalCompositeOperation = 'multiply'; context.filter = `blur(${layer.adjustments.shadowBlur}px)`; context.translate(centerX + layer.adjustments.shadowOffsetX, centerY + layer.adjustments.shadowOffsetY); context.rotate(transform.rotation * Math.PI / 180); context.scale(transform.scaleX, transform.scaleY); context.drawImage(shadow, -layer.width / 2, -layer.height / 2, layer.width, layer.height); context.restore(); }
      if (bounds) {
        const width = bounds.right - bounds.left, height = bounds.bottom - bounds.top, localX = (bounds.left + bounds.right) / 2 - layer.width / 2, localY = bounds.bottom - layer.height / 2;
        context.save(); context.globalAlpha = layer.opacity / 100 * layer.adjustments.shadowOpacity / 100 * .72; context.globalCompositeOperation = 'multiply'; context.filter = `blur(${Math.max(2, layer.adjustments.shadowBlur * .42)}px)`; context.translate(centerX + layer.adjustments.shadowOffsetX * .2, centerY + layer.adjustments.shadowOffsetY * .3); context.rotate(transform.rotation * Math.PI / 180); context.scale(transform.scaleX, transform.scaleY); context.beginPath(); context.ellipse(localX, localY, Math.max(8, width * .2), Math.max(4, height * .018), 0, 0, Math.PI * 2); context.fillStyle = 'rgba(5, 11, 22, .92)'; context.fill(); context.restore();
      }
    }
    if (layer.adjustments.lightWrap > 0) {
      const wrap = wrapRaster(layer); if (wrap) { context.save(); context.globalAlpha = layer.opacity / 100 * layer.adjustments.lightWrap / 100 * .38; context.globalCompositeOperation = 'screen'; context.filter = `blur(${layer.adjustments.lightWrapRadius}px)`; context.translate(centerX, centerY); context.rotate(transform.rotation * Math.PI / 180); context.scale(transform.scaleX, transform.scaleY); context.drawImage(wrap, -layer.width / 2, -layer.height / 2, layer.width, layer.height); context.restore(); }
    }
    context.save(); context.globalAlpha = layer.opacity / 100; context.globalCompositeOperation = layer.blendMode; context.translate(centerX, centerY); context.rotate(transform.rotation * Math.PI / 180); context.scale(transform.scaleX, transform.scaleY); context.drawImage(source, -layer.width / 2, -layer.height / 2, layer.width, layer.height); context.restore();
  }
  context.restore();
}
function checkerCanvas(): HTMLCanvasElement { if (checker) return checker; checker = createCanvas(32, 32); const c = checker.getContext('2d'); if (c) { c.fillStyle = '#eceef2'; c.fillRect(0, 0, 32, 32); c.fillStyle = '#d3d6dc'; c.fillRect(0, 0, 16, 16); c.fillRect(16, 16, 16, 16); } return checker; }
export function drawDocumentSurface(context: CanvasRenderingContext2D, documentModel: CompositeDocument): void { context.save(); context.shadowColor = 'rgba(0,0,0,.55)'; context.shadowBlur = 28; context.shadowOffsetY = 10; context.fillStyle = '#fff'; context.fillRect(0, 0, documentModel.width, documentModel.height); context.restore(); const pattern = context.createPattern(checkerCanvas(), 'repeat'); if (pattern) { context.fillStyle = pattern; context.fillRect(0, 0, documentModel.width, documentModel.height); } }
export function renderDocumentToCanvas(documentModel: CompositeDocument, layers: RasterLayer[]): HTMLCanvasElement { const canvas = createCanvas(documentModel.width, documentModel.height), context = canvas.getContext('2d'); if (!context) throw new Error('Canvas 2D is unavailable in this browser.'); drawComposition(context, documentModel, layers); return canvas; }
export function pngFileName(name: string): string { return `${name.trim() || 'ezcomp'}.png`; }
export async function exportPng(documentModel: CompositeDocument, layers: RasterLayer[]): Promise<void> { const canvas = renderDocumentToCanvas(documentModel, layers); const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG export failed.')), 'image/png')); const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = pngFileName(documentModel.name); anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }
