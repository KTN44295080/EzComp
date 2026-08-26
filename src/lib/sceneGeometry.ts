export interface AffineMatrix { a: number; b: number; c: number; d: number; e: number; f: number }

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));
const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = clamp((value - edge0) / Math.max(.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
};

export function depthOcclusionWeight(depth: number, subjectDepth: number, softness: number): number {
  const feather = .008 + clamp(softness / 100) * .2;
  return smoothstep(clamp(subjectDepth - feather), clamp(subjectDepth + feather), clamp(depth));
}

export function groundDepthWeight(depth: number, footDepth: number): number {
  const nearer = depth - footDepth, farther = footDepth - depth;
  return (1 - smoothstep(.07, .24, nearer)) * (1 - smoothstep(.28, .62, farther));
}

export function normalizedDepthBlur(depth: number, focus: number, focusRange: number): number {
  const normalizedFocus = clamp(focus / 100), halfRange = clamp(focusRange / 200), available = Math.max(.01, Math.max(normalizedFocus, 1 - normalizedFocus) - halfRange);
  const distance = clamp((Math.abs(clamp(depth) - normalizedFocus) - halfRange) / available);
  return distance * distance * (3 - 2 * distance);
}

export function depthBandWeights(amount: number, bandCount: number): { lower: number; upper: number; lowerWeight: number; upperWeight: number } {
  const count = Math.max(2, Math.floor(bandCount)), position = clamp(amount) * (count - 1), lower = Math.floor(position), upper = Math.min(count - 1, lower + 1);
  if (lower === upper) return { lower, upper, lowerWeight: 255, upperWeight: 0 };
  const upperWeight = Math.round((position - lower) * 255);
  return { lower, upper, lowerWeight: 255 - upperWeight, upperWeight };
}

export function projectedShadowMatrix(input: {
  footX: number; footY: number; localFootX: number; localFootY: number;
  directionDegrees: number; widthScale: number; lengthScale: number;
}): AffineMatrix {
  const radians = input.directionDegrees * Math.PI / 180, directionX = Math.cos(radians), directionY = Math.sin(radians), perpendicularX = -directionY, perpendicularY = directionX;
  const a = perpendicularX * input.widthScale, b = perpendicularY * input.widthScale, c = -directionX * input.lengthScale, d = -directionY * input.lengthScale;
  return { a, b, c, d, e: input.footX - a * input.localFootX - c * input.localFootY, f: input.footY - b * input.localFootX - d * input.localFootY };
}
