import * as THREE from 'three';
import type { Aabb } from '@/game/clearance';

// Distinct false fronts along the west side of the street. Widths, parapets,
// and stains differ so the row does not collapse into one wall. Signs face
// east, toward a camera standing in the street.

type Parapet = 'step' | 'square' | 'arch';

interface Lot {
  name: string;
  width: number;
  height: number;
  parapet: Parapet;
  paint: string;
  awning: number;
  board: string;
  forge?: boolean;
}

const LOTS: readonly Lot[] = [
  { name: 'SALOON', width: 8.4, height: 6.6, parapet: 'step', awning: 0x6e2430, paint: '#c45a48', board: '#6e1c18' },
  { name: 'SMITHY', width: 6.4, height: 5.1, parapet: 'arch', awning: 0x2c241c, forge: true, paint: '#8a6a4e', board: '#241810' },
  { name: 'BANK', width: 7.6, height: 7.4, parapet: 'square', awning: 0x3e5a48, paint: '#e4d2a4', board: '#1c3830' },
  { name: 'LIVERY', width: 9.0, height: 5.0, parapet: 'square', awning: 0x4a3424, paint: '#a67c48', board: '#3e2814' },
  { name: 'CABIN', width: 5.2, height: 4.1, parapet: 'square', awning: 0x6a4028, paint: '#c49262', board: '#3a2414' },
  { name: 'INN', width: 7.8, height: 6.5, parapet: 'step', awning: 0xe6d2a8, paint: '#7ea4aa', board: '#163038' },
  { name: 'FREIGHT', width: 8.6, height: 5.5, parapet: 'square', awning: 0x3a3028, paint: '#8d7050', board: '#2a2018' },
  { name: 'BARBER', width: 5.6, height: 5.2, parapet: 'arch', awning: 0x8c3030, paint: '#f0e2c0', board: '#6e2428' },
  { name: 'BUNK', width: 5.0, height: 3.9, parapet: 'square', awning: 0x5c4030, paint: '#c49868', board: '#3e2a18' },
  { name: 'ASSAY', width: 6.8, height: 6.0, parapet: 'step', awning: 0x243038, paint: '#e0bc58', board: '#3a3010' },
  { name: 'STORE', width: 7.2, height: 5.7, parapet: 'square', awning: 0xe6d2a8, paint: '#9aaa62', board: '#243018' },
  { name: 'SHACK', width: 5.4, height: 4.3, parapet: 'arch', awning: 0x4a3428, paint: '#b07848', board: '#4a2c18' },
];

const FRONT_X = -25.2;

