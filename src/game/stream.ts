import * as THREE from 'three';
import type { Terrain } from './terrain';
import { createRng } from './rng';

// Streams + panning sites.
//
// Each StreamConfig describes one watercourse — position, orientation
// (NS = length along Z, EW = length along X), site count, and an optional
// water palette. The terrain module reads matching ChannelConfigs to carve
// the riverbed so the flat water plane sits at a uniform depth.
//
// Sites are EPHEMERAL: every 12 in-game hours the stream regenerates a fresh
// set of sites at new positions along its length. Site IDs encode the epoch
// (`<streamId>_<epoch>_<index>`) so they don't collide with the previous
// generation; old site state in the save becomes orphaned but harmless.

export type StreamOrientation = 'NS' | 'EW';

export interface StreamConfig {
  id: string;
  displayName: string;
  centerX: number;
  centerZ: number;
  halfWidth: number;
  halfLength: number;
  orientation: StreamOrientation;
  siteCount: number;
  /** Override water palette; falls back to the cool blue baseline. */
  shallowColor?: number;
  deepColor?: number;
  foamColor?: number;
}

const SITE_INTERACT_RADIUS = 1.5;

const DEFAULT_SHALLOW = 0x9bd1d8;
const DEFAULT_DEEP = 0x355d6b;
const DEFAULT_FOAM = 0xeef8fa;

const WATER_OFFSET_ABOVE_FLOOR = 0.32;

export interface PanningSite {
  id: string;
  position: THREE.Vector3;
  marker: THREE.Mesh;
  streamId: string;
  /** Read-only baseline yaw used for the visual "stream direction" hint. */
  streamYaw: number;
  /** Optional yield multiplier — used by special sites (e.g. cave) to boost rewards. */
  bonusYield?: number;
}

export interface StreamLightingState {
  sunDirection: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  ambientColor: THREE.Color;
  ambientIntensity: number;
}

export interface Stream {
  id: string;
  config: StreamConfig;
  group: THREE.Group;
  /** Currently-visible sites. Replaced wholesale by setEpoch(). */
  sites: readonly PanningSite[];
  update(time: number, playerPos: THREE.Vector3, focusedSiteId: string | null): void;
  findNearestSite(playerPos: THREE.Vector3): { site: PanningSite; distance: number } | null;
  /**
   * Swap in a fresh set of sites at new positions seeded by (epoch, streamId).
   * No-op when called with the same epoch as the current set.
   */
  setEpoch(epoch: number): void;
  /** Push sun + ambient state into the water shader (called per frame). */
  updateLighting(state: StreamLightingState): void;
}

const VERT_SHADER = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vViewDir;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorld = worldPos.xyz;
    vec3 cameraWorld = (inverse(viewMatrix) * vec4(0,0,0,1)).xyz;
    vViewDir = normalize(cameraWorld - vWorld);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

