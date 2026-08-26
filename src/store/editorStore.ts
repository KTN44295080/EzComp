import { create } from 'zustand';
import { defaultAdjustments, defaultDepthOfField, defaultDocument, defaultFinish, defaultSceneLock, normalizeAdjustments, type CompositeDocument, type CompositeFinish, type DepthOfFieldSettings, type EditorTool, type LayerAdjustments, type LayerTransform, type RasterLayer, type SceneLock, type ViewportState } from '../types/editor';
import { makeId } from '../lib/id';

interface HistorySnapshot { document: CompositeDocument; layers: RasterLayer[]; selectedLayerId: string | null }
interface EditorState {
  document: CompositeDocument; layers: RasterLayer[]; selectedLayerId: string | null;
  viewport: ViewportState; tool: EditorTool; isImporting: boolean; isRestoring: boolean;
  compareBefore: boolean; message: string; error: string | null;
  past: HistorySnapshot[]; future: HistorySnapshot[]; transactionBase: HistorySnapshot | null;
  setDocument: (patch: Partial<CompositeDocument>) => void;
  cropCanvas: (width: number, height: number) => void;
  setFinish: (patch: Partial<CompositeFinish>) => void;
  setSceneLock: (patch: Partial<SceneLock>) => void;
  replaceProject: (document: CompositeDocument, layers: RasterLayer[], record?: boolean) => void;
  appendLayers: (layers: RasterLayer[]) => void; selectLayer: (id: string | null) => void;
  patchLayer: (id: string, patch: Partial<RasterLayer>) => void;
  patchLayerTransform: (id: string, patch: Partial<LayerTransform>) => void;
  patchLayerAdjustments: (id: string, patch: Partial<LayerAdjustments>) => void;
  patchLayerDepthOfField: (id: string, patch: Partial<DepthOfFieldSettings>) => void;
  resetAdjustment: (id: string, key: keyof LayerAdjustments) => void; resetLayerValues: (id: string) => void;
  removeLayer: (id: string) => void; duplicateLayer: (id: string) => void;
  moveLayer: (id: string, direction: 'up' | 'down') => void;
  setViewport: (patch: Partial<ViewportState>) => void; setTool: (tool: EditorTool) => void;
  setImporting: (value: boolean) => void; setRestoring: (value: boolean) => void;
  setCompareBefore: (value: boolean) => void; setMessage: (message: string) => void;
  setError: (error: string | null) => void; resetProject: () => void;
  undo: () => void; redo: () => void; beginTransaction: () => void; endTransaction: () => void;
}

const initialViewport = (): ViewportState => ({ zoom: 0.5, panX: 0, panY: 0 });
const snapshot = (state: Pick<EditorState, 'document' | 'layers' | 'selectedLayerId'>): HistorySnapshot => ({
  document: structuredClone(state.document), layers: structuredClone(state.layers), selectedLayerId: state.selectedLayerId,
});
const sameSnapshot = (a: HistorySnapshot, b: HistorySnapshot) => JSON.stringify(a) === JSON.stringify(b);
const withHistory = (state: EditorState, patch: Partial<EditorState>): Partial<EditorState> => ({
  ...patch,
  past: state.transactionBase ? state.past : [...state.past.slice(-79), snapshot(state)],
  future: [],
});
const topRasterId = (layers: RasterLayer[]): string | null => [...layers].reverse().find((layer) => layer.kind !== 'group')?.id ?? null;
const rasterCount = (layers: RasterLayer[]): number => layers.filter((layer) => layer.kind !== 'group').length;

