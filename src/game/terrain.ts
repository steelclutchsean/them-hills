import * as THREE from 'three';
import { RAPIER } from '@/physics/world';
import { bindFrameUniforms, FRAME_UNIFORM_GLSL } from '@/render/frame-uniforms';
import { groundMaps } from '@/render/painterly';

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

// Bank shape — same for every channel. The water surface sits at natural
// ground level (WATER_OFFSET_ABOVE_FLOOR == channel depth, defined in
// stream.ts). The terrain pulls DOWN inside halfWidth so the bed is below
// the surface, then rises a lip of BANK_HEIGHT across BANK_WIDTH. The
// gravel splat covers that lip and fades to grass across BANK_TRANSITION.
const BANK_WIDTH = 2.2; // meters past halfWidth where the gravel lip stays
const BANK_HEIGHT = 1.15; // raised berm so the creek has a readable bank
const BANK_TRANSITION = 2.6; // meters past the lip where gravel fades to grass

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

export interface Terrain {
  /** Chunked visual meshes. The physics collider stays one heightfield. */
  mesh: THREE.Group;
  collider: RAPIER.Collider;
  /** Ground height at world (x, z), bilinear interpolated. Matches the Rapier collider. */
  getHeightAt(x: number, z: number): number;
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
  attribute float aBankMask;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying float vBankMask;

  #include <common>
  #include <shadowmap_pars_vertex>
  #include <fog_pars_vertex>

  void main() {
    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    // World-space normal. The previous shader dotted a view-space normal
    // against a world-space sun, so the hills relit as the camera orbited.
    vNormal = normalize(mat3(modelMatrix) * objectNormal);

    #include <begin_vertex>
    #include <project_vertex>
    #include <worldpos_vertex>
    vWorld = worldPosition.xyz;
    vColor = color;
    vBankMask = aBankMask;

    #include <shadowmap_vertex>
    #include <fog_vertex>
  }
`;

// Painted splat. Grass, dirt, gravel, and rock are triplanar samples of
// the Sierra palette, weighted by slope, height, and the creek bank mask.
const TERRAIN_FS = /* glsl */ `
  ${FRAME_UNIFORM_GLSL}
  uniform sampler2D uGrass;
  uniform sampler2D uDirt;
  uniform sampler2D uGravel;
  uniform sampler2D uRock;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying float vBankMask;

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

  vec3 triplanar(sampler2D tex, vec3 pos, vec3 n) {
    vec3 w = abs(n);
    w = pow(w, vec3(3.0));
    w /= max(w.x + w.y + w.z, 1e-4);
    vec3 x = texture2D(tex, pos.zy * 0.18).rgb;
    vec3 y = texture2D(tex, pos.xz * 0.18).rgb;
    vec3 z = texture2D(tex, pos.xy * 0.18).rgb;
    return x * w.x + y * w.y + z * w.z;
  }

  void main() {
    vec2 worldXZ = vWorld.xz;
    vec3 n0 = normalize(vNormal);
    float slope = 1.0 - clamp(n0.y, 0.0, 1.0);
    float maskShaped = smoothstep(0.05, 0.95, vBankMask);

    vec3 grass = triplanar(uGrass, vWorld, n0);
    vec3 dirt = triplanar(uDirt, vWorld, n0);
    vec3 gravel = triplanar(uGravel, vWorld, n0);
    vec3 rock = triplanar(uRock, vWorld, n0);

    float rockW = smoothstep(0.22, 0.62, slope);
    float grassW = (1.0 - rockW) * (1.0 - maskShaped) * smoothstep(0.15, 0.0, slope);
    float gravelW = maskShaped * (1.0 - rockW * 0.35);
    float dirtW = (1.0 - grassW) * (1.0 - rockW) * (1.0 - gravelW * 0.65);
    float sumW = max(grassW + dirtW + gravelW + rockW, 1e-3);
    vec3 tex = (grass * grassW + dirt * dirtW + gravel * gravelW + rock * rockW) / sumW;

    // Vertex color is a mild biome brightness, not a second photograph.
    vec3 albedo = tex * mix(vec3(1.08), vColor * 1.15, 0.12);
    float macro = noise(worldXZ * 0.012);
    float patch = noise(worldXZ * 0.045 + 4.0);
    albedo *= mix(0.78, 1.22, macro);
    albedo.r *= mix(0.92, 1.12, patch);
    albedo.g *= mix(1.08, 0.9, patch);
    float rough = mix(0.92, 0.72, maskShaped);

    // Detail normal from the same hash noise, added in world XZ so lighting
    // breaks up the heightfield's large facets without extra vertices.
    float e = 0.42;
    float h0 = noise(worldXZ * 1.8);
    float hx = noise((worldXZ + vec2(e, 0.0)) * 1.8);
    float hz = noise((worldXZ + vec2(0.0, e)) * 1.8);
    vec3 n = normalize(vNormal + vec3((h0 - hx) * 2.4, 0.0, (h0 - hz) * 2.4));

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
    // Keep a readable floor. Pitch-black shade fights the stylized kit.
    shadow = mix(0.38, 1.0, shadow);

    vec3 sunDir = normalize(uSunDir);
    float wrap = clamp(dot(n, sunDir) * 0.62 + 0.38, 0.0, 1.0);
    float hemiW = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 gi = uAmbientColor * (uAmbientIntensity * 0.65)
            + mix(uHemiGround, uHemiSky, hemiW) * uHemiIntensity;
    float cavity = mix(0.74, 1.0, smoothstep(0.02, 0.85, n.y));
    vec3 lit = albedo * cavity * (gi + uSunColor * uSunIntensity * wrap * shadow);

    vec3 viewDir = normalize(cameraPosition - vWorld);
    vec3 halfDir = normalize(sunDir + viewDir);
    float specPow = mix(12.0, 72.0, clamp(1.0 - rough, 0.0, 1.0));
    float spec = pow(max(dot(n, halfDir), 0.0), specPow) * (1.0 - rough);
    // Banks read wet; open ground stays matte.
    spec *= shadow * mix(0.03, 0.32, maskShaped);
    lit += uSunColor * spec * uSunIntensity;

    // Caustics on the wet bed. Scrolling product noise, only where the
    // bank mask says this vertex is in the channel.
    float cauA = noise(worldXZ * 2.4 - vec2(uTime * 0.35, uTime * 0.12));
    float cauB = noise(worldXZ * 4.1 + vec2(uTime * 0.22, -uTime * 0.28));
    float caustic = smoothstep(0.55, 0.92, cauA * cauB) * maskShaped * shadow;
    lit += vec3(0.45, 0.85, 0.78) * caustic * uSunIntensity * 0.55;

    gl_FragColor = vec4(lit, 1.0);
    #include <fog_fragment>
    // Valley mist. Lower ground picks up the fog color even at the camera.
    float mist = (1.0 - smoothstep(-2.0, 6.5, vWorld.y)) * 0.12;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, mist);
  }
