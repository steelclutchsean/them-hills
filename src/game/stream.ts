import * as THREE from 'three';
import { bindFrameUniforms, FRAME_UNIFORM_GLSL } from '@/render/frame-uniforms';
import { reflectionUniforms } from '@/render/reflection';
import type { Terrain } from './terrain';
import { createRng } from './rng';
import type { Watercourse } from './watercourse';

// Streams + panning sites.
//
// Each StreamConfig is the gameplay identity (id, site count, names). The
// channel shape lives on a Watercourse spline: varied width, pools, riffles,
// gravel bars. Sites are placed on that spline, biased toward the bars.
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

const DEFAULT_SHALLOW = 0x5eb8a8;
const DEFAULT_DEEP = 0x1c5c62;
const DEFAULT_FOAM = 0xf4efe2;

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

export interface Stream {
  id: string;
  config: StreamConfig;
  course: Watercourse;
  group: THREE.Group;
  /** Surface mesh. Hidden while the planar reflection renders. */
  water: THREE.Mesh;
  /** Currently-visible sites. Replaced wholesale by setEpoch(). */
  sites: readonly PanningSite[];
  /** World XZ of rocks that break the surface. Foam trails read these. */
  setRocks(rocks: readonly THREE.Vector3[]): void;
  update(
    time: number,
    playerPos: THREE.Vector3,
    focusedSiteId: string | null,
    /** Look up site dig-state for marker visibility. Sites with
     *  digsRemaining <= 0 hide their marker AND drop out of
     *  findNearestSite results until the next midnight respawn. */
    isDepleted: (siteId: string) => boolean,
  ): void;
  findNearestSite(playerPos: THREE.Vector3): { site: PanningSite; distance: number } | null;
  /**
   * Swap in a fresh set of sites at new positions seeded by (epoch, streamId).
   * No-op when called with the same epoch as the current set.
   */
  setEpoch(epoch: number): void;
}

const VERT_SHADER = /* glsl */ `
  ${FRAME_UNIFORM_GLSL}
  attribute vec2 aFlow;
  attribute float aLateral;
  attribute float aDepth;
  varying vec3 vWorld;
  varying vec3 vViewDir;
  varying vec2 vFlow;
  varying float vLateral;
  varying float vDepth;
  #include <common>
  #include <fog_pars_vertex>
  #include <shadowmap_pars_vertex>
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    float along = dot(worldPos.xz, aFlow);
    float wave = sin(along * 3.2 + uTime * 1.6) * 0.03
               + sin(along * 7.0 - uTime * 2.2) * 0.012;
    wave *= 1.0 - abs(aLateral) * 0.65;
    worldPos.y += wave;
    vWorld = worldPos.xyz;
    vFlow = aFlow;
    vLateral = aLateral;
    vDepth = aDepth;
    vec4 mvPosition = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPosition;
    vViewDir = normalize(cameraPosition - vWorld);
    #ifdef USE_SHADOWMAP
      #if NUM_DIR_LIGHT_SHADOWS > 0
        vDirectionalShadowCoord[0] = directionalShadowMatrix[0] * worldPos;
      #endif
    #endif
    #include <fog_vertex>
  }
`;

