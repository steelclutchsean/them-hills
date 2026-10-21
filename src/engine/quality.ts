// Single place for the render budget. Later overhaul phases add Low / Medium /
// High presets here instead of scattering magic numbers through shaders.
//
// Targets a 2022 laptop at 1080p: one shadow map, half-res bloom, pixel ratio
// capped so the HDR framebuffer stays inside a typical integrated-GPU budget.

export const RENDER_QUALITY = {
  /** Cap devicePixelRatio. 2× at 1080p plus bloom is too many pixels. */
  maxPixelRatio: 1.5,
  /** MSAA samples on the HDR color target. 0 falls back to no MSAA. */
  msaaSamples: 4,
  shadowMapSize: 2048,
  /** Half-extent of the player-centered shadow ortho, in meters. */
  shadowExtent: 24,
  shadowNear: 8,
  shadowFar: 190,
  shadowBias: -0.00018,
  shadowNormalBias: 0.028,
  shadowRadius: 1.6,
  /** 1 = full black. Lower keeps stylized albedo readable in shade. */
  shadowIntensity: 0.85,
  bloomResolution: 384,
  bloomStrength: 0.22,
  bloomRadius: 0.42,
  /** HDR threshold. Above this, sun disc / water glints / gold sparks bloom. */
  bloomThreshold: 1.05,
  environmentIntensity: 0.48,
  exposure: 1.04,
} as const;
