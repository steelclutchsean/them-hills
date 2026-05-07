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

// Mesh subdivision (smooth shading + 128² grid → smooth-flowing hills, no
// faceting). The Rapier heightfield uses the same density; queries are O(1)
// regardless so the cost is just the heights array.
const SUBDIVS = 128;
const N = SUBDIVS + 1;
const EXTENT_X = 200;
const EXTENT_Z = 200;
const HEIGHT_SCALE = 6;

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

/** Pure terrain noise — no flattening, no carve. Used for both vertex sampling
 * and per-channel "natural at center" sampling for the carve target. */
function rawHeight(x: number, z: number): number {
  return (
    Math.sin(x * 0.06) * 0.4 +
    Math.cos(z * 0.05) * 0.35 +
    Math.sin(x * 0.21 + z * 0.13) * 0.12 +
    Math.cos(x * 0.07 - z * 0.09) * 0.08
  );
}

function generateHeights(channels: readonly ChannelConfig[]): Float32Array {
  // Pre-compute each channel's target floor in normalized space. The target
  // is "natural-at-center minus carve depth", so the carve guarantees the
  // riverbed reaches a known elevation everywhere along the centerline —
  // which lets the flat water plane stay at a uniform Y above the floor for
  // the entire stream length. (The earlier subtract-fixed-depth approach
  // produced a sloped floor under a flat water plane, so the player got
  // submerged whenever the natural terrain dipped below the water level.)
  const targets = channels.map((ch) => {
    const naturalAtCenter = rawHeight(ch.centerX, ch.centerZ);
    return naturalAtCenter - ch.depth / HEIGHT_SCALE;
  });

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

      // Pull the vertex toward each channel's target floor by a smooth U-shape
      // factor. At the centerline (t=0) the carve fully matches the target
      // (in either direction — pulling natural mountains down OR natural
      // valleys up); at the banks (t=1) it leaves the natural height untouched.
      // Bidirectional pull guarantees a uniform target depth along the
      // centerline, so the flat water plane sits at a consistent height above
      // the floor for the entire stream.
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
        if (dAlong < ch.halfLength && dCross < ch.halfWidth) {
          const t = dCross / ch.halfWidth;
          const shape = 1 - t * t;
          scaled = scaled + (target - scaled) * shape;
        }
      }

      heights[heightIdx(ix, iy)] = scaled;
    }
  }
  return heights;
}

const TERRAIN_VS = /* glsl */ `
  attribute vec3 color;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vColor;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorld = worldPos.xyz;
    vNormal = normalize(normalMatrix * normal);
    vColor = color;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

// Procedural surface texture. Three octaves of value-noise (large patches,
// medium speckle, fine grain) blend with the per-vertex base palette and a
// dirt tint so the terrain reads as textured ground. Lighting is a simple
// lambert sun plus ambient; intensity comes from the same sky controller
// that drives the rest of the world so dawn/dusk/storms tint the ground
// correctly.
const TERRAIN_FS = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  uniform vec3 uAmbientColor;
  uniform float uAmbientIntensity;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vColor;

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
  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      v += amp * noise(p);
      p *= 2.13;
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 base = vColor;
    vec2 worldXZ = vWorld.xz;

    // Three noise scales: 0.3 = ~3m blobs (patches), 1.7 = ~60cm speckle,
    // 5.0 = high-frequency grain that makes near-camera ground feel solid.
    float n1 = fbm(worldXZ * 0.3);
    float n2 = noise(worldXZ * 1.7);
    float n3 = noise(worldXZ * 5.0);
    float n4 = noise(worldXZ * 12.0);

    // Modulate the base palette: dim some patches, brighten others, drop
    // muddy/dirt patches into the lower-noise wells.
    vec3 lighter = base * 1.25 + vec3(0.04, 0.05, 0.02);
    vec3 darker  = base * 0.65;
    vec3 dirty   = vec3(0.32, 0.24, 0.16);
    base = mix(darker, base, smoothstep(0.30, 0.70, n1));
    base = mix(base, lighter, smoothstep(0.55, 0.85, n2) * 0.55);
    float dirtMask = smoothstep(0.55, 0.78, n1) * smoothstep(0.45, 0.70, n2);
    base = mix(base, dirty, dirtMask * 0.45);

    // Fine grain for per-pixel variation — keeps it from looking like a flat
    // sticker close-up. Very subtle.
    base *= 0.88 + 0.18 * n3 + 0.06 * n4;

    // Slope-aware darkening — steep faces sit in shadow more, which both
    // adds depth to hills and reinforces the rock-tinted vertex colors on
    // the cliffs.
    float upDot = clamp(vNormal.y, 0.0, 1.0);
    base *= mix(0.6, 1.0, upDot);

    // Lambert sun + ambient. Sun direction is updated each frame so dawn /
    // dusk tilt is accurate.
    float lambert = max(0.0, dot(vNormal, uSunDir));
    vec3 lit = base * (uAmbientColor * uAmbientIntensity + uSunColor * uSunIntensity * lambert * 0.85);

    gl_FragColor = vec4(lit, 1.0);
  }
`;

