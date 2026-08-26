import type { ContentTransform, RasterLayer } from '../types/editor';

export function applyContentTransform(layer: RasterLayer, canvas: { width: number; height: number }, previous: ContentTransform, next: ContentTransform): RasterLayer {
  if (layer.kind === 'group') return layer;
  const factor = next.scale / Math.max(.0001, previous.scale), centerX = canvas.width / 2, centerY = canvas.height / 2;
  const layerCenterX = layer.transform.x + layer.width * layer.transform.scaleX / 2, layerCenterY = layer.transform.y + layer.height * layer.transform.scaleY / 2;
  const nextCenterX = centerX + (layerCenterX - centerX - previous.x) * factor + next.x, nextCenterY = centerY + (layerCenterY - centerY - previous.y) * factor + next.y;
  const scaleX = layer.transform.scaleX * factor, scaleY = layer.transform.scaleY * factor;
  return { ...layer, transform: { ...layer.transform, scaleX, scaleY, x: nextCenterX - layer.width * scaleX / 2, y: nextCenterY - layer.height * scaleY / 2 } };
}

