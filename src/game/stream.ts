import * as THREE from 'three';
import type { Terrain } from './terrain';

// Phase 2 ships a single hand-placed stream so the prospecting loop is testable
// before world build-out (Phase 5). The stream is a flat water rectangle with a
// custom painterly shader, plus N "panning sites" arranged along the centerline.

const STREAM_CENTER_X = 10;
const STREAM_HALF_WIDTH = 2.5;
const STREAM_HALF_LENGTH = 14.25;
const STREAM_WATER_OFFSET = 0.05;

const SITE_COUNT = 20;
const SITE_INTERACT_RADIUS = 1.5;

export interface PanningSite {
  id: string;
  position: THREE.Vector3;
  marker: THREE.Mesh;
  /** Read-only baseline yaw used for the visual "stream direction" hint. */
  streamYaw: number;
}

export interface Stream {
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

export function createStream(terrain: Terrain): Stream {
  const group = new THREE.Group();

  // Stream surface anchored to the terrain height at its center, slightly raised so
  // it reads as flowing over the ground. Phase 5 will carve a real channel.
  const baseY = terrain.getHeightAt(STREAM_CENTER_X, 0) + STREAM_WATER_OFFSET;

  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(0x9bd1d8) },
      uDeep: { value: new THREE.Color(0x355d6b) },
      uFoam: { value: new THREE.Color(0xeef8fa) },
    },
    vertexShader: VERT_SHADER,
    fragmentShader: FRAG_SHADER,
    transparent: true,
    side: THREE.DoubleSide,
  });

  const waterGeom = new THREE.PlaneGeometry(STREAM_HALF_WIDTH * 2, STREAM_HALF_LENGTH * 2, 1, 1);
  waterGeom.rotateX(-Math.PI / 2);
  const waterMesh = new THREE.Mesh(waterGeom, waterMat);
  waterMesh.position.set(STREAM_CENTER_X, baseY, 0);
  group.add(waterMesh);

  // Sites along the centerline, evenly spaced.
  const sites: PanningSite[] = [];
  const ringGeom = new THREE.TorusGeometry(0.4, 0.05, 6, 24);
  ringGeom.rotateX(-Math.PI / 2);

  for (let i = 0; i < SITE_COUNT; i++) {
    const t = (i + 0.5) / SITE_COUNT;
    const z = (t - 0.5) * STREAM_HALF_LENGTH * 2;
    const sitePos = new THREE.Vector3(STREAM_CENTER_X, baseY + 0.08, z);

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
      id: `coyote_creek_${(i + 1).toString().padStart(2, '0')}`,
      position: sitePos,
      marker,
      streamYaw: 0,
    });
  }

  return {
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

        // Subtle bob + pulse when focused
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