// Color palette for vertex tinting. Per-vertex color picks among these based
// on the local slope and proximity to a stream.
const COLOR_MEADOW = new THREE.Color(0x4d6c3a);
const COLOR_HILL = new THREE.Color(0x617d44);
const COLOR_CLIFF = new THREE.Color(0x6b5a3e);
const COLOR_SAND = new THREE.Color(0x9b8e63);

function paintVertexColors(
  geom: THREE.BufferGeometry,
  heights: Float32Array,
  channels: readonly ChannelConfig[],
): void {
  const positions = geom.attributes.position;
  if (!positions) return;
  const count = positions.count;
  const colors = new Float32Array(count * 3);

  // Slope at each vertex: forward-difference height across one cell in X and Z.
  // The N×N grid lets us compute steepness directly from the heights array.
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

      // Sand/silt near stream banks (within 1.4× channel halfWidth from any
      // channel centerline). Looks like exposed riverbed.
      let sandFactor = 0;
      const u = ix / SUBDIVS - 0.5;
      const v = iy / SUBDIVS - 0.5;
      const wx = u * EXTENT_X;
      const wz = v * EXTENT_Z;
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
        if (dAlong < ch.halfLength + 2 && dCross < ch.halfWidth * 1.6) {
          // Smooth ramp from 1 at bank up to 0 at 1.6×halfWidth out
          const t = Math.max(0, (dCross - ch.halfWidth) / (ch.halfWidth * 0.6));
          sandFactor = Math.max(sandFactor, 1 - Math.min(1, t));
        }
      }

      // Base color blends meadow → hill with elevation, then folds in cliff
      // tint with slope, and finally sand tint near stream banks.
      const elevationT = Math.min(1, Math.max(0, h / 4 + 0.3));
      tmp.copy(COLOR_MEADOW).lerp(COLOR_HILL, elevationT);
      const cliffT = Math.min(1, Math.max(0, (slope - 0.45) / 0.4));
      tmp.lerp(COLOR_CLIFF, cliffT);
      tmp.lerp(COLOR_SAND, sandFactor * 0.65);

      // Tiny per-vertex jitter for texture variation
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
}

export function createTerrain(world: RAPIER.World, channels: readonly ChannelConfig[]): Terrain {
  const heights = generateHeights(channels);

  // Three.js mesh: PlaneGeometry rotated to lie on the XZ plane.
  // PlaneGeometry vertex (iy, ix) is at world (ix * segX - widthHalf, _, iy * segZ - heightHalf)
  // — same world position as Rapier's heightfield cell (i=iy, j=ix), so we read column-major.
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

  // Custom procedural terrain shader. Per-vertex color (meadow / hill / cliff
  // / sand) supplies the macro palette; the fragment shader breaks up each
  // tile with multi-octave noise, dirt patches, and fine grain so the surface
  // reads as textured ground rather than solid plastic.
  const terrainMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0.5, 1, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(0xffffff) },
      uSunIntensity: { value: 1.0 },
      uAmbientColor: { value: new THREE.Color(0xffffff) },
      uAmbientIntensity: { value: 0.5 },
    },
    vertexShader: TERRAIN_VS,
    fragmentShader: TERRAIN_FS,
  });
  const mesh = new THREE.Mesh(geom, terrainMat);
  mesh.receiveShadow = true;

  // Rapier heightfield collider with the same column-major layout.
  // nrows = subdivisions along Z, ncols = subdivisions along X.
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
