import * as THREE from 'three';

// Mine entrance — a procedural wooden timber archway placed against a
// hillside. Phase 10a: the entrance is visible and interactable but the
// interior isn't built yet, so INTERACT shows a "needs pickaxe" prompt
// instead of opening anything. Phase 10b will add the cave interior + a
// hidden panning site behind this gate.

const MINE_INTERACT_RADIUS = 2.4;

export interface MineInfo {
  id: string;
  group: THREE.Group;
  position: THREE.Vector3;
  marker: THREE.Mesh;
  isPlayerNear(playerPos: THREE.Vector3): boolean;
  update(time: number, focused: boolean): void;
  /**
   * True if the player has the gear required to enter the mine. Phase 10a
   * always returns false (entry gated until 10b ships); kept here so the
   * unlock check has a single home.
   */
  isUnlocked(shovelTier: number): boolean;
}

export function createMineEntrance(
  scene: THREE.Scene,
  getGroundY: (x: number, z: number) => number,
): MineInfo {
  // Far north-west corner of the world so finding it requires intentional
  // exploration past the streams and town.
  const position = new THREE.Vector3(-45, getGroundY(-45, -45), -45);

  const group = new THREE.Group();
  group.name = 'mine_north';
  group.position.copy(position);

  const beamMat = new THREE.MeshStandardMaterial({
    color: 0x3a2618,
    flatShading: true,
    roughness: 0.95,
  });
  const aged = new THREE.MeshStandardMaterial({
    color: 0x2a1808,
    flatShading: true,
    roughness: 0.97,
  });

  // Two vertical posts
  const postGeom = new THREE.CylinderGeometry(0.18, 0.22, 2.6, 8);
  const postL = new THREE.Mesh(postGeom, beamMat);
  postL.position.set(-0.95, 1.3, 0);
  postL.castShadow = true;
  group.add(postL);
  const postR = postL.clone();
  postR.position.x = 0.95;
  group.add(postR);

  // Top crossbeam
  const topBeam = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 0.3), beamMat);
  topBeam.position.set(0, 2.5, 0);
  topBeam.castShadow = true;
  group.add(topBeam);

  // Slanted upper plank for visual weight
  const plank = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 0.18), aged);
  plank.position.set(0, 2.85, 0);
  plank.rotation.z = -0.06;
  plank.castShadow = true;
  group.add(plank);

  // Carved sign nailed to the crossbeam
  const signTex = makeMineSign('MINE');
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex,
    color: 0xffffff,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.36), signMat);
  sign.position.set(0, 2.5, 0.22);
  group.add(sign);

  // Backing wall (stone face) to suggest the cave is BEHIND the timbers,
  // not just open ground. A simple flat panel with darker stone color.
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a26,
    flatShading: true,
    roughness: 0.98,
  });
  const stone = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.7, 0.4), stoneMat);
  stone.position.set(0, 1.35, -0.4);
  group.add(stone);

  // Boarded-up entrance — a few horizontal planks blocking the doorway,
  // visually locking the mine. (Phase 10b removes these once the player
  // gets a pickaxe and the interior opens.)
  for (let i = 0; i < 4; i++) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 0.06), aged);
    board.position.set(0, 0.4 + i * 0.55, 0.25);
    board.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.04;
    board.castShadow = true;
    group.add(board);
  }

  // Halo
  const ringGeom = new THREE.TorusGeometry(0.6, 0.04, 6, 24);
  ringGeom.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x886644,
    emissive: 0x442211,
    emissiveIntensity: 0.4,
    roughness: 0.5,
    flatShading: true,
  });
  const marker = new THREE.Mesh(ringGeom, ringMat);
  marker.position.set(0, 0.04, 1.2);
  group.add(marker);

  scene.add(group);

  return {
    id: 'mine_north',
    group,
    position: position.clone(),
    marker,
    isPlayerNear(playerPos) {
      const dx = playerPos.x - position.x;
      const dz = playerPos.z - position.z;
      return Math.hypot(dx, dz) < MINE_INTERACT_RADIUS;
    },
    update(_time, focused) {
      const ringMatRef = marker.material as THREE.MeshStandardMaterial;
      const targetEmissive = focused ? 1.2 : 0.4;
      ringMatRef.emissiveIntensity += (targetEmissive - ringMatRef.emissiveIntensity) * 0.15;
    },
    isUnlocked(shovelTier) {
      // Pickaxe = shovel T3. Phase 10b will open the interior when this
      // returns true; for 10a the prompt always reads as locked.
      return shovelTier >= 3;
    },
  };
}

function makeMineSign(label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 144;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[mine] canvas context unavailable');

  ctx.fillStyle = '#3a2412';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Wood grain stripes
  ctx.strokeStyle = '#2a1808';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (i * canvas.height) / 8 + 6);
    ctx.lineTo(canvas.width, (i * canvas.height) / 8 + 12);
    ctx.stroke();
  }

  ctx.fillStyle = '#d8b878';
  ctx.font = 'bold 64px "Times New Roman", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
