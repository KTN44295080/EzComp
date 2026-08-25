export const blendModes = [
  'source-over', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light',
  'color-dodge', 'color-burn', 'darken', 'lighten', 'difference', 'exclusion',
  'hue', 'saturation', 'color', 'luminosity',
] as const;

export type BlendMode = (typeof blendModes)[number];
export type EditorTool = 'move' | 'hand';

export interface CompositeDocument {
  name: string;
  width: number;
  height: number;
  background: 'transparent' | 'black' | 'white';
}

export interface LayerTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

export interface LayerAdjustments {
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
  blur: number;
}

export interface RasterLayer {
  id: string;
  assetId: string;
  name: string;
  sourcePath?: string;
  width: number;
  height: number;
  thumbnailUrl?: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  transform: LayerTransform;
  adjustments: LayerAdjustments;
}

export interface ViewportState { zoom: number; panX: number; panY: number }

export const defaultAdjustments = (): LayerAdjustments => ({
  exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, blur: 0,
});

export const defaultDocument = (): CompositeDocument => ({
  name: 'Untitled', width: 1920, height: 1080, background: 'transparent',
});

export const defaultTransform = (): LayerTransform => ({
  x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
});
