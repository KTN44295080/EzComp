import type { CompositeDocument, RasterLayer, ViewportState } from '../types/editor';
import { layerCropRect } from './layerCrop';
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
  const center = layerCenter(layer), crop = layerCropRect(layer), radians = layer.transform.rotation * Math.PI / 180;
  const toDocument = (x: number, y: number) => rotate({ x: center.x + (x - layer.width / 2) * layer.transform.scaleX, y: center.y + (y - layer.height / 2) * layer.transform.scaleY }, center, radians);
  const corners = [toDocument(crop.x, crop.y), toDocument(crop.x + crop.width, crop.y), toDocument(crop.x + crop.width, crop.y + crop.height), toDocument(crop.x, crop.y + crop.height)];
  const top = toDocument(crop.x + crop.width / 2, crop.y), visualCenter = toDocument(crop.x + crop.width / 2, crop.y + crop.height / 2), distance = Math.max(.001, Math.hypot(top.x - visualCenter.x, top.y - visualCenter.y));
  const rotation = { x: top.x + (top.x - visualCenter.x) / distance * rotationDistance, y: top.y + (top.y - visualCenter.y) / distance * rotationDistance };
  return { corners, rotation, top };
}
export function pointInsideLayer(point: Point, layer: RasterLayer): boolean {
  const center = layerCenter(layer), radians = -layer.transform.rotation * Math.PI / 180, dx = point.x - center.x, dy = point.y - center.y;
  const x = (dx * Math.cos(radians) - dy * Math.sin(radians)) / layer.transform.scaleX + layer.width / 2, y = (dx * Math.sin(radians) + dy * Math.cos(radians)) / layer.transform.scaleY + layer.height / 2, crop = layerCropRect(layer);
  return x >= crop.x && x <= crop.x + crop.width && y >= crop.y && y <= crop.y + crop.height;
}
export function nearestTransformHandle(point: Point, layer: RasterLayer, zoom: number): 'scale' | 'rotate' | null {
  const handles = layerHandles(layer, 34 / zoom), threshold = 11 / zoom;
  if (Math.hypot(point.x - handles.rotation.x, point.y - handles.rotation.y) <= threshold) return 'rotate';
  return handles.corners.some((p) => Math.hypot(point.x - p.x, point.y - p.y) <= threshold) ? 'scale' : null;
}
export function fitZoom(canvas: { width: number; height: number }, document: CompositeDocument, padding = 56): number {
  return Math.min(Math.max(1, canvas.width - padding * 2) / document.width, Math.max(1, canvas.height - padding * 2) / document.height, 1);
}
