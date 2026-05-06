import * as THREE from 'three';
import { RAPIER } from '@/physics/world';

// 200m × 200m heightmap with deterministic rolling-hills generator.
// The generator flattens a ~30m radius around the origin so the spawn area is gentle.

const SUBDIVS = 64;
const EXTENT_X = 200;
const EXTENT_Z = 200;
const HEIGHT_SCALE = 6;

export interface Terrain {
  mesh: THREE.Mesh;
  collider: RAPIER.Collider;
  /** Approximate ground height at world (x, z); used for spawning. */
  getHeightAt(x: number, z: number): number;
}

function generateHeights(): Float32Array {
  const N = SUBDIVS + 1;
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
      heights[iy * N + ix] = h * (1 - 0.7 * flattening);
    }
  }
  return heights;
}

export function createTerrain(world: RAPIER.World): Terrain {
  const heights = generateHeights();
  const N = SUBDIVS + 1;

  // Three.js mesh: PlaneGeometry rotated to lie on the XZ plane, vertex Y displaced by heights.
  const geom = new THREE.PlaneGeometry(EXTENT_X, EXTENT_Z, SUBDIVS, SUBDIVS);
  geom.rotateX(-Math.PI / 2);
  const positions = geom.attributes.position;
  if (!positions) throw new Error('[terrain] PlaneGeometry missing position attribute');
  for (let iy = 0; iy < N; iy++) {
    for (let ix = 0; ix < N; ix++) {
      const idx = iy * N + ix;
      positions.setY(idx, heights[idx]! * HEIGHT_SCALE);
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

  // Rapier heightfield collider matches the same grid.
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
      const h00 = heights[iz0 * N + ix0]!;
      const h10 = heights[iz0 * N + ix1]!;
      const h01 = heights[iz1 * N + ix0]!;
      const h11 = heights[iz1 * N + ix1]!;
      const h0 = h00 + (h10 - h00) * tx;
      const h1 = h01 + (h11 - h01) * tx;
      return (h0 + (h1 - h0) * tz) * HEIGHT_SCALE;
    },
  };
}
