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

const SUBDIVS = 64;
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

export interface Terrain {
  mesh: THREE.Mesh;
  collider: RAPIER.Collider;
  /** Ground height at world (x, z), bilinear interpolated. Matches the Rapier collider. */
  getHeightAt(x: number, z: number): number;
}

/** Column-major index: heights[i + j * nrows] where i = row (Z), j = col (X). */
function heightIdx(ix: number, iy: number): number {
  return iy + ix * N;
}

function generateHeights(channels: readonly ChannelConfig[]): Float32Array {
  const heights = new Float32Array(N * N);
  for (let iy = 0; iy < N; iy++) {
    for (let ix = 0; ix < N; ix++) {
      const u = ix / SUBDIVS - 0.5;
      const v = iy / SUBDIVS - 0.5;
      const x = u * EXTENT_X;
      const z = v * EXTENT_Z;
      const h =
        Math.sin(x * 0.06) * 0.4 +
        Math.cos(z * 0.05) * 0.35 +
        Math.sin(x * 0.21 + z * 0.13) * 0.12 +
        Math.cos(x * 0.07 - z * 0.09) * 0.08;
      const distFromOrigin = Math.hypot(x, z);
      const flattening = Math.max(0, 1 - distFromOrigin / 30);
      let scaled = h * (1 - 0.7 * flattening);

      // Stream channel carves: smooth U-shape, deepest at center, fades to 0
      // at banks. Multiple channels stack additively where they overlap (a
      // confluence is naturally deeper than either upstream branch).
      for (const ch of channels) {
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
          const carveDepthMeters = (1 - t * t) * ch.depth;
          scaled -= carveDepthMeters / HEIGHT_SCALE;
        }
      }

      heights[heightIdx(ix, iy)] = scaled;
    }
  }
  return heights;
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

  const mesh = new THREE.Mesh(
    geom,
    new THREE.MeshStandardMaterial({
      color: 0x4a6a3a,
      flatShading: true,
      roughness: 0.95,
      metalness: 0,
    }),
  );
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
  };
}
