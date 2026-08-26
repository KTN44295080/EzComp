import { getAsset } from './assets';
import { applyAdjustmentsToImageData, hasPixelAdjustments } from './colorMath';
import { ambientOcclusionDepthWeight, depthBandWeights, depthOcclusionWeight, groundDepthWeight, normalizedDepthBlur, projectedShadowMatrix } from './sceneGeometry';
import { defaultDepthOfField, defaultFinish, type CompositeDocument, type CompositeFinish, type RasterLayer } from '../types/editor';

const rasterCache = new Map<string, { key: string; canvas: HTMLCanvasElement }>();
const shadowCache = new Map<string, HTMLCanvasElement>();
const wrapCache = new Map<string, HTMLCanvasElement>();
const occlusionCache = new Map<string, HTMLCanvasElement>();
const projectedShadowCache = new Map<string, HTMLCanvasElement>();
const ambientOcclusionCache = new Map<string, HTMLCanvasElement>();
const boundsCache = new Map<string, { left: number; top: number; right: number; bottom: number }>();
let checker: HTMLCanvasElement | undefined;
let finishGrain: HTMLCanvasElement | undefined;
const createCanvas = (w: number, h: number) => { const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(w)); canvas.height = Math.max(1, Math.round(h)); return canvas; };
function backdropBelow(layers: RasterLayer[], layerIndex: number): RasterLayer | undefined { return layers.slice(0, layerIndex).find((candidate) => candidate.kind !== 'group' && isLayerEffectivelyVisible(candidate, layers) && candidate.opacity > 0); }
function drawBackdropInLayerSpace(context: CanvasRenderingContext2D, layer: RasterLayer, backdrop: RasterLayer, source: CanvasImageSource, outputWidth: number, outputHeight: number): void {
  const foreground = layer.transform, background = backdrop.transform, foregroundCenterX = foreground.x + layer.width * foreground.scaleX / 2, foregroundCenterY = foreground.y + layer.height * foreground.scaleY / 2, backgroundCenterX = background.x + backdrop.width * background.scaleX / 2, backgroundCenterY = background.y + backdrop.height * background.scaleY / 2;
  context.scale(outputWidth / layer.width, outputHeight / layer.height); context.translate(layer.width / 2, layer.height / 2); context.scale(1 / Math.max(.001, foreground.scaleX), 1 / Math.max(.001, foreground.scaleY)); context.rotate(-foreground.rotation * Math.PI / 180); context.translate(-foregroundCenterX, -foregroundCenterY);
  context.translate(backgroundCenterX, backgroundCenterY); context.rotate(background.rotation * Math.PI / 180); context.scale(background.scaleX, background.scaleY); context.drawImage(source, -backdrop.width / 2, -backdrop.height / 2, backdrop.width, backdrop.height);
}
function layerPointToDocument(layer: RasterLayer, x: number, y: number): { x: number; y: number } {
  const centerX = layer.transform.x + layer.width * layer.transform.scaleX / 2, centerY = layer.transform.y + layer.height * layer.transform.scaleY / 2, radians = layer.transform.rotation * Math.PI / 180, localX = (x - layer.width / 2) * layer.transform.scaleX, localY = (y - layer.height / 2) * layer.transform.scaleY;
  return { x: centerX + localX * Math.cos(radians) - localY * Math.sin(radians), y: centerY + localX * Math.sin(radians) + localY * Math.cos(radians) };
}
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
function pixelWrapRaster(layer: RasterLayer, backdrop: RasterLayer): HTMLCanvasElement | undefined {
  const key = `pixels:${layer.assetId}:${backdrop.assetId}:${Object.values(layer.transform).join(':')}:${Object.values(backdrop.transform).join(':')}:${Object.values(backdrop.adjustments).join(':')}:${Object.values(backdrop.depthOfField ?? {}).join(':')}:${layer.adjustments.lightWrapRadius}`, cached = wrapCache.get(key); if (cached) return cached;
  const mask = shadowRaster(layer), backdropSource = adjustedRaster(backdrop); if (!mask || !backdropSource) return undefined;
  const sampled = createCanvas(mask.width, mask.height), sampledContext = sampled.getContext('2d'); if (!sampledContext) return undefined;
  drawBackdropInLayerSpace(sampledContext, layer, backdrop, backdropSource, mask.width, mask.height);
  const softened = createCanvas(mask.width, mask.height), softenedContext = softened.getContext('2d'); if (!softenedContext) return undefined; const resolutionScale = mask.width / layer.width;
  softenedContext.filter = `blur(${Math.max(1.5, layer.adjustments.lightWrapRadius * resolutionScale)}px)`; softenedContext.drawImage(sampled, 0, 0);
  const edgeCanvas = createCanvas(mask.width, mask.height), edgeContext = edgeCanvas.getContext('2d', { willReadFrequently: true }), maskContext = mask.getContext('2d', { willReadFrequently: true }); if (!edgeContext || !maskContext) return undefined;
  const blurredMask = createCanvas(mask.width, mask.height), blurredMaskContext = blurredMask.getContext('2d', { willReadFrequently: true }); if (!blurredMaskContext) return undefined; blurredMaskContext.filter = `blur(${Math.max(1.5, layer.adjustments.lightWrapRadius * resolutionScale * .72)}px)`; blurredMaskContext.drawImage(mask, 0, 0);
  const original = maskContext.getImageData(0, 0, mask.width, mask.height).data, blurred = blurredMaskContext.getImageData(0, 0, mask.width, mask.height).data, edge = edgeContext.createImageData(mask.width, mask.height);
  for (let i = 0; i < original.length; i += 4) { const inside = (original[i + 3] ?? 0) / 255, softenedAlpha = (blurred[i + 3] ?? 0) / 255, alpha = inside * Math.min(1, Math.max(0, (1 - softenedAlpha) * 3.2)); edge.data[i] = 255; edge.data[i + 1] = 255; edge.data[i + 2] = 255; edge.data[i + 3] = Math.round(alpha * 255); }
  edgeContext.putImageData(edge, 0, 0); softenedContext.globalCompositeOperation = 'destination-in'; softenedContext.drawImage(edgeCanvas, 0, 0); wrapCache.set(key, softened); return softened;
}
function depthOcclusionRaster(layer: RasterLayer, backdrop: RasterLayer): HTMLCanvasElement | undefined {
  const depthId = backdrop.depthOfField?.depthMapAssetId, depth = depthId ? getAsset(depthId) : undefined;
  if (!depth || layer.adjustments.occlusionOpacity <= 0) return undefined;
  const key = `${layer.assetId}:${backdrop.assetId}:${depthId}:${Object.values(layer.transform).join(':')}:${Object.values(backdrop.transform).join(':')}:${Object.values(backdrop.adjustments).join(':')}:${Object.values(backdrop.depthOfField).join(':')}:${layer.adjustments.occlusionDepth}:${layer.adjustments.occlusionSoftness}`, cached = occlusionCache.get(key); if (cached) return cached;
  const subjectMask = shadowRaster(layer), backdropSource = adjustedRaster(backdrop); if (!subjectMask || !backdropSource) return undefined;
  const width = subjectMask.width, height = subjectMask.height, sampledColor = createCanvas(width, height), colorContext = sampledColor.getContext('2d'), sampledDepth = createCanvas(width, height), depthContext = sampledDepth.getContext('2d', { willReadFrequently: true }), maskContext = subjectMask.getContext('2d', { willReadFrequently: true });
  if (!colorContext || !depthContext || !maskContext) return undefined;
  drawBackdropInLayerSpace(colorContext, layer, backdrop, backdropSource, width, height); drawBackdropInLayerSpace(depthContext, layer, backdrop, depth.source, width, height);
  const depthPixels = depthContext.getImageData(0, 0, width, height).data, subjectPixels = maskContext.getImageData(0, 0, width, height).data, alphaCanvas = createCanvas(width, height), alphaContext = alphaCanvas.getContext('2d'); if (!alphaContext) return undefined; const alpha = alphaContext.createImageData(width, height), threshold = layer.adjustments.occlusionDepth / 100;
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4, subjectAlpha = (subjectPixels[offset + 3] ?? 0) / 255, depthAlpha = (depthPixels[offset + 3] ?? 0) / 255, rawDepth = (depthPixels[offset] ?? 0) / 255, normalizedDepth = backdrop.depthOfField.invert ? 1 - rawDepth : rawDepth, weight = subjectAlpha * depthAlpha * depthOcclusionWeight(normalizedDepth, threshold, layer.adjustments.occlusionSoftness);
    alpha.data[offset] = 255; alpha.data[offset + 1] = 255; alpha.data[offset + 2] = 255; alpha.data[offset + 3] = Math.round(weight * 255);
  }
  alphaContext.putImageData(alpha, 0, 0); colorContext.globalCompositeOperation = 'destination-in'; colorContext.drawImage(alphaCanvas, 0, 0); occlusionCache.set(key, sampledColor); return sampledColor;
}
function ambientOcclusionRaster(layer: RasterLayer, backdrop: RasterLayer): HTMLCanvasElement | undefined {
  if (layer.adjustments.ambientOcclusion <= 0 || layer.adjustments.ambientOcclusionRadius <= 0) return undefined;
  const depthId = backdrop.depthOfField?.depthMapAssetId ?? '', key = `${layer.assetId}:${backdrop.assetId}:${depthId}:${Object.values(layer.transform).join(':')}:${Object.values(backdrop.transform).join(':')}:${Object.values(backdrop.depthOfField ?? {}).join(':')}:${layer.adjustments.ambientOcclusionRadius}:${layer.adjustments.ambientOcclusionDepthRange}:${layer.adjustments.occlusionDepth}:${layer.depthOfField?.sceneDepth ?? 'auto'}`, cached = ambientOcclusionCache.get(key); if (cached) return cached;
  const mask = shadowRaster(layer), maskContext = mask?.getContext('2d', { willReadFrequently: true }); if (!mask || !maskContext) return undefined;
  const blurred = createCanvas(mask.width, mask.height), blurredContext = blurred.getContext('2d', { willReadFrequently: true }); if (!blurredContext) return undefined;
  const resolutionScale = mask.width / layer.width; blurredContext.filter = `blur(${Math.max(1.2, layer.adjustments.ambientOcclusionRadius * resolutionScale)}px)`; blurredContext.drawImage(mask, 0, 0); blurredContext.filter = 'none';
  const depthAsset = depthId ? getAsset(depthId) : undefined, sampledDepth = depthAsset ? createCanvas(mask.width, mask.height) : undefined, depthContext = sampledDepth?.getContext('2d', { willReadFrequently: true });
  if (depthAsset && depthContext) drawBackdropInLayerSpace(depthContext, layer, backdrop, depthAsset.source, mask.width, mask.height);
  const original = maskContext.getImageData(0, 0, mask.width, mask.height).data, softened = blurredContext.getImageData(0, 0, mask.width, mask.height).data, depthPixels = depthContext?.getImageData(0, 0, mask.width, mask.height).data, bounds = visibleBounds(layer), top = (bounds?.top ?? 0) * mask.height / layer.height, bottom = Math.max(top + 1, (bounds?.bottom ?? layer.height) * mask.height / layer.height), subjectDepth = Math.max(0, Math.min(1, (layer.depthOfField?.sceneDepth ?? layer.adjustments.occlusionDepth) / 100));
  const canvas = createCanvas(mask.width, mask.height), context = canvas.getContext('2d'); if (!context) return undefined; const output = context.createImageData(mask.width, mask.height);
  for (let pixel = 0; pixel < mask.width * mask.height; pixel += 1) {
    const offset = pixel * 4, inside = (original[offset + 3] ?? 0) / 255, soft = (softened[offset + 3] ?? 0) / 255, edge = Math.max(0, soft - inside * .82); if (edge <= .001) continue;
    const y = Math.floor(pixel / mask.width), bodyY = Math.max(0, Math.min(1, (y - top) / (bottom - top))), contactCurve = bodyY * bodyY * (3 - 2 * bodyY), depthAlpha = (depthPixels?.[offset + 3] ?? 0) / 255, rawDepth = (depthPixels?.[offset] ?? 128) / 255, depth = backdrop.depthOfField?.invert ? 1 - rawDepth : rawDepth, proximity = depthAlpha > .01 ? ambientOcclusionDepthWeight(depth, subjectDepth, layer.adjustments.ambientOcclusionDepthRange) : 1, alpha = edge * (.38 + contactCurve * .62) * (.3 + proximity * .7);
    output.data[offset] = 5; output.data[offset + 1] = 8; output.data[offset + 2] = 14; output.data[offset + 3] = Math.round(Math.min(1, alpha) * 255);
  }
  context.putImageData(output, 0, 0); ambientOcclusionCache.set(key, canvas); return canvas;
}
function projectedGroundShadow(documentModel: CompositeDocument, layer: RasterLayer, backdrop: RasterLayer | undefined): HTMLCanvasElement | undefined {
  if (layer.adjustments.shadowProjection <= 0 || layer.adjustments.shadowOpacity <= 0) return undefined;
  const depthId = backdrop?.depthOfField?.depthMapAssetId ?? '', key = `${documentModel.width}:${documentModel.height}:${layer.assetId}:${depthId}:${Object.values(layer.transform).join(':')}:${Object.values(layer.adjustments).join(':')}:${backdrop ? Object.values(backdrop.transform).join(':') : ''}:${backdrop ? Object.values(backdrop.depthOfField).join(':') : ''}`, cached = projectedShadowCache.get(key); if (cached) return cached;
  const shadow = shadowRaster(layer), bounds = visibleBounds(layer); if (!shadow || !bounds) return undefined;
  const renderScale = Math.min(1, 1800 / Math.max(documentModel.width, documentModel.height)), canvas = createCanvas(documentModel.width * renderScale, documentModel.height * renderScale), context = canvas.getContext('2d', { willReadFrequently: Boolean(depthId) }); if (!context) return undefined;
  const localFootX = (bounds.left + bounds.right) / 2, localFootY = bounds.bottom, foot = layerPointToDocument(layer, localFootX, localFootY), displayedHeight = Math.max(1, (bounds.bottom - bounds.top) * Math.abs(layer.transform.scaleY)), castLength = displayedHeight * layer.adjustments.shadowLength / 100, matrix = projectedShadowMatrix({ footX: foot.x + layer.adjustments.shadowOffsetX, footY: foot.y + layer.adjustments.shadowOffsetY, localFootX, localFootY, directionDegrees: layer.adjustments.keyLightAngle + 180, widthScale: Math.max(.02, Math.abs(layer.transform.scaleX) * .58), lengthScale: castLength / Math.max(1, bounds.bottom - bounds.top) });
  context.filter = `blur(${Math.max(1, layer.adjustments.shadowBlur * renderScale * .72)}px)`; context.setTransform(matrix.a * renderScale, matrix.b * renderScale, matrix.c * renderScale, matrix.d * renderScale, matrix.e * renderScale, matrix.f * renderScale); context.drawImage(shadow, 0, 0, layer.width, layer.height); context.setTransform(1, 0, 0, 1, 0, 0); context.filter = 'none';
  const depth = depthId ? getAsset(depthId) : undefined;
  if (depth && backdrop) {
    const depthCanvas = createCanvas(canvas.width, canvas.height), depthContext = depthCanvas.getContext('2d', { willReadFrequently: true }); if (depthContext) {
      const centerX = backdrop.transform.x + backdrop.width * backdrop.transform.scaleX / 2, centerY = backdrop.transform.y + backdrop.height * backdrop.transform.scaleY / 2; depthContext.scale(renderScale, renderScale); depthContext.translate(centerX, centerY); depthContext.rotate(backdrop.transform.rotation * Math.PI / 180); depthContext.scale(backdrop.transform.scaleX, backdrop.transform.scaleY); depthContext.drawImage(depth.source, -backdrop.width / 2, -backdrop.height / 2, backdrop.width, backdrop.height); depthContext.setTransform(1, 0, 0, 1, 0, 0);
      const shadowPixels = context.getImageData(0, 0, canvas.width, canvas.height), depthPixels = depthContext.getImageData(0, 0, canvas.width, canvas.height).data, footX = Math.max(0, Math.min(canvas.width - 1, Math.round(foot.x * renderScale))), footY = Math.max(0, Math.min(canvas.height - 1, Math.round(foot.y * renderScale))), footOffset = (footY * canvas.width + footX) * 4, rawFootDepth = (depthPixels[footOffset] ?? 128) / 255, footDepth = backdrop.depthOfField.invert ? 1 - rawFootDepth : rawFootDepth;
      for (let index = 0; index < canvas.width * canvas.height; index += 1) { const offset = index * 4; if ((shadowPixels.data[offset + 3] ?? 0) === 0) continue; const depthAlpha = (depthPixels[offset + 3] ?? 0) / 255, rawDepth = (depthPixels[offset] ?? 0) / 255, normalizedDepth = backdrop.depthOfField.invert ? 1 - rawDepth : rawDepth, weight = depthAlpha * groundDepthWeight(normalizedDepth, footDepth); shadowPixels.data[offset + 3] = Math.round((shadowPixels.data[offset + 3] ?? 0) * weight); }
      context.putImageData(shadowPixels, 0, 0);
    }
  }
  projectedShadowCache.set(key, canvas); return canvas;
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
export function clearRasterCache(): void { rasterCache.clear(); shadowCache.clear(); wrapCache.clear(); occlusionCache.clear(); projectedShadowCache.clear(); ambientOcclusionCache.clear(); boundsCache.clear(); }
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
    if (layer.kind === 'group' || !isLayerEffectivelyVisible(layer, layers) || layer.opacity <= 0) continue; const source = adjustedRaster(layer); if (!source) continue;
    const { transform } = layer, centerX = transform.x + layer.width * transform.scaleX / 2, centerY = transform.y + layer.height * transform.scaleY / 2, backdrop = backdropBelow(layers, layerIndex);
    const ambientOcclusion = backdrop ? ambientOcclusionRaster(layer, backdrop) : undefined;
    if (ambientOcclusion) { context.save(); context.globalAlpha = layer.opacity / 100 * layer.adjustments.ambientOcclusion / 100 * .9; context.globalCompositeOperation = 'multiply'; context.translate(centerX, centerY); context.rotate(transform.rotation * Math.PI / 180); context.scale(transform.scaleX, transform.scaleY); context.drawImage(ambientOcclusion, -layer.width / 2, -layer.height / 2, layer.width, layer.height); context.restore(); }
    if (layer.adjustments.shadowOpacity > 0) {
      const projection = projectedGroundShadow(documentModel, layer, backdrop), bounds = visibleBounds(layer);
      if (projection) { context.save(); context.globalAlpha = layer.opacity / 100 * layer.adjustments.shadowOpacity / 100 * layer.adjustments.shadowProjection / 100 * .82; context.globalCompositeOperation = 'multiply'; context.drawImage(projection, 0, 0, documentModel.width, documentModel.height); context.restore(); }
      if (bounds) {
        const width = bounds.right - bounds.left, height = bounds.bottom - bounds.top, localX = (bounds.left + bounds.right) / 2 - layer.width / 2, localY = bounds.bottom - layer.height / 2;
        context.save(); context.globalAlpha = layer.opacity / 100 * layer.adjustments.shadowOpacity / 100 * .72; context.globalCompositeOperation = 'multiply'; context.filter = `blur(${Math.max(2, layer.adjustments.shadowBlur * .42)}px)`; context.translate(centerX + layer.adjustments.shadowOffsetX * .2, centerY + layer.adjustments.shadowOffsetY * .3); context.rotate(transform.rotation * Math.PI / 180); context.scale(transform.scaleX, transform.scaleY); context.beginPath(); context.ellipse(localX, localY, Math.max(8, width * .2), Math.max(4, height * .018), 0, 0, Math.PI * 2); context.fillStyle = 'rgba(5, 11, 22, .92)'; context.fill(); context.restore();
      }
    }
    context.save(); context.globalAlpha = layer.opacity / 100; context.globalCompositeOperation = layer.blendMode; context.translate(centerX, centerY); context.rotate(transform.rotation * Math.PI / 180); context.scale(transform.scaleX, transform.scaleY); context.drawImage(source, -layer.width / 2, -layer.height / 2, layer.width, layer.height); context.restore();
    if (layer.adjustments.lightWrap > 0) {
      const pixelWrap = backdrop ? pixelWrapRaster(layer, backdrop) : undefined, wrap = pixelWrap ?? wrapRaster(layer); if (wrap) { context.save(); context.globalAlpha = layer.opacity / 100 * layer.adjustments.lightWrap / 100 * (pixelWrap ? .72 : .3); context.globalCompositeOperation = 'screen'; if (!pixelWrap) context.filter = `blur(${layer.adjustments.lightWrapRadius}px)`; context.translate(centerX, centerY); context.rotate(transform.rotation * Math.PI / 180); context.scale(transform.scaleX, transform.scaleY); context.drawImage(wrap, -layer.width / 2, -layer.height / 2, layer.width, layer.height); context.restore(); }
    }
    const occlusion = backdrop ? depthOcclusionRaster(layer, backdrop) : undefined;
    if (occlusion) { context.save(); context.globalAlpha = layer.opacity / 100 * layer.adjustments.occlusionOpacity / 100; context.globalCompositeOperation = 'source-over'; context.translate(centerX, centerY); context.rotate(transform.rotation * Math.PI / 180); context.scale(transform.scaleX, transform.scaleY); context.drawImage(occlusion, -layer.width / 2, -layer.height / 2, layer.width, layer.height); context.restore(); }
  }
  context.restore();
}
function sceneDepthBackdrop(layers: RasterLayer[]): RasterLayer | undefined {
  return layers.find((layer) => layer.kind !== 'group' && isLayerEffectivelyVisible(layer, layers) && layer.opacity > 0);
}
export function hasSceneDepthOfField(layers: RasterLayer[]): boolean {
  const backdrop = sceneDepthBackdrop(layers), settings = backdrop ? { ...defaultDepthOfField(), ...backdrop.depthOfField } : undefined;
  return Boolean(settings?.enabled && settings.depthMapAssetId && settings.maxBlur > 0);
}
function drawLayerInOutputSpace(context: CanvasRenderingContext2D, documentModel: CompositeDocument, layer: RasterLayer, source: CanvasImageSource, outputWidth: number, outputHeight: number): void {
  const centerX = layer.transform.x + layer.width * layer.transform.scaleX / 2, centerY = layer.transform.y + layer.height * layer.transform.scaleY / 2;
  context.save(); context.scale(outputWidth / documentModel.width, outputHeight / documentModel.height); context.translate(centerX, centerY); context.rotate(layer.transform.rotation * Math.PI / 180); context.scale(layer.transform.scaleX, layer.transform.scaleY); context.drawImage(source, -layer.width / 2, -layer.height / 2, layer.width, layer.height); context.restore();
}
function sampleDepthAtContact(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, documentModel: CompositeDocument, layer: RasterLayer): number {
  const bounds = visibleBounds(layer), localX = bounds ? (bounds.left + bounds.right) / 2 : layer.width / 2, localY = bounds?.bottom ?? layer.height, point = layerPointToDocument(layer, localX, localY), centerX = Math.round(point.x / documentModel.width * canvas.width), centerY = Math.round(point.y / documentModel.height * canvas.height);
  let sum = 0, count = 0;
  for (let y = -2; y <= 2; y += 1) for (let x = -2; x <= 2; x += 1) { const sampleX = Math.max(0, Math.min(canvas.width - 1, centerX + x)), sampleY = Math.max(0, Math.min(canvas.height - 1, centerY + y)), pixel = context.getImageData(sampleX, sampleY, 1, 1).data; if ((pixel[3] ?? 0) > 0) { sum += pixel[0] ?? 128; count += 1; } }
  return count ? sum / count / 255 : .5;
}
function sceneDepthMap(documentModel: CompositeDocument, layers: RasterLayer[], backdrop: RasterLayer, width: number, height: number): HTMLCanvasElement | undefined {
  const settings = { ...defaultDepthOfField(), ...backdrop.depthOfField }, depth = settings.depthMapAssetId ? getAsset(settings.depthMapAssetId) : undefined; if (!depth) return undefined;
  const canvas = createCanvas(width, height), context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) return undefined;
  const fallback = Math.round(settings.focus / 100 * 255); context.fillStyle = `rgb(${fallback} ${fallback} ${fallback})`; context.fillRect(0, 0, width, height); drawLayerInOutputSpace(context, documentModel, backdrop, depth.source, width, height);
  const normalized = context.getImageData(0, 0, width, height);
  for (let offset = 0; offset < normalized.data.length; offset += 4) { const raw = normalized.data[offset] ?? fallback, value = settings.invert ? 255 - raw : raw; normalized.data[offset] = value; normalized.data[offset + 1] = value; normalized.data[offset + 2] = value; normalized.data[offset + 3] = 255; }
  context.putImageData(normalized, 0, 0);
  const backdropMap = createCanvas(width, height), backdropContext = backdropMap.getContext('2d', { willReadFrequently: true }); if (!backdropContext) return undefined; backdropContext.drawImage(canvas, 0, 0);
  for (const layer of layers) {
    if (layer.id === backdrop.id || layer.kind === 'group' || !isLayerEffectivelyVisible(layer, layers) || layer.opacity <= 0) continue;
    const mask = shadowRaster(layer); if (!mask) continue;
    const manual = layer.depthOfField?.sceneDepth, layerDepth = manual === null || manual === undefined ? sampleDepthAtContact(backdropContext, backdropMap, documentModel, layer) : Math.max(0, Math.min(1, manual / 100)), value = Math.round(layerDepth * 255);
    const plane = createCanvas(mask.width, mask.height), planeContext = plane.getContext('2d'); if (!planeContext) continue; planeContext.drawImage(mask, 0, 0); planeContext.globalCompositeOperation = 'source-in'; planeContext.fillStyle = `rgb(${value} ${value} ${value})`; planeContext.fillRect(0, 0, plane.width, plane.height);
    context.globalAlpha = layer.opacity / 100; drawLayerInOutputSpace(context, documentModel, layer, plane, width, height); context.globalAlpha = 1;
  }
  return canvas;
}
function sceneDepthOfField(context: CanvasRenderingContext2D, width: number, height: number, documentModel: CompositeDocument, layers: RasterLayer[]): void {
  const backdrop = sceneDepthBackdrop(layers), settings = backdrop ? { ...defaultDepthOfField(), ...backdrop.depthOfField } : undefined; if (!backdrop || !settings?.enabled || !settings.depthMapAssetId || settings.maxBlur <= 0) return;
  const renderScale = Math.min(1, 2048 / Math.max(width, height)), lowWidth = Math.max(1, Math.round(width * renderScale)), lowHeight = Math.max(1, Math.round(height * renderScale)), depthPixelScale = Math.min(lowWidth / documentModel.width, lowHeight / documentModel.height), base = createCanvas(lowWidth, lowHeight), baseContext = base.getContext('2d'); if (!baseContext) return;
  baseContext.imageSmoothingEnabled = true; baseContext.imageSmoothingQuality = 'high'; baseContext.drawImage(context.canvas, 0, 0, width, height, 0, 0, lowWidth, lowHeight);
  const depthCanvas = sceneDepthMap(documentModel, layers, backdrop, lowWidth, lowHeight), depthContext = depthCanvas?.getContext('2d', { willReadFrequently: true }); if (!depthCanvas || !depthContext) return;
  const depthPixels = depthContext.getImageData(0, 0, lowWidth, lowHeight).data, bandCount = 12, masks = Array.from({ length: bandCount }, () => new Uint8ClampedArray(lowWidth * lowHeight)), blendMask = new Uint8ClampedArray(lowWidth * lowHeight);
  for (let pixel = 0; pixel < lowWidth * lowHeight; pixel += 1) {
    const amount = normalizedDepthBlur((depthPixels[pixel * 4] ?? 0) / 255, settings.focus, settings.focusRange), weights = depthBandWeights(amount, bandCount); masks[weights.lower]![pixel] = weights.lowerWeight; if (weights.upperWeight > 0) masks[weights.upper]![pixel] = weights.upperWeight;
    const transition = Math.min(1, amount / .08); blendMask[pixel] = Math.round(transition * transition * (3 - 2 * transition) * 255);
  }
  const result = createCanvas(lowWidth, lowHeight), resultContext = result.getContext('2d'); if (!resultContext) return; resultContext.globalCompositeOperation = 'lighter';
  for (let band = 0; band < bandCount; band += 1) {
    const filtered = createCanvas(lowWidth, lowHeight), filteredContext = filtered.getContext('2d'); if (!filteredContext) continue;
    if (band === 0) filteredContext.drawImage(base, 0, 0); else { filteredContext.filter = `blur(${settings.maxBlur * band / (bandCount - 1) * depthPixelScale}px)`; filteredContext.drawImage(base, 0, 0); }
    const maskCanvas = createCanvas(lowWidth, lowHeight), maskContext = maskCanvas.getContext('2d'); if (!maskContext) continue; const maskData = maskContext.createImageData(lowWidth, lowHeight), bandMask = masks[band]!;
    for (let pixel = 0; pixel < bandMask.length; pixel += 1) { const offset = pixel * 4; maskData.data[offset] = 255; maskData.data[offset + 1] = 255; maskData.data[offset + 2] = 255; maskData.data[offset + 3] = bandMask[pixel] ?? 0; }
    maskContext.putImageData(maskData, 0, 0); filteredContext.globalCompositeOperation = 'destination-in'; filteredContext.drawImage(maskCanvas, 0, 0); resultContext.drawImage(filtered, 0, 0);
  }
  const blendCanvas = createCanvas(lowWidth, lowHeight), blendContext = blendCanvas.getContext('2d'); if (!blendContext) return; const blendData = blendContext.createImageData(lowWidth, lowHeight);
  for (let pixel = 0; pixel < blendMask.length; pixel += 1) { const offset = pixel * 4; blendData.data[offset] = 255; blendData.data[offset + 1] = 255; blendData.data[offset + 2] = 255; blendData.data[offset + 3] = blendMask[pixel] ?? 0; }
  blendContext.putImageData(blendData, 0, 0); resultContext.globalCompositeOperation = 'destination-in'; resultContext.drawImage(blendCanvas, 0, 0); context.save(); context.globalCompositeOperation = 'source-over'; context.drawImage(result, 0, 0, width, height); context.restore();
}
function checkerCanvas(): HTMLCanvasElement { if (checker) return checker; checker = createCanvas(32, 32); const c = checker.getContext('2d'); if (c) { c.fillStyle = '#eceef2'; c.fillRect(0, 0, 32, 32); c.fillStyle = '#d3d6dc'; c.fillRect(0, 0, 16, 16); c.fillRect(16, 16, 16, 16); } return checker; }
export function drawDocumentSurface(context: CanvasRenderingContext2D, documentModel: CompositeDocument): void { context.save(); context.shadowColor = 'rgba(0,0,0,.55)'; context.shadowBlur = 28; context.shadowOffsetY = 10; context.fillStyle = '#fff'; context.fillRect(0, 0, documentModel.width, documentModel.height); context.restore(); const pattern = context.createPattern(checkerCanvas(), 'repeat'); if (pattern) { context.fillStyle = pattern; context.fillRect(0, 0, documentModel.width, documentModel.height); } }
export function hasCompositeFinish(finish: CompositeFinish | undefined): boolean { const value = { ...defaultFinish(), ...finish }; return value.diffusion > 0 || value.bloom > 0 || value.vignette > 0 || value.grain > 0; }
function finishGrainCanvas(): HTMLCanvasElement { if (finishGrain) return finishGrain; finishGrain = createCanvas(192, 192); const context = finishGrain.getContext('2d'); if (!context) return finishGrain; const image = context.createImageData(finishGrain.width, finishGrain.height); for (let pixel = 0; pixel < finishGrain.width * finishGrain.height; pixel += 1) { let seed = Math.imul(pixel + 17, 374761393); seed = Math.imul(seed ^ (seed >>> 13), 1274126177); const value = 104 + Math.round((seed >>> 0) / 4294967295 * 48), offset = pixel * 4; image.data[offset] = value; image.data[offset + 1] = value; image.data[offset + 2] = value; image.data[offset + 3] = 255; } context.putImageData(image, 0, 0); return finishGrain; }
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
  if (finish.grain > 0) { const pattern = context.createPattern(finishGrainCanvas(), 'repeat'); if (pattern) { context.save(); context.globalAlpha = finish.grain / 100 * .34; context.globalCompositeOperation = 'soft-light'; context.fillStyle = pattern; context.fillRect(0, 0, width, height); context.restore(); } }
}
export function renderPreviewComposition(documentModel: CompositeDocument, layers: RasterLayer[], maxEdge = 2560): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(documentModel.width, documentModel.height)), canvas = createCanvas(documentModel.width * scale, documentModel.height * scale), context = canvas.getContext('2d'); if (!context) throw new Error('Canvas 2D is unavailable in this browser.');
  context.scale(scale, scale); drawComposition(context, documentModel, layers); context.setTransform(1, 0, 0, 1, 0, 0);
  sceneDepthOfField(context, canvas.width, canvas.height, documentModel, layers);
  if (hasCompositeFinish(documentModel.finish)) finishCanvas(context, canvas.width, canvas.height, { ...documentModel.finish, diffusionRadius: documentModel.finish.diffusionRadius * scale, bloomRadius: documentModel.finish.bloomRadius * scale });
  return canvas;
}
export function renderDocumentToCanvas(documentModel: CompositeDocument, layers: RasterLayer[]): HTMLCanvasElement { const canvas = createCanvas(documentModel.width, documentModel.height), context = canvas.getContext('2d'); if (!context) throw new Error('Canvas 2D is unavailable in this browser.'); drawComposition(context, documentModel, layers); sceneDepthOfField(context, canvas.width, canvas.height, documentModel, layers); if (hasCompositeFinish(documentModel.finish)) finishCanvas(context, canvas.width, canvas.height, documentModel.finish); return canvas; }
export function pngFileName(name: string): string { return `${name.trim() || 'ezcomp'}.png`; }
export async function exportPng(documentModel: CompositeDocument, layers: RasterLayer[]): Promise<void> { const canvas = renderDocumentToCanvas(documentModel, layers); const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG export failed.')), 'image/png')); const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = pngFileName(documentModel.name); anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0); }
