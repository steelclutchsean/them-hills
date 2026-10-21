import * as THREE from 'three';
import type { Aabb } from '@/game/clearance';
import { poseNpc, spawnNpc } from '@/game/crew';
import { groundMaps } from '@/render/painterly';

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

function streetTexture(): THREE.CanvasTexture {
  return canvasTex((ctx, w, h) => {
    ctx.fillStyle = '#6b4424';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2200; i++) {
      const x = (i * 53) % w;
      const y = (i * 97) % h;
      ctx.fillStyle = i % 4 === 0 ? '#3a2414' : i % 4 === 1 ? '#a67a48' : i % 4 === 2 ? '#4a2c18' : '#7a5230';
      ctx.fillRect(x, y, 2 + (i % 3), 2 + (i % 2));
    }
    ctx.fillStyle = 'rgba(18, 8, 4, 0.82)';
    ctx.fillRect(w * 0.3, 0, w * 0.08, h);
    ctx.fillRect(w * 0.62, 0, w * 0.07, h);
    ctx.strokeStyle = 'rgba(36, 18, 8, 0.85)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 36; i++) {
      const x = (i * 71) % (w - 24);
      const y = (i * 113) % (h - 16);
      ctx.beginPath();
      ctx.arc(x, y, 8, 0.15, Math.PI - 0.15);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 12, y + 7, 7, 0.2, Math.PI - 0.1);
      ctx.stroke();
    }
  }, 512, 512);
}

function brickTexture(): THREE.CanvasTexture {
  return canvasTex((ctx, w, h) => {
    ctx.fillStyle = '#c4a48a';
    ctx.fillRect(0, 0, w, h);
    const bh = 18;
    const bw = 40;
    for (let row = 0; row < h / bh + 1; row++) {
      const off = row % 2 === 0 ? 0 : bw / 2;
      for (let x = -bw + off; x < w; x += bw) {
        ctx.fillStyle = (row + x) % 5 === 0 ? '#8a3e2c' : '#a85a3c';
        ctx.fillRect(x + 2, row * bh + 2, bw - 4, bh - 4);
      }
    }
  }, 128, 128);
}

function shakeTexture(): THREE.CanvasTexture {
  return canvasTex((ctx, w, h) => {
    ctx.fillStyle = '#5c3a22';
    ctx.fillRect(0, 0, w, h);
    const rows = 14;
    const rh = h / rows;
    for (let row = 0; row < rows; row++) {
      const y = row * rh;
      const off = row % 2 === 0 ? 0 : 16;
      ctx.fillStyle = row % 3 === 0 ? '#8a5a32' : '#6b4630';
      for (let x = -32 + off; x < w; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, y + rh);
        ctx.quadraticCurveTo(x + 16, y + 1, x + 32, y + rh);
        ctx.lineTo(x, y + rh);
        ctx.fill();
        ctx.strokeStyle = '#2a160e';
        ctx.stroke();
      }
    }
  }, 256, 256);
}

function stoneTexture(): THREE.CanvasTexture {
  return canvasTex((ctx, w, h) => {
    ctx.fillStyle = '#8d7764';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 28; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#6e5a48' : '#b7a48c';
      ctx.fillRect((i * 37) % (w - 8), (i * 19) % (h - 8), 26 + (i % 3) * 8, 14 + (i % 2) * 6);
    }
    ctx.strokeStyle = '#3a2c22';
    ctx.lineWidth = 3;
    for (let y = 8; y < h; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y + 3);
      ctx.stroke();
    }
  }, 128, 128);
}

function coalTexture(): THREE.CanvasTexture {
  return canvasTex((ctx, w, h) => {
    ctx.fillStyle = '#1a100c';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#ff6a22' : '#ffd08a';
      ctx.beginPath();
      ctx.arc((i * 23) % w, (i * 17) % h, 3 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }, 64, 64);
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

interface StreetMaps {
  street: THREE.CanvasTexture;
  glass: THREE.CanvasTexture;
  brick: THREE.CanvasTexture;
  shake: THREE.CanvasTexture;
  stone: THREE.CanvasTexture;
  coal: THREE.CanvasTexture;
}

let shared: StreetMaps | null = null;

function maps(): StreetMaps {
  shared ??= {
    street: streetTexture(),
    glass: glassTexture(),
    brick: brickTexture(),
    shake: shakeTexture(),
    stone: stoneTexture(),
    coal: coalTexture(),
  };
  return shared;
}

const IRON = new THREE.MeshStandardMaterial({
  color: 0x4a453e,
  roughness: 0.45,
  metalness: 0.72,
  flatShading: true,
});

interface StreetBeat {
  smith: THREE.Group;
  coals: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
}

const beats: StreetBeat[] = [];

function armHammer(root: THREE.Object3D, hero: boolean): void {
  const shovel = root.getObjectByName('shovel');
  if (!shovel || shovel.getObjectByName('smith-hammer')) return;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.08), IRON);
  head.name = 'smith-hammer';
  head.position.set(0, hero ? 0.78 : -0.66, hero ? 0 : 0.28);
  shovel.add(head);
  shovel.traverse((obj) => {
    if (obj === head || obj === shovel) return;
    if (obj instanceof THREE.Mesh && obj.geometry instanceof THREE.BoxGeometry) obj.visible = false;
  });
}

