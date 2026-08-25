# EzComp

EzComp is a local-first web compositor for matching existing image assets without regenerating them. It is aimed at fast background/character compositing, PSD inspection, and non-destructive color correction in a browser.

## Current MVP

- Import PSD, PNG, JPEG, and WebP files
- Preserve readable PSD raster layers, names, hierarchy paths, visibility, opacity, position, and common blend modes
- Reorder, duplicate, hide, remove, and select layers
- Move layers directly on the canvas or edit numeric transforms
- Adjust exposure, contrast, saturation, temperature, tint, blur, opacity, and blend mode
- Pan, zoom, fit to view, paste images, and drag-and-drop files
- Export the full-resolution composition as a PNG
- Keep all image processing in the browser; there is no upload endpoint

## Principles

1. **Existing pixels remain authoritative.** EzComp does not redraw or regenerate imported artwork.
2. **Edits are non-destructive.** Layer transforms and color adjustments are stored as parameters and evaluated for preview/export.
3. **Local by default.** Imported image data stays in browser memory.
4. **Desktop-first.** The initial UI targets mouse/keyboard compositing workflows.

## Development

Requirements: Node.js 22.12 or newer.

```bash
npm install
npm run dev
```

Verification:

```bash
npm test
npm run build
```

## Keyboard and pointer controls

- `V`: move tool
- `H`: hand tool
- Hold `Space`: temporary hand tool
- Mouse wheel: zoom around cursor
- Middle mouse drag: pan
- Arrow keys: nudge selected layer by 1 px
- `Shift` + arrow keys: nudge by 10 px
- `Delete` / `Backspace`: remove selected layer
- `0`: fit composition to viewport
- Paste an image from the clipboard to add it as a layer

## PSD support and current limitations

PSD parsing is provided by `ag-psd`. EzComp currently imports rasterized layer canvases and falls back to the PSD composite image when individual raster data is unavailable. Unsupported Photoshop features are not emulated. The initial renderer uses Canvas 2D and sRGB browser preview; color-managed wide-gamut workflows, masks, adjustment layers, smart objects, 16-bit channels, PSB, WebGPU rendering, and project persistence are roadmap items.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for implementation boundaries and the next milestones.
