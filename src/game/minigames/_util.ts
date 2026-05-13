import * as THREE from 'three';

/**
 * Force a Three.js group (and all its descendants) to render on top of
 * every other scene mesh regardless of depth. Used on camera-child
 * viewmodels (meter bars, tool meshes, cursors) so the volumetric
 * stream-water box can't occlude them when the player is inside a
 * stream.
 *
 *  - renderOrder = 999  → draw after all default-priority meshes
 *  - depthTest = false  → don't fail depth check against scene geometry
 *  - depthWrite = false → don't pollute the depth buffer either
 *
 * Materials are mutated in place. Call once after building the group.
 */
export function forceTopDraw(obj: THREE.Object3D): void {
  obj.traverse((node) => {
    node.renderOrder = 999;
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) {
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        for (const m of mat) tweakMaterial(m);
      } else if (mat) {
        tweakMaterial(mat);
      }
    }
  });
}

function tweakMaterial(m: THREE.Material): void {
  m.depthTest = false;
  m.depthWrite = false;
  // Transparent meshes get sorted but the depth pass is skipped — this
  // is what lets the viewmodels paint over the water box.
  m.needsUpdate = true;
}