/** Hammer swing and coal flicker. Called once a frame from the town tick. */
export function tickTownStreet(time: number): void {
  for (const beat of beats) {
    poseNpc(beat.smith, time, 'rock', 0.6);
    armHammer(beat.smith, beat.smith.userData.hero === true);
    const flick = 0.7 + Math.abs(Math.sin(time * 11)) * 0.85 + Math.sin(time * 23) * 0.15;
    beat.coals.emissiveIntensity = flick;
    beat.light.intensity = 3.5 + flick * 5;
  }
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
  yaw = Math.PI / 2,
): void {
  const ww = wide ? 1.15 : 0.72;
  const wh = wide ? 1.35 : 1.05;
  const frame = new THREE.Group();
  frame.position.set(x, y, z);
  frame.rotation.y = yaw;
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), glassMat);
  frame.add(hole);
  const thick = 0.08;
  const bars: [number, number, number, number, number, number][] = [
    [0, wh / 2, 0, ww + 0.16, 0.1, thick],
    [0, -wh / 2, 0, ww + 0.16, 0.1, thick],
    [-ww / 2, 0, 0, thick, wh, thick],
    [ww / 2, 0, 0, thick, wh, thick],
  ];
  for (const [px, py, pz, sx, sy, sz] of bars) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), woodMat);
    bar.position.set(px, py, pz);
    frame.add(bar);
  }
  parent.add(frame);
}

function addFoundation(
  group: THREE.Group,
  groundY: (x: number, z: number) => number,
  originX: number,
  originZ: number,
  depth: number,
  width: number,
  stone: THREE.Material,
): void {
  const base = groundY(originX, originZ);
  let minRel = 0;
  for (const lx of [0.2, -depth * 0.5, -depth]) {
    for (const lz of [-width * 0.48, 0, width * 0.48]) {
      const rel = groundY(originX + lx, originZ + lz) - base;
      if (rel < minRel) minRel = rel;
    }
  }
  const drop = Math.max(0.28, -minRel + 0.12);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(depth + 0.35, drop, width * 0.96), stone);
  plinth.position.set(-depth / 2, -drop / 2, 0);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);
}

function addGable(
  group: THREE.Group,
  depth: number,
  width: number,
  wallH: number,
  shake: THREE.Material,
  iron: THREE.Material,
): void {
  const rise = 1.45;
  const half = depth / 2;
  const slopeLen = Math.hypot(half, rise);
  const ang = Math.atan2(rise, half);
  for (const side of [-1, 1]) {
    const plane = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.12, width * 0.98), shake);
    plane.position.set(-half + side * (half / 2), wallH + rise * 0.45, 0);
    plane.rotation.z = -side * ang;
    plane.castShadow = true;
    plane.receiveShadow = true;
    group.add(plane);
  }
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.5, 6), iron);
  pipe.position.set(-depth * 0.42, wallH + rise + 0.55, width * 0.18);
  pipe.castShadow = true;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 6), iron);
  cap.position.y = 0.78;
  pipe.add(cap);
  group.add(pipe);
}

