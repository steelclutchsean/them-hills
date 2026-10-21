import * as THREE from 'three';
import { bindFrameUniforms, FRAME_UNIFORM_GLSL } from '@/render/frame-uniforms';
import { reflectionUniforms } from '@/render/reflection';
import { creekProbeUniforms } from '@/render/creek-probe';
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

/** Camera matrices for the screen-space creek mirror. Shared by every stream. */
export const waterViewUniforms = {
  uProj: { value: new THREE.Matrix4() },
  uView: { value: new THREE.Matrix4() },
};

const horizonUp = new THREE.Vector3();
const horizonDir = new THREE.Vector4();

export function syncWaterMatrices(camera: THREE.Camera, renderer?: THREE.WebGLRenderer): void {
  waterViewUniforms.uProj.value.copy(camera.projectionMatrix);
  waterViewUniforms.uView.value.copy(camera.matrixWorldInverse);
  if (renderer) renderer.getDrawingBufferSize(reflectionUniforms.uResolution.value);
  // Screen y of the water plane's vanishing line. The software mirror flips
  // the frame across it, which is where the far-bank trunks land in the creek.
  horizonUp.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
  const uy = Math.abs(horizonUp.y) < 1e-4 ? 1e-4 : horizonUp.y;
  horizonDir.set(0, horizonUp.z / uy, -1, 0).applyMatrix4(camera.projectionMatrix);
  const horizon =
    Math.abs(horizonDir.w) > 1e-5
      ? THREE.MathUtils.clamp((horizonDir.y / horizonDir.w) * 0.5 + 0.5, 0.02, 0.98)
      : 0.5;
  reflectionUniforms.uHorizon.value = horizon;
}