// Realistic-ish water shader. Three things conspire to give the impression
// of volume rather than a flat sheet of color:
//
//   1) Depth-based color absorption. The riverbed is below the water plane;
//      depth is computed from the lateral distance to the centerline (the
//      same quadratic that carved the bed). Color blends shallow → deep,
//      and alpha goes from ~0.45 at the bank to ~0.92 at the centerline so
//      shallow water visibly shows the riverbed beneath through partial
//      transparency.
//
//   2) Bank-edge foam. Where depth approaches zero, the water gets a
//      noisy white edge — the broken / aerated surface where moving water
//      meets the bank. Foam is animated by the same flow uv as the surface
//      noise so it reads as flowing froth rather than static highlights.
//
//   3) Sun-glint highlights. A fake surface normal is computed from the
//      gradient of two noise samples; sharp specular spike along the
//      reflection of the sun direction (driven by sky each frame) creates
//      sparkly water surface that catches dawn / dusk warmth.
const FRAG_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  uniform vec2 uFlowDir;
  uniform float uFlowSpeed;
  // Cross-section uniforms — drive the depth gradient.
  uniform vec2 uCenterPos;
  uniform vec2 uPerpDir;
  uniform float uHalfWidth;
  uniform float uMaxDepth;
  // Lighting from sky controller, set each frame.
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  uniform vec3 uAmbientColor;
  uniform float uAmbientIntensity;
  varying vec3 vWorld;
  varying vec3 vViewDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec2 worldXZ = vWorld.xz;
    vec2 flow = uFlowDir * uTime * uFlowSpeed;

    // Cross-section depth: quadratic falloff from centerline to bank.
    float dCross = abs(dot(worldXZ - uCenterPos, uPerpDir));
    float t = clamp(dCross / uHalfWidth, 0.0, 1.0);
    float depth = uMaxDepth * (1.0 - t * t);
    float depthFactor = smoothstep(0.0, uMaxDepth * 0.85, depth);

    // Layered surface noise — large slow waves, medium ripples, small
    // crests. Each layer scrolls along the flow direction at its own rate.
    float n1 = noise(worldXZ * 0.28 - flow * 1.0);
    float n2 = noise(worldXZ * 0.85 - flow * 0.6 + vec2(7.3, 1.9));
    float n3 = noise(worldXZ * 2.4  - flow * 0.32 + vec2(2.1, 11.4));
    float surface = n1 * 0.50 + n2 * 0.32 + n3 * 0.18;

    // Base color: shallow → deep, modulated subtly by surface for shimmer.
    vec3 base = mix(uShallow, uDeep, depthFactor);
    base = mix(base * 0.86, base * 1.18, smoothstep(0.30, 0.70, surface));

    // Bank-edge foam — wherever water is shallow AND foam noise is high.
    float bankProximity = 1.0 - smoothstep(0.04, 0.22, depth);
    float foamNoise = noise(worldXZ * 4.5 - flow * 0.85);
    float foamMask = bankProximity * smoothstep(0.40, 0.85, foamNoise);
    base = mix(base, uFoam, foamMask * 0.85);

    // Sun glint — fake surface normal from noise gradient, sharp highlight
    // along reflection of sun direction. Reads as sparkles on the water.
    float h0 = noise(worldXZ * 0.9 - flow * 0.7);
    float h1 = noise((worldXZ + vec2(0.10, 0.0)) * 0.9 - flow * 0.7);
    float h2 = noise((worldXZ + vec2(0.0, 0.10)) * 0.9 - flow * 0.7);
    vec3 surfNormal = normalize(vec3((h0 - h1) * 4.5, 1.0, (h0 - h2) * 4.5));
    vec3 reflectDir = reflect(-uSunDir, surfNormal);
    float spec = pow(max(0.0, dot(reflectDir, vViewDir)), 36.0);
    base += uSunColor * (spec * 0.85 * uSunIntensity);

    // Ambient + sun lighting on the body color. Water doesn't lambert
    // realistically but a simple tint by sky color keeps day-night
    // consistent with everything else.
    vec3 lit = base * (uAmbientColor * uAmbientIntensity * 0.7
                      + uSunColor * uSunIntensity * 0.6);

    // Variable alpha — shallow water more transparent so the riverbed
    // (river-rocks texture, on the terrain mesh below) shows through.
    // Foam edges push alpha up so they read as solid foam, not ghosts.
    float alpha = mix(0.45, 0.92, depthFactor);
    alpha = max(alpha, foamMask * 0.85);

    gl_FragColor = vec4(lit, alpha);
  }
