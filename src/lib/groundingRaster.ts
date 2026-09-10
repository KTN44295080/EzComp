import { getAsset, registerAsset, removeAsset } from './assets';
import { adjustRgb } from './colorMath';
import { layerCropRect } from './layerCrop';
import { defaultAdjustments, defaultDepthOfField, type CompositeDocument, type RasterLayer } from '../types/editor';
import { analyseAlpha, clamp, effectivelyVisible, fromWorld, normalizeGrounding, receiverFor, toWorld, type AlphaAnalysis, type ContactPoint, type GroundingSettings } from './grounding';

const canvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
function drawSubject(ctx: CanvasRenderingContext2D, layer: RasterLayer, source: CanvasImageSource): void {
  const t = layer.transform, c = layerCropRect(layer);
  ctx.save(); ctx.translate(t.x + layer.width * t.scaleX / 2, t.y + layer.height * t.scaleY / 2);
  ctx.rotate(t.rotation * Math.PI / 180); ctx.scale(t.scaleX, t.scaleY);
  ctx.drawImage(source, c.x, c.y, c.width, c.height, c.x - layer.width / 2, c.y - layer.height / 2, c.width, c.height); ctx.restore();
}
/** Analysis happens in displayed space, so rotated and cropped subjects are handled. */
export function analyseGroundingLayer(layer: RasterLayer): AlphaAnalysis {
  const asset = getAsset(layer.assetId);
  if (!asset) return { points: [], confidence: 'review', aspect: 0, note: '元画像が読み込まれていません。' };
  const c = layerCropRect(layer), corners = [[c.x, c.y], [c.x + c.width, c.y], [c.x, c.y + c.height], [c.x + c.width, c.y + c.height]].map(([x, y]) => toWorld(layer, { x: x! / layer.width, y: y! / layer.height }));
  const x = Math.min(...corners.map(p => p.x)), y = Math.min(...corners.map(p => p.y)), w = Math.max(1, Math.max(...corners.map(p => p.x)) - x), h = Math.max(1, Math.max(...corners.map(p => p.y)) - y);
  const scale = Math.min(1, 640 / Math.max(w, h)), raster = canvas(w * scale, h * scale), ctx = raster.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('接地点の解析にCanvas 2Dが必要です。');
  ctx.scale(raster.width / w, raster.height / h); ctx.translate(-x, -y); drawSubject(ctx, layer, asset.source);
  const result = analyseAlpha(ctx.getImageData(0, 0, raster.width, raster.height).data, raster.width, raster.height);
  const points = result.points.map(p => ({ ...p, ...fromWorld(layer, { x: x + p.x * w, y: y + p.y * h }), width: clamp(p.width * w / Math.max(1, layer.width * Math.abs(layer.transform.scaleX)), .002, .8) }));
  const croppedContact = (layer.crop?.bottom ?? 0) > 0 && points.some(p => p.y >= (c.y + c.height - 3 / scale) / layer.height);
  return { ...result, points, ...(croppedContact ? { confidence: 'review' as const, note: '切り抜きの下端を検出しています。足元が欠けていないか確認してください。' } : {}) };
}
export function sampleGroundColor(layer: RasterLayer, receiver: RasterLayer, points: ContactPoint[]): string | null {
  const asset = getAsset(receiver.assetId); if (!asset || !points.length) return null;
  const scale = Math.min(1, 384 / Math.max(receiver.width, receiver.height));
  const c = canvas(receiver.width * scale, receiver.height * scale), ctx = c.getContext('2d', { willReadFrequently: true }); if (!ctx) return null;
  ctx.drawImage(asset.source, 0, 0, c.width, c.height);
  let red = 0, green = 0, blue = 0, n = 0;
  for (const point of points) {
    const local = fromWorld(receiver, toWorld(layer, point));
    const px = Math.round(local.x * c.width), py = Math.round(local.y * c.height);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = px + dx, y = py + dy; if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
      const d = ctx.getImageData(x, y, 1, 1).data; if (d[3]! < 150) continue;
      const rgb = adjustRgb({ r: d[0]!, g: d[1]!, b: d[2]! }, receiver.adjustments);
      red += rgb.r; green += rgb.g; blue += rgb.b; n++;
    }
  }
  if (!n) return null;
  return '#' + [red, green, blue].map(v => Math.round(clamp(v / n * .35 + 28, 24, 145)).toString(16).padStart(2, '0')).join('');
}
interface CacheEntry { key: string; source: CanvasImageSource; receiver: CanvasImageSource; before: RasterLayer[]; after: RasterLayer[] }
const cache = new Map<string, CacheEntry>();
export function clearGroundingCache(): void { for (const entry of cache.values()) for (const l of [...entry.before, ...entry.after]) removeAsset(l.assetId); cache.clear(); }
function removeEntry(id: string): void { const old = cache.get(id); if (old) for (const l of [...old.before, ...old.after]) removeAsset(l.assetId); cache.delete(id); }
function gradientEllipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, opacity: number, angle = 0): void {
  if (opacity <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle * Math.PI / 180); ctx.scale(Math.max(.1, rx), Math.max(.1, ry));
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, color); g.addColorStop(.2, color); g.addColorStop(1, color + '00');
  ctx.globalAlpha = clamp(opacity); ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
}
function makeHelper(subject: RasterLayer, name: string, image: HTMLCanvasElement, x: number, y: number, scale: number, blend: RasterLayer['blendMode'], opacity: number): RasterLayer {
  const id = `__grounding-${subject.id}-${name}`; registerAsset(id, image, image.width, image.height);
  return { id, assetId: id, name, kind: 'raster', parentId: subject.parentId, visible: true, locked: true, opacity, blendMode: blend,
    width: image.width, height: image.height, transform: { x, y, scaleX: 1 / scale, scaleY: 1 / scale, rotation: 0 },
    adjustments: defaultAdjustments(), depthOfField: { ...defaultDepthOfField(), sceneDepth: subject.depthOfField?.sceneDepth ?? null } };
}
function activePoints(layer: RasterLayer, s: GroundingSettings): ContactPoint[] {
  const c = layerCropRect(layer);
  return s.points.filter(p => p.weight > 0 && p.x * layer.width >= c.x - 1 && p.x * layer.width <= c.x + c.width + 1 && p.y * layer.height >= c.y - 1 && p.y * layer.height <= c.y + c.height + 1);
}
function buildGrounding(layer: RasterLayer, receiver: RasterLayer, s: GroundingSettings, doc: CompositeDocument): CacheEntry | null {
  const source = getAsset(layer.assetId), ground = getAsset(receiver.assetId); if (!source || !ground) return null;
  const points = activePoints(layer, s).map(p => ({ ...toWorld(layer, p), width: Math.max(2, p.width * layer.width * Math.abs(layer.transform.scaleX)), weight: p.weight }));
  if (!points.length) return null;
  const extent = (p: typeof points[number]) => p.width * 3.2 * s.spread / 100 + 8;
  const x = Math.max(-32, Math.floor(Math.min(...points.map(p => p.x - extent(p))))), y = Math.max(-32, Math.floor(Math.min(...points.map(p => p.y - extent(p)))));
  const w = Math.min(doc.width + 32, Math.ceil(Math.max(...points.map(p => p.x + extent(p))))) - x;
  const h = Math.min(doc.height + 32, Math.ceil(Math.max(...points.map(p => p.y + extent(p))))) - y;
  if (w <= 0 || h <= 0) return null;
  const scale = Math.min(1, 1536 / Math.max(w, h)), dark = canvas(w * scale, h * scale), tint = canvas(dark.width, dark.height);
  const dc = dark.getContext('2d'), tc = tint.getContext('2d'); if (!dc || !tc) return null;
  for (const c of [dc, tc]) { c.scale(scale, scale); c.translate(-x, -y); }
  for (const p of points) {
    const radius = p.width * s.spread / 100, soft = .65 + s.softness / 100 * .85;
    // A dark contact core is retained even with a luminous/cyan broad shadow.
    gradientEllipse(dc, p.x, p.y + radius * .02, radius * .56, Math.max(1.2, radius * .10 * soft), '#101c29', s.contact / 100 * p.weight, s.angle);
    gradientEllipse(dc, p.x, p.y + radius * .06, radius * 1.35, radius * .32 * soft, '#243744', s.ao / 100 * p.weight * .72, s.angle);
    gradientEllipse(tc, p.x, p.y + radius * .05, radius * 2.7, radius * .55 * soft, s.color, p.weight * (s.blend === 'screen' ? .20 : .38), s.angle);
    if (s.glow > 0) gradientEllipse(tc, p.x, p.y, radius * 3, radius * .72, '#8be8f2', s.glow / 100 * p.weight * .32, s.angle);
  }
  // Restrict shadows to the receiver's visible, cropped alpha rather than painting into transparency.
  const mask = canvas(dark.width, dark.height), mc = mask.getContext('2d');
  if (mc) { mc.scale(scale, scale); mc.translate(-x, -y); mc.globalAlpha = receiver.opacity / 100; drawSubject(mc, receiver, ground.source);
    for (const c of [dc, tc]) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'destination-in'; c.drawImage(mask, 0, 0); } }
  const opacity = layer.opacity * s.strength / 100;
  const before = [makeHelper(layer, 'contact-ao', dark, x, y, scale, 'multiply', opacity), makeHelper(layer, 'colored-shadow', tint, x, y, scale, s.blend, opacity)];
  const after: RasterLayer[] = [];
  if (s.bounce > 0) {
    const k = Math.min(1, 1024 / Math.max(layer.width, layer.height)), image = canvas(layer.width * k, layer.height * k), c = image.getContext('2d');
    if (c) {
      c.scale(k, k);
      for (const p of activePoints(layer, s)) { const radius = p.width * layer.width; gradientEllipse(c, p.x * layer.width, p.y * layer.height - radius * .5, radius * 2.4, radius * 4, s.preset === 'ice' ? '#a0e9f2' : s.color, p.weight); }
      c.globalCompositeOperation = 'destination-in'; const cr = layerCropRect(layer);
      const alpha = canvas(image.width, image.height), ac = alpha.getContext('2d');
      if (ac) { ac.scale(k, k); ac.drawImage(source.source, cr.x, cr.y, cr.width, cr.height, cr.x, cr.y, cr.width, cr.height); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(alpha, 0, 0); }
      const bounce = makeHelper(layer, 'floor-bounce', image, 0, 0, 1, 'screen', opacity * s.bounce / 100 * .48);
      // Match the original centre exactly, including fractional raster dimensions.
      bounce.transform = { ...layer.transform, scaleX: layer.width * layer.transform.scaleX / image.width, scaleY: layer.height * layer.transform.scaleY / image.height }; after.push(bounce);
    }
  }
  return { key: '', source: source.source, receiver: ground.source, before, after };
}
/** Derived rasters exist only in the render registry, never in saved source layers. */
export function prepareGroundedLayers(doc: CompositeDocument, layers: RasterLayer[]): RasterLayer[] {
  const active = new Set(layers.filter(l => l.grounding?.enabled).map(l => l.id));
  for (const id of cache.keys()) if (!active.has(id)) removeEntry(id);
  if (!active.size) return layers;
  const out: RasterLayer[] = [];
  for (const layer of layers) {
    const s = normalizeGrounding(layer.grounding), receiver = s.enabled ? receiverFor(layer, layers) : undefined;
    if (!s.enabled || layer.kind === 'group' || !effectivelyVisible(layer, layers) || !receiver) { out.push(layer); continue; }
    if (s.strength <= 0) { out.push({ ...layer, grounding: undefined, adjustments: { ...layer.adjustments, shadowOpacity: 0, ambientOcclusion: 0 } }); continue; }
    const src = getAsset(layer.assetId), bg = getAsset(receiver.assetId);
    const key = JSON.stringify([doc.width, doc.height, layer.assetId, layer.transform, layer.crop, layer.opacity, layer.parentId, layer.depthOfField, receiver.assetId, receiver.transform, receiver.crop, receiver.opacity, s]);
    let value = cache.get(layer.id);
    if (!value || value.key !== key || value.source !== src?.source || value.receiver !== bg?.source || !getAsset(value.before[0]!.assetId)) {
      removeEntry(layer.id); value = buildGrounding(layer, receiver, s, doc) ?? undefined;
      if (value) { value.key = key; cache.set(layer.id, value); }
    }
    if (!value) { out.push(layer); continue; }
    // Do not double darken with the older bbox-centred contact shadow/AO. Stored values are untouched.
    out.push(...value.before, { ...layer, grounding: undefined, adjustments: { ...layer.adjustments, shadowOpacity: 0, ambientOcclusion: 0 } }, ...value.after);
  }
  return out;
}
