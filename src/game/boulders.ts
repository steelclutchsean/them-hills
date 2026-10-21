import * as THREE from 'three';
import { kitRockMaterial, stoneMaterial, timberDarkMaterial } from '@/render/painterly';
import type { Terrain } from './terrain';
import type { Watercourse } from './watercourse';
import { createRng } from './rng';

// Procedural boulders, strategically placed near streams and the mine.
//
// The Polyhaven .blend models can't load directly in Three.js, but the 4K
// diffuse JPGs can. We synthesize boulder shapes from displaced icosahedrons
// and apply one of the three rock diffuses per instance — so the surface
// material reads correctly even though the silhouette is procedural. Each
// boulder gets a random diffuse, scale, displacement seed, and rotation,
// so visible variety comes from the combination rather than any one factor.

const ROCK_VARIANTS = [kitRockMaterial(), stoneMaterial(), timberDarkMaterial()];

/**
 * Sphere → boulder. Conservative per-vertex displacement so neighbors can't
 * separate enough to produce visible gaps or self-intersecting faces.
 * Each boulder has a SINGLE Y-squash factor (so it's a flattened-but-
 * coherent sphere, not a chaos of per-vertex squashes), and the radial
 * displacement is clamped to ±18% of unit radius so triangles stay smoothly
 * connected.
 */
function createBoulderGeometry(seed: number): THREE.BufferGeometry {
  const geom = new THREE.IcosahedronGeometry(1, 3);
  const positions = geom.attributes.position;
  if (!positions) return geom;

  // Per-boulder constants. Computed once; do NOT vary across the loop.
  const seedX = (seed & 0xff) * 0.024;
  const seedY = ((seed >> 8) & 0xff) * 0.031;
  const seedZ = ((seed >> 16) & 0xff) * 0.041;
  const squashY = 0.74 + Math.sin(seed * 0.073) * 0.14; // 0.6..0.88

  const MAX_DISP = 0.18; // clamp to avoid neighbor separation

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);

    // Smooth coherent displacement: three orthogonal low-frequency sin waves.
    // Output range ~[-0.9, +0.9].
    const n =
      Math.sin(x * 2.5 + seedX) * 0.36 +
      Math.sin(y * 2.7 + seedY) * 0.32 +
      Math.sin(z * 2.3 + seedZ) * 0.28;

    const disp = Math.max(-MAX_DISP, Math.min(MAX_DISP, n * 0.45));
    const scaleR = 1.0 + disp;

    const len = Math.sqrt(x * x + y * y + z * z);
    // Apply Y-squash as a final per-axis scale so it doesn't compound with
    // the radial displacement and create asymmetric warping.
    positions.setXYZ(i, (x / len) * scaleR, (y / len) * scaleR * squashY, (z / len) * scaleR);
  }
  positions.needsUpdate = true;
  geom.computeVertexNormals();
  return geom;
}

export interface BoulderWake {
  streamId: string;
  /** Packed for the water shader: xy = world xz, z = radius. */
  rock: THREE.Vector3;
}

interface PlaceBouldersOpts {
  scene: THREE.Scene;
  terrain: Terrain;
  courses: readonly Watercourse[];
  /** Mine mouths. Boulders are kept out of the approach so the door reads. */
  minePositions: readonly THREE.Vector3[];
  /** Seed for the placement RNG. Default 0xb0. */
  seed?: number;
}

export interface BoulderCollider {
  pos: THREE.Vector3;
  radius: number;
}

export interface BoulderField {
  group: THREE.Group;
  count: number;
  /** Collision proxies — one ball per boulder, sized to the visual silhouette. */
  colliders: readonly BoulderCollider[];
  /** In-stream stones that break the surface. The water shader foams behind them. */
  wakes: readonly BoulderWake[];
}