export const useEditorStore = create<EditorState>((set) => ({
  document: defaultDocument(), layers: [], selectedLayerId: null, viewport: initialViewport(), tool: 'move',
  isImporting: false, isRestoring: true, compareBefore: false, message: 'Ready', error: null,
  past: [], future: [], transactionBase: null,
  setDocument: (patch) => set((state) => withHistory(state, { document: { ...state.document, ...patch } })),
  cropCanvas: (width, height) => set((state) => { const nextWidth = Math.max(1, Math.min(state.document.width, Math.round(width))), nextHeight = Math.max(1, Math.min(state.document.height, Math.round(height))); if (nextWidth === state.document.width && nextHeight === state.document.height) return state; const shiftX = (nextWidth - state.document.width) / 2, shiftY = (nextHeight - state.document.height) / 2; return withHistory(state, { document: { ...state.document, width: nextWidth, height: nextHeight }, layers: state.layers.map((layer) => layer.kind === 'group' ? layer : { ...layer, transform: { ...layer.transform, x: layer.transform.x + shiftX, y: layer.transform.y + shiftY } }), message: `Canvas cropped to ${nextWidth} × ${nextHeight}` }); }),
  setFinish: (patch) => set((state) => withHistory(state, { document: { ...state.document, finish: { ...defaultFinish(), ...state.document.finish, ...patch } } })),
  setSceneLock: (patch) => set((state) => ({ document: { ...state.document, sceneLock: { ...defaultSceneLock(), ...state.document.sceneLock, ...patch } } })),
  replaceProject: (document, layers, record = true) => set((state) => ({
    ...(record ? withHistory(state, {}) : { past: [], future: [] }), document: { ...defaultDocument(), ...document, sceneLock: { ...defaultSceneLock(), ...document.sceneLock }, finish: { ...defaultFinish(), ...document.finish } }, layers: layers.map((layer) => ({ ...layer, adjustments: normalizeAdjustments(layer.adjustments), depthOfField: { ...defaultDepthOfField(), ...layer.depthOfField } })),
    selectedLayerId: topRasterId(layers), viewport: initialViewport(), message: `${rasterCount(layers)} layer${rasterCount(layers) === 1 ? '' : 's'} loaded`, error: null,
  })),
  appendLayers: (layers) => set((state) => withHistory(state, { layers: [...state.layers, ...layers], selectedLayerId: topRasterId(layers) ?? state.selectedLayerId, message: `${rasterCount(layers)} layer${rasterCount(layers) === 1 ? '' : 's'} imported` })),
  selectLayer: (id) => set({ selectedLayerId: id }),
  patchLayer: (id, patch) => set((state) => withHistory(state, { layers: state.layers.map((layer) => layer.id === id ? { ...layer, ...patch } : layer) })),
  patchLayerTransform: (id, patch) => set((state) => withHistory(state, { layers: state.layers.map((layer) => layer.id === id ? { ...layer, transform: { ...layer.transform, ...patch } } : layer) })),
  patchLayerAdjustments: (id, patch) => set((state) => withHistory(state, { layers: state.layers.map((layer) => layer.id === id ? { ...layer, adjustments: { ...layer.adjustments, ...patch } } : layer) })),
  patchLayerDepthOfField: (id, patch) => set((state) => withHistory(state, { layers: state.layers.map((layer) => layer.id === id ? { ...layer, depthOfField: { ...defaultDepthOfField(), ...layer.depthOfField, ...patch } } : layer) })),
  resetAdjustment: (id, key) => set((state) => withHistory(state, { layers: state.layers.map((layer) => layer.id === id ? { ...layer, adjustments: { ...layer.adjustments, [key]: defaultAdjustments()[key] } } : layer) })),
  resetLayerValues: (id) => set((state) => withHistory(state, { layers: state.layers.map((layer) => layer.id === id ? { ...layer, opacity: 100, blendMode: 'source-over', transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }, adjustments: defaultAdjustments(), depthOfField: defaultDepthOfField() } : layer), message: 'Layer values reset' })),
  removeLayer: (id) => set((state) => { const removed = new Set([id]); let changed = true; while (changed) { changed = false; for (const layer of state.layers) if (layer.parentId && removed.has(layer.parentId) && !removed.has(layer.id)) { removed.add(layer.id); changed = true; } } const next = state.layers.filter((layer) => !removed.has(layer.id)); return withHistory(state, { layers: next, selectedLayerId: state.selectedLayerId && removed.has(state.selectedLayerId) ? topRasterId(next) : state.selectedLayerId, message: removed.size > 1 ? 'Group and contents removed' : 'Layer removed' }); }),
  duplicateLayer: (id) => set((state) => { const index = state.layers.findIndex((l) => l.id === id); const source = state.layers[index]; if (!source || source.kind === 'group' || source.parentId) return state; const copy = { ...structuredClone(source), id: makeId(), name: `${source.name} copy`, transform: { ...source.transform, x: source.transform.x + 20, y: source.transform.y + 20 } }; const layers = [...state.layers]; layers.splice(index + 1, 0, copy); return withHistory(state, { layers, selectedLayerId: copy.id, message: 'Layer duplicated' }); }),
  moveLayer: (id, direction) => set((state) => { const from = state.layers.findIndex((l) => l.id === id), current = state.layers[from]; if (!current || current.kind === 'group' || current.parentId) return state; const to = direction === 'up' ? from + 1 : from - 1; if (to < 0 || to >= state.layers.length || state.layers[to]?.kind === 'group' || state.layers[to]?.parentId) return state; const layers = [...state.layers]; const [layer] = layers.splice(from, 1); if (!layer) return state; layers.splice(to, 0, layer); return withHistory(state, { layers }); }),
  setViewport: (patch) => set((state) => ({ viewport: { ...state.viewport, ...patch } })), setTool: (tool) => set({ tool }),
  setImporting: (isImporting) => set({ isImporting }), setRestoring: (isRestoring) => set({ isRestoring }),
  setCompareBefore: (compareBefore) => set({ compareBefore }), setMessage: (message) => set({ message }), setError: (error) => set({ error }),
  resetProject: () => set({ document: defaultDocument(), layers: [], selectedLayerId: null, viewport: initialViewport(), compareBefore: false, message: 'New 1920 × 1080 composition', error: null, past: [], future: [], transactionBase: null }),
  undo: () => set((state) => { const previous = state.past.at(-1); if (!previous) return state; return { ...previous, past: state.past.slice(0, -1), future: [snapshot(state), ...state.future].slice(0, 80), message: 'Undo' }; }),
  redo: () => set((state) => { const next = state.future[0]; if (!next) return state; return { ...next, past: [...state.past.slice(-79), snapshot(state)], future: state.future.slice(1), message: 'Redo' }; }),
  beginTransaction: () => set((state) => state.transactionBase ? state : { transactionBase: snapshot(state) }),
  endTransaction: () => set((state) => { const base = state.transactionBase; if (!base) return state; const current = snapshot(state); return { transactionBase: null, past: sameSnapshot(base, current) ? state.past : [...state.past.slice(-79), base], future: sameSnapshot(base, current) ? state.future : [] }; }),
}));
