import { readPsd } from 'ag-psd';
import { registerAsset } from './assets';
import {
  defaultAdjustments,
  type BlendMode,
  type CompositeDocument,
  type RasterLayer,
} from '../types/editor';

interface PsdLayerLike {
  name?: string;
  top?: number;
  left?: number;
  bottom?: number;
  right?: number;
  hidden?: boolean;
  opacity?: number;
  blendMode?: string;
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  children?: PsdLayerLike[];
}

interface PsdLike {
  width: number;
  height: number;
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  children?: PsdLayerLike[];
}

export interface ImportResult {
  document?: CompositeDocument;
  layers: RasterLayer[];
  shouldReplaceProject: boolean;
}

const psdBlendModeMap: Record<string, BlendMode> = {
  normal: 'source-over',
  dissolve: 'source-over',
  darken: 'darken',
  multiply: 'multiply',
  colorburn: 'color-burn',
  linearburn: 'color-burn',
  lighten: 'lighten',
  screen: 'screen',
  colordodge: 'color-dodge',
  lineardodge: 'color-dodge',
  overlay: 'overlay',
  softlight: 'soft-light',
  hardlight: 'hard-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
};

function normalizeBlendMode(value?: string): BlendMode {
  if (!value) {
    return 'source-over';
  }
  const key = value.toLowerCase().replaceAll(/[^a-z]/g, '');
  return psdBlendModeMap[key] ?? 'source-over';
}

function normalizeOpacity(value?: number): number {
  if (value === undefined) {
    return 100;
  }
  const normalized = value <= 1 ? value * 100 : (value / 255) * 100;
  return Math.round(Math.min(100, Math.max(0, normalized)));
}

async function createThumbnail(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<string> {
  const size = 72;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    return '';
  }
  const scale = Math.min(size / width, size / height);
  const drawWidth = Math.max(1, width * scale);
  const drawHeight = Math.max(1, height * scale);
  context.clearRect(0, 0, size, size);
  context.drawImage(
    source,
    (size - drawWidth) / 2,
    (size - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
  return canvas.toDataURL('image/png');
}

async function makeRasterLayer(
  source: CanvasImageSource,
  options: {
    name: string;
    sourcePath?: string;
    width: number;
    height: number;
    x: number;
    y: number;
    opacity?: number;
    visible?: boolean;
    blendMode?: BlendMode;
    scale?: number;
  },
): Promise<RasterLayer> {
  const id = crypto.randomUUID();
  const assetId = crypto.randomUUID();
  registerAsset(assetId, source, options.width, options.height);

  return {
    id,
    assetId,
    name: options.name,
    sourcePath: options.sourcePath,
    width: options.width,
    height: options.height,
    thumbnailUrl: await createThumbnail(source, options.width, options.height),
    visible: options.visible ?? true,
    locked: false,
    opacity: options.opacity ?? 100,
    blendMode: options.blendMode ?? 'source-over',
    transform: {
      x: options.x,
      y: options.y,
      scaleX: options.scale ?? 1,
      scaleY: options.scale ?? 1,
      rotation: 0,
    },
    adjustments: defaultAdjustments(),
  };
}

function flattenPsdTree(
  children: PsdLayerLike[],
  parentPath: string[] = [],
): Array<{ layer: PsdLayerLike; path: string[] }> {
  const flattened: Array<{ layer: PsdLayerLike; path: string[] }> = [];

  for (const child of children) {
    const name = child.name?.trim() || 'Unnamed layer';
    const path = [...parentPath, name];
    if (child.children?.length) {
      flattened.push(...flattenPsdTree(child.children, path));
    }
    if (child.canvas) {
      flattened.push({ layer: child, path });
    }
  }

  return flattened;
}

async function importPsd(file: File, hasExistingLayers: boolean): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  const psd = readPsd(buffer) as unknown as PsdLike;
  const documentModel: CompositeDocument = {
    name: file.name.replace(/\.psd$/i, ''),
    width: psd.width,
    height: psd.height,
    background: 'transparent',
  };

  const flattened = flattenPsdTree(psd.children ?? []);
  const layers: RasterLayer[] = [];

  // PSD layer arrays are top-to-bottom. The editor stores bottom-to-top.
  for (const item of [...flattened].reverse()) {
    const { layer, path } = item;
    if (!layer.canvas) {
      continue;
    }
    const left = layer.left ?? 0;
    const top = layer.top ?? 0;
    const width = Math.max(1, (layer.right ?? left + layer.canvas.width) - left);
    const height = Math.max(1, (layer.bottom ?? top + layer.canvas.height) - top);
    const bitmap = await createImageBitmap(layer.canvas);
    layers.push(
      await makeRasterLayer(bitmap, {
        name: path.at(-1) ?? 'PSD layer',
        sourcePath: path.length > 1 ? path.slice(0, -1).join(' / ') : undefined,
        width,
        height,
        x: left,
        y: top,
        opacity: normalizeOpacity(layer.opacity),
        visible: !layer.hidden,
        blendMode: normalizeBlendMode(layer.blendMode),
      }),
    );
  }

  if (layers.length === 0 && psd.canvas) {
    const bitmap = await createImageBitmap(psd.canvas);
    layers.push(
      await makeRasterLayer(bitmap, {
        name: documentModel.name,
        width: psd.width,
        height: psd.height,
        x: 0,
        y: 0,
      }),
    );
  }

  if (layers.length === 0) {
    throw new Error('This PSD did not contain readable raster or composite image data.');
  }

  return {
    document: hasExistingLayers ? undefined : documentModel,
    layers,
    shouldReplaceProject: !hasExistingLayers,
  };
}

async function importImage(
  file: File,
  currentDocument: CompositeDocument,
  hasExistingLayers: boolean,
): Promise<ImportResult> {
  const bitmap = await createImageBitmap(file);
  const shouldReplaceProject = !hasExistingLayers;
  const targetDocument: CompositeDocument = shouldReplaceProject
    ? {
        name: file.name.replace(/\.[^.]+$/, ''),
        width: bitmap.width,
        height: bitmap.height,
        background: 'transparent',
      }
    : currentDocument;
  const scale = shouldReplaceProject
    ? 1
    : Math.min(1, targetDocument.width / bitmap.width, targetDocument.height / bitmap.height);
  const x = (targetDocument.width - bitmap.width * scale) / 2;
  const y = (targetDocument.height - bitmap.height * scale) / 2;

  return {
    document: shouldReplaceProject ? targetDocument : undefined,
    layers: [
      await makeRasterLayer(bitmap, {
        name: file.name,
        width: bitmap.width,
        height: bitmap.height,
        x,
        y,
        scale,
      }),
    ],
    shouldReplaceProject,
  };
}

export async function importFiles(
  files: File[],
  currentDocument: CompositeDocument,
  hasExistingLayers: boolean,
): Promise<ImportResult[]> {
  const supported = files.filter(
    (file) => file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.psd'),
  );

  if (supported.length === 0) {
    throw new Error('Choose a PSD, PNG, JPEG, or WebP image.');
  }

  const results: ImportResult[] = [];
  let projectHasLayers = hasExistingLayers;
  let activeDocument = currentDocument;

  for (const file of supported) {
    const result = file.name.toLowerCase().endsWith('.psd')
      ? await importPsd(file, projectHasLayers)
      : await importImage(file, activeDocument, projectHasLayers);
    results.push(result);
    projectHasLayers = true;
    if (result.document) {
      activeDocument = result.document;
    }
  }

  return results;
}
