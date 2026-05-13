import * as THREE from 'three';
import type { Terrain } from './terrain';
import type { StreamConfig } from './stream';
import { createRng } from './rng';

// Procedural boulders, strategically placed near streams and the mine.
//
// The Polyhaven .blend models can't load directly in Three.js, but the 4K
// diffuse JPGs can. We synthesize boulder shapes from displaced icosahedrons
// and apply one of the three rock diffuses per instance — so the surface
// material reads correctly even though the silhouette is procedural. Each
// boulder gets a random diffuse, scale, displacement seed, and rotation,
// so visible variety comes from the combination rather than any one factor.

const TEXTURE_VARIANTS = [
  'assets/textures/rock_moss_set_01_diff_4k.jpg',
  'assets/textures/namaqualand_boulder_02_diff_4k.jpg',
  'assets/textures/namaqualand_boulder_03_diff_4k.jpg',
];

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

interface PlaceBouldersOpts {
  scene: THREE.Scene;
  terrain: Terrain;
  streams: readonly StreamConfig[];
  minePos: THREE.Vector3;
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
}

export function placeBoulders(opts: PlaceBouldersOpts): BoulderField {
  const { scene, terrain, streams, minePos, seed = 0xb0 } = opts;
  const rng = createRng(seed);

  // Load each diffuse once; share the texture across all instances that
  // pick it. Sharing keeps GPU memory bounded and means there are at most
  // 3 distinct materials in the scene from this system.
  const loader = new THREE.TextureLoader();
  const variantMaterials = TEXTURE_VARIANTS.map((url) => {
    const tex = loader.load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.92,
      metalness: 0,
      // Render both sides — the displaced icosahedron's winding can be
      // borderline at high-frequency areas, and double-side rendering hides
      // any sliver of inverted-normal faces without a perceptible cost on
      // ~52 small meshes.
      side: THREE.DoubleSide,
    });
  });

  const root = new THREE.Group();
  root.name = 'boulders';
  scene.add(root);
  let placed = 0;
  const colliders: BoulderCollider[] = [];

  function placeOne(x: number, z: number, scaleRange: [number, number], submerge: number): void {
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

  for (const s of streams) {
    const ALONG_LEN = s.halfLength * 2;

    // Bank-line boulders — clustered just outside the water on each side,
    // sitting on the rising bank and the transition zone.
    for (let side = -1; side <= 1; side += 2) {
      const COUNT_PER_SIDE = 8;
      for (let i = 0; i < COUNT_PER_SIDE; i++) {
        const t = (i + 0.2 + rng.next() * 0.6) / COUNT_PER_SIDE;
        const along = (t - 0.5) * ALONG_LEN;
        const cross = side * (s.halfWidth + 0.4 + rng.next() * 1.6);
        const x = s.orientation === 'NS' ? s.centerX + cross : s.centerX + along;
        const z = s.orientation === 'NS' ? s.centerZ + along : s.centerZ + cross;
        placeOne(x, z, [0.55, 1.35], 0);
      }
    }

    // In-stream boulders — small to medium, slightly submerged so the
    // water visibly flows around them.
    const IN_COUNT = 6;
    for (let i = 0; i < IN_COUNT; i++) {
      const t = (i + 0.15 + rng.next() * 0.7) / IN_COUNT;
      const along = (t - 0.5) * ALONG_LEN;
      const cross = (rng.next() - 0.5) * s.halfWidth * 1.4;
      const x = s.orientation === 'NS' ? s.centerX + cross : s.centerX + along;
      const z = s.orientation === 'NS' ? s.centerZ + along : s.centerZ + cross;
      placeOne(x, z, [0.35, 0.7], 0.25);
    }
  }

  // Mine-entrance ring — looks like rocks dislodged from carving the
  // entrance, scattered around the timber archway.
  for (let i = 0; i < 6; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = rng.range(2.4, 5.5);
    const x = minePos.x + Math.cos(angle) * dist;
    const z = minePos.z + Math.sin(angle) * dist;
    placeOne(x, z, [0.7, 1.6], 0);
  }

  return { group: root, count: placed, colliders };
}
