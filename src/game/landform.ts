import * as THREE from 'three';
import type { Watercourse } from '@/game/watercourse';

// Distant ridges and the rock the creek has cut. Both are visual.
// The heightfield and its collider stay the playable ground.

function ridgeGeometry(): THREE.BufferGeometry {
  const n = 20;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = (t - 0.5) * 120;
    const crest =
      28 +
      Math.sin(t * Math.PI) * 36 +
      Math.sin(t * 11.0 + 0.6) * 8 +
      Math.sin(t * 5.0) * 6;
    pos.push(x, 0, 8, x, crest, -1, x, crest * 0.35, -18);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 3;
    idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
    idx.push(a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  return geom;
}

export function addLandform(
  scene: THREE.Scene,
  courses: readonly Watercourse[],
  groundY: (x: number, z: number) => number,
): void {
  const nearMat = new THREE.MeshStandardMaterial({
    color: 0x6e7c78,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
  const farMat = new THREE.MeshStandardMaterial({
    color: 0x8ea0ae,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
  const geom = ridgeGeometry();
  const ridges = new THREE.Group();
  ridges.name = 'ridgeline';
  const rings: { radius: number; y: number; mat: THREE.Material; count: number }[] = [
    { radius: 118, y: 0, mat: nearMat, count: 7 },
    { radius: 162, y: 6, mat: farMat, count: 6 },
  ];
  for (const ring of rings) {
    for (let i = 0; i < ring.count; i++) {
      const angle = (i / ring.count) * Math.PI * 2 + 0.2;
      const mesh = new THREE.Mesh(geom, ring.mat);
      mesh.position.set(Math.cos(angle) * ring.radius, ring.y, Math.sin(angle) * ring.radius);
      mesh.lookAt(0, ring.y, 0);
      mesh.receiveShadow = false;
      mesh.castShadow = false;
      ridges.add(mesh);
    }
  }
  scene.add(ridges);

  const cliffMat = new THREE.MeshStandardMaterial({
    color: 0x8a7564,
    roughness: 0.94,
    metalness: 0.02,
    flatShading: true,
  });
  const cliffGeom = new THREE.BoxGeometry(5.5, 3.4, 1.1);
  const coyote = courses.find((c) => c.id === 'coyote_creek');
  if (!coyote) return;
  const spots: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  coyote.samples.forEach((sample, index) => {
    if (index % 7 !== 0) return;
    if (Math.abs(sample.z) < 28 && sample.z > -6) return;
    const side = sample.x > 0 ? 1 : -1;
    const x = sample.x + side * (sample.halfWidth + 1.6);
    const z = sample.z;
    const y = groundY(x, z);
    dummy.position.set(x, y + 1.15, z);
    dummy.lookAt(sample.x, y + 1.15, sample.z);
    dummy.scale.set(0.85 + (index % 3) * 0.18, 0.8 + (index % 4) * 0.15, 1);
    dummy.updateMatrix();
    spots.push(dummy.matrix.clone());
  });
  if (spots.length === 0) return;
  const cliffs = new THREE.InstancedMesh(cliffGeom, cliffMat, spots.length);
  cliffs.name = 'creek-cliff';
  cliffs.castShadow = true;
  cliffs.receiveShadow = true;
  spots.forEach((m, i) => cliffs.setMatrixAt(i, m));
  cliffs.instanceMatrix.needsUpdate = true;
  scene.add(cliffs);
}
