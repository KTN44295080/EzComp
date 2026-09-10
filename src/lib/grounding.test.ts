import { beforeEach, describe, expect, it } from 'vitest';
import { defaultAdjustments, defaultDepthOfField, defaultDocument, defaultTransform, type RasterLayer } from '../types/editor';
import { useEditorStore } from '../store/editorStore';
import { analyseAlpha, effectivelyVisible, fromWorld, groundingDefaults, normalizeGrounding, receiverFor, toWorld } from './grounding';
import { prepareGroundedLayers } from './groundingRaster';

const layer = (id = 'subject'): RasterLayer => ({ id, assetId: id, name: id, width: 100, height: 160, visible: true, locked: false, opacity: 100, blendMode: 'source-over', transform: defaultTransform(), adjustments: defaultAdjustments(), depthOfField: defaultDepthOfField() });
const pixels = () => new Uint8ClampedArray(100 * 160 * 4);
function rect(p: Uint8ClampedArray, x: number, y: number, w: number, h: number, a = 255) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) p[(j * 100 + i) * 4 + 3] = a; }
function person(raised = false) { const p = pixels(); rect(p, 25, 10, 50, 85); rect(p, 25, 95, 14, 55); rect(p, 62, 95, 14, raised ? 30 : 55); return p; }

describe('automatic contact candidates', () => {
  it('finds two supported feet instead of one bbox-centred ellipse', () => { const a = analyseAlpha(person(), 100, 160); expect(a.confidence).toBe('auto'); expect(a.points).toHaveLength(2); expect(a.points[0]!.x).toBeLessThan(.4); expect(a.points[1]!.x).toBeGreaterThan(.6); });
  it('does not give a raised foot a strong contact shadow', () => { const a = analyseAlpha(person(true), 100, 160); expect(a.points).toHaveLength(1); expect(a.points[0]!.x).toBeLessThan(.4); });
  it('ignores weak alpha fringes', () => { const p = person(); rect(p, 10, 155, 80, 4, 70); expect(analyseAlpha(p, 100, 160).points).toEqual(analyseAlpha(person(), 100, 160).points); });
  it('rejects opaque backgrounds and empty input', () => { const p = pixels(); rect(p, 0, 0, 100, 160); expect(analyseAlpha(p, 100, 160).points).toHaveLength(0); expect(analyseAlpha(pixels(), 100, 160).points).toHaveLength(0); expect(analyseAlpha([], 100, 160).confidence).toBe('review'); });
  it('marks broad hems/flat cutouts for review rather than guessing confidently', () => { const p = pixels(); rect(p, 20, 10, 60, 140); expect(analyseAlpha(p, 100, 160).confidence).toBe('review'); });
});
describe('non-destructive settings and coordinates', () => {
  beforeEach(() => useEditorStore.getState().resetProject());
  it('leaves old files visually unchanged until explicitly enabled', () => { const layers = [layer('floor'), layer()]; expect(normalizeGrounding().enabled).toBe(false); expect(prepareGroundedLayers(defaultDocument(), layers)).toBe(layers); });
  it('sanitizes numeric/color/anchor values from project files', () => { const s = normalizeGrounding({ strength: NaN, ao: -10, color: 'url(bad)', points: [{ id: 'a', x: .5, y: 4, width: Infinity, weight: 3 }] }); expect(s.strength).toBe(100); expect(s.ao).toBe(0); expect(s.color).toBe('#405466'); expect(s.points[0]!.y).toBe(1); expect(s.points[0]!.weight).toBe(1); });
  it('round-trips rotation and nonuniform scaling', () => { const l = { ...layer(), transform: { x: 413, y: -22, scaleX: .47, scaleY: .8, rotation: 38 } }; for (let i = 0; i < 30; i++) { const p = { x: i / 30, y: .95 - i / 50 }, q = fromWorld(l, toWorld(l, p)); expect(q.x).toBeCloseTo(p.x, 12); expect(q.y).toBeCloseTo(p.y, 12); } });
  it('honors hidden ancestors and explicit receiver selection', () => { const floor = layer('floor'), hidden = { ...layer('group'), kind: 'group' as const, visible: false }, subject = { ...layer(), parentId: 'group' }; expect(effectivelyVisible(subject, [floor, hidden, subject])).toBe(false); const other = { ...layer(), grounding: { ...groundingDefaults(), receiverId: 'deleted-floor' } }; expect(receiverFor(other, [floor, other])).toBeUndefined(); });
  it('persists anchors through JSON round-trip and follows movement', () => { const l = { ...layer(), grounding: { ...groundingDefaults(), enabled: true, points: [{ id: 'p', x: .3, y: .94, width: .08, weight: 1 }] } }; const state = useEditorStore.getState(); state.replaceProject(defaultDocument(), JSON.parse(JSON.stringify([l])), false); state.patchLayerTransform(l.id, { x: 50 }); const moved = useEditorStore.getState().layers[0]!; expect(moved.grounding?.points).toEqual(l.grounding.points); expect(toWorld(moved, moved.grounding!.points[0]!).x).toBeCloseTo(80); });
  it('undoes a batch in one step and reset-all removes grounding', () => { const state = useEditorStore.getState(); state.replaceProject(defaultDocument(), [layer('a'), layer('b')], false); state.beginTransaction(); for (const id of ['a', 'b']) state.patchLayer(id, { grounding: { ...groundingDefaults('ice'), enabled: true } }); state.endTransaction(); expect(useEditorStore.getState().past).toHaveLength(1); state.undo(); expect(useEditorStore.getState().layers.every(l => !l.grounding)).toBe(true); state.redo(); state.resetLayerValues('a'); expect(useEditorStore.getState().layers[0]!.grounding).toBeUndefined(); });
});
