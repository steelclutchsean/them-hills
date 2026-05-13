import * as THREE from 'three';
import { RAPIER } from '@/physics/world';

// 200m × 200m heightmap with deterministic rolling-hills generator.
// Flattens a ~30m radius around the origin so the spawn area is gentle.
//
// IMPORTANT: Rapier's heightfield expects heights stored in **column-major** order
// (per the Heightfield class doc and rapier3d source). For a square (nrows × ncols)
// matrix where i indexes rows (Z direction) and j indexes columns (X direction),
// the linear index is `i + j * nrows`. Storing it row-major caused visual mesh and
// physics collider to disagree for any asymmetric heightmap, which manifested as
// the character sinking into the visual ground (because the Rapier-reported height
// at world (x, z) was actually the height at world (z, x)).

const SUBDIVS = 128;
const N = SUBDIVS + 1;
const EXTENT_X = 200;
const EXTENT_Z = 200;
const HEIGHT_SCALE = 6;

// Bank shape — same for every channel. The water plane sits at natural
// ground level (WATER_OFFSET_ABOVE_FLOOR == channel depth, defined in
// stream.ts). The terrain pulls DOWN inside halfWidth (riverbed) so the
// bed is genuinely below the water plane. Banks stay flush with natural
// terrain — no raised berm — so water meets the surrounding ground with
// no step. `BANK_WIDTH` and `BANK_TRANSITION` still define the river-rocks
// texture zone: the river-rocks diffuse covers water + the BANK_WIDTH past
// the water edge, then a smooth BANK_TRANSITION blend to forest-floor.
const BANK_WIDTH = 1.6; // meters past halfWidth where rocks texture stays solid
const BANK_HEIGHT = 0; // flush water — no raised bank
const BANK_TRANSITION = 2.4; // meters past bank zone where rocks → forest

export type ChannelOrientation = 'NS' | 'EW';

export interface ChannelConfig {
  centerX: number;
  centerZ: number;
  halfWidth: number;
  halfLength: number;
  orientation: ChannelOrientation;
  /** Vertical drop in meters at the channel center; tapers to 0 at the banks. */
  depth: number;
}

export interface TerrainLightingState {
  sunDirection: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  ambientColor: THREE.Color;
  ambientIntensity: number;
}

export interface Terrain {
  mesh: THREE.Mesh;
  collider: RAPIER.Collider;
  /** Ground height at world (x, z), bilinear interpolated. Matches the Rapier collider. */
  getHeightAt(x: number, z: number): number;
  /** Push the latest sun + ambient lighting to the terrain shader uniforms. */
  updateLighting(state: TerrainLightingState): void;
}

/** Column-major index: heights[i + j * nrows] where i = row (Z), j = col (X). */
function heightIdx(ix: number, iy: number): number {
  return iy + ix * N;
}

/** Pure terrain noise — no flattening, no carve. */
function rawHeight(x: number, z: number): number {
  return (
    Math.sin(x * 0.06) * 0.4 +
    Math.cos(z * 0.05) * 0.35 +
    Math.sin(x * 0.21 + z * 0.13) * 0.12 +
    Math.cos(x * 0.07 - z * 0.09) * 0.08
  );
}

