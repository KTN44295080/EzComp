# EzComp

EzComp is a local-first web compositor for matching existing image assets without regenerating them. Imported pixels remain authoritative; transforms and color corrections are stored as non-destructive parameters and evaluated in Canvas 2D at preview/export time.

## Features

- PSD, PNG, JPEG, and WebP import
- PSD raster layer names, hierarchy paths, visibility, opacity, position, and common blend modes
- Layer reordering, duplication, visibility, locking, selection, and deletion
- Canvas move, uniform scale handles, rotation handle, pan, zoom, and fit
- Exposure, contrast, saturation, temperature, tint, blur, opacity, and blend mode
- Per-adjustment reset, color reset, transform reset, and all-layer-value reset
- Undo/redo with pointer interactions grouped into a single history step
- Before/After adjustment comparison
- Local `.ezcomp` project download and load, including raster pixels
- IndexedDB autosave and startup restore
- Full-resolution PNG export
- Loading, error, autosave, drop, and empty states

Images are processed in the browser. EzComp has no image upload endpoint, D1 database, R2 bucket, or generative-image feature.

## Keyboard and pointer controls

- `Ctrl/Cmd + Z`: Undo
- `Ctrl/Cmd + Shift + Z` or `Ctrl/Cmd + Y`: Redo
- `Ctrl/Cmd + S`: Save `.ezcomp` project
- `Ctrl/Cmd + O`: Open `.ezcomp` project
- `Ctrl/Cmd + D`: Duplicate selected layer
- `V`: Move tool
- `H`: Hand tool
- `B`: Toggle Before/After
- Hold `Space`: Temporary hand tool
- Mouse wheel: Zoom around cursor
- Middle mouse drag: Pan
- Arrow keys: Nudge by 1 px
- `Shift + Arrow`: Nudge by 10 px
- `Delete` / `Backspace`: Delete selected layer
- `0`: Fit composition to viewport
- Paste or drag supported raster images to import

## Verification

```bash
npm test
npm run typecheck
npm run build
```

PSD support uses `ag-psd`. Unsupported Photoshop features are not emulated; readable raster layers are imported and the composite image is used as fallback. Masks, adjustment layers, smart objects, 16-bit channels, PSB, and full color-managed wide-gamut workflows remain outside the current scope.
