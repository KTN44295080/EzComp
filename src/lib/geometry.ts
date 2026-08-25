import type { CompositeDocument, RasterLayer, ViewportState } from '../types/editor';
export interface Point { x: number; y: number }
export function screenToDocument(point: Point, canvas: { width: number; height: number }, document: CompositeDocument, viewport: ViewportState): Point {
  return { x: (point.x - (canvas.width / 2 + viewport.panX)) / viewport.zoom + document.width / 2, y: (point.y - (canvas.height / 2 + viewport.panY)) / viewport.zoom + document.height / 2 };
}
export function documentToScreen(point: Point, canvas: { width: number; height: number }, document: CompositeDocument, viewport: ViewportState): Point {
  return { x: (point.x - document.width / 2) * viewport.zoom + canvas.width / 2 + viewport.panX, y: (point.y - document.height / 2) * viewport.zoom + canvas.height / 2 + viewport.panY };
}
export function layerCenter(layer: RasterLayer): Point {
  return { x: layer.transform.x + layer.width * layer.transform.scaleX / 2, y: layer.transform.y + layer.height * layer.transform.scaleY / 2 };
}
function rotate(point: Point, center: Point, radians: number): Point {
  const x = point.x - center.x, y = point.y - center.y;
  return { x: center.x + x * Math.cos(radians) - y * Math.sin(radians), y: center.y + x * Math.sin(radians) + y * Math.cos(radians) };
}
export function layerHandles(layer: RasterLayer, rotationDistance: number): { corners: Point[]; rotation: Point; top: Point } {
  const center = layerCenter(layer), halfW = Math.abs(layer.width * layer.transform.scaleX) / 2, halfH = Math.abs(layer.height * layer.transform.scaleY) / 2, radians = layer.transform.rotation * Math.PI / 180;
  const corners = [{ x: center.x - halfW, y: center.y - halfH }, { x: center.x + halfW, y: center.y - halfH }, { x: center.x + halfW, y: center.y + halfH }, { x: center.x - halfW, y: center.y + halfH }].map((p) => rotate(p, center, radians));
  const top = rotate({ x: center.x, y: center.y - halfH }, center, radians);
  const rotation = rotate({ x: center.x, y: center.y - halfH - rotationDistance }, center, radians);
  return { corners, rotation, top };
}
export function pointInsideLayer(point: Point, layer: RasterLayer): boolean {
  const center = layerCenter(layer), radians = -layer.transform.rotation * Math.PI / 180, dx = point.x - center.x, dy = point.y - center.y;
  const x = dx * Math.cos(radians) - dy * Math.sin(radians), y = dx * Math.sin(radians) + dy * Math.cos(radians);
  return Math.abs(x) <= Math.abs(layer.width * layer.transform.scaleX / 2) && Math.abs(y) <= Math.abs(layer.height * layer.transform.scaleY / 2);
}
export function nearestTransformHandle(point: Point, layer: RasterLayer, zoom: number): 'scale' | 'rotate' | null {
  const handles = layerHandles(layer, 34 / zoom), threshold = 11 / zoom;
  if (Math.hypot(point.x - handles.rotation.x, point.y - handles.rotation.y) <= threshold) return 'rotate';
  return handles.corners.some((p) => Math.hypot(point.x - p.x, point.y - p.y) <= threshold) ? 'scale' : null;
}
export function fitZoom(canvas: { width: number; height: number }, document: CompositeDocument, padding = 56): number {
  return Math.min(Math.max(1, canvas.width - padding * 2) / document.width, Math.max(1, canvas.height - padding * 2) / document.height, 1);
}