function smoothstep01(a: number, b: number, x: number): number {
  if (a === b) return x < a ? 0 : 1;
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function generateHeights(channels: readonly ChannelConfig[]): Float32Array {
  // Pre-compute each channel's target floor in normalized (pre-HEIGHT_SCALE)
  // space. The target is "natural-at-center minus carve depth".
  const targets = channels.map((ch) => {
    const naturalAtCenter = rawHeight(ch.centerX, ch.centerZ);
    return naturalAtCenter - ch.depth / HEIGHT_SCALE;
  });
  const bankHeightNorm = BANK_HEIGHT / HEIGHT_SCALE;

  const heights = new Float32Array(N * N);
  for (let iy = 0; iy < N; iy++) {
    for (let ix = 0; ix < N; ix++) {
      const u = ix / SUBDIVS - 0.5;
      const v = iy / SUBDIVS - 0.5;
      const x = u * EXTENT_X;
      const z = v * EXTENT_Z;
      const h = rawHeight(x, z);
      const distFromOrigin = Math.hypot(x, z);
      const flattening = Math.max(0, 1 - distFromOrigin / 30);
      let scaled = h * (1 - 0.7 * flattening);

      for (let i = 0; i < channels.length; i++) {
        const ch = channels[i]!;
        const target = targets[i]!;
        let dCross: number;
        let dAlong: number;
        if (ch.orientation === 'NS') {
          dCross = Math.abs(x - ch.centerX);
          dAlong = Math.abs(z - ch.centerZ);
        } else {
          dCross = Math.abs(z - ch.centerZ);
          dAlong = Math.abs(x - ch.centerX);
        }
        if (dAlong > ch.halfLength) continue;

        // Riverbed pull-down. Inside halfWidth the floor merges to target;
        // bidirectional so natural valleys also get pulled UP to target if
        // they happen to be below it. Quadratic shape (1 - t²) keeps the bed
        // flat at the centerline and curves up gently to the water edge.
        if (dCross < ch.halfWidth) {
          const t = dCross / ch.halfWidth;
          const bedShape = 1 - t * t;
          scaled = scaled + (target - scaled) * bedShape;
        }

        // Bank raise. Between halfWidth and halfWidth + BANK_WIDTH the
        // terrain is pushed UP by BANK_HEIGHT × sin(πt), peaking at the
        // middle of the bank zone — so the bank rises smoothly out of the
        // water edge, crests, and falls back to natural at the outer side.
        const bankInner = ch.halfWidth;
        const bankOuter = ch.halfWidth + BANK_WIDTH;
        if (dCross > bankInner && dCross < bankOuter) {
          const t = (dCross - bankInner) / BANK_WIDTH;
          const bankShape = Math.sin(t * Math.PI);
          scaled += bankHeightNorm * bankShape;
        }
      }

      heights[heightIdx(ix, iy)] = scaled;
    }
  }
  return heights;
}

const TERRAIN_VS = /* glsl */ `
  attribute vec3 color;
  attribute float aBankMask;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying float vBankMask;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorld = worldPos.xyz;
    vNormal = normalize(normalMatrix * normal);
    vColor = color;
    vBankMask = aBankMask;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

// Two diffuses sampled in world space and blended by the per-vertex
// bank-mask attribute. The forest-floor diffuse covers the open terrain;
// the river-rocks diffuse covers the riverbed under the water plane and
// the rising banks. Both are sampled at two scales and mixed by a slow
// noise so the player doesn't see a visible repeating grid.
const TERRAIN_FS = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  uniform vec3 uAmbientColor;
  uniform float uAmbientIntensity;
  uniform sampler2D uDiffuseGround;
  uniform sampler2D uDiffuseRocks;
  uniform float uTileScale;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying float vBankMask;

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

  vec3 sampleTwoScales(sampler2D tex, vec2 worldXZ) {
    vec2 uvSmall = worldXZ * uTileScale;
    vec2 uvLarge = worldXZ * (uTileScale * 0.25) + vec2(0.37, 0.81);
    vec3 small = texture2D(tex, uvSmall).rgb;
    vec3 large = texture2D(tex, uvLarge).rgb;
    float blend = noise(worldXZ * 0.04);
    return mix(small, large, blend * 0.5);
  }

  void main() {
    vec2 worldXZ = vWorld.xz;

    vec3 ground = sampleTwoScales(uDiffuseGround, worldXZ);
    vec3 rocks  = sampleTwoScales(uDiffuseRocks, worldXZ);

    // The bank mask is interpolated by the GPU across the triangle, but the
    // raw 0..1 ramp can read as a flat fade. A slight smoothstep on top
    // gives the rocks zone slightly harder edges where it meets the forest.
    float maskShaped = smoothstep(0.05, 0.95, vBankMask);
    vec3 tex = mix(ground, rocks, maskShaped);

    // Tint by per-vertex color (meadow / hill / cliff / sand). vColor sits
    // roughly in (0.3..0.6) per channel so multiplying by 2.1 puts neutral
    // around 1.0; sand/cliff vertices pull the texture warmer or browner.
    vec3 base = tex * vColor * 2.1;

    float upDot = clamp(vNormal.y, 0.0, 1.0);
    base *= mix(0.55, 1.0, upDot);

    float lambert = max(0.0, dot(vNormal, uSunDir));
    vec3 lit = base * (uAmbientColor * uAmbientIntensity + uSunColor * uSunIntensity * lambert * 0.85);

    gl_FragColor = vec4(lit, 1.0);
  }
`;

const COLOR_MEADOW = new THREE.Color(0x4d6c3a);
const COLOR_HILL = new THREE.Color(0x617d44);
const COLOR_CLIFF = new THREE.Color(0x6b5a3e);
const COLOR_SAND = new THREE.Color(0x9b8e63);

/**
 * Per-vertex coloring + bank-mask attribute. vColor shades meadow / hill /
 * cliff / sand by slope + elevation + stream proximity. aBankMask is 1.0
 * inside the rocks zone (water + rising bank), smoothly fades to 0 across
 * BANK_TRANSITION meters past the bank, and 0 elsewhere.
 */
function paintVertexColors(
  geom: THREE.BufferGeometry,
  heights: Float32Array,
  channels: readonly ChannelConfig[],
): void {
  const positions = geom.attributes.position;
  if (!positions) return;
  const count = positions.count;
  const colors = new Float32Array(count * 3);
  const bankMasks = new Float32Array(count);

  const cellX = EXTENT_X / SUBDIVS;
  const cellZ = EXTENT_Z / SUBDIVS;
  const tmp = new THREE.Color();

  for (let iy = 0; iy < N; iy++) {
    for (let ix = 0; ix < N; ix++) {
      const meshIdx = iy * N + ix;
      const ixR = Math.min(ix + 1, SUBDIVS);
      const iyD = Math.min(iy + 1, SUBDIVS);
      const h = heights[heightIdx(ix, iy)]! * HEIGHT_SCALE;
      const hR = heights[heightIdx(ixR, iy)]! * HEIGHT_SCALE;
      const hD = heights[heightIdx(ix, iyD)]! * HEIGHT_SCALE;
      const dx = (hR - h) / cellX;
      const dz = (hD - h) / cellZ;
      const slope = Math.hypot(dx, dz);

      const u = ix / SUBDIVS - 0.5;
      const v = iy / SUBDIVS - 0.5;
      const wx = u * EXTENT_X;
      const wz = v * EXTENT_Z;

      let sandFactor = 0;
      let bankMask = 0;
      for (const ch of channels) {
        let dCross: number;
        let dAlong: number;
        if (ch.orientation === 'NS') {
          dCross = Math.abs(wx - ch.centerX);
          dAlong = Math.abs(wz - ch.centerZ);
        } else {
          dCross = Math.abs(wz - ch.centerZ);
          dAlong = Math.abs(wx - ch.centerX);
        }
        // Channel is only relevant within its own length plus a small fade-out
        // at the ends — past that, the bank/sand contribution is zero.
        const alongFade = smoothstep01(ch.halfLength + 1.5, ch.halfLength - 1.5, dAlong);
        if (alongFade <= 0) continue;

        const bankOuter = ch.halfWidth + BANK_WIDTH;
        const blendOuter = bankOuter + BANK_TRANSITION;
        let mask = 0;
        if (dCross < bankOuter) {
          mask = 1;
        } else if (dCross < blendOuter) {
          mask = 1 - smoothstep01(bankOuter, blendOuter, dCross);
        }
        bankMask = Math.max(bankMask, mask * alongFade);

        // Sand vertex tint extends a bit into the transition zone so banks
        // read sandy underneath the rocks texture even if the texture blend
        // hasn't fully kicked in yet.
        if (dCross < blendOuter) {
          const sandEnd = ch.halfWidth * 1.6;
          if (dCross < sandEnd) {
            const t = Math.max(
              0,
              (dCross - ch.halfWidth) / Math.max(0.001, sandEnd - ch.halfWidth),
            );
            sandFactor = Math.max(sandFactor, (1 - t) * alongFade);
          }
        }
      }
      bankMasks[meshIdx] = bankMask;

      const elevationT = Math.min(1, Math.max(0, h / 4 + 0.3));
      tmp.copy(COLOR_MEADOW).lerp(COLOR_HILL, elevationT);
      const cliffT = Math.min(1, Math.max(0, (slope - 0.45) / 0.4));
      tmp.lerp(COLOR_CLIFF, cliffT);
      tmp.lerp(COLOR_SAND, sandFactor * 0.65);

      const jitter = (((ix * 1103) ^ (iy * 524287)) % 100) / 1000 - 0.05;
      tmp.r = Math.max(0, Math.min(1, tmp.r + jitter));
      tmp.g = Math.max(0, Math.min(1, tmp.g + jitter));
      tmp.b = Math.max(0, Math.min(1, tmp.b + jitter));

      colors[meshIdx * 3 + 0] = tmp.r;
      colors[meshIdx * 3 + 1] = tmp.g;
      colors[meshIdx * 3 + 2] = tmp.b;
    }
  }

  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setAttribute('aBankMask', new THREE.BufferAttribute(bankMasks, 1));
}

export function createTerrain(world: RAPIER.World, channels: readonly ChannelConfig[]): Terrain {
  const heights = generateHeights(channels);

  const geom = new THREE.PlaneGeometry(EXTENT_X, EXTENT_Z, SUBDIVS, SUBDIVS);
  geom.rotateX(-Math.PI / 2);
  const positions = geom.attributes.position;
  if (!positions) throw new Error('[terrain] PlaneGeometry missing position attribute');
  for (let iy = 0; iy < N; iy++) {
    for (let ix = 0; ix < N; ix++) {
      const meshIdx = iy * N + ix;
      positions.setY(meshIdx, heights[heightIdx(ix, iy)]! * HEIGHT_SCALE);
    }
  }
  positions.needsUpdate = true;
  geom.computeVertexNormals();

  paintVertexColors(geom, heights, channels);

  // Polyhaven 4K diffuses tiled in world space.
  const textureLoader = new THREE.TextureLoader();
  const groundTex = textureLoader.load('assets/textures/forrest_ground_01_diff_4k.jpg');
  groundTex.wrapS = THREE.RepeatWrapping;
  groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.anisotropy = 8;
  const rocksTex = textureLoader.load('assets/textures/river_small_rocks_diff_4k.jpg');
  rocksTex.wrapS = THREE.RepeatWrapping;
  rocksTex.wrapT = THREE.RepeatWrapping;
  rocksTex.colorSpace = THREE.SRGBColorSpace;
  rocksTex.anisotropy = 8;

  const terrainMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0.5, 1, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(0xffffff) },
      uSunIntensity: { value: 1.0 },
      uAmbientColor: { value: new THREE.Color(0xffffff) },
      uAmbientIntensity: { value: 0.5 },
      uDiffuseGround: { value: groundTex },
      uDiffuseRocks: { value: rocksTex },
      // 0.25 = one tile per 4 world meters.
      uTileScale: { value: 0.25 },
    },
    vertexShader: TERRAIN_VS,
    fragmentShader: TERRAIN_FS,
  });
  const mesh = new THREE.Mesh(geom, terrainMat);
  mesh.receiveShadow = true;

  const scale = new RAPIER.Vector3(EXTENT_X, HEIGHT_SCALE, EXTENT_Z);
  const colliderDesc = RAPIER.ColliderDesc.heightfield(SUBDIVS, SUBDIVS, heights, scale);
  const collider = world.createCollider(colliderDesc);

  return {
    mesh,
    collider,
    getHeightAt(x, z) {
      const u = x / EXTENT_X + 0.5;
      const v = z / EXTENT_Z + 0.5;
      if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
      const fx = u * SUBDIVS;
      const fz = v * SUBDIVS;
      const ix0 = Math.floor(fx);
      const iz0 = Math.floor(fz);
      const ix1 = Math.min(ix0 + 1, SUBDIVS);
      const iz1 = Math.min(iz0 + 1, SUBDIVS);
      const tx = fx - ix0;
      const tz = fz - iz0;
      const h00 = heights[heightIdx(ix0, iz0)]!;
      const h10 = heights[heightIdx(ix1, iz0)]!;
      const h01 = heights[heightIdx(ix0, iz1)]!;
      const h11 = heights[heightIdx(ix1, iz1)]!;
      const h0 = h00 + (h10 - h00) * tx;
      const h1 = h01 + (h11 - h01) * tx;
      return (h0 + (h1 - h0) * tz) * HEIGHT_SCALE;
    },
    updateLighting(state) {
      (terrainMat.uniforms.uSunDir!.value as THREE.Vector3).copy(state.sunDirection);
      (terrainMat.uniforms.uSunColor!.value as THREE.Color).copy(state.sunColor);
      terrainMat.uniforms.uSunIntensity!.value = state.sunIntensity;
      (terrainMat.uniforms.uAmbientColor!.value as THREE.Color).copy(state.ambientColor);
      terrainMat.uniforms.uAmbientIntensity!.value = state.ambientIntensity;
    },
  };
}
