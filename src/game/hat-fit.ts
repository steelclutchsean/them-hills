import * as THREE from 'three';

const SKULL = /modeled-head|prospector_head|skull/i;

/**
 * Drop a hat onto the skull so the brim cuts the top of the head.
 * The hat's local origin stays on the Head bone. Only Y is solved.
 */
export function seatHat(headBone: THREE.Object3D, hat: THREE.Object3D): void {
  const tiltZ = hat.rotation.z;
  hat.position.set(0, 0, 0);
  hat.rotation.set(-0.06, 0, tiltZ);
  headBone.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(headBone.matrixWorld).invert();
  const headBox = new THREE.Box3();
  let found = false;
  headBone.traverse((obj) => {
    if (obj === hat || isUnder(hat, obj)) return;
    if (!(obj instanceof THREE.Mesh) || !obj.visible) return;
    if (!SKULL.test(obj.name)) return;
    const box = new THREE.Box3().setFromObject(obj);
    box.applyMatrix4(inv);
    headBox.union(box);
    found = true;
  });
  if (!found || headBox.isEmpty()) return;
  const hatBox = new THREE.Box3().setFromObject(hat);
  hatBox.applyMatrix4(inv);
  // Brim overlaps the crown by a few centimeters.
  hat.position.y += headBox.max.y - hatBox.min.y - 0.028;
  hat.updateWorldMatrix(true, true);
}

function isUnder(root: THREE.Object3D, obj: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = obj;
  while (cursor) {
    if (cursor === root) return true;
    cursor = cursor.parent;
  }
  return false;
}

/** Hats whose world box misses the skull. Empty when every hat is seated. */
export function floatingHats(root: THREE.Object3D): { checked: number; floating: string[] } {
  const floating: string[] = [];
  let checked = 0;
  root.updateWorldMatrix(true, true);
  root.traverse((obj) => {
    if (obj.name !== 'prospector_hat') return;
    const bone = obj.parent;
    if (!bone) return;
    let head: THREE.Object3D | null = null;
    bone.traverse((child) => {
      if (head || child === obj || isUnder(obj, child)) return;
      if (child instanceof THREE.Mesh && child.visible && SKULL.test(child.name)) head = child;
    });
    checked += 1;
    if (!head) {
      floating.push('no-head');
      return;
    }
    const skull = new THREE.Box3().setFromObject(head);
    const cap = new THREE.Box3().setFromObject(obj);
    if (!skull.intersectsBox(cap)) {
      const gap = cap.min.y - skull.max.y;
      floating.push(`gap ${gap.toFixed(2)}m`);
    }
  });
  return { checked, floating };
}
