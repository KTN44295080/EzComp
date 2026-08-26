import { describe, expect, it } from 'vitest';
import { documentToScreen, layerHandles, nearestTransformHandle, pointInsideLayer, screenToDocument } from './geometry';
import { defaultAdjustments, defaultDepthOfField, defaultDocument, type RasterLayer } from '../types/editor';

const layer: RasterLayer = { id:'l', assetId:'a', name:'Layer', width:100, height:50, visible:true, locked:false, opacity:100, blendMode:'source-over', transform:{ x:20, y:30, scaleX:1, scaleY:1, rotation:0 }, adjustments:defaultAdjustments(), depthOfField:defaultDepthOfField() };
describe('editor geometry', () => {
  it('round-trips viewport coordinates', () => { const doc = defaultDocument(), view = { zoom:.5, panX:40, panY:-20 }, canvas = { width:1200, height:800 }, point = { x:400, y:300 }; expect(screenToDocument(documentToScreen(point, canvas, doc, view), canvas, doc, view)).toEqual(point); });
  it('exposes scale and rotation handles', () => { const handles = layerHandles(layer, 34); expect(nearestTransformHandle(handles.corners[0]!, layer, 1)).toBe('scale'); expect(nearestTransformHandle(handles.rotation, layer, 1)).toBe('rotate'); });
  it('uses the visible crop for selection and hit testing', () => { const cropped = { ...layer, crop: { left: 20, top: 10, right: 30, bottom: 5 } }; const handles = layerHandles(cropped, 34); expect(handles.corners[0]).toEqual({ x: 40, y: 40 }); expect(handles.corners[2]).toEqual({ x: 90, y: 75 }); expect(pointInsideLayer({ x: 30, y: 35 }, cropped)).toBe(false); expect(pointInsideLayer({ x: 60, y: 55 }, cropped)).toBe(true); });
});
