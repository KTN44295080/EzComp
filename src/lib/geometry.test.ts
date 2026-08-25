import { describe, expect, it } from 'vitest';
import { documentToScreen, screenToDocument } from './geometry';
import { defaultDocument } from '../types/editor';

describe('viewport geometry', () => {
  it('round-trips document and screen coordinates', () => {
    const document = defaultDocument();
    const viewport = { zoom: 0.5, panX: 40, panY: -20 };
    const canvasSize = { width: 1200, height: 800 };
    const point = { x: 400, y: 300 };

    const screen = documentToScreen(point, canvasSize, document, viewport);
    const roundTrip = screenToDocument(screen, canvasSize, document, viewport);

    expect(roundTrip.x).toBeCloseTo(point.x, 8);
    expect(roundTrip.y).toBeCloseTo(point.y, 8);
  });
});
