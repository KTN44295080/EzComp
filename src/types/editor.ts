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
  contentTransform: ContentTransform;
  sceneLock: SceneLock;
  finish: CompositeFinish;
}

export interface ContentTransform { scale: number; x: number; y: number }

export interface CompositeFinish {
  diffusion: number;
  diffusionRadius: number;
  bloom: number;
  bloomRadius: number;
  vignette: number;
  grain: number;
}

export interface DepthOfFieldSettings {
  enabled: boolean;
  depthMapAssetId: string | null;
  method: 'ai' | 'fast' | null;
  /** Normalized scene distance for this layer. Null samples the backdrop at the layer's contact point. */
  sceneDepth: number | null;
  focus: number;
  focusRange: number;
  maxBlur: number;
  invert: boolean;
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
  shadows: number;
  highlights: number;
  blur: number;
  shadowOpacity: number;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  highlightColor: string;
  highlightTint: number;
  shadowColor: string;
  shadowTint: number;
  lightingBalance: number;
  keyLightStrength: number;
  keyLightAngle: number;
  keyLightSoftness: number;
  upperBodyLight: number;
  rimLight: number;
  environmentColor: string;
  lightWrap: number;
  lightWrapRadius: number;
  occlusionOpacity: number;
  occlusionDepth: number;
  occlusionSoftness: number;
  ambientOcclusion: number;
  ambientOcclusionRadius: number;
  ambientOcclusionDepthRange: number;
  atmosphere: number;
  grain: number;
  shadowProjection: number;
  shadowLength: number;
}

export interface SceneLock {
  enabled: boolean;
  preset: string | null;
  referenceId: string | null;
  scope: 'scene' | 'local' | null;
  sourceLayerId: string | null;
  sourceLayerName: string | null;
  adjustments: Partial<LayerAdjustments> | null;
}

export type NumericLayerAdjustmentKey = { [Key in keyof LayerAdjustments]: LayerAdjustments[Key] extends number ? Key : never }[keyof LayerAdjustments];

export interface RasterLayer {
  id: string;
  assetId: string;
  kind?: 'raster' | 'group';
  parentId?: string;
  depth?: number;
  expanded?: boolean;
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
  depthOfField: DepthOfFieldSettings;
}

export interface ViewportState { zoom: number; panX: number; panY: number }

export const defaultAdjustments = (): LayerAdjustments => ({
  exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0,
  shadows: 0, highlights: 0, blur: 0,
  shadowOpacity: 0, shadowBlur: 18, shadowOffsetX: 0, shadowOffsetY: 14,
  highlightColor: '#ff91c8', highlightTint: 0,
  shadowColor: '#65b9ff', shadowTint: 0, lightingBalance: 0,
  keyLightStrength: 0, keyLightAngle: 315, keyLightSoftness: 70,
  upperBodyLight: 0, rimLight: 0,
  environmentColor: '#8aa9c8', lightWrap: 0, lightWrapRadius: 12,
  occlusionOpacity: 0, occlusionDepth: 55, occlusionSoftness: 18,
  ambientOcclusion: 0, ambientOcclusionRadius: 18, ambientOcclusionDepthRange: 30,
  atmosphere: 0, grain: 0,
  shadowProjection: 0, shadowLength: 42,
});

export const normalizeAdjustments = (value?: Partial<LayerAdjustments>): LayerAdjustments => {
  const normalized = { ...defaultAdjustments(), ...value };
  if (value?.ambientOcclusion === undefined && ((value?.lightWrap ?? 0) > 0 || (value?.shadowOpacity ?? 0) > 0)) normalized.ambientOcclusion = 22;
  return normalized;
};

export const defaultSceneLock = (): SceneLock => ({
  enabled: true, preset: null, referenceId: null, scope: null,
  sourceLayerId: null, sourceLayerName: null, adjustments: null,
});

export const defaultFinish = (): CompositeFinish => ({
  diffusion: 0, diffusionRadius: 24, bloom: 0, bloomRadius: 36, vignette: 0, grain: 0,
});

export const defaultContentTransform = (): ContentTransform => ({ scale: 1, x: 0, y: 0 });

export const mvFinish = (): CompositeFinish => ({
  diffusion: 18, diffusionRadius: 24, bloom: 9, bloomRadius: 36, vignette: 6, grain: 7,
});

export const defaultDepthOfField = (): DepthOfFieldSettings => ({
  enabled: false, depthMapAssetId: null, method: null,
  sceneDepth: null, focus: 58, focusRange: 12, maxBlur: 18, invert: false,
});

export const defaultDocument = (): CompositeDocument => ({
  name: 'Untitled', width: 1920, height: 1080, background: 'transparent', contentTransform: defaultContentTransform(), sceneLock: defaultSceneLock(), finish: defaultFinish(),
});

export const defaultTransform = (): LayerTransform => ({
  x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0,
});
