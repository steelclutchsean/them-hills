import * as THREE from 'three';

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

  const group = new THREE.Group();
  group.name = 'general_store';
  group.position.copy(position);

  const matWood = new THREE.MeshStandardMaterial({
    color: 0x4a3826,
    flatShading: true,
    roughness: 0.92,
  });

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.8, 8), matWood);
  post.position.y = 0.9;
  post.castShadow = true;
  group.add(post);

  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.05), matWood);
  crossbar.position.y = 1.78;
  crossbar.castShadow = true;
  group.add(crossbar);

  const signTex = makeSignTexture('General Store', 0x4a8c2a);
  const matSign = new THREE.MeshStandardMaterial({
    map: signTex,
    color: 0xffffff,
    roughness: 0.7,
    side: THREE.DoubleSide,
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4), matSign);
  sign.position.y = 1.5;
  sign.castShadow = true;
  group.add(sign);

  const ringGeom = new THREE.TorusGeometry(0.25, 0.04, 6, 24);
  ringGeom.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x4a8c2a,
    emissive: 0x223311,
    emissiveIntensity: 0.4,
    roughness: 0.5,
    flatShading: true,
  });
  const marker = new THREE.Mesh(ringGeom, ringMat);
  marker.position.y = 2.05;
  group.add(marker);

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

function makeSignTexture(label: string, accent: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[general-store] canvas context unavailable');

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
  ctx.font = 'bold 56px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
