import type { RasterLayer } from '../types/editor';

export type GroundingPreset = 'natural' | 'ice' | 'warm';
export type ShadowBlend = 'multiply' | 'soft-light' | 'screen' | 'overlay';
/** Source-relative anchors follow the subject, including canvas resize and crop. */
export interface ContactPoint { id: string; x: number; y: number; width: number; weight: number }
export interface GroundingSettings {
  enabled: boolean;
  preset: GroundingPreset;
  receiverId: string | null;
  points: ContactPoint[];
  strength: number;
  contact: number;
  ao: number;
  spread: number;
  softness: number;
  color: string;
  blend: ShadowBlend;
  glow: number;
  bounce: number;
  angle: number;
  confidence: 'auto' | 'review' | 'manual';
  note: string;
}
// Optional extension: old projects remain disabled and preserve their old shadows.
declare module '../types/editor' { interface RasterLayer { grounding?: GroundingSettings } }
export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const finite = (v: unknown, fallback: number, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
export function groundingDefaults(preset: GroundingPreset = 'natural'): GroundingSettings {
  return { enabled: false, preset, receiverId: null, points: [], strength: 100,
    contact: 78, ao: 42, spread: 100, softness: 50, color: preset === 'ice' ? '#86dce9' : preset === 'warm' ? '#8f6852' : '#405466',
    blend: preset === 'ice' ? 'screen' : 'multiply', glow: preset === 'ice' ? 20 : 0,
    bounce: preset === 'ice' ? 10 : 5, angle: 0, confidence: 'review', note: '' };
}
export function normalizeGrounding(value?: Partial<GroundingSettings> | null): GroundingSettings {
  const v = value ?? {}, p = v.preset === 'ice' || v.preset === 'warm' ? v.preset : 'natural', d = groundingDefaults(p);
  const number = (k: keyof GroundingSettings, lo = 0, hi = 100) => finite(v[k], d[k] as number, lo, hi);
  const seen = new Set<string>();
  const points = (Array.isArray(v.points) ? v.points : []).slice(0, 8).flatMap((pt, i) => {
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return [];
    let id = typeof pt.id === 'string' ? pt.id.slice(0, 100) : `contact-${i}`;
    if (seen.has(id)) id = `contact-${i}-${seen.size}`; seen.add(id);
    return [{ id, x: clamp(pt.x), y: clamp(pt.y), width: finite(pt.width, .06, .002, .8), weight: finite(pt.weight, 1, 0, 1) }];
  });
  return { ...d, enabled: v.enabled === true, receiverId: typeof v.receiverId === 'string' ? v.receiverId : null, points,
    strength: number('strength'), contact: number('contact'), ao: number('ao'), spread: number('spread', 20, 250), softness: number('softness'),
    color: typeof v.color === 'string' && /^#[a-f\d]{6}$/i.test(v.color) ? v.color : d.color,
    blend: ['multiply', 'soft-light', 'screen', 'overlay'].includes(v.blend ?? '') ? v.blend! : d.blend,
    glow: number('glow'), bounce: number('bounce'), angle: number('angle', -80, 80),
    confidence: v.confidence === 'auto' || v.confidence === 'manual' ? v.confidence : 'review',
    note: typeof v.note === 'string' ? v.note.slice(0, 240) : '' };
}
export interface Point { x: number; y: number }
export function toWorld(layer: RasterLayer, point: Point): Point {
  const t = layer.transform, r = t.rotation * Math.PI / 180;
  const x = (point.x - .5) * layer.width * t.scaleX, y = (point.y - .5) * layer.height * t.scaleY;
  return { x: t.x + layer.width * t.scaleX / 2 + x * Math.cos(r) - y * Math.sin(r),
    y: t.y + layer.height * t.scaleY / 2 + x * Math.sin(r) + y * Math.cos(r) };
}
export function fromWorld(layer: RasterLayer, point: Point): Point {
  const t = layer.transform, r = -t.rotation * Math.PI / 180;
  const x = point.x - t.x - layer.width * t.scaleX / 2, y = point.y - t.y - layer.height * t.scaleY / 2;
  const sx = Math.abs(t.scaleX) < 1e-6 ? 1e-6 : t.scaleX, sy = Math.abs(t.scaleY) < 1e-6 ? 1e-6 : t.scaleY;
  return { x: .5 + (x * Math.cos(r) - y * Math.sin(r)) / (layer.width * sx), y: .5 + (x * Math.sin(r) + y * Math.cos(r)) / (layer.height * sy) };
}
export function effectivelyVisible(layer: RasterLayer, layers: RasterLayer[]): boolean {
  if (!layer.visible || layer.opacity <= 0) return false;
  const visited = new Set<string>([layer.id]); let id = layer.parentId;
  while (id) { if (visited.has(id)) return false; visited.add(id); const p = layers.find(l => l.id === id); if (!p || !p.visible) return false; id = p.parentId; }
  return true;
}
export function receiverFor(layer: RasterLayer, layers: RasterLayer[]): RasterLayer | undefined {
  const earlier = layers.slice(0, layers.findIndex(l => l.id === layer.id)).filter(l => l.kind !== 'group' && effectivelyVisible(l, layers));
  const id = normalizeGrounding(layer.grounding).receiverId;
  return id ? earlier.find(l => l.id === id) : earlier[0];
}
export interface AlphaAnalysis { points: ContactPoint[]; confidence: 'auto' | 'review'; note: string; aspect: number }
/** Conservative silhouette heuristic, not a semantic foot detector or a 3D solver. */
export function analyseAlpha(data: ArrayLike<number>, w: number, h: number): AlphaAnalysis {
  const fail = (note: string): AlphaAnalysis => ({ points: [], confidence: 'review', note, aspect: 0 });
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 4 || h < 4 || data.length !== w * h * 4) return fail('画像の透明度を解析できません。');
  const bottom = new Int32Array(w).fill(-1), rows = new Uint32Array(h);
  let left = w, right = -1, top = h, low = -1, count = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3]! >= 176) {
    bottom[x] = y; rows[y] = (rows[y] ?? 0) + 1; count++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); low = Math.max(low, y);
  }
  if (count < 18 || low < 0) return fail('不透明な輪郭が不足しています。接地点を手動で指定してください。');
  if (count > w * h * .94) return fail('背景透過のない画像です。人物を分けたレイヤーを選択してください。');
  const bw = right - left + 1, bh = low - top + 1, support = Math.max(2, Math.round(bw * .012));
  // Ignore isolated tail/noise pixels, but retain the actual sole of a small foot.
  while (low > top && rows[low]! < support) low--;
  const band = Math.max(2, Math.round(bh * .028)), minRun = Math.max(2, Math.round(bw * .012)), gap = Math.max(1, Math.round(bw * .008));
  const active: number[] = [];
  for (let x = left; x <= right; x++) if (bottom[x]! >= low - band) active.push(x);
  const runs: number[][] = [];
  for (const x of active) { const last = runs.at(-1); if (last && x - last.at(-1)! <= gap + 1) last.push(x); else runs.push([x]); }
  const valid = runs.filter(r => r.length >= minRun).sort((a, b) => b.length - a.length);
  if (!valid.length) return fail('接地点が不明です。画面上で追加してください。');
  const points = valid.slice(0, 2).sort((a, b) => a[0]! - b[0]!).map((r, i) => {
    const edge = r.filter(x => bottom[x]! >= low - Math.max(1, band * .35));
    const xs = edge.length >= 2 ? edge : r;
    return { id: `auto-${i}`, x: (xs.reduce((a, b) => a + b, 0) / xs.length + .5) / w,
      y: (Math.min(low, Math.max(...xs.map(x => bottom[x]!))) + 1) / h,
      width: clamp((r.at(-1)! - r[0]! + 1) * 1.25 / w, .015, .4), weight: 1 };
  });
  const wide = valid[0]!.length > bw * .52, ambiguous = valid.length > 2 || wide || bh / bw < .8;
  return { points, confidence: ambiguous ? 'review' : 'auto', aspect: bh / bw,
    note: ambiguous ? '裾・髪・小物を接地点として検出した可能性があります。位置を確認してください。' : '下端の不透明な輪郭から推定。高い位置にある足は強い接触影の対象外です。' };
}
