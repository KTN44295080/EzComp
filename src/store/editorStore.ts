import { create } from 'zustand';
import type {
  CompositeDocument,
  EditorTool,
  LayerAdjustments,
  LayerTransform,
  RasterLayer,
  ViewportState,
} from '../types/editor';
import { defaultDocument } from '../types/editor';

interface EditorState {
  document: CompositeDocument;
  layers: RasterLayer[];
  selectedLayerId: string | null;
  viewport: ViewportState;
  tool: EditorTool;
  isImporting: boolean;
  message: string;
  setDocument: (patch: Partial<CompositeDocument>) => void;
  replaceProject: (document: CompositeDocument, layers: RasterLayer[]) => void;
  appendLayers: (layers: RasterLayer[]) => void;
  selectLayer: (id: string | null) => void;
  patchLayer: (id: string, patch: Partial<RasterLayer>) => void;
  patchLayerTransform: (id: string, patch: Partial<LayerTransform>) => void;
  patchLayerAdjustments: (id: string, patch: Partial<LayerAdjustments>) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  moveLayer: (id: string, direction: 'up' | 'down') => void;
  setViewport: (patch: Partial<ViewportState>) => void;
  setTool: (tool: EditorTool) => void;
  setImporting: (isImporting: boolean) => void;
  setMessage: (message: string) => void;
  resetProject: () => void;
}

const initialViewport = (): ViewportState => ({ zoom: 0.5, panX: 0, panY: 0 });

export const useEditorStore = create<EditorState>((set) => ({
  document: defaultDocument(),
  layers: [],
  selectedLayerId: null,
  viewport: initialViewport(),
  tool: 'move',
  isImporting: false,
  message: 'Ready',

  setDocument: (patch) =>
    set((state) => ({
      document: { ...state.document, ...patch },
    })),

  replaceProject: (document, layers) =>
    set({
      document,
      layers,
      selectedLayerId: layers.at(-1)?.id ?? null,
      viewport: initialViewport(),
      message: `${layers.length} layer${layers.length === 1 ? '' : 's'} loaded`,
    }),

  appendLayers: (layers) =>
    set((state) => ({
      layers: [...state.layers, ...layers],
      selectedLayerId: layers.at(-1)?.id ?? state.selectedLayerId,
      message: `${layers.length} layer${layers.length === 1 ? '' : 's'} imported`,
    })),

  selectLayer: (id) => set({ selectedLayerId: id }),

  patchLayer: (id, patch) =>
    set((state) => ({
      layers: state.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
    })),

  patchLayerTransform: (id, patch) =>
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id
          ? { ...layer, transform: { ...layer.transform, ...patch } }
          : layer,
      ),
    })),

  patchLayerAdjustments: (id, patch) =>
    set((state) => ({
      layers: state.layers.map((layer) =>
        layer.id === id
          ? { ...layer, adjustments: { ...layer.adjustments, ...patch } }
          : layer,
      ),
    })),

  removeLayer: (id) =>
    set((state) => {
      const nextLayers = state.layers.filter((layer) => layer.id !== id);
      const removedIndex = state.layers.findIndex((layer) => layer.id === id);
      const nextSelection =
        state.selectedLayerId === id
          ? (nextLayers[Math.min(Math.max(removedIndex - 1, 0), nextLayers.length - 1)]?.id ?? null)
          : state.selectedLayerId;
      return {
        layers: nextLayers,
        selectedLayerId: nextSelection,
        message: 'Layer removed',
      };
    }),

  duplicateLayer: (id) =>
    set((state) => {
      const sourceIndex = state.layers.findIndex((layer) => layer.id === id);
      const source = state.layers[sourceIndex];
      if (!source) {
        return state;
      }
      const duplicate: RasterLayer = {
        ...source,
        id: crypto.randomUUID(),
        name: `${source.name} copy`,
        transform: {
          ...source.transform,
          x: source.transform.x + 20,
          y: source.transform.y + 20,
        },
        adjustments: { ...source.adjustments },
      };
      const nextLayers = [...state.layers];
      nextLayers.splice(sourceIndex + 1, 0, duplicate);
      return {
        layers: nextLayers,
        selectedLayerId: duplicate.id,
        message: 'Layer duplicated',
      };
    }),

  moveLayer: (id, direction) =>
    set((state) => {
      const sourceIndex = state.layers.findIndex((layer) => layer.id === id);
      const targetIndex = direction === 'up' ? sourceIndex + 1 : sourceIndex - 1;
      if (
        sourceIndex < 0 ||
        targetIndex < 0 ||
        targetIndex >= state.layers.length
      ) {
        return state;
      }
      const nextLayers = [...state.layers];
      const [layer] = nextLayers.splice(sourceIndex, 1);
      if (!layer) {
        return state;
      }
      nextLayers.splice(targetIndex, 0, layer);
      return { layers: nextLayers };
    }),

  setViewport: (patch) =>
    set((state) => ({
      viewport: { ...state.viewport, ...patch },
    })),

  setTool: (tool) => set({ tool }),
  setImporting: (isImporting) => set({ isImporting }),
  setMessage: (message) => set({ message }),

  resetProject: () =>
    set({
      document: defaultDocument(),
      layers: [],
      selectedLayerId: null,
      viewport: initialViewport(),
      tool: 'move',
      message: 'New 1920 × 1080 composition',
    }),
}));