const DEFAULT_SHALLOW = 0x2f8f96;
const DEFAULT_DEEP = 0x0c3a44;
const DEFAULT_FOAM = 0xe7f2ea;

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
  setStage(rise: number, spread: number): void;
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
  uniform samplerCube uProbe0;
  uniform samplerCube uProbe1;
  uniform samplerCube uProbe2;
  uniform samplerCube uProbe3;
  uniform float uHasProbe;
  uniform vec3 uProbePos[4];
  uniform vec3 uProbeMin[4];
  uniform vec3 uProbeMax[4];
  uniform sampler2D uPlanar;
  uniform mat4 uPlanarVP;
  uniform float uHasPlanar;
  uniform float uPlanarMatch;
  uniform sampler2D uFlowMap;
  uniform mat4 uProj;
  uniform mat4 uView;
  varying vec3 vWorld;
  varying vec3 vViewDir;
  varying vec2 vFlow;
  varying float vLateral;
  varying float vDepth;
  #include <common>
  #include <packing>
  #include <fog_pars_fragment>
  #include <shadowmap_pars_fragment>

  vec3 boxProject(vec3 dir, vec3 pos, vec3 bMin, vec3 bMax, vec3 probePos) {
    vec3 safe = dir;
    if (abs(safe.x) < 1e-4) safe.x = 1e-4;
    if (abs(safe.y) < 1e-4) safe.y = 1e-4;
    if (abs(safe.z) < 1e-4) safe.z = 1e-4;
    vec3 bound = mix(bMin, bMax, step(vec3(0.0), safe));
    vec3 travel = (bound - pos) / safe;
    float dist = min(min(travel.x, travel.y), travel.z);
    return normalize(pos + safe * dist - probePos);
  }

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
    float depthFactor = smoothstep(0.08, 0.82, clamp(vDepth / 1.65, 0.0, 1.0) * (1.0 - t * t * 0.65));
    // Cool green-blue absorption. Gold is the gravel bed showing through
    // the clear shallows, not a pigment in the water.
    vec3 base = mix(uShallow, uDeep, depthFactor);
    base = mix(base, uDeep * 0.55, smoothstep(1.05, 1.7, vDepth));

    // Two scrolling layers, cross-faded, so the ripple moves without a seam.
    float phase = fract(uTime * uFlowSpeed * 0.35);
    float phaseB = fract(phase + 0.5);
    float fade = abs(phase * 2.0 - 1.0);
    vec2 flowUv = worldXZ * 0.85;
    float nA = noise(flowUv - flow * phase * 3.2);
    float nB = noise(flowUv - flow * phaseB * 3.2 + vec2(5.1, 2.4));
    float n1 = mix(nA, nB, fade);
    float n2 = noise(worldXZ * 1.7 - scroll * 1.6 + vec2(4.2, 1.3));
    float n3 = noise(worldXZ * 3.4 - scroll * 0.7 + vec2(1.7, 8.0));
    float surface = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
    base = mix(base * 0.7, base * 1.32, smoothstep(0.3, 0.72, surface));
    float rippleLine = smoothstep(0.46, 0.52, n1) * smoothstep(0.64, 0.54, n1);
    base *= 1.0 - rippleLine * 0.22;

    // A wide wet band, then broken low foam. The old edge was a hard white ring.
    float shore = smoothstep(0.62, 0.98, t);
    float wet = smoothstep(0.42, 0.74, t) * (1.0 - smoothstep(0.86, 1.0, t));
    float foamNoise = noise(worldXZ * 2.1 - scroll * 0.45);
    float foamMask = shore * smoothstep(0.64, 0.92, foamNoise) * 0.22;
    // Riffles are the shallow runs. Streaks follow the spline tangent.
    // Shallows foam in the channel. It dies toward the bank so the shore
    // is wet sand, not a white ring.
    float riffle = smoothstep(0.85, 0.28, vDepth) * (1.0 - smoothstep(0.4, 0.82, t));
    float across = dot(worldXZ, vec2(flow.y, -flow.x));
    float along = dot(worldXZ, flow);
    float streak = noise(vec2(across * 5.5, along * 1.2 - uTime * uFlowSpeed * 3.0));
    foamMask = max(foamMask, riffle * smoothstep(0.62, 0.9, streak) * 0.2);

    float wake = 0.0;
    float lip = 0.0;
    for (int i = 0; i < 8; i++) {
      float radius = uRocks[i].z;
      if (radius < 0.05) continue;
      vec2 rockXZ = uRocks[i].xy;
      vec2 toFrag = worldXZ - rockXZ;
      float ahead = dot(toFrag, flow);
      float side = abs(toFrag.x * flow.y - toFrag.y * flow.x);
      float body = 1.0 - smoothstep(radius * 0.15, radius * 2.6, length(toFrag));
      float trail = smoothstep(-0.1, 0.45, ahead)
                  * (1.0 - smoothstep(0.2, 6.4, ahead))
                  * (1.0 - smoothstep(radius * 0.2, radius * 2.8, side));
      // A bright line peeling off each shoulder of the rock, then a tail.
      float shoulder = exp(-abs(side - radius * 0.7) * 4.0)
                     * smoothstep(-0.05, 0.35, ahead)
                     * (1.0 - smoothstep(0.6, 5.2, ahead));
      wake = max(wake, max(body, trail));
      lip = max(lip, shoulder);
    }
    foamMask = max(foamMask, max(wake * 0.45, lip));
    vec3 foamCol = mix(base, vec3(0.7, 0.78, 0.74), clamp(foamMask, 0.0, 0.4));
    foamCol = mix(foamCol, vec3(0.9, 0.91, 0.86), clamp(lip, 0.0, 0.6));

    float h0 = n1;
    float h1 = noise(flowUv + vec2(0.16, 0.0) - flow * phase * 3.2);
    float h2 = noise(flowUv + vec2(0.0, 0.16) - flow * phase * 3.2);
    vec2 sideDir = vec2(-flow.y, flow.x);
    vec2 flowUvN = vec2(dot(worldXZ, flow), dot(worldXZ, sideDir));
    vec3 mapA = texture2D(uFlowMap, flowUvN * 0.38 - vec2(uTime * uFlowSpeed * 0.32, 0.0)).xyz * 2.0 - 1.0;
    vec3 mapB = texture2D(uFlowMap, flowUvN * 0.71 + vec2(0.17, uTime * uFlowSpeed * 0.2)).xyz * 2.0 - 1.0;
    vec3 surfNormal = normalize(vec3(
      (h0 - h1) * 7.5 + (mapA.x + mapB.x) * 0.9,
      1.0,
      (h0 - h2) * 7.5 + (mapA.y + mapB.y) * 0.9
    ));
    vec3 viewDir = normalize(vViewDir);
    vec3 sunDir = normalize(uSunDir);
    vec3 reflectDir = reflect(-sunDir, surfNormal);
    float spec = pow(max(0.0, dot(reflectDir, viewDir)), 56.0);
    base += uSunColor * (spec * 0.85 * uSunIntensity);

    float fres = pow(1.0 - max(dot(viewDir, surfNormal), 0.0), 2.1);
    vec3 reflected = uHemiSky;
    float mirrorHit = 0.0;
    float planarHit = 0.0;
    if (uHasProbe > 0.5) {
      vec3 reflN = normalize(vec3(surfNormal.x * 0.32, 1.0, surfNormal.z * 0.32));
      vec3 dir = reflect(-viewDir, reflN);
      float d0 = distance(vWorld, uProbePos[0]);
      float d1 = distance(vWorld, uProbePos[1]);
      float d2 = distance(vWorld, uProbePos[2]);
      float d3 = distance(vWorld, uProbePos[3]);
      float nearest = min(min(d0, d1), min(d2, d3));
      float w0 = 1.0 - smoothstep(0.0, 16.0, d0 - nearest);
      float w1 = 1.0 - smoothstep(0.0, 16.0, d1 - nearest);
      float w2 = 1.0 - smoothstep(0.0, 16.0, d2 - nearest);
      float w3 = 1.0 - smoothstep(0.0, 16.0, d3 - nearest);
      vec3 c0 = textureCube(uProbe0, boxProject(dir, vWorld, uProbeMin[0], uProbeMax[0], uProbePos[0])).rgb;
      vec3 c1 = textureCube(uProbe1, boxProject(dir, vWorld, uProbeMin[1], uProbeMax[1], uProbePos[1])).rgb;
      vec3 c2 = textureCube(uProbe2, boxProject(dir, vWorld, uProbeMin[2], uProbeMax[2], uProbePos[2])).rgb;
      vec3 c3 = textureCube(uProbe3, boxProject(dir, vWorld, uProbeMin[3], uProbeMax[3], uProbePos[3])).rgb;
      reflected = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.001);
      mirrorHit = 1.0;
    }
    // The planar is a mirrored capture of this exact camera. Anywhere else
    // it would be a smeared photo, so the cubes carry the everyday look.
    if (uHasPlanar > 0.5 && uPlanarMatch > 0.5 && fres > 0.05) {
      vec4 clip = uPlanarVP * vec4(vWorld, 1.0);
      if (clip.w > 0.15) {
        vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
        uv += surfNormal.xz * 0.004;
        if (uv.x > 0.015 && uv.x < 0.985 && uv.y > 0.015 && uv.y < 0.985) {
          vec3 bank = texture2D(uPlanar, uv).rgb;
          float bl = dot(bank, vec3(0.2126, 0.7152, 0.0722));
          float cubeL = dot(reflected, vec3(0.2126, 0.7152, 0.0722));
          // A flat dark texel is the underground side of the bake. The cube
          // already holds the trees, so only a brighter planar sample wins.
          if (bl > 0.04 && bl + 0.03 > cubeL) {
            reflected = bank;
            mirrorHit = 1.0;
            planarHit = 1.0;
          }
        }
      }
    }
    // Keep the bake's light and dark (trunk against sky) and throw away its
    // chroma. Sunlit dirt stays out of the pigment; gold is the gravel bed.
    float rl = dot(reflected, vec3(0.2126, 0.7152, 0.0722));
    float shaped = clamp(pow(max(rl, 0.001), 0.58) * 1.85, 0.05, 2.15);
    vec3 cool = vec3(0.22, 0.66, 0.62) * shaped;
    float reflectAmt = mix(0.05, 0.16, smoothstep(0.15, 0.75, fres));
    if (planarHit > 0.5 || mirrorHit > 0.5) {
      reflected = cool;
      reflectAmt = mix(0.34, 0.9, smoothstep(0.06, 0.62, fres));
      reflectAmt *= mix(0.22, 1.0, smoothstep(0.08, 0.55, depthFactor));
      reflectAmt *= mix(1.0, 0.3, smoothstep(0.68, 0.98, t));
    } else {
      reflectAmt *= 0.35;
    }
    base = mix(base, reflected, reflectAmt);
    base = mix(base, vec3(0.28, 0.25, 0.2), wet * 0.88);
    float foamAmt = clamp(max(foamMask, lip), 0.0, 0.88);
    // Keep the rock lips. Don't paint the mirror out with sheet foam.
    if (mirrorHit > 0.5) foamAmt = max(lip * 0.85, min(foamAmt, 0.32));
    base = mix(base, foamCol, foamAmt);

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

    float alpha = mix(0.18, 0.97, smoothstep(0.02, 0.48, depthFactor));
    alpha *= mix(1.0, 0.1, smoothstep(0.42, 0.96, t));
    alpha = max(alpha, lip * 0.72);
    alpha = mix(alpha, min(1.0, alpha + 0.12), fres * (1.0 - shore));

    gl_FragColor = vec4(lit, alpha);
    #ifdef USE_FOG
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * 0.22);
      gl_FragColor.a *= 1.0 - fogFactor * 0.35;
    #endif
  }
