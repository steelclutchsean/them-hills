import * as THREE from 'three';

// Camp NPC. Player walks up, presses INTERACT — meters refill to full and
// game time advances ~4 hours. No cost. Visually a stone-ringed campfire
// with three tripod logs and glowing embers; pulses subtly so the player
// can spot it from a distance.

const CAMP_INTERACT_RADIUS = 1.8;

export interface CampInfo {
  group: THREE.Group;
  position: THREE.Vector3;
  marker: THREE.Mesh;
  isPlayerNear(playerPos: THREE.Vector3): boolean;
  update(time: number, focused: boolean): void;
}

export function createCamp(
  scene: THREE.Scene,
  getGroundY: (x: number, z: number) => number,
): CampInfo {
  const position = new THREE.Vector3(-7, getGroundY(-7, 5), 5);

  const group = new THREE.Group();
  group.name = 'camp';
  group.position.copy(position);

  // Stone ring around the fire pit
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x6b6258,
    flatShading: true,
    roughness: 0.95,
  });
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), stoneMat);
    stone.position.set(Math.cos(angle) * 0.55, 0.1, Math.sin(angle) * 0.55);
    stone.rotation.set(angle * 1.3, angle * 0.7, angle * 1.9);
    stone.scale.set(1, 0.55, 1);
    stone.castShadow = true;
    group.add(stone);
  }

  // Three tripod logs over the fire
  const logMat = new THREE.MeshStandardMaterial({
    color: 0x3a2415,
    roughness: 0.9,
    flatShading: true,
  });
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.95, 6), logMat);
    log.position.set(Math.cos(angle) * 0.18, 0.36, Math.sin(angle) * 0.18);
    log.rotation.z = Math.PI / 4;
    log.rotation.y = angle;
    log.castShadow = true;
    group.add(log);
  }

  // Glowing embers — pulse continuously so the camp is visible at distance
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0xff6622,
    emissive: 0xff4400,
    emissiveIntensity: 1.2,
    roughness: 0.5,
  });
  const embers = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), emberMat);
  embers.position.y = 0.16;
  embers.scale.set(1, 0.45, 1);
  group.add(embers);

  // Interact halo on the ground
  const ringGeom = new THREE.TorusGeometry(0.7, 0.04, 6, 24);
  ringGeom.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xff8844,
    emissive: 0x331100,
    emissiveIntensity: 0.4,
    roughness: 0.5,
    flatShading: true,
  });
  const marker = new THREE.Mesh(ringGeom, ringMat);
  marker.position.y = 0.04;
  group.add(marker);

  scene.add(group);

  return {
    group,
    position: position.clone(),
    marker,
    isPlayerNear(playerPos) {
      const dx = playerPos.x - position.x;
      const dz = playerPos.z - position.z;
      return Math.hypot(dx, dz) < CAMP_INTERACT_RADIUS;
    },
    update(time, focused) {
      const ringMatRef = marker.material as THREE.MeshStandardMaterial;
      const targetEmissive = focused ? 1.4 : 0.4;
      ringMatRef.emissiveIntensity += (targetEmissive - ringMatRef.emissiveIntensity) * 0.15;

      const eMat = embers.material as THREE.MeshStandardMaterial;
      eMat.emissiveIntensity = 1.0 + 0.3 * Math.sin(time * 4);
    },
  };
}
