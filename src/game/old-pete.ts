import * as THREE from 'three';

// Old Pete's bedroll — a small camp scene that implies a person lives here:
// rolled-up wool, a battered wooden chest, a walking stick leaning against
// a stone, and a carved nameplate. Visual is consistent with the wooden-post
// pattern used by the other NPCs: no humanoid mesh, the speaker name in
// dialogue ("Old Pete") supplies the personality.

const PETE_INTERACT_RADIUS = 1.6;

export interface OldPeteInfo {
  group: THREE.Group;
  position: THREE.Vector3;
  marker: THREE.Mesh;
  isPlayerNear(playerPos: THREE.Vector3): boolean;
  update(time: number, focused: boolean): void;
}

export function createOldPete(
  scene: THREE.Scene,
  getGroundY: (x: number, z: number) => number,
): OldPeteInfo {
  const position = new THREE.Vector3(-4, getGroundY(-4, 6), 6);

  const group = new THREE.Group();
  group.name = 'old_pete';
  group.position.copy(position);

  const woolMat = new THREE.MeshStandardMaterial({
    color: 0x8a6a4a,
    flatShading: true,
    roughness: 0.95,
  });
  const bedroll = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.0, 10), woolMat);
  bedroll.rotation.z = Math.PI / 2;
  bedroll.position.set(-0.2, 0.18, 0);
  bedroll.castShadow = true;
  group.add(bedroll);

  const chestMat = new THREE.MeshStandardMaterial({
    color: 0x4a2a14,
    flatShading: true,
    roughness: 0.9,
  });
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.32), chestMat);
  chest.position.set(0.55, 0.16, -0.1);
  chest.castShadow = true;
  group.add(chest);

  const lidMat = new THREE.MeshStandardMaterial({
    color: 0x6a3818,
    flatShading: true,
    roughness: 0.9,
  });
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 0.34), lidMat);
  lid.position.set(0.55, 0.34, -0.1);
  lid.rotation.x = -0.18;
  lid.castShadow = true;
  group.add(lid);

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x6b6258,
    flatShading: true,
    roughness: 0.95,
  });
  const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), stoneMat);
  stone.position.set(0.0, 0.12, 0.55);
  stone.scale.set(1.1, 0.7, 1.1);
  group.add(stone);

  const stickMat = new THREE.MeshStandardMaterial({
    color: 0x4a3018,
    flatShading: true,
    roughness: 0.92,
  });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.4, 6), stickMat);
  stick.position.set(0.0, 0.55, 0.55);
  stick.rotation.set(0.45, 0, 0.25);
  stick.castShadow = true;
  group.add(stick);

  // Carved nameplate on the chest lid
  const plateTex = makePlateTexture("Pete's Camp");
  const plateMat = new THREE.MeshStandardMaterial({
    map: plateTex,
    color: 0xffffff,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.12), plateMat);
  plate.position.set(0.55, 0.42, 0.06);
  plate.rotation.x = -0.18;
  group.add(plate);

  const ringGeom = new THREE.TorusGeometry(0.45, 0.04, 6, 24);
  ringGeom.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xa57850,
    emissive: 0x331708,
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
      return Math.hypot(dx, dz) < PETE_INTERACT_RADIUS;
    },
    update(time, focused) {
      const ringMatRef = marker.material as THREE.MeshStandardMaterial;
      const targetEmissive = focused ? 1.4 : 0.4;
      ringMatRef.emissiveIntensity += (targetEmissive - ringMatRef.emissiveIntensity) * 0.15;
      // Subtle stick sway so the scene reads as alive
      stick.rotation.z = 0.25 + 0.04 * Math.sin(time * 1.3);
    },
  };
}

function makePlateTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[old-pete] canvas context unavailable');
  ctx.fillStyle = '#6a4828';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#3a2412';
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  ctx.fillStyle = '#f0d089';
  ctx.font = 'bold 42px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