const FRAG_SHADER = /* glsl */ `
  ${FRAME_UNIFORM_GLSL}
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  uniform float uFlowSpeed;
  uniform vec3 uRocks[8];
  uniform sampler2D uReflect;
  uniform mat4 uReflProjView;
  uniform float uHasReflect;
  varying vec3 vWorld;
  varying vec3 vViewDir;
  varying vec2 vFlow;
  varying float vLateral;
  varying float vDepth;
  #include <common>
  #include <packing>
  #include <fog_pars_fragment>
  #include <shadowmap_pars_fragment>

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
    vec2 flow = normalize(vFlow + vec2(1e-4, 0.0));
    vec2 scroll = flow * uTime * uFlowSpeed;

    float t = abs(vLateral);
    float depthFactor = clamp(vDepth / 1.65, 0.0, 1.0) * (1.0 - t * t * 0.85);
    vec3 murk = vec3(0.42, 0.40, 0.28);
    vec3 base = mix(uShallow, uDeep, depthFactor);
    base = mix(base, murk, smoothstep(1.05, 1.7, vDepth) * 0.4);

    float n1 = noise(worldXZ * 0.32 - scroll);
    float n2 = noise(worldXZ * 0.9 - scroll * 1.4 + vec2(4.2, 1.3));
    float n3 = noise(worldXZ * 2.6 - scroll * 0.55 + vec2(1.7, 8.0));
    float surface = n1 * 0.5 + n2 * 0.32 + n3 * 0.18;
    base = mix(base * 0.84, base * 1.16, smoothstep(0.28, 0.72, surface));

    float edge = smoothstep(0.62, 0.96, t);
    float foamNoise = noise(worldXZ * 3.8 - scroll * 1.3);
    float foamMask = edge * smoothstep(0.32, 0.78, foamNoise);

    float wake = 0.0;
    for (int i = 0; i < 8; i++) {
      float radius = uRocks[i].z;
      if (radius < 0.05) continue;
      vec2 rockXZ = uRocks[i].xy;
      vec2 toFrag = worldXZ - rockXZ;
      float ahead = dot(toFrag, flow);
      float side = abs(toFrag.x * flow.y - toFrag.y * flow.x);
      float body = 1.0 - smoothstep(radius * 0.2, radius * 1.35, length(toFrag));
      float trail = smoothstep(-0.05, 0.35, ahead)
                  * (1.0 - smoothstep(0.15, 2.8, ahead))
                  * (1.0 - smoothstep(radius * 0.15, radius * 1.6, side));
      wake = max(wake, max(body, trail));
    }
    foamMask = max(foamMask, wake * 0.92);
    base = mix(base, uFoam, foamMask * 0.88);

    float h0 = noise(worldXZ * 1.1 - scroll);
    float h1 = noise((worldXZ + vec2(0.12, 0.0)) * 1.1 - scroll);
    float h2 = noise((worldXZ + vec2(0.0, 0.12)) * 1.1 - scroll);
    vec3 surfNormal = normalize(vec3((h0 - h1) * 5.0, 1.0, (h0 - h2) * 5.0));
    vec3 viewDir = normalize(vViewDir);
    vec3 sunDir = normalize(uSunDir);
    vec3 reflectDir = reflect(-sunDir, surfNormal);
    float spec = pow(max(0.0, dot(reflectDir, viewDir)), 56.0);
    base += uSunColor * (spec * 2.2 * uSunIntensity);

    float fres = pow(1.0 - max(dot(viewDir, surfNormal), 0.0), 3.2);
    vec3 reflected = mix(uHemiSky, uFoam, 0.22);
    if (uHasReflect > 0.5) {
      vec4 clip = uReflProjView * vec4(vWorld, 1.0);
      vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
      if (clip.w > 0.0 && uv.x > 0.02 && uv.x < 0.98 && uv.y > 0.02 && uv.y < 0.98) {
        reflected = texture2D(uReflect, uv).rgb;
      }
    }
    base = mix(base, reflected, fres * 0.7);

    float cau = noise(worldXZ * 3.4 - scroll * 1.5) * noise(worldXZ * 6.2 + scroll * 0.6);
    base += vec3(0.55, 0.95, 0.85) * smoothstep(0.62, 0.9, cau) * (1.0 - depthFactor);

    float shadow = 1.0;
    #ifdef USE_SHADOWMAP
      #if NUM_DIR_LIGHT_SHADOWS > 0
        shadow = getShadow(
          directionalShadowMap[0],
          directionalLightShadows[0].shadowMapSize,
          directionalLightShadows[0].shadowIntensity,
          directionalLightShadows[0].shadowBias,
          directionalLightShadows[0].shadowRadius,
          vDirectionalShadowCoord[0]
        );
      #endif
    #endif
    shadow = mix(0.45, 1.0, shadow);
    vec3 lit = base * mix(0.62, 1.0, shadow);
    lit = mix(lit, lit * uSunColor, 0.16 * uSunIntensity * shadow);

    float alpha = mix(0.5, 0.94, depthFactor);
    alpha = max(alpha, foamMask * 0.9);
    alpha = mix(alpha, min(1.0, alpha + 0.28), fres);

    gl_FragColor = vec4(lit, alpha);
    #ifdef USE_FOG
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * 0.55);
      gl_FragColor.a *= 1.0 - fogFactor;
    #endif
  }
`;