`;

const COLOR_MEADOW = new THREE.Color(0xc6a84a);
const COLOR_HILL = new THREE.Color(0x8a9344);
const COLOR_CLIFF = new THREE.Color(0x8d7764);
const COLOR_SAND = new THREE.Color(0xc2b39a);

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

function sliceChunk(
  source: THREE.BufferGeometry,
  ix0: number,
  ix1: number,
  iy0: number,
  iy1: number,
): THREE.BufferGeometry {
  const pos = source.attributes.position;
  const normal = source.attributes.normal;
  const color = source.attributes.color;
  const bank = source.attributes.aBankMask;
  if (!pos || !normal || !color || !bank) {
    throw new Error('[terrain] chunk source is missing attributes');
  }
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const banks: number[] = [];
  const push = (ix: number, iy: number): void => {
    const i = iy * N + ix;
    positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
    colors.push(color.getX(i), color.getY(i), color.getZ(i));
    banks.push(bank.getX(i));
  };
  for (let iy = iy0; iy < iy1; iy++) {
    for (let ix = ix0; ix < ix1; ix++) {
      // Same winding as THREE.PlaneGeometry.
      push(ix, iy);
      push(ix, iy + 1);
      push(ix + 1, iy);
      push(ix, iy + 1);
      push(ix + 1, iy + 1);
      push(ix + 1, iy);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geom.setAttribute('aBankMask', new THREE.Float32BufferAttribute(banks, 1));
  geom.computeBoundingSphere();
  return geom;
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

  const painted = groundMaps();
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    THREE.UniformsLib.lights,
    {
      uGrass: { value: painted.grass },
      uDirt: { value: painted.dirt },
      uGravel: { value: painted.gravel },
      uRock: { value: painted.rock },
    },
  ]);
  bindFrameUniforms(uniforms);

  const terrainMat = new THREE.ShaderMaterial({
    name: 'Terrain',
    uniforms,
    vertexShader: TERRAIN_VS,
    fragmentShader: TERRAIN_FS,
    lights: true,
    fog: true,
    vertexColors: true,
  });

  // Four-by-four chunks of the same grid so the camera can cull hills
  // that are behind it. Edges share the global vertex indices, so the
  // tiles meet without a crack. Far chunks are the LOD: they live in the
  // same material but drop out of the frustum first.
  const mesh = new THREE.Group();
  mesh.name = 'terrain';
  const chunkSegs = SUBDIVS / 4;
  for (let cz = 0; cz < 4; cz++) {
    for (let cx = 0; cx < 4; cx++) {
      const chunk = sliceChunk(
        geom,
        cx * chunkSegs,
        (cx + 1) * chunkSegs,
        cz * chunkSegs,
        (cz + 1) * chunkSegs,
      );
      const chunkMesh = new THREE.Mesh(chunk, terrainMat);
      chunkMesh.receiveShadow = true;
      chunkMesh.name = `terrain-${cx}-${cz}`;
      mesh.add(chunkMesh);
    }
  }
  geom.dispose();

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
  };
}