function makeBuilding(
  lot: Lot,
  index: number,
  groundY: (x: number, z: number) => number,
  originX: number,
  originZ: number,
): THREE.Group {
  const group = new THREE.Group();
  const boards = stainedBoards(lot.paint);
  const trim = stainedBoards('#4a301c');
  const shake = new THREE.MeshStandardMaterial({
    map: maps().shake,
    color: 0xffffff,
    roughness: 0.92,
    flatShading: true,
  });
  const stone = new THREE.MeshStandardMaterial({
    map: maps().stone,
    color: 0xffffff,
    roughness: 0.95,
    flatShading: true,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    map: maps().glass,
    roughness: 0.25,
    metalness: 0.15,
    flatShading: true,
  });
  const depth = 8 + (index % 5) * 0.9;
  const wallH = Math.max(3.3, lot.height * 0.56);
  const shape = frontShape(lot.width, lot.height, lot.parapet);
  const frontGeom = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: false });
  frontGeom.rotateY(Math.PI / 2);
  frontGeom.translate(0.22, 0, 0);
  const front = new THREE.Mesh(frontGeom, boards);
  front.castShadow = true;
  front.receiveShadow = false;
  group.add(front);

  const body = new THREE.Mesh(new THREE.BoxGeometry(depth, wallH, lot.width * 0.9), boards);
  body.position.set(-depth / 2 - 0.02, wallH / 2, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  addFoundation(group, groundY, originX, originZ, depth, lot.width, stone);
  addGable(group, depth, lot.width, wallH, shake, IRON);
  group.userData.depth = depth;

  const sideZ = lot.width * 0.45;
  addWindow(group, trim, glassMat, -depth * 0.35, wallH * 0.55, sideZ, false, 0);
  addWindow(group, trim, glassMat, -depth * 0.7, wallH * 0.55, -sideZ, false, Math.PI);

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
    const foot = groundY(originX + 1.25, originZ + z) - groundY(originX, originZ);
    const top = 2.35;
    const h = Math.max(0.4, top - foot);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, h, 6), trim);
    post.position.set(1.25, foot + h / 2, z);
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
    addForge(group);
    const frontY = groundY(originX, originZ);
    for (const name of ['smithy-forge', 'street-smith']) {
      const obj = group.getObjectByName(name);
      if (!obj) continue;
      obj.position.y += groundY(originX + obj.position.x, originZ + obj.position.z) - frontY;
    }
    const glow = group.children.find((child) => child instanceof THREE.PointLight);
    const forge = group.getObjectByName('smithy-forge');
    if (glow && forge) glow.position.y = forge.position.y + 0.7;
  }
  return group;
}

function addForge(group: THREE.Group): void {
  const forge = new THREE.Group();
  forge.name = 'smithy-forge';
  forge.userData.noBatch = true;
  const brick = new THREE.MeshStandardMaterial({
    map: maps().brick,
    color: 0xffffff,
    roughness: 0.9,
    flatShading: true,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.85, 1.05), brick);
  body.position.y = 0.42;
  body.castShadow = true;
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.28, 0.9), IRON);
  hood.position.set(0.05, 0.98, 0);
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.7, 6), brick);
  chimney.position.set(-0.15, 1.85, -0.15);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.38, 0.55), brick);
  mouth.position.set(0.7, 0.48, 0);
  const coals = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.12, 0.55),
    new THREE.MeshStandardMaterial({
      map: maps().coal,
      color: 0xffe0c0,
      emissive: 0xff6a22,
      emissiveIntensity: 1.1,
      roughness: 0.5,
      flatShading: true,
    }),
  );
  coals.position.set(0.15, 0.22, 0);
  coals.name = 'smithy-coals';
  const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.16), IRON);
  anvil.position.set(0.95, 0.62, 0.85);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 5), IRON);
  horn.rotation.z = -Math.PI / 2;
  horn.position.set(0.22, 0, 0);
  anvil.add(horn);
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.48, 6), stainedBoards('#4a301c'));
  stump.position.set(0.95, 0.24, 0.85);
  forge.add(body, hood, chimney, mouth, coals, stump, anvil);
  forge.position.set(1.35, 0, 1.55);
  const glow = new THREE.PointLight(0xff7a3a, 6, 9, 2);
  glow.position.set(1.5, 0.7, 1.55);
  const smith = spawnNpc(0x6a5344, 0x2a241c, 1);
  smith.name = 'street-smith';
  smith.position.set(2.15, 0, 0.35);
  smith.rotation.y = 2.4;
  smith.userData.noBatch = true;
  group.add(forge, glow, smith);
  const coalMat = coals.material;
  if (coalMat instanceof THREE.MeshStandardMaterial) {
    beats.push({ smith, coals: coalMat, light: glow });
  }
}

