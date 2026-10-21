import * as THREE from 'three';

// The ridge is a ring. A pine whose base sits on the outer face is hidden by
// the crest, and the crown reads as a tree hanging in the sky. Seating casts
// onto the mesh and keeps only bases on the inner slope, under the crest.

const INNER = 78;
const SPAN = 92;
const SEG_A = 256;
const SEG_R = 20;

/** How tall a ridge card is, including the largest scale. Crowns must stay under the crest. */
export const RIDGE_CROWN_HEIGHT = 11;

function peakAmount(angle: number): number {
  const raw =
    0.58 +
    0.24 * Math.sin(angle * 2.0 + 0.4) +
    0.16 * Math.sin(angle * 5.0 + 1.1) +
    0.1 * Math.sin(angle * 11.0 + 0.2) +
    0.05 * Math.sin(angle * 19.0);
  return Math.max(0.32, Math.min(1, raw));
}

export function buildRidgeRing(groundY: (x: number, z: number) => number): {
  geometry: THREE.BufferGeometry;
  candidates: THREE.Vector3[];
} {
  const pos: number[] = [];
  const uv: number[] = [];
  const crestAttr: number[] = [];
  const idx: number[] = [];
  const candidates: THREE.Vector3[] = [];
  for (let i = 0; i <= SEG_A; i++) {
    const a = i === SEG_A ? 0 : (i / SEG_A) * Math.PI * 2;
    const amount = peakAmount(a);
    for (let j = 0; j <= SEG_R; j++) {
      const u = j / SEG_R;
      const radius = INNER + u * SPAN;
      const crest = Math.exp(-((u - 0.62) * (u - 0.62)) / 0.045);
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      const y = groundY(x, z) + crest * amount * 86;
      pos.push(x, y, z);
      uv.push(a * 2, u * 2);
      crestAttr.push(crest * amount);
      if (i !== SEG_A && i % 5 === 0 && j % 3 === 0) {
        candidates.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  const row = SEG_R + 1;
  for (let i = 0; i < SEG_A; i++) {
    for (let j = 0; j < SEG_R; j++) {
      const a = i * row + j;
      const b = a + row;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('crest', new THREE.Float32BufferAttribute(crestAttr, 1));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  let up = 0;
  for (let i = 0; i < normals.count; i += 40) up += normals.getY(i);
  if (up < 0) {
    for (let k = 0; k < idx.length; k += 3) {
      const swap = idx[k + 1] ?? 0;
      idx[k + 1] = idx[k + 2] ?? 0;
      idx[k + 2] = swap;
    }
    geometry.setIndex(idx);
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingSphere();
  return { geometry, candidates };
}

const rayOrigin = new THREE.Vector3();
const rayDown = new THREE.Vector3(0, -1, 0);
const raycaster = new THREE.Raycaster(rayOrigin, rayDown, 0, 900);

function surfaceAt(mesh: THREE.Mesh, x: number, z: number): THREE.Intersection | null {
  rayOrigin.set(x, 420, z);
  raycaster.set(rayOrigin, rayDown);
  raycaster.near = 0;
  raycaster.far = 900;
  const hit = raycaster.intersectObject(mesh, false)[0];
  return hit ?? null;
}

/**
 * Drop each candidate onto the ridge mesh. A miss, an outer face, a crest,
 * or a crown that would clear the skyline is left out.
 */
export function seatRidgePines(
  geometry: THREE.BufferGeometry,
  candidates: readonly { x: number; z: number }[],
  crownHeight = RIDGE_CROWN_HEIGHT,
): THREE.Vector3[] {
  const mesh = new THREE.Mesh(geometry);
  mesh.updateMatrixWorld(true);
  const crestCache = new Map<number, number>();
  const seated: THREE.Vector3[] = [];

  const crestY = (angle: number): number => {
    const key = Math.round(angle * 48);
    const cached = crestCache.get(key);
    if (cached !== undefined) return cached;
    let best = Number.NEGATIVE_INFINITY;
    for (let u = 0.34; u <= 0.9; u += 0.04) {
      const radius = INNER + u * SPAN;
      const hit = surfaceAt(mesh, Math.cos(angle) * radius, Math.sin(angle) * radius);
      if (hit && hit.point.y > best) best = hit.point.y;
    }
    crestCache.set(key, best);
    return best;
  };

  for (const candidate of candidates) {
    const hit = surfaceAt(mesh, candidate.x, candidate.z);
    if (!hit) continue;
    const base = hit.point;
    if (Math.hypot(base.x - candidate.x, base.z - candidate.z) > 0.85) continue;
    const normal = hit.normal ?? hit.face?.normal;
    if (!normal) continue;
    const flat = Math.hypot(normal.x, normal.z);
    if (flat < 0.16) continue;
    const inward = Math.hypot(base.x, base.z) || 1;
    const facingValley = (-normal.x * base.x + -normal.z * base.z) / (flat * inward);
    if (facingValley < 0.25) continue;
    const angle = Math.atan2(base.z, base.x);
    const crest = crestY(angle);
    if (!(crest > base.y + crownHeight)) continue;
    const check = surfaceAt(mesh, base.x, base.z);
    if (!check || Math.abs(check.point.y - base.y) > 0.3) continue;
    seated.push(new THREE.Vector3(base.x, base.y, base.z));
  }
  return seated;
}
