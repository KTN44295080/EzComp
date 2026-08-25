import { describe, expect, it } from 'vitest';
import { documentToScreen, layerHandles, nearestTransformHandle, screenToDocument } from './geometry';
import { defaultAdjustments, defaultDocument, type RasterLayer } from '../types/editor';

const layer: RasterLayer = { id:'l', assetId:'a', name:'Layer', width:100, height:50, visible:true, locked:false, opacity:100, blendMode:'source-over', transform:{ x:20, y:30, scaleX:1, scaleY:1, rotation:0 }, adjustments:defaultAdjustments() };
describe('editor geometry', () => {
  it('round-trips viewport coordinates', () => { const doc = defaultDocument(), view = { zoom:.5, panX:40, panY:-20 }, canvas = { width:1200, height:800 }, point = { x:400, y:300 }; expect(screenToDocument(documentToScreen(point, canvas, doc, view), canvas, doc, view)).toEqual(point); });
  it('exposes scale and rotation handles', () => { const handles = layerHandles(layer, 34); expect(nearestTransformHandle(handles.corners[0]!, layer, 1)).toBe('scale'); expect(nearestTransformHandle(handles.rotation, layer, 1)).toBe('rotate'); });
});
