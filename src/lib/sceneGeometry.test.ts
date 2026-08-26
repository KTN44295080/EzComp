import { describe, expect, it } from 'vitest';
import { ambientOcclusionDepthWeight, depthBandWeights, depthOcclusionWeight, groundDepthWeight, normalizedDepthBlur, projectedShadowMatrix } from './sceneGeometry';

describe('depth-aware scene geometry', () => {
  it('restores only depth pixels in front of the subject plane', () => {
    expect(depthOcclusionWeight(.8, .5, 10)).toBeGreaterThan(.95);
    expect(depthOcclusionWeight(.2, .5, 10)).toBeLessThan(.05);
  });

  it('keeps the ground near the sampled foot depth and rejects nearer occluders', () => {
    expect(groundDepthWeight(.5, .5)).toBeGreaterThan(.95);
    expect(groundDepthWeight(.85, .5)).toBeLessThan(.05);
  });

  it('keeps ambient occlusion local to nearby scene depth', () => {
    expect(ambientOcclusionDepthWeight(.52, .5, 30)).toBeGreaterThan(.95);
    expect(ambientOcclusionDepthWeight(.9, .5, 30)).toBeLessThan(.05);
  });

  it('anchors a projected silhouette at its contact point', () => {
    const matrix = projectedShadowMatrix({ footX: 400, footY: 300, localFootX: 50, localFootY: 100, directionDegrees: 135, widthScale: .6, lengthScale: .4 });
    expect(matrix.a * 50 + matrix.c * 100 + matrix.e).toBeCloseTo(400);
    expect(matrix.b * 50 + matrix.d * 100 + matrix.f).toBeCloseTo(300);
  });

  it('interpolates depth blur continuously without an alpha gap', () => {
    expect(normalizedDepthBlur(.58, 58, 12)).toBe(0);
    expect(normalizedDepthBlur(0, 58, 12)).toBeGreaterThan(.9);
    for (const amount of [0, .1, .25, .5, .73, 1]) {
      const weights = depthBandWeights(amount, 12);
      expect(weights.lowerWeight + weights.upperWeight).toBe(255);
    }
  });
});
