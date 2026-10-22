import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildRidgeRing, RIDGE_CROWN_HEIGHT, seatRidgePines } from './ridge-pines';

const rayOrigin = new THREE.Vector3();
const rayDown = new THREE.Vector3(0, -1, 0);
const raycaster = new THREE.Raycaster(rayOrigin, rayDown, 0, 900);

function surfaceY(mesh: THREE.Mesh, x: number, z: number): THREE.Vector3 | null {
  rayOrigin.set(x, 420, z);
  raycaster.set(rayOrigin, rayDown);
  const hit = raycaster.intersectObject(mesh, false)[0];
  return hit ? hit.point.clone() : null;
}

const groundY = (x: number, z: number): number =>
  1.4 + Math.sin(x * 0.02) * 0.35 + Math.cos(z * 0.017) * 0.2;
const built = buildRidgeRing(groundY);
const mesh = new THREE.Mesh(built.geometry);
mesh.updateMatrixWorld(true);

const seated = seatRidgePines(built.geometry, built.candidates);
assert.ok(seated.length > 20, `expected a band of pines, got ${seated.length}`);

let maxGap = 0;
for (const base of seated) {
  const hit = surfaceY(mesh, base.x, base.z);
  assert.ok(hit, `no ridge under pine at ${base.x.toFixed(1)}, ${base.z.toFixed(1)}`);
  const gap = Math.abs(hit.y - base.y);
  const slip = Math.hypot(hit.x - base.x, hit.z - base.z);
  maxGap = Math.max(maxGap, gap);
  assert.ok(gap < 0.35, `base floats ${gap.toFixed(3)} m`);
  assert.ok(slip < 0.35, `base misses the column by ${slip.toFixed(3)} m`);
  assert.ok(Math.hypot(base.x, base.z) < 135, 'pine seated past the crest');
  const angle = Math.atan2(base.z, base.x);
  let crest = Number.NEGATIVE_INFINITY;
  for (let u = 0.34; u <= 0.9; u += 0.04) {
    const radius = 78 + u * 92;
    const sample = surfaceY(mesh, Math.cos(angle) * radius, Math.sin(angle) * radius);
    if (sample && sample.y > crest) crest = sample.y;
  }
  assert.ok(
    crest > base.y + RIDGE_CROWN_HEIGHT,
    `crown clears the crest by ${(base.y + RIDGE_CROWN_HEIGHT - crest).toFixed(2)} m`,
  );
}

const rejected = seatRidgePines(built.geometry, [
  { x: 0, z: 0 },
  { x: 400, z: 12 },
  { x: Math.cos(0.4) * 160, z: Math.sin(0.4) * 160 },
]);
assert.equal(rejected.length, 0, 'off-mesh and outer-slope pines must be dropped');

console.log(`ridge pines ${seated.length} seated, max base gap ${maxGap.toFixed(4)} m`);
