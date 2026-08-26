import { defaultLayerCrop, type LayerCrop, type RasterLayer } from '../types/editor';

const finite = (value: number | undefined): number => Number.isFinite(value) ? Math.round(value ?? 0) : 0;

export function normalizeLayerCrop(crop: Partial<LayerCrop> | undefined, width: number, height: number): LayerCrop {
  const source = { ...defaultLayerCrop(), ...crop }, maxX = Math.max(0, Math.round(width) - 1), maxY = Math.max(0, Math.round(height) - 1);
  const left = Math.min(maxX, Math.max(0, finite(source.left))), top = Math.min(maxY, Math.max(0, finite(source.top)));
  return {
    left,
    top,
    right: Math.min(Math.max(0, maxX - left), Math.max(0, finite(source.right))),
    bottom: Math.min(Math.max(0, maxY - top), Math.max(0, finite(source.bottom))),
  };
}

export function layerCropRect(layer: Pick<RasterLayer, 'crop' | 'width' | 'height'>): { x: number; y: number; width: number; height: number } {
  const crop = normalizeLayerCrop(layer.crop, layer.width, layer.height);
  return { x: crop.left, y: crop.top, width: Math.max(1, layer.width - crop.left - crop.right), height: Math.max(1, layer.height - crop.top - crop.bottom) };
}

export function layerCropKey(layer: Pick<RasterLayer, 'crop' | 'width' | 'height'>): string {
  const crop = normalizeLayerCrop(layer.crop, layer.width, layer.height);
  return `${crop.left}:${crop.top}:${crop.right}:${crop.bottom}`;
}