`;

let flowMapTex: THREE.CanvasTexture | null = null;

/** Streaks that run along U, which the shader scrolls in the flow direction. */
function flowNormalMap(): THREE.CanvasTexture {
  if (flowMapTex) return flowMapTex;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[stream] canvas 2d unavailable');
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      height[y * size + x] =
        Math.sin((u * 3.0 + v * 14.0) * Math.PI * 2) * 0.55 +
        Math.sin((u * 1.2 - v * 6.0) * Math.PI * 2) * 0.3 +
        Math.sin((v * 22.0 + u * 0.4) * Math.PI * 2) * 0.15;
    }
  }
  const image = ctx.createImageData(size, size);
  const at = (x: number, y: number) =>
    height[((y + size) % size) * size + ((x + size) % size)] ?? 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = at(x + 1, y) - at(x - 1, y);
      const dy = at(x, y + 1) - at(x, y - 1);
      const nx = -dx * 2.4;
      const ny = -dy * 2.4;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      image.data[i] = Math.round((nx / len) * 127 + 128);
      image.data[i + 1] = Math.round((ny / len) * 127 + 128);
      image.data[i + 2] = Math.round((nz / len) * 127 + 128);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  flowMapTex = new THREE.CanvasTexture(canvas);
  flowMapTex.wrapS = THREE.RepeatWrapping;
  flowMapTex.wrapT = THREE.RepeatWrapping;
  flowMapTex.colorSpace = THREE.NoColorSpace;
  return flowMapTex;
}

let gravelMat: THREE.MeshStandardMaterial | null = null;

function gravelMaterial(): THREE.MeshStandardMaterial {
  if (gravelMat) return gravelMat;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[stream] canvas 2d unavailable');
  ctx.fillStyle = '#c4a06a';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const x = (i * 47) % size;
    const y = (i * 29) % size;
    const r = 3 + (i % 5);
    const tone = 120 + (i % 7) * 14;
    ctx.fillStyle = `rgb(${tone + 40}, ${tone - 10}, ${tone - 50})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.72, (i % 5) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(6, 6);
  gravelMat = new THREE.MeshStandardMaterial({
    map,
    color: 0xfff2dc,
    roughness: 0.94,
    metalness: 0,
  });
  return gravelMat;
}

