import * as THREE from 'three';
import type { ClaimRecord } from '@/save/schema';

// Ground rings for filed claims. Gameplay markers, same language as the
// gold-site rings — not a scenery pass.

const COLOR: Record<ClaimRecord['habitat'], number> = {
  inside_bend: 0xe2b84a,
  gravel_bar: 0xc4a06a,
  bedrock: 0x8a93a0,
  boulder_lee: 0xd7c4a1,
  tail: 0x8a7058,
  barren: 0x666666,
};

export interface ClaimMarkers {
  sync(claims: readonly ClaimRecord[], groundY: (x: number, z: number) => number): void;
}

export function createClaimMarkers(scene: THREE.Scene): ClaimMarkers {
  const group = new THREE.Group();
  group.name = 'claim_markers';
  scene.add(group);
  const meshes = new Map<string, THREE.Mesh>();

  return {
    sync(claims, groundY) {
      const live = new Set(claims.map((c) => c.id));
      for (const [id, mesh] of meshes) {
        if (live.has(id)) continue;
        group.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        meshes.delete(id);
      }
      for (const claim of claims) {
        let mesh = meshes.get(claim.id);
        if (!mesh) {
          const geom = new THREE.TorusGeometry(claim.kind === 'lode' ? 1.1 : 0.85, 0.045, 6, 28);
          geom.rotateX(-Math.PI / 2);
          const mat = new THREE.MeshStandardMaterial({
            color: COLOR[claim.habitat],
            emissive: claim.jumperSince !== null ? 0x661111 : 0x332208,
            emissiveIntensity: 0.45,
            roughness: 0.55,
            flatShading: true,
          });
          mesh = new THREE.Mesh(geom, mat);
          mesh.name = `claim_${claim.id}`;
          group.add(mesh);
          meshes.set(claim.id, mesh);
        }
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.setHex(COLOR[claim.habitat]);
        mat.emissive.setHex(claim.jumperSince !== null ? 0x881818 : 0x332208);
        mesh.position.set(claim.x, groundY(claim.x, claim.z) + 0.08, claim.z);
      }
    },
  };
}