function canvasTex(
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  w: number,
  h: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[town-street] no 2d');
  paint(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function signTexture(label: string, board: string): THREE.CanvasTexture {
  return canvasTex((ctx, w, h) => {
    ctx.fillStyle = '#140e0a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = board;
    ctx.fillRect(14, 14, w - 28, h - 28);
    ctx.strokeStyle = '#f4efe2';
    ctx.lineWidth = 10;
    ctx.strokeRect(28, 28, w - 56, h - 56);
    ctx.fillStyle = '#f6f0e2';
    ctx.strokeStyle = '#140e0a';
    ctx.lineWidth = 12;
    const size = label.length > 6 ? 92 : 108;
    ctx.font = `700 ${size}px "Liberation Serif", "Noto Serif", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeText(label, w / 2, h / 2 + 8);
    ctx.fillText(label, w / 2, h / 2 + 8);
  }, 768, 220);
}

function clothTexture(hex: string): THREE.CanvasTexture {
  return canvasTex((ctx, w, h) => {
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(40, 24, 12, 0.35)';
    ctx.lineWidth = 2;
    for (let x = 8; x < w; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 6, h * 0.3, x - 6, h * 0.7, x + 2, h);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 244, 220, 0.18)';
    ctx.fillRect(0, 0, w, 18);
  }, 128, 128);
}

function dirtTexture(): THREE.CanvasTexture {
  return canvasTex((ctx, w, h) => {
    ctx.fillStyle = '#c17a45';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      const x = (i * 53) % w;
      const y = (i * 97) % h;
      ctx.fillStyle = i % 3 === 0 ? '#8a4e2c' : i % 3 === 1 ? '#e6d2a8' : '#5c3824';
      ctx.fillRect(x, y, 4 + (i % 5) * 2, 3 + (i % 4));
    }
    ctx.fillStyle = 'rgba(48, 26, 12, 0.72)';
    ctx.fillRect(w * 0.3, 0, w * 0.07, h);
    ctx.fillRect(w * 0.66, 0, w * 0.06, h);
    ctx.fillStyle = 'rgba(90, 52, 28, 0.4)';
    ctx.fillRect(w * 0.32, 0, w * 0.03, h);
  }, 512, 512);
}

function glassTexture(): THREE.CanvasTexture {
  return canvasTex((ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1c3a44');
    g.addColorStop(1, '#0e2428');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(244, 239, 226, 0.35)';
    ctx.fillRect(6, 6, w * 0.28, h * 0.45);
  }, 64, 80);
}

let shared: { dirt: THREE.CanvasTexture; glass: THREE.CanvasTexture } | null = null;

function maps(): { dirt: THREE.CanvasTexture; glass: THREE.CanvasTexture } {
  shared ??= { dirt: dirtTexture(), glass: glassTexture() };
  return shared;
}

function stainedBoards(paint: string): THREE.MeshStandardMaterial {
  const tex = canvasTex((ctx, w, h) => {
    ctx.fillStyle = paint;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(42, 24, 12, 0.38)';
    for (let y = 0; y < h; y += 22) ctx.fillRect(0, y, w, 3);
    ctx.fillStyle = 'rgba(255, 236, 200, 0.14)';
    for (let y = 4; y < h; y += 22) ctx.fillRect(0, y, w, 8);
    ctx.fillStyle = 'rgba(28, 16, 8, 0.32)';
    ctx.fillRect(0, h * 0.78, w, h * 0.22);
    ctx.fillStyle = 'rgba(20, 12, 8, 0.55)';
    for (let i = 0; i < 16; i++) ctx.fillRect((i * 41) % (w - 4), 10 + (i % 6) * 22, 3, 3);
  }, 128, 256);
  return new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
  });
}

function frontShape(width: number, height: number, kind: Parapet): THREE.Shape {
  const s = new THREE.Shape();
  const hw = width / 2;
  const shoulder = height * 0.7;
  s.moveTo(-hw, 0);
  s.lineTo(hw, 0);
  s.lineTo(hw, shoulder);
  if (kind === 'square') {
    s.lineTo(hw, height);
    s.lineTo(-hw, height);
  } else if (kind === 'step') {
    s.lineTo(hw, shoulder + 0.35);
    s.lineTo(hw * 0.62, shoulder + 0.35);
    s.lineTo(hw * 0.62, height * 0.9);
    s.lineTo(hw * 0.28, height * 0.9);
    s.lineTo(hw * 0.28, height);
    s.lineTo(-hw * 0.28, height);
    s.lineTo(-hw * 0.28, height * 0.9);
    s.lineTo(-hw * 0.62, height * 0.9);
    s.lineTo(-hw * 0.62, shoulder + 0.35);
    s.lineTo(-hw, shoulder + 0.35);
  } else {
    s.lineTo(hw, shoulder);
    s.quadraticCurveTo(0, height * 1.08, -hw, shoulder);
  }
  s.lineTo(-hw, 0);
  return s;
}

function addWindow(
  parent: THREE.Object3D,
  woodMat: THREE.Material,
  glassMat: THREE.Material,
  x: number,
  y: number,
  z: number,
  wide: boolean,
): void {
  const ww = wide ? 1.15 : 0.72;
  const wh = wide ? 1.35 : 1.05;
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), glassMat);
  hole.position.set(x, y, z);
  hole.rotation.y = Math.PI / 2;
  parent.add(hole);
  const thick = 0.08;
  const bars: [number, number, number, number, number, number][] = [
    [x, y + wh / 2, z, thick, 0.1, ww + 0.16],
    [x, y - wh / 2, z, thick, 0.1, ww + 0.16],
    [x, y, z - ww / 2, thick, wh, 0.1],
    [x, y, z + ww / 2, thick, wh, 0.1],
  ];
  for (const [px, py, pz, sx, sy, sz] of bars) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), woodMat);
    bar.position.set(px, py, pz);
    parent.add(bar);
  }
}

function makeBuilding(lot: Lot, index: number): THREE.Group {
  const group = new THREE.Group();
  const boards = stainedBoards(lot.paint);
  const trim = stainedBoards('#4a301c');
  const glassMat = new THREE.MeshStandardMaterial({
    map: maps().glass,
    roughness: 0.25,
    metalness: 0.15,
    flatShading: true,
  });
  const shape = frontShape(lot.width, lot.height, lot.parapet);
  const frontGeom = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: false });
  frontGeom.rotateY(Math.PI / 2);
  frontGeom.translate(0.22, 0, 0);
  const front = new THREE.Mesh(frontGeom, boards);
  front.castShadow = true;
  front.receiveShadow = false;
  group.add(front);

  const bodyH = lot.height * 0.62;
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, bodyH, lot.width * 0.86), boards);
  body.position.set(-2.3, bodyH / 2, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.16, lot.width * 0.9), trim);
  roof.position.set(-2.2, bodyH + 0.15, 0);
  roof.rotation.z = 0.08;
  roof.castShadow = true;
  group.add(roof);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.15, 1.05), trim);
  door.position.set(0.28, 1.08, lot.parapet === 'arch' ? 0 : lot.width * 0.12);
  group.add(door);

  const winZ = lot.width * 0.28;
  addWindow(group, trim, glassMat, 0.3, lot.height * 0.42, -winZ, index % 2 === 0);
  if (lot.width > 6) addWindow(group, trim, glassMat, 0.3, lot.height * 0.46, winZ * 0.15, false);

  const awningMat = new THREE.MeshStandardMaterial({
    map: clothTexture(`#${lot.awning.toString(16).padStart(6, '0')}`),
    roughness: 0.9,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const awning = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.06, lot.width * 0.72), awningMat);
  awning.position.set(0.85, 2.55, 0);
  awning.rotation.z = -0.22;
  group.add(awning);
  for (const z of [-lot.width * 0.32, lot.width * 0.32]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.35, 6), trim);
    post.position.set(1.25, 1.15, z);
    post.castShadow = true;
    group.add(post);
  }

  const signMat = new THREE.MeshBasicMaterial({ map: signTexture(lot.name, lot.board) });
  signMat.polygonOffset = true;
  signMat.polygonOffsetFactor = -1;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.min(lot.width * 0.84, 6.4), 1.85),
    signMat,
  );
  sign.position.set(0.78, Math.max(3.35, lot.height * 0.56), 0);
  sign.rotation.y = Math.PI / 2;
  sign.name = `street-sign-${index}`;
  sign.userData.noBatch = true;
  group.add(sign);

  if (lot.forge) {
    const forge = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.7, 0.7),
      new THREE.MeshStandardMaterial({
        map: maps().dirt,
        color: 0x3a2418,
        emissive: 0xff6a2a,
        emissiveIntensity: 1.6,
        roughness: 0.55,
        flatShading: true,
      }),
    );
    forge.position.set(0.7, 0.7, 0);
    forge.name = 'smithy-forge';
    forge.userData.noBatch = true;
    const glow = new THREE.PointLight(0xff7a3a, 8, 11, 2);
    glow.position.set(1.1, 1.2, 0);
    group.add(forge, glow);
  }
  return group;
}