export function placeBoulders(opts: PlaceBouldersOpts): BoulderField {
  const { scene, terrain, courses, minePositions, seed = 0xb0 } = opts;
  const rng = createRng(seed);

  const variantMaterials = ROCK_VARIANTS;

  const root = new THREE.Group();
  root.name = 'boulders';
  scene.add(root);
  let placed = 0;
  const colliders: BoulderCollider[] = [];
  const wakes: BoulderWake[] = [];

  function blocksEntrance(x: number, z: number): boolean {
    for (const mine of minePositions) {
      const dx = x - mine.x;
      const dz = z - mine.z;
      // Door faces +Z. Keep the mouth and the walk-up clear.
      if (dx * dx + dz * dz < 3.4 * 3.4) return true;
      if (Math.abs(dx) < 2.6 && dz > -1.4 && dz < 8) return true;
    }
    return false;
  }

  function placeOne(x: number, z: number, scaleRange: [number, number], submerge: number): void {
    if (blocksEntrance(x, z)) return;
    const scale = scaleRange[0] + rng.next() * (scaleRange[1] - scaleRange[0]);
    const matIdx = rng.int(0, variantMaterials.length);
    const material = variantMaterials[matIdx];
    if (!material) return;
    const boulderGeom = createBoulderGeometry(Math.floor(rng.next() * 0xffffff));
    const mesh = new THREE.Mesh(boulderGeom, material);
    mesh.scale.setScalar(scale);
    mesh.rotation.set(
      rng.range(0, Math.PI * 2),
      rng.range(0, Math.PI * 2),
      rng.range(0, Math.PI * 2),
    );
    // Position so the boulder sits roughly half-buried — natural-looking
    // for irregular shapes without flat bottoms. submerge pulls extra into
    // the ground (in-stream boulders look like worn river stones).
    const groundY = terrain.getHeightAt(x, z);
    mesh.position.set(x, groundY + scale * 0.55 - submerge, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    placed++;

    // Collision proxy: a ball sized to the horizontal silhouette. The visual
    // boulder is a unit icosahedron with ±18% radial displacement and a
    // Y-squash, scaled by `scale`. Use ~0.7 × scale so the player capsule
    // bumps just before the visual surface — slightly forgiving but doesn't
    // leave a visible gap. Centered on the visual mesh.
    colliders.push({
      pos: mesh.position.clone(),
      radius: scale * 0.7,
    });
  }

  for (const course of courses) {
    const samples = course.samples;
    for (let side = -1; side <= 1; side += 2) {
      const countPerSide = 10;
      for (let i = 0; i < countPerSide; i++) {
        const sample = samples[Math.floor(((i + 0.2) / countPerSide) * (samples.length - 1))]!;
        const cross = side * (sample.halfWidth + 0.35 + rng.next() * 1.7);
        const x = sample.x + -sample.tz * cross;
        const z = sample.z + sample.tx * cross;
        placeOne(x, z, [0.5, 1.3], 0);
      }
    }

    const inCount = course.id === 'coyote_creek' ? 10 : 6;
    for (let i = 0; i < inCount; i++) {
      const sample = samples[Math.floor(((i + 0.2) / inCount) * (samples.length - 1))]!;
      const cross = (rng.next() - 0.5) * sample.halfWidth * 1.15;
      const x = sample.x + -sample.tz * cross;
      const z = sample.z + sample.tx * cross;
      if (blocksEntrance(x, z)) continue;
      const scale = 0.38 + rng.next() * 0.42;
      const matIdx = rng.int(0, variantMaterials.length);
      const material = variantMaterials[matIdx];
      if (!material) continue;
      const boulderGeom = createBoulderGeometry(Math.floor(rng.next() * 0xffffff));
      const mesh = new THREE.Mesh(boulderGeom, material);
      mesh.scale.setScalar(scale);
      mesh.rotation.set(
        rng.range(0, Math.PI * 2),
        rng.range(0, Math.PI * 2),
        rng.range(0, Math.PI * 2),
      );
      // Sit the crown through the water so the stone reads as a riffle rock.
      mesh.position.set(x, sample.waterY - scale * 0.22, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      placed++;
      colliders.push({ pos: mesh.position.clone(), radius: scale * 0.7 });
      wakes.push({ streamId: course.id, rock: new THREE.Vector3(x, z, scale * 0.85) });
    }
  }

  // One stone in the Coyote pool the creek cameras frame, so the foam
  // collar is in those shots and not only on a rock a bend away.
  const coyote = courses.find((c) => c.id === 'coyote_creek');
  if (coyote) {
    let pool = coyote.samples[0];
    let poolDist = Infinity;
    for (const sample of coyote.samples) {
      const dist = Math.abs(sample.z - 10);
      if (dist < poolDist) {
        poolDist = dist;
        pool = sample;
      }
    }
    if (pool) {
      const x = pool.x - pool.tz * pool.halfWidth * 0.28;
      const z = pool.z + pool.tx * pool.halfWidth * 0.28;
      if (!blocksEntrance(x, z)) {
        const scale = 0.72;
        const material = variantMaterials[0];
        if (material) {
          const mesh = new THREE.Mesh(createBoulderGeometry(0xc0c0a), material);
          mesh.scale.setScalar(scale);
          mesh.position.set(x, pool.waterY - scale * 0.22, z);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          root.add(mesh);
          placed++;
          colliders.push({ pos: mesh.position.clone(), radius: scale * 0.7 });
          wakes.push({ streamId: coyote.id, rock: new THREE.Vector3(x, z, scale * 0.85) });
        }
      }
    }
  }

  // The water shader only has eight wake slots. Keep the rocks nearest the
  // reviewed stretch of each channel so foam shows up in the creek cameras.
  const ranked: BoulderWake[] = [];
  for (const course of courses) {
    const hero =
      course.id === 'coyote_creek'
        ? { x: 25, z: 10 }
        : { x: 0, z: course.samples[Math.floor(course.samples.length / 2)]?.z ?? 0 };
    const mine = wakes
      .filter((w) => w.streamId === course.id)
      .sort((a, b) => {
        const da = (a.rock.x - hero.x) ** 2 + (a.rock.y - hero.z) ** 2;
        const db = (b.rock.x - hero.x) ** 2 + (b.rock.y - hero.z) ** 2;
        return da - db;
      });
    ranked.push(...mine.slice(0, 8));
  }
  wakes.length = 0;
  wakes.push(...ranked);

  // Mine-entrance ring — looks like rocks dislodged from carving the
  // entrance, scattered around the timber archway.
  for (const mine of minePositions) {
    for (let i = 0; i < 6; i++) {
      const angle = rng.range(0, Math.PI * 2);
      const dist = rng.range(4.2, 7.2);
      const x = mine.x + Math.cos(angle) * dist;
      const z = mine.z + Math.sin(angle) * dist;
      placeOne(x, z, [0.7, 1.6], 0);
    }
  }

  return { group: root, count: placed, colliders, wakes };
}
