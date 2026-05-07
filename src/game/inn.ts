import * as THREE from 'three';

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

  const group = new THREE.Group();
  group.name = 'inn';
  group.position.copy(position);

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x6b4a2a,
    flatShading: true,
    roughness: 0.92,
  });
  const walls = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.2, 2.6), wallMat);
  walls.position.y = 1.1;
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x4a2818,
    flatShading: true,
    roughness: 0.88,
  });
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, 1.95, 1.1, 4, 1), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 2.7;
  roof.scale.set(1.1, 1, 1.4);
  roof.castShadow = true;
  group.add(roof);

  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x2a1a08,
    flatShading: true,
    roughness: 0.9,
  });
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.5, 0.06), doorMat);
  door.position.set(0, 0.75, 1.31);
  group.add(door);

  const signTex = makeSignTexture('Hills Inn', 0xd47a2a);
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex,
    color: 0xffffff,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.55), signMat);
  sign.position.set(0, 2.0, 1.32);
  group.add(sign);

  // Lantern next to door — emissive sphere + glow halo. Looks great at dusk.
  const lanternMat = new THREE.MeshStandardMaterial({
    color: 0xffaa55,
    emissive: 0xff8a33,
    emissiveIntensity: 1.2,
    roughness: 0.4,
  });
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), lanternMat);
  lantern.position.set(0.6, 1.6, 1.32);
  group.add(lantern);

  // Interact halo on the ground, in front of door
  const ringGeom = new THREE.TorusGeometry(0.5, 0.04, 6, 24);
  ringGeom.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xd47a2a,
    emissive: 0x331708,
    emissiveIntensity: 0.4,
    roughness: 0.5,
    flatShading: true,
  });
  const marker = new THREE.Mesh(ringGeom, ringMat);
  marker.position.set(0, 0.04, 1.7);
  group.add(marker);

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
      const lMat = lantern.material as THREE.MeshStandardMaterial;
      lMat.emissiveIntensity = 1.0 + 0.3 * Math.sin(time * 5.3) + 0.1 * Math.sin(time * 11.7);
    },
  };
}

function makeSignTexture(label: string, accent: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[inn] canvas context unavailable');

  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, '#5e442e');
  bg.addColorStop(1, '#3a2818');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const accentHex = `#${accent.toString(16).padStart(6, '0')}`;
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

  ctx.fillStyle = '#f5d088';
  ctx.font = 'bold 64px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