function ribbon(
  groundY: (x: number, z: number) => number,
  x: number,
  z0: number,
  z1: number,
  width: number,
  lift: number,
  mat: THREE.Material,
): THREE.Mesh {
  const steps = Math.max(2, Math.ceil((z1 - z0) / 1.4));
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const z = z0 + (z1 - z0) * t;
    const y = groundY(x, z) + lift;
    pos.push(x - width / 2, y, z, x + width / 2, y, z);
    uv.push(0, t * 18, 3, t * 18);
    if (i < steps) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

export function buildTownStreet(
  scene: THREE.Scene,
  groundY: (x: number, z: number) => number,
): void {
  const root = new THREE.Group();
  root.name = 'town-street';
  const lots: Aabb[] = [];
  let cursor = -18;
  const built: { lot: Lot; z: number }[] = [];
  LOTS.forEach((lot, index) => {
    const z = cursor + lot.width / 2;
    const y = groundY(FRONT_X, z);
    const building = makeBuilding(lot, index);
    building.position.set(FRONT_X, y, z);
    root.add(building);
    lots.push({
      minX: FRONT_X - 4.8,
      maxX: FRONT_X + 0.6,
      minY: y,
      maxY: y + lot.height + 0.4,
      minZ: z - lot.width / 2,
      maxZ: z + lot.width / 2,
    });
    built.push({ lot, z });
    cursor += lot.width + 3.4;
  });
  const z0 = built[0] ? built[0].z - built[0].lot.width / 2 : -18;
  const z1 = built.length
    ? built[built.length - 1]!.z + built[built.length - 1]!.lot.width / 2
    : 20;

  const deckMat = stainedBoards('#c49262');
  const deck = ribbon(groundY, FRONT_X + 1.7, z0 - 0.4, z1 + 0.4, 1.7, 0.42, deckMat);
  deck.name = 'boardwalk';
  root.add(deck);
  const postMat = stainedBoards('#5c3a22');
  for (let z = z0; z <= z1; z += 2.4) {
    const y = groundY(FRONT_X + 2.35, z);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.48, 0.12), postMat);
    post.position.set(FRONT_X + 2.35, y + 0.2, z);
    root.add(post);
  }
  for (const end of [z0 - 0.2, z1 + 0.2]) {
    const side = end < 0 ? -1 : 1;
    for (let step = 0; step < 3; step++) {
      const z = end + side * (0.35 + step * 0.42);
      const y = groundY(FRONT_X + 1.7, z);
      const tread = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.4), deckMat);
      tread.position.set(FRONT_X + 1.7, y + 0.08 + (2 - step) * 0.12, z);
      root.add(tread);
    }
  }

  const streetMat = new THREE.MeshStandardMaterial({
    map: maps().dirt,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
  const street = ribbon(groundY, -19.4, z0 - 2, z1 + 2, 6.2, 0.04, streetMat);
  street.name = 'street-dirt';
  root.add(street);

  const railMat = stainedBoards('#6b4630');
  for (const z of built.filter((_, i) => i % 2 === 0).map((b) => b.z)) {
    const y = groundY(FRONT_X + 2.7, z);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.4), railMat);
    rail.position.set(FRONT_X + 2.7, y + 0.85, z);
    root.add(rail);
    for (const dz of [-1.1, 1.1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 5), railMat);
      post.position.set(FRONT_X + 2.7, y + 0.45, z + dz);
      root.add(post);
    }
  }

  root.userData.lots = lots;
  scene.add(root);
}
