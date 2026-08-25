export type RegisteredAsset = {
  source: CanvasImageSource;
  width: number;
  height: number;
};

const assets = new Map<string, RegisteredAsset>();

export function registerAsset(
  id: string,
  source: CanvasImageSource,
  width: number,
  height: number,
): void {
  const previous = assets.get(id)?.source;
  if (previous instanceof ImageBitmap) {
    previous.close();
  }
  assets.set(id, { source, width, height });
}

export function getAsset(id: string): RegisteredAsset | undefined {
  return assets.get(id);
}

export function removeAsset(id: string): void {
  const source = assets.get(id)?.source;
  if (source instanceof ImageBitmap) {
    source.close();
  }
  assets.delete(id);
}

export function clearAssets(): void {
  for (const asset of assets.values()) {
    if (asset.source instanceof ImageBitmap) {
      asset.source.close();
    }
  }
  assets.clear();
}