`;

export function createStream(terrain: Terrain, cfg: StreamConfig): Stream {
  const group = new THREE.Group();
  group.name = `stream_${cfg.id}`;

  // Anchor the water plane to the carved channel's floor at center. Because
  // the new terrain carve forces a uniform target floor along the centerline,
  // this single Y is correct for the entire stream length.
  const baseY = terrain.getHeightAt(cfg.centerX, cfg.centerZ) + WATER_OFFSET_ABOVE_FLOOR;

  // Flow direction along the stream axis; magnitude controls visual speed.
  const flowDir = cfg.orientation === 'NS' ? new THREE.Vector2(0, 1) : new THREE.Vector2(1, 0);
  // Perpendicular vector for cross-stream depth sampling. NS streams measure
  // perpendicular distance along X; EW streams measure along Z.
  const perpDir = cfg.orientation === 'NS' ? new THREE.Vector2(1, 0) : new THREE.Vector2(0, 1);
  // Max depth at the centerline. Matches WATER_OFFSET_ABOVE_FLOOR — water
  // surface sits this far above the deepest carved riverbed point.
  const MAX_DEPTH = WATER_OFFSET_ABOVE_FLOOR;

  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(cfg.shallowColor ?? DEFAULT_SHALLOW) },
      uDeep: { value: new THREE.Color(cfg.deepColor ?? DEFAULT_DEEP) },
      uFoam: { value: new THREE.Color(cfg.foamColor ?? DEFAULT_FOAM) },
      uFlowDir: { value: flowDir },
      uFlowSpeed: { value: 0.55 },
      uCenterPos: { value: new THREE.Vector2(cfg.centerX, cfg.centerZ) },
      uPerpDir: { value: perpDir },
      uHalfWidth: { value: cfg.halfWidth },
      uMaxDepth: { value: MAX_DEPTH },
      uSunDir: { value: new THREE.Vector3(0.5, 1, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(0xffffff) },
      uSunIntensity: { value: 1.0 },
      uAmbientColor: { value: new THREE.Color(0xffffff) },
      uAmbientIntensity: { value: 0.5 },
    },
    vertexShader: VERT_SHADER,
    fragmentShader: FRAG_SHADER,
    transparent: true,
    side: THREE.DoubleSide,
    // Render water AFTER opaque geometry so alpha blending is correct
    // against the textured riverbed below. Also disable depth write so
    // overlapping foam patches don't z-fight at exactly the same Y.
    depthWrite: false,
  });

  const planeXExtent = cfg.orientation === 'NS' ? cfg.halfWidth * 2 : cfg.halfLength * 2;
  const planeZExtent = cfg.orientation === 'NS' ? cfg.halfLength * 2 : cfg.halfWidth * 2;
  const waterGeom = new THREE.PlaneGeometry(planeXExtent, planeZExtent, 1, 1);
  waterGeom.rotateX(-Math.PI / 2);
  const waterMesh = new THREE.Mesh(waterGeom, waterMat);
  waterMesh.position.set(cfg.centerX, baseY, cfg.centerZ);
  group.add(waterMesh);

  const ringGeom = new THREE.TorusGeometry(0.4, 0.05, 6, 24);
  ringGeom.rotateX(-Math.PI / 2);

  // Mutable site state — replaced wholesale every epoch change.
  let sites: PanningSite[] = [];
  let currentEpoch = -1;

  function regenerateSites(epoch: number): void {
    // Tear down the previous generation's marker meshes.
    for (const s of sites) {
      group.remove(s.marker);
      (s.marker.material as THREE.Material).dispose();
    }
    sites = [];

    // Seed RNG by stream + epoch so each respawn produces a different but
    // deterministic-on-reload layout.
    const seed = stringHash(cfg.id) ^ (epoch * 0x9e3779b1);
    const rng = createRng(seed);

    // Sites randomly distributed along the stream length, spaced apart so
    // they don't pile up. We pick siteCount evenly-jittered slots.
    for (let i = 0; i < cfg.siteCount; i++) {
      const t = (i + 0.2 + rng.next() * 0.6) / cfg.siteCount;
      const along = (t - 0.5) * cfg.halfLength * 2;
      const lateralJitter = (rng.next() - 0.5) * cfg.halfWidth * 0.5;
      const sx = cfg.orientation === 'NS' ? cfg.centerX + lateralJitter : cfg.centerX + along;
      const sz = cfg.orientation === 'NS' ? cfg.centerZ + along : cfg.centerZ + lateralJitter;
      const sitePos = new THREE.Vector3(sx, baseY + 0.08, sz);

      const ringMat = new THREE.MeshStandardMaterial({
        color: 0xc89b3b,
        emissive: 0x553311,
        emissiveIntensity: 0.4,
        roughness: 0.5,
        flatShading: true,
      });
      const marker = new THREE.Mesh(ringGeom, ringMat);
      marker.position.copy(sitePos);
      group.add(marker);

      sites.push({
        id: `${cfg.id}_${epoch.toString(36)}_${(i + 1).toString().padStart(2, '0')}`,
        position: sitePos,
        marker,
        streamId: cfg.id,
        streamYaw: cfg.orientation === 'NS' ? 0 : Math.PI / 2,
      });
    }
    currentEpoch = epoch;
  }

  // First-paint: epoch 0 sites.
  regenerateSites(0);

  const stream: Stream = {
    id: cfg.id,
    config: cfg,
    group,
    get sites() {
      return sites;
    },
    update(time, playerPos, focusedSiteId) {
      waterMat.uniforms.uTime!.value = time;
      for (const site of sites) {
        const isFocused = site.id === focusedSiteId;
        const dx = site.position.x - playerPos.x;
        const dz = site.position.z - playerPos.z;
        const dist = Math.hypot(dx, dz);
        const inRange = dist < SITE_INTERACT_RADIUS;
        const targetEmissive = isFocused ? 1.4 : inRange ? 0.85 : 0.4;
        const mat = site.marker.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity += (targetEmissive - mat.emissiveIntensity) * 0.15;
        const pulse = isFocused ? 1.0 + 0.08 * Math.sin(time * 6) : 1.0;
        site.marker.scale.setScalar(pulse);
      }
    },
    findNearestSite(playerPos) {
      let best: { site: PanningSite; distance: number } | null = null;
      for (const site of sites) {
        const dx = site.position.x - playerPos.x;
        const dz = site.position.z - playerPos.z;
        const d = Math.hypot(dx, dz);
        if (d < SITE_INTERACT_RADIUS && (best === null || d < best.distance)) {
          best = { site, distance: d };
        }
      }
      return best;
    },
    setEpoch(epoch) {
      if (epoch === currentEpoch) return;
      regenerateSites(epoch);
    },
    updateLighting(state) {
      (waterMat.uniforms.uSunDir!.value as THREE.Vector3).copy(state.sunDirection);
      (waterMat.uniforms.uSunColor!.value as THREE.Color).copy(state.sunColor);
      waterMat.uniforms.uSunIntensity!.value = state.sunIntensity;
      (waterMat.uniforms.uAmbientColor!.value as THREE.Color).copy(state.ambientColor);
      waterMat.uniforms.uAmbientIntensity!.value = state.ambientIntensity;
    },
  };
  return stream;
}

function stringHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface StreamRegistry {
  streams: readonly Stream[];
  update(time: number, playerPos: THREE.Vector3, focusedSiteId: string | null): void;
  findNearestSite(playerPos: THREE.Vector3): { site: PanningSite; distance: number } | null;
  isPlayerInAnyStream(playerPos: { x: number; z: number }): boolean;
  /** True if (x, z) is within `padding` meters of any stream's water surface. */
  isInStreamZone(x: number, z: number, padding?: number): boolean;
  /** Push a new epoch to every stream; sites regenerate if the epoch changed. */
  setEpoch(epoch: number): void;
  /** Push lighting state to every stream's water shader. */
  updateLighting(state: StreamLightingState): void;
}

export function createStreamRegistry(streams: Stream[]): StreamRegistry {
  return {
    streams,
    update(time, playerPos, focusedSiteId) {
      for (const s of streams) s.update(time, playerPos, focusedSiteId);
    },
    findNearestSite(playerPos) {
      let best: { site: PanningSite; distance: number } | null = null;
      for (const s of streams) {
        const candidate = s.findNearestSite(playerPos);
        if (candidate && (best === null || candidate.distance < best.distance)) {
          best = candidate;
        }
      }
      return best;
    },
    isPlayerInAnyStream(playerPos) {
      for (const s of streams) {
        if (isInsideStreamRect(playerPos.x, playerPos.z, s.config, 0)) return true;
      }
      return false;
    },
    isInStreamZone(x, z, padding = 0) {
      for (const s of streams) {
        if (isInsideStreamRect(x, z, s.config, padding)) return true;
      }
      return false;
    },
    setEpoch(epoch) {
      for (const s of streams) s.setEpoch(epoch);
    },
    updateLighting(state) {
      for (const s of streams) s.updateLighting(state);
    },
  };
}

function isInsideStreamRect(x: number, z: number, cfg: StreamConfig, padding: number): boolean {
  const dx = Math.abs(x - cfg.centerX);
  const dz = Math.abs(z - cfg.centerZ);
  if (cfg.orientation === 'NS') {
    return dx < cfg.halfWidth + padding && dz < cfg.halfLength + padding;
  }
  return dx < cfg.halfLength + padding && dz < cfg.halfWidth + padding;
}
