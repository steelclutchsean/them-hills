// Graphics presets. `RENDER_QUALITY` is the live budget the renderer reads.
// The pause menu and auto-detect write it through setQuality().

export type QualityName = 'low' | 'medium' | 'high' | 'ultra';

export interface QualitySettings {
  maxPixelRatio: number;
  msaaSamples: number;
  shadowMapSize: number;
  shadowExtent: number;
  shadowNear: number;
  shadowFar: number;
  shadowBias: number;
  shadowNormalBias: number;
  shadowRadius: number;
  shadowIntensity: number;
  bloomResolution: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  environmentIntensity: number;
  exposure: number;
  grassTall: number;
  grassCover: number;
  /** Multiplier on scatter counts (trees, rocks, shrubs). */
  scatter: number;
  shafts: boolean;
  motes: number;
  /** Quarter-res GTAO. Off on the low preset. */
  ao: boolean;
  /** Planar creek reflection. */
  reflections: boolean;
  /** Screen-space sun shafts. */
  godrays: boolean;
}

const SHARED = {
  shadowExtent: 24,
  shadowNear: 8,
  shadowFar: 190,
  shadowBias: -0.00018,
  shadowNormalBias: 0.028,
  shadowRadius: 1.6,
  shadowIntensity: 0.85,
  bloomRadius: 0.42,
  bloomThreshold: 1.05,
  exposure: 1.04,
} as const;

export const QUALITY_PRESETS: Record<QualityName, QualitySettings> = {
  low: {
    ...SHARED,
    maxPixelRatio: 1,
    msaaSamples: 0,
    shadowMapSize: 1024,
    bloomResolution: 256,
    bloomStrength: 0.12,
    environmentIntensity: 0.35,
    grassTall: 1400,
    grassCover: 2800,
    scatter: 0.45,
    shafts: false,
    motes: 24,
    ao: false,
    reflections: false,
    godrays: false,
  },
  medium: {
    ...SHARED,
    maxPixelRatio: 1.25,
    msaaSamples: 2,
    shadowMapSize: 2048,
    bloomResolution: 320,
    bloomStrength: 0.18,
    environmentIntensity: 0.42,
    grassTall: 3000,
    grassCover: 7000,
    scatter: 0.7,
    shafts: true,
    motes: 48,
    ao: false,
    reflections: true,
    godrays: true,
  },
  high: {
    ...SHARED,
    maxPixelRatio: 1.5,
    msaaSamples: 4,
    shadowMapSize: 2048,
    bloomResolution: 384,
    bloomStrength: 0.22,
    environmentIntensity: 0.48,
    grassTall: 5000,
    grassCover: 12000,
    scatter: 1,
    shafts: true,
    motes: 72,
    ao: true,
    reflections: true,
    godrays: true,
  },
  ultra: {
    ...SHARED,
    maxPixelRatio: 1.75,
    msaaSamples: 4,
    shadowMapSize: 4096,
    bloomResolution: 512,
    bloomStrength: 0.26,
    environmentIntensity: 0.55,
    grassTall: 7000,
    grassCover: 18000,
    scatter: 1.15,
    shafts: true,
    motes: 110,
    ao: true,
    reflections: true,
    godrays: true,
  },
};

export const RENDER_QUALITY: QualitySettings = { ...QUALITY_PRESETS.high };

const STORAGE_KEY = 'them-hills-quality';
let active: QualityName = 'high';

export function getQualityName(): QualityName {
  return active;
}

export function setQuality(name: QualityName): void {
  active = name;
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.quality = name;
  }
  const preset = QUALITY_PRESETS[name];
  (Object.keys(preset) as (keyof QualitySettings)[]).forEach((key) => {
    (RENDER_QUALITY[key] as QualitySettings[typeof key]) = preset[key];
  });
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Private mode and the smoke browser can refuse storage.
  }
}

export function detectQuality(rendererInfo: string): QualityName {
  if (/swiftshader|llvmpipe|softpipe/i.test(rendererInfo)) return 'low';
  const cores = navigator.hardwareConcurrency ?? 4;
  const ratio = window.devicePixelRatio || 1;
  if (cores <= 4 || ratio < 1.25) return 'medium';
  if (cores >= 8 && ratio >= 2) return 'ultra';
  return 'high';
}

/** Saved choice, otherwise a guess from the GL renderer string. */
export function initQuality(rendererInfo: string): QualityName {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }
  const name: QualityName =
    saved === 'low' || saved === 'medium' || saved === 'high' || saved === 'ultra'
      ? saved
      : detectQuality(rendererInfo);
  setQuality(name);
  return name;
}

export function glRendererString(gl: WebGLRenderingContext): string {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  if (!ext) return '';
  return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '');
}