function buildBed(course: Watercourse): THREE.BufferGeometry {
  const samples = course.samples;
  const positions: number[] = [];
  const uvs: number[] = [];
  for (const s of samples) {
    const nx = -s.tz;
    const nz = s.tx;
    const w = s.halfWidth * 0.9;
    const drop = 0.06 + Math.min(0.28, s.depth * 0.16);
    for (const side of [-1, 1]) {
      positions.push(s.x + nx * w * side, s.waterY - drop, s.z + nz * w * side);
      uvs.push(s.x * 0.18, s.z * 0.18);
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < samples.length - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

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
  uniforms.uProbe0 = creekProbeUniforms.uProbe0;
  uniforms.uProbe1 = creekProbeUniforms.uProbe1;
  uniforms.uProbe2 = creekProbeUniforms.uProbe2;
  uniforms.uProbe3 = creekProbeUniforms.uProbe3;
  uniforms.uHasProbe = creekProbeUniforms.uHasProbe;
  uniforms.uProbePos = creekProbeUniforms.uProbePos;
  uniforms.uProbeMin = creekProbeUniforms.uProbeMin;
  uniforms.uProbeMax = creekProbeUniforms.uProbeMax;
  uniforms.uPlanar = creekProbeUniforms.uPlanar;
  uniforms.uPlanarVP = creekProbeUniforms.uPlanarVP;
  uniforms.uHasPlanar = creekProbeUniforms.uHasPlanar;
  uniforms.uPlanarMatch = creekProbeUniforms.uPlanarMatch;
  uniforms.uFlowMap = { value: flowNormalMap() };
  uniforms.uProj = waterViewUniforms.uProj;
  uniforms.uView = waterViewUniforms.uView;
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

  const bed = new THREE.Mesh(buildBed(course), gravelMaterial());
  bed.name = `bed_${cfg.id}`;
  bed.receiveShadow = true;
  bed.castShadow = false;
  group.add(bed);

  const waterMesh = new THREE.Mesh(buildRibbon(course), waterMat);
  const waterBase = Float32Array.from(
    (waterMesh.geometry.getAttribute('position') as THREE.BufferAttribute).array,
  );
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
    setStage(rise, spread) {
      const geom = waterMesh.geometry;
      const attr = geom.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i += 2) {
        const x0 = waterBase[i * 3] ?? 0;
        const y0 = waterBase[i * 3 + 1] ?? 0;
        const z0 = waterBase[i * 3 + 2] ?? 0;
        const x1 = waterBase[(i + 1) * 3] ?? 0;
        const y1 = waterBase[(i + 1) * 3 + 1] ?? 0;
        const z1 = waterBase[(i + 1) * 3 + 2] ?? 0;
        const mx = (x0 + x1) * 0.5;
        const mz = (z0 + z1) * 0.5;
        attr.setXYZ(i, mx + (x0 - mx) * spread, y0 + rise, mz + (z0 - mz) * spread);
        attr.setXYZ(i + 1, mx + (x1 - mx) * spread, y1 + rise, mz + (z1 - mz) * spread);
      }
      attr.needsUpdate = true;
      geom.computeBoundingSphere();
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
  /** Raise or drop the surface and widen or narrow the ribbon. Calm is 0, 1. */
  setStage(rise: number, spread: number): void;
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
    setStage(rise, spread) {
      for (const s of streams) s.setStage(rise, spread);
    },
  };
}
