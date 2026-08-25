# EzComp architecture

## Runtime boundaries

EzComp separates serializable editor state from binary image assets.

- `src/store/editorStore.ts` owns the document, layer parameters, selection, tool, and viewport.
- `src/lib/assets.ts` owns browser image objects keyed by `assetId`.
- `src/lib/importers.ts` converts local files and PSD raster layers into the editor model.
- `src/lib/renderer.ts` evaluates non-destructive adjustments and renders preview/export pixels.
- `src/components/EditorCanvas.tsx` owns viewport interaction and hit testing.

This separation is deliberate. A future project format can serialize layer parameters and store image blobs in IndexedDB without placing `ImageBitmap` or canvas objects inside application state.

## Layer order

The store keeps layers in bottom-to-top order. Rendering iterates forward. The Layers panel displays the reversed order to match conventional image editors.

## Render pipeline

1. Resolve the immutable source asset from the registry.
2. Evaluate color adjustments into a cached raster only when adjustment parameters change.
3. Apply blur as a final raster operation.
4. Apply transform, opacity, and blend mode while compositing.
5. Clip all layer output to document bounds.

The full-resolution PNG exporter uses the same composition pipeline as the viewport, without the checkerboard surface.

## Near-term milestones

### M1 — Editing fundamentals

- Undo/redo transactions
- Drag handles for scale and rotation
- Layer locking and drag reordering
- Crop and document resize UI
- Autosave to IndexedDB

### M2 — Compositing tools

- Raster and vector masks
- Feather, expand/contract, and edge decontamination
- Curves, levels, HSL, and channel mixer
- Shadow catcher, contact shadow, and light wrap
- Background-driven color-match analysis

### M3 — Production renderer

- WebGPU renderer with WebGL2 fallback
- Tiled processing for large documents
- Web Worker PSD decode and adjustment evaluation
- Linear-light internal compositing and color-profile handling
- 16-bit processing where browser capabilities permit

### M4 — Project interchange

- `.ezcomp` project package
- PSD export where supported
- Embedded or linked assets
- Deterministic render snapshots and regression fixtures