function buildRibbon(course: Watercourse): THREE.BufferGeometry {
  const samples = course.samples;
  const positions: number[] = [];
  const flows: number[] = [];
  const laterals: number[] = [];
  const depths: number[] = [];
  for (const s of samples) {
    const nx = -s.tz;
    const nz = s.tx;
    const w = s.halfWidth * 0.92;
    for (const side of [-1, 1]) {
      positions.push(s.x + nx * w * side, s.waterY, s.z + nz * w * side);
      flows.push(s.tx, s.tz);
      laterals.push(side);
      depths.push(s.depth);
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('aFlow', new THREE.Float32BufferAttribute(flows, 2));
  geom.setAttribute('aLateral', new THREE.Float32BufferAttribute(laterals, 1));
  geom.setAttribute('aDepth', new THREE.Float32BufferAttribute(depths, 1));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}

export function createStream(terrain: Terrain, cfg: StreamConfig, course: Watercourse): Stream {
  const group = new THREE.Group();
  group.name = `stream_${cfg.id}`;

  const rocks = Array.from({ length: 8 }, () => new THREE.Vector3());
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    THREE.UniformsLib.lights,
  ]) as Record<string, THREE.IUniform>;
  uniforms.uShallow = { value: new THREE.Color(cfg.shallowColor ?? DEFAULT_SHALLOW) };
  uniforms.uDeep = { value: new THREE.Color(cfg.deepColor ?? DEFAULT_DEEP) };
  uniforms.uFoam = { value: new THREE.Color(cfg.foamColor ?? DEFAULT_FOAM) };
  uniforms.uFlowSpeed = { value: 0.62 };
  uniforms.uRocks = { value: rocks };
  uniforms.uReflect = reflectionUniforms.uReflect;
  uniforms.uReflProjView = reflectionUniforms.uReflProjView;
  uniforms.uHasReflect = reflectionUniforms.uHasReflect;
  bindFrameUniforms(uniforms);

  const waterMat = new THREE.ShaderMaterial({
    name: 'StreamWater',
    uniforms,
    vertexShader: VERT_SHADER,
    fragmentShader: FRAG_SHADER,
    transparent: true,
    fog: true,
    lights: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const waterMesh = new THREE.Mesh(buildRibbon(course), waterMat);
  waterMesh.name = `water_${cfg.id}`;
  waterMesh.receiveShadow = true;
  waterMesh.castShadow = false;
  group.add(waterMesh);

  const ringGeom = new THREE.TorusGeometry(0.4, 0.05, 6, 24);
  ringGeom.rotateX(-Math.PI / 2);

  let sites: PanningSite[] = [];
  let currentEpoch = -1;

  function regenerateSites(epoch: number): void {
    for (const s of sites) {
      group.remove(s.marker);
      (s.marker.material as THREE.Material).dispose();
    }
    sites = [];

    const seed = stringHash(cfg.id) ^ (epoch * 0x9e3779b1);
    const rng = createRng(seed);

    for (let i = 0; i < cfg.siteCount; i++) {
      const t = (i + 0.15 + rng.next() * 0.7) / cfg.siteCount;
      const sample = course.at(t);
      let lateral = (rng.next() - 0.5) * sample.halfWidth * 0.55;
      if (sample.bar !== 0 && rng.next() < 0.7) {
        lateral = sample.bar * sample.halfWidth * (0.28 + rng.next() * 0.38);
      }
      const nx = -sample.tz;
      const nz = sample.tx;
      const sx = sample.x + nx * lateral;
      const sz = sample.z + nz * lateral;
      const surface = sample.waterY || terrain.getHeightAt(sx, sz);
      const sitePos = new THREE.Vector3(sx, surface + 0.06, sz);

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
        streamYaw: Math.atan2(sample.tx, sample.tz),
      });
    }
    currentEpoch = epoch;
  }

  regenerateSites(0);

  const stream: Stream = {
    id: cfg.id,
    config: cfg,
    course,
    group,
    water: waterMesh,
    get sites() {
      return sites;
    },
    setRocks(next) {
      for (let i = 0; i < 8; i++) {
        const src = next[i];
        const dst = rocks[i]!;
        if (src) dst.copy(src);
        else dst.set(0, 0, 0);
      }
    },
    update(time, playerPos, focusedSiteId, isDepleted) {
      waterMat.uniforms.uTime!.value = time;
      for (const site of sites) {
        const depleted = isDepleted(site.id);
        if (depleted) {
          site.marker.visible = false;
          continue;
        }
        site.marker.visible = true;
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
        if (!site.marker.visible) continue;
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
  update(
    time: number,
    playerPos: THREE.Vector3,
    focusedSiteId: string | null,
    isDepleted: (siteId: string) => boolean,
  ): void;
  findNearestSite(playerPos: THREE.Vector3): { site: PanningSite; distance: number } | null;
  isPlayerInAnyStream(playerPos: { x: number; z: number }): boolean;
  /** True if (x, z) is within `padding` meters of any stream's water surface. */
  isInStreamZone(x: number, z: number, padding?: number): boolean;
  /** Push a new epoch to every stream; sites regenerate if the epoch changed. */
  setEpoch(epoch: number): void;
}

export function createStreamRegistry(streams: Stream[]): StreamRegistry {
  return {
    streams,
    update(time, playerPos, focusedSiteId, isDepleted) {
      for (const s of streams) s.update(time, playerPos, focusedSiteId, isDepleted);
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
        if (s.course.contains(playerPos.x, playerPos.z, 0)) return true;
      }
      return false;
    },
    isInStreamZone(x, z, padding = 0) {
      for (const s of streams) {
        if (s.course.contains(x, z, padding)) return true;
      }
      return false;
    },
    setEpoch(epoch) {
      for (const s of streams) s.setEpoch(epoch);
    },
  };
}
