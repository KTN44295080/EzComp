import { getAsset, registerAsset } from './assets';
import { makeId } from './id';

const MODEL_ID = 'onnx-community/depth-anything-v2-small';
const MAX_INPUT_EDGE = 768;

export interface DepthProgress {
  phase: 'loading' | 'estimating' | 'processing';
  progress: number | null;
  message: string;
}

export interface DepthMapResult {
  assetId: string;
  width: number;
  height: number;
  method: 'ai' | 'fast';
}

type RawDepthImage = { data: Uint8Array | Uint8ClampedArray; width: number; height: number; channels: number };
type DepthEstimator = (input: unknown) => Promise<{ depth: RawDepthImage }>;
type TransformersModule = typeof import('@huggingface/transformers');

let estimatorPromise: Promise<{ estimator: DepthEstimator; transformers: TransformersModule; backend: 'WebGPU' | 'WASM' }> | null = null;

const createCanvas = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
};

function sourceCanvas(assetId: string, maxEdge = MAX_INPUT_EDGE): HTMLCanvasElement {
  const asset = getAsset(assetId);
  if (!asset) throw new Error('The selected layer image is not available in browser memory.');
  const scale = Math.min(1, maxEdge / Math.max(asset.width, asset.height));
  const canvas = createCanvas(asset.width * scale, asset.height * scale), context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable for depth analysis.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(asset.source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function normalizedDepthCanvas(depth: RawDepthImage): HTMLCanvasElement {
  const canvas = createCanvas(depth.width, depth.height), context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable for the depth map.');
  const values = new Uint8Array(depth.width * depth.height);
  for (let i = 0; i < values.length; i += 1) values[i] = depth.data[i * Math.max(1, depth.channels)] ?? 0;
  const sorted = Uint8Array.from(values).sort(), low = sorted[Math.floor(sorted.length * .01)] ?? 0, high = sorted[Math.floor(sorted.length * .99)] ?? 255;
  const range = Math.max(1, high - low), image = context.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < values.length; i += 1) {
    const value = Math.round(Math.min(1, Math.max(0, ((values[i] ?? 0) - low) / range)) * 255), offset = i * 4;
    image.data[offset] = value; image.data[offset + 1] = value; image.data[offset + 2] = value; image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function progressHandler(onProgress?: (progress: DepthProgress) => void) {
  return (event: unknown) => {
    const detail = event as { status?: string; progress?: number; file?: string };
    const value = Number.isFinite(detail.progress) ? Math.max(0, Math.min(100, Number(detail.progress))) : null;
    onProgress?.({ phase: 'loading', progress: value, message: value === null ? 'Loading the local depth model…' : `Loading depth model… ${Math.round(value)}%` });
  };
}

async function loadEstimator(onProgress?: (progress: DepthProgress) => void): Promise<{ estimator: DepthEstimator; transformers: TransformersModule; backend: 'WebGPU' | 'WASM' }> {
  if (estimatorPromise) return estimatorPromise;
  estimatorPromise = (async () => {
    const transformers = await import('@huggingface/transformers');
    const canUseWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator;
    if (canUseWebGpu) {
      try {
        const estimator = await transformers.pipeline('depth-estimation', MODEL_ID, { device: 'webgpu', dtype: 'q4f16', progress_callback: progressHandler(onProgress) });
        return { estimator: estimator as unknown as DepthEstimator, transformers, backend: 'WebGPU' as const };
      } catch {
        onProgress?.({ phase: 'loading', progress: null, message: 'WebGPU unavailable; switching to compatible CPU depth…' });
      }
    }
    const estimator = await transformers.pipeline('depth-estimation', MODEL_ID, { device: 'wasm', dtype: 'q8', progress_callback: progressHandler(onProgress) });
    return { estimator: estimator as unknown as DepthEstimator, transformers, backend: 'WASM' as const };
  })().catch((cause) => { estimatorPromise = null; throw cause; });
  return estimatorPromise;
}

export async function generateAiDepthMap(assetId: string, onProgress?: (progress: DepthProgress) => void): Promise<DepthMapResult> {
  const inputCanvas = sourceCanvas(assetId), { estimator, transformers, backend } = await loadEstimator(onProgress);
  onProgress?.({ phase: 'estimating', progress: null, message: `Estimating relative depth locally with ${backend}…` });
  const input = transformers.RawImage.fromCanvas(inputCanvas), output = await estimator(input);
  onProgress?.({ phase: 'processing', progress: 100, message: 'Preparing depth-aware focus masks…' });
  const canvas = normalizedDepthCanvas(output.depth), depthAssetId = makeId();
  registerAsset(depthAssetId, canvas, canvas.width, canvas.height);
  return { assetId: depthAssetId, width: canvas.width, height: canvas.height, method: 'ai' };
}

export async function generateFastDepthMap(assetId: string): Promise<DepthMapResult> {
  const source = sourceCanvas(assetId, 640), context = source.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas analysis is unavailable.');
  const pixels = context.getImageData(0, 0, source.width, source.height), output = context.createImageData(source.width, source.height), data = pixels.data;
  for (let y = 0; y < source.height; y += 1) for (let x = 0; x < source.width; x += 1) {
    const offset = (y * source.width + x) * 4, left = (y * source.width + Math.max(0, x - 2)) * 4, above = (Math.max(0, y - 2) * source.width + x) * 4;
    const luminance = (data[offset] ?? 0) * .2126 + (data[offset + 1] ?? 0) * .7152 + (data[offset + 2] ?? 0) * .0722;
    const leftLuma = (data[left] ?? 0) * .2126 + (data[left + 1] ?? 0) * .7152 + (data[left + 2] ?? 0) * .0722;
    const aboveLuma = (data[above] ?? 0) * .2126 + (data[above + 1] ?? 0) * .7152 + (data[above + 2] ?? 0) * .0722;
    const edge = Math.min(1, (Math.abs(luminance - leftLuma) + Math.abs(luminance - aboveLuma)) / 92), vertical = source.height <= 1 ? .5 : y / (source.height - 1);
    const value = Math.round(Math.min(1, Math.max(0, vertical * .72 + edge * .18 + (1 - luminance / 255) * .1)) * 255);
    output.data[offset] = value; output.data[offset + 1] = value; output.data[offset + 2] = value; output.data[offset + 3] = 255;
  }
  const raw = createCanvas(source.width, source.height), rawContext = raw.getContext('2d');
  if (!rawContext) throw new Error('Canvas 2D is unavailable.');
  rawContext.putImageData(output, 0, 0);
  const smoothed = createCanvas(source.width, source.height), smoothContext = smoothed.getContext('2d');
  if (!smoothContext) throw new Error('Canvas 2D is unavailable.');
  smoothContext.filter = 'blur(7px)'; smoothContext.drawImage(raw, 0, 0);
  const depthAssetId = makeId(); registerAsset(depthAssetId, smoothed, smoothed.width, smoothed.height);
  return { assetId: depthAssetId, width: smoothed.width, height: smoothed.height, method: 'fast' };
}
