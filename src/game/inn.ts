import * as THREE from 'three';
import { buildCabin } from '@/game/structures';

// Hills Inn — first talking-NPC building. Procedural cabin: rectangular
// walls, peaked roof, painted sign, lantern by the door. Innkeeper Mae
// (the dialogue speaker) is implied at the door rather than rendered as a
// separate humanoid mesh — keeping NPC visuals minimal until we have a
// proper rigged-character pipeline.

const INN_INTERACT_RADIUS = 2.4;

export interface InnInfo {
  group: THREE.Group;
  position: THREE.Vector3;
  marker: THREE.Mesh;
  isPlayerNear(playerPos: THREE.Vector3): boolean;
  update(time: number, focused: boolean): void;
}

export function createInn(
  scene: THREE.Scene,
  getGroundY: (x: number, z: number) => number,
): InnInfo {
  const position = new THREE.Vector3(-13, getGroundY(-13, 10), 10);

  const built = buildCabin({ sign: 'Hills Inn', accent: 0xd47a2a, width: 4.4, depth: 3.6 });
  const group = built.root;
  group.name = 'inn';
  group.position.copy(position);
  const marker = built.marker;
  const lanternMat = built.lantern;

  scene.add(group);

  return {
    group,
    position: position.clone(),
    marker,
    isPlayerNear(playerPos) {
      const dx = playerPos.x - position.x;
      const dz = playerPos.z - position.z;
      return Math.hypot(dx, dz) < INN_INTERACT_RADIUS;
    },
    update(time, focused) {
      const ringMatRef = marker.material as THREE.MeshStandardMaterial;
      const targetEmissive = focused ? 1.4 : 0.4;
      ringMatRef.emissiveIntensity += (targetEmissive - ringMatRef.emissiveIntensity) * 0.15;

      // Lantern flickers gently
      if (lanternMat) {
        lanternMat.emissiveIntensity =
          1.0 + 0.3 * Math.sin(time * 5.3) + 0.1 * Math.sin(time * 11.7);
      }
    },
  };
}
