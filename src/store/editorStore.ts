import { create } from 'zustand';
import { defaultAdjustments, defaultDocument, type CompositeDocument, type EditorTool, type LayerAdjustments, type LayerTransform, type RasterLayer, type ViewportState } from '../types/editor';
import { makeId } from '../lib/id';

interface HistorySnapshot { document: CompositeDocument; layers: RasterLayer[]; selectedLayerId: string | null }
interface EditorState {
  document: CompositeDocument; layers: RasterLayer[]; selectedLayerId: string | null;
  viewport: ViewportState; tool: EditorTool; isImporting: boolean; isRestoring: boolean;
  compareBefore: boolean; message: string; error: string | null;
  past: HistorySnapshot[]; future: HistorySnapshot[]; transactionBase: HistorySnapshot | null;
  setDocument: (patch: Partial<CompositeDocument>) => void;
  replaceProject: (document: CompositeDocument, layers: RasterLayer[], record?: boolean) => void;
  appendLayers: (layers: RasterLayer[]) => void; selectLayer: (id: string | null) => void;
  patchLayer: (id: string, patch: Partial<RasterLayer>) => void;
  patchLayerTransform: (id: string, patch: Partial<LayerTransform>) => void;
  patchLayerAdjustments: (id: string, patch: Partial<LayerAdjustments>) => void;
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

export const useEditorStore = create<EditorState>((set) => ({
  document: defaultDocument(), layers: [], selectedLayerId: null, viewport: initialViewport(), tool: 'move',
  isImporting: false, isRestoring: true, compareBefore: false, message: 'Ready', error: null,
  past: [], future: [], transactionBase: null,
  setDocument: (patch) => set((state) => withHistory(state, { document: { ...state.document, ...patch } })),
  replaceProject: (document, layers, record = true) => set((state) => ({
    ...(record ? withHistory(state, {}) : { past: [], future: [] }), document, layers,
    selectedLayerId: layers.at(-1)?.id ?? null, viewport: initialViewport(), message: `${layers.length} layer${layers.length === 1 ? '' : 's'} loaded`, error: null,
  })),
  appendLayers: (layers) => set((state) => withHistory(state, { layers: [...state.layers, ...layers], selectedLayerId: layers.at(-1)?.id ?? state.selectedLayerId, message: `${layers.length} layer${layers.length === 1 ? '' : 's'} imported` })),
  selectLayer: (id) => set({ selectedLayerId: id }),
  patchLayer: (id, patch) => set((state) => withHistory(state, { layers: state.layers.map((layer) => layer.id === id ? { ...layer, ...patch } : layer) })),
  patchLayerTransform: (id, patch) => set((state) => withHistory(state, { layers: state.layers.map((layer) => layer.id === id ? { ...layer, transform: { ...layer.transform, ...patch } } : layer) })),
  patchLayerAdjustments: (id, patch) => set((state) => withHistory(state, { layers: state.layers.map((layer) => layer.id === id ? { ...layer, adjustments: { ...layer.adjustments, ...patch } } : layer) })),
  resetAdjustment: (id, key) => set((state) => withHistory(state, { layers: state.layers.map((layer) => layer.id === id ? { ...layer, adjustments: { ...layer.adjustments, [key]: defaultAdjustments()[key] } } : layer) })),
  resetLayerValues: (id) => set((state) => withHistory(state, { layers: state.layers.map((layer) => layer.id === id ? { ...layer, opacity: 100, blendMode: 'source-over', transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }, adjustments: defaultAdjustments() } : layer), message: 'Layer values reset' })),
  removeLayer: (id) => set((state) => { const next = state.layers.filter((l) => l.id !== id); return withHistory(state, { layers: next, selectedLayerId: state.selectedLayerId === id ? next.at(-1)?.id ?? null : state.selectedLayerId, message: 'Layer removed' }); }),
  duplicateLayer: (id) => set((state) => { const index = state.layers.findIndex((l) => l.id === id); const source = state.layers[index]; if (!source) return state; const copy = { ...structuredClone(source), id: makeId(), name: `${source.name} copy`, transform: { ...source.transform, x: source.transform.x + 20, y: source.transform.y + 20 } }; const layers = [...state.layers]; layers.splice(index + 1, 0, copy); return withHistory(state, { layers, selectedLayerId: copy.id, message: 'Layer duplicated' }); }),
  moveLayer: (id, direction) => set((state) => { const from = state.layers.findIndex((l) => l.id === id); const to = direction === 'up' ? from + 1 : from - 1; if (from < 0 || to < 0 || to >= state.layers.length) return state; const layers = [...state.layers]; const [layer] = layers.splice(from, 1); if (!layer) return state; layers.splice(to, 0, layer); return withHistory(state, { layers }); }),
  setViewport: (patch) => set((state) => ({ viewport: { ...state.viewport, ...patch } })), setTool: (tool) => set({ tool }),
  setImporting: (isImporting) => set({ isImporting }), setRestoring: (isRestoring) => set({ isRestoring }),
  setCompareBefore: (compareBefore) => set({ compareBefore }), setMessage: (message) => set({ message }), setError: (error) => set({ error }),
  resetProject: () => set({ document: defaultDocument(), layers: [], selectedLayerId: null, viewport: initialViewport(), compareBefore: false, message: 'New 1920 × 1080 composition', error: null, past: [], future: [], transactionBase: null }),
  undo: () => set((state) => { const previous = state.past.at(-1); if (!previous) return state; return { ...previous, past: state.past.slice(0, -1), future: [snapshot(state), ...state.future].slice(0, 80), message: 'Undo' }; }),
  redo: () => set((state) => { const next = state.future[0]; if (!next) return state; return { ...next, past: [...state.past.slice(-79), snapshot(state)], future: state.future.slice(1), message: 'Redo' }; }),
  beginTransaction: () => set((state) => state.transactionBase ? state : { transactionBase: snapshot(state) }),
  endTransaction: () => set((state) => { const base = state.transactionBase; if (!base) return state; const current = snapshot(state); return { transactionBase: null, past: sameSnapshot(base, current) ? state.past : [...state.past.slice(-79), base], future: sameSnapshot(base, current) ? state.future : [] }; }),
}));
