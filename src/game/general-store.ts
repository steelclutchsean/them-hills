import * as THREE from 'three';
import { buildShop } from '@/game/structures';

// General Store NPC. The player walks up to it and opens the upgrade UI to
// spend wallet cash on tool tier upgrades. Visually it's a wooden post +
// hanging painted sign — same pattern as the Assayer / Pawn Shop vendors,
// just with a green sign accent so it's distinguishable from the gold-buying
// vendors.

const STORE_INTERACT_RADIUS = 1.8;

export interface GeneralStoreInfo {
  group: THREE.Group;
  position: THREE.Vector3;
  marker: THREE.Mesh;
  isPlayerNear(playerPos: THREE.Vector3): boolean;
  update(time: number, focused: boolean): void;
}

export function createGeneralStore(
  scene: THREE.Scene,
  getGroundY: (x: number, z: number) => number,
): GeneralStoreInfo {
  const position = new THREE.Vector3(-10, getGroundY(-10, -3), -3);

  const built = buildShop({ sign: 'General Store', accent: 0x4a8c2a });
  const group = built.root;
  group.name = 'general_store';
  group.position.copy(position);
  const marker = built.marker;

  scene.add(group);

  return {
    group,
    position: position.clone(),
    marker,
    isPlayerNear(playerPos) {
      const dx = playerPos.x - position.x;
      const dz = playerPos.z - position.z;
      return Math.hypot(dx, dz) < STORE_INTERACT_RADIUS;
    },
    update(time, focused) {
      const mat = marker.material as THREE.MeshStandardMaterial;
      const targetEmissive = focused ? 1.4 : 0.4;
      mat.emissiveIntensity += (targetEmissive - mat.emissiveIntensity) * 0.15;
      const pulse = focused ? 1.0 + 0.08 * Math.sin(time * 6) : 1.0;
      marker.scale.setScalar(pulse);
    },
  };
}
