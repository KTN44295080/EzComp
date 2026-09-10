import * as original from './renderer';
import { clearGroundingCache, prepareGroundedLayers } from './groundingRaster';
import type { CompositeDocument, RasterLayer } from '../types/editor';
export * from './renderer';
export function clearRasterCache(): void { clearGroundingCache(); original.clearRasterCache(); }
export function drawComposition(c: CanvasRenderingContext2D, d: CompositeDocument, layers: RasterLayer[]): void { original.drawComposition(c, d, prepareGroundedLayers(d, layers)); }
export function renderPreviewComposition(d: CompositeDocument, layers: RasterLayer[], maxEdge = 2560): HTMLCanvasElement { return original.renderPreviewComposition(d, prepareGroundedLayers(d, layers), maxEdge); }
export function renderDocumentToCanvas(d: CompositeDocument, layers: RasterLayer[]): HTMLCanvasElement { return original.renderDocumentToCanvas(d, prepareGroundedLayers(d, layers)); }
export async function exportComposition(d: CompositeDocument, layers: RasterLayer[], format: original.ExportFormat): Promise<void> { return original.exportComposition(d, prepareGroundedLayers(d, layers), format); }
export async function exportPng(d: CompositeDocument, layers: RasterLayer[]): Promise<void> { return exportComposition(d, layers, 'png'); }