function ribbonFrom(
  samples: readonly { z: number; y: number }[],
  x: number,
  width: number,
  mat: THREE.Material,
  uvAlong: number,
): THREE.Mesh {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  samples.forEach((sample, i) => {
    const t = samples.length <= 1 ? 0 : i / (samples.length - 1);
    pos.push(x - width / 2, sample.y, sample.z, x + width / 2, sample.y, sample.z);
    uv.push(0, t * uvAlong, 1, t * uvAlong);
    if (i < samples.length - 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
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

function deckHeights(
  groundY: (x: number, z: number) => number,
  x: number,
  z0: number,
  z1: number,
): { z: number; y: number; ground: number }[] {
  const step = 1.2;
  const raw: { z: number; ground: number }[] = [];
  for (let z = z0; z <= z1 + 0.01; z += step) raw.push({ z, ground: groundY(x, z) });
  return raw.map((sample, i) => {
    let acc = 0;
    let n = 0;
    for (let k = -5; k <= 5; k++) {
      const other = raw[i + k];
      if (!other) continue;
      acc += other.ground;
      n++;
    }
    const smooth = acc / Math.max(1, n);
    return { z: sample.z, ground: sample.ground, y: Math.max(smooth + 0.28, sample.ground + 0.16) };
  });
}

function streetMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map: maps().street,
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  mat.customProgramCacheKey = () => 'them-hills-street-dirt-2';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGrass = { value: groundMaps().grass };
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 vStreetWorld;',
    ).replace(
      '#include <project_vertex>',
      `vec4 streetWorld = modelMatrix * vec4(transformed, 1.0);
       vStreetWorld = streetWorld.xyz;
       #include <project_vertex>`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D uGrass;\nvarying vec3 vStreetWorld;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         {
           float edge = smoothstep(0.0, 0.16, vMapUv.x) * smoothstep(1.0, 0.84, vMapUv.x);
           vec3 grass = texture2D(uGrass, vStreetWorld.xz * 0.85).rgb;
           diffuseColor.rgb = mix(grass, diffuseColor.rgb, edge);
           float puddle = 0.0;
           puddle = max(puddle, 1.0 - smoothstep(0.35, 1.8, distance(vStreetWorld.xz, vec2(-16.4, 1.5))));
           puddle = max(puddle, 1.0 - smoothstep(0.28, 1.35, distance(vStreetWorld.xz, vec2(-17.2, 22.0))));
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.22, 0.22), puddle * edge * 0.82);
         }`,
      );
  };
  return mat;
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
    const building = makeBuilding(lot, index, groundY, FRONT_X, z);
    building.position.set(FRONT_X, y, z);
    root.add(building);
    const depth = typeof building.userData.depth === 'number' ? building.userData.depth : 10;
    lots.push({
      minX: FRONT_X - depth - 0.4,
      maxX: FRONT_X + 2.4,
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
  const walkX = FRONT_X + 1.85;
  const deckSamples = deckHeights(groundY, walkX, z0 - 0.6, z1 + 0.6);
  const deck = ribbonFrom(
    deckSamples,
    walkX,
    2.05,
    deckMat,
    Math.max(8, (z1 - z0) / 2.2),
  );
  deck.name = 'boardwalk';
  root.add(deck);
  const postMat = stainedBoards('#5c3a22');
  deckSamples.forEach((sample, index) => {
    if (index % 2 !== 0) return;
    const postH = Math.max(0.12, sample.y - sample.ground);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, postH, 0.12), postMat);
    post.position.set(walkX + 0.82, sample.ground + postH / 2, sample.z);
    root.add(post);
  });
  for (const end of [deckSamples[0], deckSamples[deckSamples.length - 1]]) {
    if (!end) continue;
    const side = end.z < 0 ? -1 : 1;
    const ground = groundY(walkX, end.z + side * 1.4);
    const rise = end.y - ground;
    const count = Math.max(3, Math.min(5, Math.ceil(rise / 0.16)));
    for (let step = 0; step < count; step++) {
      const z = end.z + side * (0.32 + step * 0.4);
      const y = end.y - ((step + 1) / count) * Math.max(rise, 0.2);
      const tread = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.38), deckMat);
      tread.position.set(walkX, Math.max(y, groundY(walkX, z) + 0.04), z);
      root.add(tread);
    }
  }

  const streetZ0 = z0 - 2;
  const streetZ1 = z1 + 2;
  const streetSamples: { z: number; y: number }[] = [];
  for (let z = streetZ0; z <= streetZ1; z += 1.4) {
    streetSamples.push({ z, y: groundY(-15.2, z) + 0.06 });
  }
  const street = ribbonFrom(streetSamples, -15.2, 16, streetMaterial(), (streetZ1 - streetZ0) / 3.2);
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
