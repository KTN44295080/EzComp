import type { CompositeDocument, RasterLayer, ViewportState } from '../types/editor';

export interface Point {
  x: number;
  y: number;
}

export function screenToDocument(
  point: Point,
  canvasSize: { width: number; height: number },
  document: CompositeDocument,
  viewport: ViewportState,
): Point {
  return {
    x:
      (point.x - (canvasSize.width / 2 + viewport.panX)) / viewport.zoom +
      document.width / 2,
    y:
      (point.y - (canvasSize.height / 2 + viewport.panY)) / viewport.zoom +
      document.height / 2,
  };
}

export function documentToScreen(
  point: Point,
  canvasSize: { width: number; height: number },
  document: CompositeDocument,
  viewport: ViewportState,
): Point {
  return {
    x:
      (point.x - document.width / 2) * viewport.zoom +
      canvasSize.width / 2 +
      viewport.panX,
    y:
      (point.y - document.height / 2) * viewport.zoom +
      canvasSize.height / 2 +
      viewport.panY,
  };
}

export function pointInsideLayer(point: Point, layer: RasterLayer): boolean {
  const { transform } = layer;
  const centerX = transform.x + (layer.width * transform.scaleX) / 2;
  const centerY = transform.y + (layer.height * transform.scaleY) / 2;
  const radians = (-transform.rotation * Math.PI) / 180;
  const deltaX = point.x - centerX;
  const deltaY = point.y - centerY;
  const localX = deltaX * Math.cos(radians) - deltaY * Math.sin(radians);
  const localY = deltaX * Math.sin(radians) + deltaY * Math.cos(radians);

  return (
    Math.abs(localX) <= Math.abs((layer.width * transform.scaleX) / 2) &&
    Math.abs(localY) <= Math.abs((layer.height * transform.scaleY) / 2)
  );
}

export function fitZoom(
  canvasSize: { width: number; height: number },
  document: CompositeDocument,
  padding = 56,
): number {
  const availableWidth = Math.max(1, canvasSize.width - padding * 2);
  const availableHeight = Math.max(1, canvasSize.height - padding * 2);
  return Math.min(availableWidth / document.width, availableHeight / document.height, 1);
}
