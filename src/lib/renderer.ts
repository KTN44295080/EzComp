import { getAsset } from './assets';
import { applyAdjustmentsToImageData, hasPixelAdjustments } from './colorMath';
import { defaultDepthOfField, defaultFinish, type CompositeDocument, type CompositeFinish, type RasterLayer } from '../types/editor';

const rasterCache = new Map<string, { key: string; canvas: HTMLCanvasElement }>();
const shadowCache = new Map<string, HTMLCanvasElement>();
const wrapCache = new Map<string, HTMLCanvasElement>();
const depthBlurCache = new Map<string, { key: string; canvas: HTMLCanvasElement }>();
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
function depthAwareRaster(layer: RasterLayer, source: CanvasImageSource): CanvasImageSource {
  const settings = { ...defaultDepthOfField(), ...layer.depthOfField };
  if (!settings.enabled || !settings.depthMapAssetId || settings.maxBlur <= 0) return source;
  const depth = getAsset(settings.depthMapAssetId); if (!depth) return source;
  const key = `${layer.assetId}:${Object.values(layer.adjustments).join(':')}:${Object.values(settings).join(':')}`, cached = depthBlurCache.get(layer.id);
  if (cached?.key === key) return cached.canvas;
  const renderScale = Math.min(1, 2560 / Math.max(layer.width, layer.height)), width = Math.max(1, Math.round(layer.width * renderScale)), height = Math.max(1, Math.round(layer.height * renderScale));
  const base = createCanvas(width, height), baseContext = base.getContext('2d'); if (!baseContext) return source;
  baseContext.imageSmoothingEnabled = true; baseContext.imageSmoothingQuality = 'high'; baseContext.drawImage(source, 0, 0, width, height);
  const depthCanvas = createCanvas(width, height), depthContext = depthCanvas.getContext('2d', { willReadFrequently: true }); if (!depthContext) return source;
  depthContext.imageSmoothingEnabled = true; depthContext.imageSmoothingQuality = 'high'; depthContext.drawImage(depth.source, 0, 0, width, height);
  const depthPixels = depthContext.getImageData(0, 0, width, height).data, bandCount = 6, masks = Array.from({ length: bandCount }, () => new Uint8ClampedArray(width * height));
  const focus = settings.focus / 100, halfRange = settings.focusRange / 200, available = Math.max(.01, Math.max(focus, 1 - focus) - halfRange);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const sampled = (depthPixels[pixel * 4] ?? 0) / 255, value = settings.invert ? 1 - sampled : sampled;
    const distance = Math.max(0, Math.abs(value - focus) - halfRange) / available, normalizedBlur = Math.min(1, distance * distance * (3 - 2 * distance));
    const position = normalizedBlur * (bandCount - 1), lower = Math.floor(position), upper = Math.min(bandCount - 1, lower + 1), fraction = position - lower;
    masks[lower]![pixel] = Math.round((1 - fraction) * 255); masks[upper]![pixel] = Math.min(255, (masks[upper]![pixel] ?? 0) + Math.round(fraction * 255));
  }
  const result = createCanvas(width, height), resultContext = result.getContext('2d'); if (!resultContext) return source;
  const transformScale = Math.max(.02, Math.min(Math.abs(layer.transform.scaleX), Math.abs(layer.transform.scaleY)));
  for (let band = 0; band < bandCount; band += 1) {
    const amount = band / (bandCount - 1), filtered = createCanvas(width, height), filteredContext = filtered.getContext('2d'); if (!filteredContext) continue;
    if (band === 0) filteredContext.drawImage(base, 0, 0); else { filteredContext.filter = `blur(${settings.maxBlur * amount * renderScale / transformScale}px)`; filteredContext.drawImage(base, 0, 0); }
    const maskCanvas = createCanvas(width, height), maskContext = maskCanvas.getContext('2d'); if (!maskContext) continue; const maskData = maskContext.createImageData(width, height), weights = masks[band]!;
    for (let pixel = 0; pixel < weights.length; pixel += 1) { const offset = pixel * 4; maskData.data[offset] = 255; maskData.data[offset + 1] = 255; maskData.data[offset + 2] = 255; maskData.data[offset + 3] = weights[pixel] ?? 0; }
    maskContext.putImageData(maskData, 0, 0); filteredContext.globalCompositeOperation = 'destination-in'; filteredContext.drawImage(maskCanvas, 0, 0); resultContext.drawImage(filtered, 0, 0);
  }
  depthBlurCache.set(layer.id, { key, canvas: result }); return result;
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
function pixelWrapRaster(layer: RasterLayer, backdrop: RasterLayer): HTMLCanvasElement | undefined {
  const key = `pixels:${layer.assetId}:${backdrop.assetId}:${Object.values(layer.transform).join(':')}:${Object.values(backdrop.transform).join(':')}:${Object.values(backdrop.adjustments).join(':')}:${Object.values(backdrop.depthOfField ?? {}).join(':')}:${layer.adjustments.lightWrapRadius}`, cached = wrapCache.get(key); if (cached) return cached;
  const mask = shadowRaster(layer), adjustedBackdrop = adjustedRaster(backdrop), backdropSource = adjustedBackdrop ? depthAwareRaster(backdrop, adjustedBackdrop) : undefined; if (!mask || !backdropSource) return undefined;
  const sampled = createCanvas(mask.width, mask.height), sampledContext = sampled.getContext('2d'); if (!sampledContext) return undefined;
  const foreground = layer.transform, background = backdrop.transform, foregroundCenterX = foreground.x + layer.width * foreground.scaleX / 2, foregroundCenterY = foreground.y + layer.height * foreground.scaleY / 2, backgroundCenterX = background.x + backdrop.width * background.scaleX / 2, backgroundCenterY = background.y + backdrop.height * background.scaleY / 2;
  sampledContext.scale(mask.width / layer.width, mask.height / layer.height);
  sampledContext.translate(layer.width / 2, layer.height / 2); sampledContext.scale(1 / Math.max(.001, foreground.scaleX), 1 / Math.max(.001, foreground.scaleY)); sampledContext.rotate(-foreground.rotation * Math.PI / 180); sampledContext.translate(-foregroundCenterX, -foregroundCenterY);
  sampledContext.translate(backgroundCenterX, backgroundCenterY); sampledContext.rotate(background.rotation * Math.PI / 180); sampledContext.scale(background.scaleX, background.scaleY); sampledContext.drawImage(backdropSource, -backdrop.width / 2, -backdrop.height / 2, backdrop.width, backdrop.height);
  const softened = createCanvas(mask.width, mask.height), softenedContext = softened.getContext('2d'); if (!softenedContext) return undefined; const resolutionScale = mask.width / layer.width;
  softenedContext.filter = `blur(${Math.max(1.5, layer.adjustments.lightWrapRadius * resolutionScale)}px)`; softenedContext.drawImage(sampled, 0, 0);
  const edgeCanvas = createCanvas(mask.width, mask.height), edgeContext = edgeCanvas.getContext('2d', { willReadFrequently: true }), maskContext = mask.getContext('2d', { willReadFrequently: true }); if (!edgeContext || !maskContext) return undefined;
  const blurredMask = createCanvas(mask.width, mask.height), blurredMaskContext = blurredMask.getContext('2d', { willReadFrequently: true }); if (!blurredMaskContext) return undefined; blurredMaskContext.filter = `blur(${Math.max(1.5, layer.adjustments.lightWrapRadius * resolutionScale * .72)}px)`; blurredMaskContext.drawImage(mask, 0, 0);
  const original = maskContext.getImageData(0, 0, mask.width, mask.height).data, blurred = blurredMaskContext.getImageData(0, 0, mask.width, mask.height).data, edge = edgeContext.createImageData(mask.width, mask.height);
  for (let i = 0; i < original.length; i += 4) { const inside = (original[i + 3] ?? 0) / 255, softenedAlpha = (blurred[i + 3] ?? 0) / 255, alpha = inside * Math.min(1, Math.max(0, (1 - softenedAlpha) * 3.2)); edge.data[i] = 255; edge.data[i + 1] = 255; edge.data[i + 2] = 255; edge.data[i + 3] = Math.round(alpha * 255); }
  edgeContext.putImageData(edge, 0, 0); softenedContext.globalCompositeOperation = 'destination-in'; softenedContext.drawImage(edgeCanvas, 0, 0); wrapCache.set(key, softened); return softened;
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
export function clearRasterCache(): void { rasterCache.clear(); shadowCache.clear(); wrapCache.clear(); depthBlurCache.clear(); boundsCache.clear(); }
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
  for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
    const layer = layers[layerIndex]!;
    if (layer.kind === 'group' || !isLayerEffectivelyVisible(layer, layers) || layer.opacity <= 0) continue; const adjusted = adjustedRaster(layer); if (!adjusted) continue; const source = depthAwareRaster(layer, adjusted);
    const { transform } = layer, centerX = transform.x + layer.width * transform.scaleX / 2, centerY = transform.y + layer.height * transform.scaleY / 2;
    if (layer.adjustments.shadowOpacity > 0) {
      const shadow = shadowRaster(layer), bounds = visibleBounds(layer);
      if (shadow) { context.save(); context.globalAlpha = layer.opacity / 100 * layer.adjustments.shadowOpacity / 100 * .28; context.globalCompositeOperation = 'multiply'; context.filter = `blur(${layer.adjustments.shadowBlur}px)`; context.translate(centerX + layer.adjustments.shadowOffsetX, centerY + layer.adjustments.shadowOffsetY); context.rotate(transform.rotation * Math.PI / 180); context.scale(transform.scaleX, transform.scaleY); context.drawImage(shadow, -layer.width / 2, -layer.height / 2, layer.width, layer.height); context.restore(); }
      if (bounds) {
        const width = bounds.right - bounds.left, height = bounds.bottom - bounds.top, localX = (bounds.left + bounds.right) / 2 - layer.width / 2, localY = bounds.bottom - layer.height / 2;
        context.save(); context.globalAlpha = layer.opacity / 100 * layer.adjustments.shadowOpacity / 100 * .72; context.globalCompositeOperation = 'multiply'; context.filter = `blur(${Math.max(2, layer.adjustments.shadowBlur * .42)}px)`; context.translate(centerX + layer.adjustments.shadowOffsetX * .2, centerY + layer.adjustments.shadowOffsetY * .3); context.rotate(transform.rotation * Math.PI / 180); context.scale(transform.scaleX, transform.scaleY); context.beginPath(); context.ellipse(localX, localY, Math.max(8, width * .2), Math.max(4, height * .018), 0, 0, Math.PI * 2); context.fillStyle = 'rgba(5, 11, 22, .92)'; context.fill(); context.restore();
      }
    }
    context.save(); context.globalAlpha = layer.opacity / 100; context.globalCompositeOperation = layer.blendMode; context.translate(centerX, centerY); context.rotate(transform.rotation * Math.PI / 180); context.scale(transform.scaleX, transform.scaleY); context.drawImage(source, -layer.width / 2, -layer.height / 2, layer.width, layer.height); context.restore();
    if (layer.adjustments.lightWrap > 0) {
      const backdrop = layers.slice(0, layerIndex).find((candidate) => candidate.kind !== 'group' && isLayerEffectivelyVisible(candidate, layers) && candidate.opacity > 0), pixelWrap = backdrop ? pixelWrapRaster(layer, backdrop) : undefined, wrap = pixelWrap ?? wrapRaster(layer); if (wrap) { context.save(); context.globalAlpha = layer.opacity / 100 * layer.adjustments.lightWrap / 100 * (pixelWrap ? .72 : .3); context.globalCompositeOperation = 'screen'; if (!pixelWrap) context.filter = `blur(${layer.adjustments.lightWrapRadius}px)`; context.translate(centerX, centerY); context.rotate(transform.rotation * Math.PI / 180); context.scale(transform.scaleX, transform.scaleY); context.drawImage(wrap, -layer.width / 2, -layer.height / 2, layer.width, layer.height); context.restore(); }
    }
  }
  context.restore();
}
function checkerCanvas(): HTMLCanvasElement { if (checker) return checker; checker = createCanvas(32, 32); const c = checker.getContext('2d'); if (c) { c.fillStyle = '#eceef2'; c.fillRect(0, 0, 32, 32); c.fillStyle = '#d3d6dc'; c.fillRect(0, 0, 16, 16); c.fillRect(16, 16, 16, 16); } return checker; }
export function drawDocumentSurface(context: CanvasRenderingContext2D, documentModel: CompositeDocument): void { context.save(); context.shadowColor = 'rgba(0,0,0,.55)'; context.shadowBlur = 28; context.shadowOffsetY = 10; context.fillStyle = '#fff'; context.fillRect(0, 0, documentModel.width, documentModel.height); context.restore(); const pattern = context.createPattern(checkerCanvas(), 'repeat'); if (pattern) { context.fillStyle = pattern; context.fillRect(0, 0, documentModel.width, documentModel.height); } }
export function hasCompositeFinish(finish: CompositeFinish | undefined): boolean { const value = { ...defaultFinish(), ...finish }; return value.diffusion > 0 || value.bloom > 0 || value.vignette > 0; }
function finishCanvas(context: CanvasRenderingContext2D, width: number, height: number, finishValue: CompositeFinish): void {
  const finish = { ...defaultFinish(), ...finishValue }, maxEdge = 2048, scale = Math.min(1, maxEdge / Math.max(width, height)), lowWidth = Math.max(1, Math.round(width * scale)), lowHeight = Math.max(1, Math.round(height * scale));
  const source = createCanvas(lowWidth, lowHeight), sourceContext = source.getContext('2d', { willReadFrequently: finish.bloom > 0 }); if (!sourceContext) return;
  sourceContext.imageSmoothingEnabled = true; sourceContext.imageSmoothingQuality = 'high'; sourceContext.drawImage(context.canvas, 0, 0, width, height, 0, 0, lowWidth, lowHeight);
  if (finish.diffusion > 0) {
    const diffused = createCanvas(lowWidth, lowHeight), diffusedContext = diffused.getContext('2d'); if (diffusedContext) { diffusedContext.filter = `blur(${finish.diffusionRadius * scale}px)`; diffusedContext.drawImage(source, 0, 0); context.save(); context.globalAlpha = finish.diffusion / 100 * .13; context.globalCompositeOperation = 'source-over'; context.drawImage(diffused, 0, 0, width, height); context.globalAlpha = finish.diffusion / 100 * .28; context.globalCompositeOperation = 'screen'; context.drawImage(diffused, 0, 0, width, height); context.restore(); }
  }
  if (finish.bloom > 0) {
    const highlight = createCanvas(lowWidth, lowHeight), highlightContext = highlight.getContext('2d'); if (highlightContext && sourceContext) {
      const pixels = sourceContext.getImageData(0, 0, lowWidth, lowHeight), data = pixels.data; for (let i = 0; i < data.length; i += 4) { const luminance = ((data[i] ?? 0) * .2126 + (data[i + 1] ?? 0) * .7152 + (data[i + 2] ?? 0) * .0722) / 255, alpha = Math.min(1, Math.max(0, (luminance - .62) / .32)); data[i + 3] = Math.round((data[i + 3] ?? 0) * alpha * alpha); } highlightContext.putImageData(pixels, 0, 0);
      const bloomed = createCanvas(lowWidth, lowHeight), bloomContext = bloomed.getContext('2d'); if (bloomContext) { bloomContext.filter = `blur(${finish.bloomRadius * scale}px)`; bloomContext.drawImage(highlight, 0, 0); context.save(); context.globalAlpha = finish.bloom / 100 * .72; context.globalCompositeOperation = 'screen'; context.drawImage(bloomed, 0, 0, width, height); context.restore(); }
    }
  }
  if (finish.vignette > 0) { const gradient = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * .18, width / 2, height / 2, Math.max(width, height) * .72); gradient.addColorStop(0, 'rgba(0,0,0,0)'); gradient.addColorStop(.68, 'rgba(0,0,0,.04)'); gradient.addColorStop(1, 'rgba(0,0,0,1)'); context.save(); context.globalAlpha = finish.vignette / 100 * .72; context.globalCompositeOperation = 'multiply'; context.fillStyle = gradient; context.fillRect(0, 0, width, height); context.restore(); }
}
export function renderPreviewComposition(documentModel: CompositeDocument, layers: RasterLayer[], maxEdge = 2560): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(documentModel.width, documentModel.height)), canvas = createCanvas(documentModel.width * scale, documentModel.height * scale), context = canvas.getContext('2d'); if (!context) throw new Error('Canvas 2D is unavailable in this browser.');
  context.scale(scale, scale); drawComposition(context, documentModel, layers); context.setTransform(1, 0, 0, 1, 0, 0);
  if (hasCompositeFinish(documentModel.finish)) finishCanvas(context, canvas.width, canvas.height, { ...documentModel.finish, diffusionRadius: documentModel.finish.diffusionRadius * scale, bloomRadius: documentModel.finish.bloomRadius * scale });
  return canvas;
}
export function renderDocumentToCanvas(documentModel: CompositeDocument, layers: RasterLayer[]): HTMLCanvasElement { const canvas = createCanvas(documentModel.width, documentModel.height), context = canvas.getContext('2d'); if (!context) throw new Error('Canvas 2D is unavailable in this browser.'); drawComposition(context, documentModel, layers); if (hasCompositeFinish(documentModel.finish)) finishCanvas(context, canvas.width, canvas.height, documentModel.finish); return canvas; }
export function pngFileName(name: string): string { return `${name.trim() || 'ezcomp'}.png`; }
export async function exportPng(documentModel: CompositeDocument, layers: RasterLayer[]): Promise<void> { const canvas = renderDocumentToCanvas(documentModel, layers); const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG export failed.')), 'image/png')); const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = pngFileName(documentModel.name); anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }
