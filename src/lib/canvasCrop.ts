export function cropSizeForRatio(width: number, height: number, ratio: number): { width: number; height: number } {
  if (width < 1 || height < 1 || ratio <= 0) throw new Error('Canvas dimensions and aspect ratio must be positive.');
  return width / height > ratio ? { width: Math.max(1, Math.round(height * ratio)), height } : { width, height: Math.max(1, Math.round(width / ratio)) };
}

export function cropSizeWithLockedRatio(width: number, height: number, value: number, axis: 'width' | 'height', ratio: number): { width: number; height: number } {
  if (!Number.isFinite(value) || value < 1) return { width, height };
  const requested = axis === 'width'
    ? { width: Math.round(value), height: Math.max(1, Math.round(value / ratio)) }
    : { width: Math.max(1, Math.round(value * ratio)), height: Math.round(value) };
  if (requested.width <= width && requested.height <= height) return requested;
  return cropSizeForRatio(width, height, ratio);
}
