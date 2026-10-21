import * as THREE from 'three';

// Trees and rocks are visual-only (no physics), so the chase camera's
// Rapier ray misses them and the lens ends up inside the canopy. This
// list is what the camera fades and shortens against.

const roots: THREE.Object3D[] = [];
const faded: THREE.Mesh[] = [];
const raycaster = new THREE.Raycaster();

export function registerObstacle(root: THREE.Object3D): void {
  roots.push(root);
}

/** Fade meshes between `from` and `to`. Returns the nearest hit distance. */
export function fadeObstacles(from: THREE.Vector3, to: THREE.Vector3): number | null {
  for (const mesh of faded) {
    const base = mesh.userData.baseMat as THREE.Material | undefined;
    if (base) mesh.material = base;
  }
  faded.length = 0;
  if (roots.length === 0) return null;

  const delta = to.clone().sub(from);
  const reach = delta.length();
  if (reach < 0.2) return null;
  delta.multiplyScalar(1 / reach);
  raycaster.set(from, delta);
  raycaster.far = reach;
  const hits = raycaster.intersectObjects(roots, true);
  let nearest: number | null = null;
  for (const hit of hits) {
    if (hit.distance < 0.2) continue;
    if (nearest === null || hit.distance < nearest) nearest = hit.distance;
    const obj = hit.object;
    if (!(obj instanceof THREE.Mesh) || faded.length >= 6) continue;
    if (Array.isArray(obj.material)) continue;
    if (!obj.userData.baseMat) {
      obj.userData.baseMat = obj.material;
      const copy = obj.material.clone();
      if ('opacity' in copy) {
        const std = copy as THREE.MeshStandardMaterial;
        std.transparent = true;
        std.opacity = 0.18;
        std.depthWrite = false;
      }
      obj.userData.fadeMat = copy;
    }
    const fadeMat = obj.userData.fadeMat as THREE.Material | undefined;
    if (!fadeMat) continue;
    obj.material = fadeMat;
    faded.push(obj);
  }
  return nearest;
}
