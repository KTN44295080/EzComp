export type RegisteredAsset = {
  source: CanvasImageSource;
  width: number;
  height: number;
};

const assets = new Map<string, RegisteredAsset>();

export function registerAsset(id: string, source: CanvasImageSource, width: number, height: number): void {
  const previous = assets.get(id)?.source;
  if (previous instanceof ImageBitmap) previous.close();
  assets.set(id, { source, width, height });
}

export function getAsset(id: string): RegisteredAsset | undefined { return assets.get(id); }

export function removeAsset(id: string): void {
  const source = assets.get(id)?.source;
  if (source instanceof ImageBitmap) source.close();
  assets.delete(id);
}

export function clearAssets(): void {
  for (const asset of assets.values()) if (asset.source instanceof ImageBitmap) asset.source.close();
  assets.clear();
}

export async function assetToBlob(id: string): Promise<Blob> {
  const asset = assets.get(id);
  if (!asset) throw new Error('A layer image is missing from browser memory.');
  const canvas = document.createElement('canvas');
  canvas.width = asset.width;
  canvas.height = asset.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');
  context.drawImage(asset.source, 0, 0, asset.width, asset.height);
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Could not encode a layer image.')),
    'image/png',
  ));
}

export async function restoreAsset(id: string, blob: Blob): Promise<void> {
  const bitmap = await createImageBitmap(blob);
  registerAsset(id, bitmap, bitmap.width, bitmap.height);
}
