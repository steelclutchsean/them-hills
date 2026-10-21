import * as THREE from 'three';

// Upgrades for glTF / procedural MeshStandard materials so they sit in the
// same lighting rig as the custom terrain shaders: anisotropy on albedo,
// a non-mirror roughness floor, and a modest environment response.
//
// Call this once per loaded hierarchy. Safe to call more than once.

const ANISOTROPY = 8;

export function upgradeLoadedMaterials(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of list) {
      if (!mat || !('roughness' in mat)) continue;
      const std = mat as THREE.MeshStandardMaterial;
      if (std.map) {
        std.map.anisotropy = ANISOTROPY;
        std.map.needsUpdate = true;
      }
      if (std.normalMap) {
        std.normalMap.anisotropy = ANISOTROPY;
      }
      // Stylized kits often export roughness 1, which kills the environment
      // map entirely. Leave authored roughness alone unless it's pinned at
      // the top of the range.
      if (std.roughness > 0.96) std.roughness = 0.84;
      std.envMapIntensity = Math.min(std.envMapIntensity, 1);
      if (std.envMapIntensity === 1) std.envMapIntensity = 0.85;
    }
  });
}
