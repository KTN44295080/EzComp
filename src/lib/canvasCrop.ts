export function cropSizeForRatio(width: number, height: number, ratio: number): { width: number; height: number } {
  if (width < 1 || height < 1 || ratio <= 0) throw new Error('Canvas dimensions and aspect ratio must be positive.');
  return width / height > ratio ? { width: Math.max(1, Math.round(height * ratio)), height } : { width, height: Math.max(1, Math.round(width / ratio)) };
}

