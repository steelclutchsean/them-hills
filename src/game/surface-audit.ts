import * as THREE from 'three';

/**
 * A visible mesh with no painted map whose color is the engine default,
 * a neutral gray, or a flat box. Warm stained boards are not this.
 * Metal can be gray.
 */
export function isBareSurface(
  mat: THREE.Material | null | undefined,
  geometry?: THREE.BufferGeometry,
): boolean {
  if (!mat) return true;
  if (mat instanceof THREE.ShaderMaterial) return false;
  if (mat instanceof THREE.SpriteMaterial) return !mat.map;
  if (mat instanceof THREE.PointsMaterial) return !mat.map;
  const standard = mat as THREE.MeshStandardMaterial;
  if (standard.map) return false;
  const color = standard.color;
  if (!color) return true;
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  const sat = max < 1e-4 ? 0 : (max - min) / max;
  const metal = standard.metalness ?? 0;
  const whiteDefault = color.r > 0.96 && color.g > 0.96 && color.b > 0.96 && metal < 0.2;
  const gray = sat < 0.12 && max > 0.22 && max < 0.9 && metal < 0.35;
  const box = geometry?.type === 'BoxGeometry';
  const flatBox = box && sat < 0.35 && metal < 0.4 && max > 0.15;
  return whiteDefault || gray || flatBox;
}

/** Names of visible meshes wearing a bare material. Hidden objects are skipped. */
export function bareMeshes(root: THREE.Object3D): string[] {
  const found: string[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) && !(obj instanceof THREE.InstancedMesh)) return;
    if (!obj.visible) return;
    let hidden: THREE.Object3D | null = obj.parent;
    while (hidden) {
      if (!hidden.visible) return;
      hidden = hidden.parent;
    }
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    if (list.some((entry) => isBareSurface(entry, obj.geometry))) {
      found.push(obj.name || obj.parent?.name || obj.geometry?.type || 'mesh');
    }
  });
  return found.slice(0, 24);
}
