import * as THREE from 'three';
import type { Terrain } from './terrain';

// Streams + panning sites.
//
// Phase 9a moved from a single hardcoded stream to a config-driven model.
// Each StreamConfig describes one watercourse: where it sits in the world,
// its orientation (NS = length along Z, EW = length along X), how many
// sites line its centerline, and an optional water palette. The terrain
// module reads matching ChannelConfigs to carve the riverbed underneath.
//
// The streamRegistry aggregates all streams in the world so callers
// (proximity probes, the in-stream-water check, scatter rejection) can ask
// world-level questions without knowing the stream layout.

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
}

export interface Stream {
  id: string;
  config: StreamConfig;
  group: THREE.Group;
  sites: readonly PanningSite[];
  update(time: number, playerPos: THREE.Vector3, focusedSiteId: string | null): void;
  findNearestSite(playerPos: THREE.Vector3): { site: PanningSite; distance: number } | null;
}

const VERT_SHADER = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorld = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const FRAG_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  varying vec3 vWorld;

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
    vec2 p = vWorld.xz * 0.45;
    float n1 = noise(p + vec2(uTime * 0.20, uTime * 0.15));
    float n2 = noise(p * 2.3 - vec2(uTime * 0.13, uTime * 0.10));
    float water = n1 * 0.6 + n2 * 0.4;

    vec3 color = mix(uDeep, uShallow, water);
    float foam = smoothstep(0.62, 0.85, water);
    color = mix(color, uFoam, foam * 0.55);

    gl_FragColor = vec4(color, 0.9);
  }
`;

export function createStream(terrain: Terrain, cfg: StreamConfig): Stream {
  const group = new THREE.Group();
  group.name = `stream_${cfg.id}`;

  // Anchor the water plane to the carved channel's floor, slightly raised so
  // it reads as flowing over the ground.
  const baseY = terrain.getHeightAt(cfg.centerX, cfg.centerZ) + WATER_OFFSET_ABOVE_FLOOR;

  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(cfg.shallowColor ?? DEFAULT_SHALLOW) },
      uDeep: { value: new THREE.Color(cfg.deepColor ?? DEFAULT_DEEP) },
      uFoam: { value: new THREE.Color(cfg.foamColor ?? DEFAULT_FOAM) },
    },
    vertexShader: VERT_SHADER,
    fragmentShader: FRAG_SHADER,
    transparent: true,
    side: THREE.DoubleSide,
  });

  // Water-plane dimensions: X-extent and Z-extent in world after the
  // -PI/2 rotateX. NS streams have width along X and length along Z; EW
  // streams swap them.
  const planeXExtent = cfg.orientation === 'NS' ? cfg.halfWidth * 2 : cfg.halfLength * 2;
  const planeZExtent = cfg.orientation === 'NS' ? cfg.halfLength * 2 : cfg.halfWidth * 2;
  const waterGeom = new THREE.PlaneGeometry(planeXExtent, planeZExtent, 1, 1);
  waterGeom.rotateX(-Math.PI / 2);
  const waterMesh = new THREE.Mesh(waterGeom, waterMat);
  waterMesh.position.set(cfg.centerX, baseY, cfg.centerZ);
  group.add(waterMesh);

  // Sites along the centerline. Vary Z for NS streams, X for EW.
  const sites: PanningSite[] = [];
  const ringGeom = new THREE.TorusGeometry(0.4, 0.05, 6, 24);
  ringGeom.rotateX(-Math.PI / 2);

  for (let i = 0; i < cfg.siteCount; i++) {
    const t = (i + 0.5) / cfg.siteCount;
    const along = (t - 0.5) * cfg.halfLength * 2;
    const sx = cfg.orientation === 'NS' ? cfg.centerX : cfg.centerX + along;
    const sz = cfg.orientation === 'NS' ? cfg.centerZ + along : cfg.centerZ;
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
      id: `${cfg.id}_${(i + 1).toString().padStart(2, '0')}`,
      position: sitePos,
      marker,
      streamId: cfg.id,
      streamYaw: cfg.orientation === 'NS' ? 0 : Math.PI / 2,
    });
  }

  return {
    id: cfg.id,
    config: cfg,
    group,
    sites,
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
  };
}

export interface StreamRegistry {
  streams: readonly Stream[];
  update(time: number, playerPos: THREE.Vector3, focusedSiteId: string | null): void;
  findNearestSite(playerPos: THREE.Vector3): { site: PanningSite; distance: number } | null;
  isPlayerInAnyStream(playerPos: { x: number; z: number }): boolean;
  /** True if (x, z) is within `padding` meters of any stream's water surface. */
  isInStreamZone(x: number, z: number, padding?: number): boolean;
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
