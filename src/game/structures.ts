import * as THREE from 'three';
import { PALETTE } from '@/render/palette';
import {
  canvasMaterial,
  stoneMaterial,
  timberDarkMaterial,
  timberMaterial,
} from '@/render/painterly';

// Frontier buildings from cylinders, planks, and a few dressed props.
// Shared by the inn, the buyers, the store, the camp, and the mine mouths.

function paintSign(label: string, accent: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[structures] canvas 2d unavailable');
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, '#a56b3c');
  bg.addColorStop(1, '#5c3a22');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = `#${accent.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  ctx.fillStyle = '#f6e7c1';
  ctx.font = 'bold 58px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = label.split('\n');
  lines.forEach((line, i) => {
    const y = canvas.height / 2 + (i - (lines.length - 1) / 2) * 64;
    ctx.fillText(line, canvas.width / 2, y);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function mesh(
  geom: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(geom, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export interface BuiltPlace {
  root: THREE.Group;
  lantern: THREE.MeshStandardMaterial | null;
  marker: THREE.Mesh;
}

function markerRing(y = 0.05): THREE.Mesh {
  const geom = new THREE.TorusGeometry(0.55, 0.045, 6, 24);
  geom.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: PALETTE.gold,
    emissive: 0x553311,
    emissiveIntensity: 0.45,
    roughness: 0.5,
    flatShading: true,
  });
  const ring = new THREE.Mesh(geom, mat);
  ring.position.y = y;
  return ring;
}

function addBarrel(parent: THREE.Object3D, x: number, z: number): void {
  const barrel = mesh(
    new THREE.CylinderGeometry(0.22, 0.24, 0.48, 8),
    timberDarkMaterial(),
    x,
    0.24,
    z,
  );
  parent.add(barrel);
  const hoop = mesh(new THREE.TorusGeometry(0.23, 0.015, 4, 10), stoneMaterial(), x, 0.32, z);
  hoop.rotation.x = Math.PI / 2;
  parent.add(hoop);
}

function addLantern(
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: PALETTE.lantern,
    emissive: PALETTE.lantern,
    emissiveIntensity: 1.15,
    roughness: 0.35,
  });
  const globe = mesh(new THREE.SphereGeometry(0.08, 8, 6), mat, x, y, z);
  globe.castShadow = false;
  parent.add(globe);
  const cap = mesh(new THREE.ConeGeometry(0.07, 0.08, 6), timberDarkMaterial(), x, y + 0.1, z);
  parent.add(cap);
  return mat;
}

/** Log cabin with a porch, chimney, sign, barrels, and a door lantern. */
export function buildCabin(opts: {
  sign: string;
  accent: number;
  width?: number;
  depth?: number;
}): BuiltPlace {
  const width = opts.width ?? 4.2;
  const depth = opts.depth ?? 3.4;
  const root = new THREE.Group();
  const wood = timberMaterial();
  const dark = timberDarkMaterial();
  const stone = stoneMaterial();

  const foundation = mesh(new THREE.BoxGeometry(width + 0.4, 0.28, depth + 0.5), stone, 0, 0.14, 0);
  root.add(foundation);

  const hx = width / 2 - 0.15;
  const hz = depth / 2 - 0.15;
  const post = new THREE.CylinderGeometry(0.12, 0.14, 2.5, 6);
  for (const [x, z] of [
    [-hx, -hz],
    [hx, -hz],
    [-hx, hz],
    [hx, hz],
  ] as const) {
    root.add(mesh(post, dark, x, 1.45, z));
  }

  const log = new THREE.CylinderGeometry(0.09, 0.09, width - 0.2, 6);
  log.rotateZ(Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const y = 0.45 + i * 0.38;
    root.add(mesh(log, wood, 0, y, -hz));
    root.add(mesh(log, wood, 0, y, hz));
  }
  const side = new THREE.CylinderGeometry(0.09, 0.09, depth - 0.3, 6);
  side.rotateX(Math.PI / 2);
  for (let i = 0; i < 5; i++) {
    const y = 0.45 + i * 0.38;
    root.add(mesh(side, wood, -hx, y, 0));
    root.add(mesh(side, wood, hx, y, 0));
  }

  const door = mesh(new THREE.BoxGeometry(0.7, 1.35, 0.08), dark, 0, 0.85, hz + 0.06);
  root.add(door);
  const frame = mesh(new THREE.BoxGeometry(0.52, 0.42, 0.1), dark, 0.95, 1.25, hz + 0.04);
  root.add(frame);
  const pane = mesh(
    new THREE.PlaneGeometry(0.34, 0.24),
    new THREE.MeshStandardMaterial({
      color: 0xc9ddd6,
      roughness: 0.18,
      metalness: 0.04,
      emissive: 0x1d3330,
      emissiveIntensity: 0.35,
    }),
    0.95,
    1.25,
    hz + 0.1,
  );
  root.add(pane);
  const sill = mesh(new THREE.BoxGeometry(0.62, 0.05, 0.16), wood, 0.95, 1.02, hz + 0.08);
  root.add(sill);

  // Porch deck and two posts.
  root.add(mesh(new THREE.BoxGeometry(width * 0.7, 0.08, 1.1), wood, 0, 0.32, hz + 0.7));
  const porchPost = new THREE.CylinderGeometry(0.07, 0.08, 2.1, 6);
  root.add(mesh(porchPost, dark, -width * 0.28, 1.4, hz + 1.15));
  root.add(mesh(porchPost, dark, width * 0.28, 1.4, hz + 1.15));

  const roofMat = timberDarkMaterial();
  const roofL = mesh(new THREE.BoxGeometry(width + 0.8, 0.1, 2.1), roofMat, 0, 2.85, -0.7);
  roofL.rotation.x = 0.42;
  root.add(roofL);
  const roofR = mesh(new THREE.BoxGeometry(width + 0.8, 0.1, 2.1), roofMat, 0, 2.85, 0.7);
  roofR.rotation.x = -0.42;
  root.add(roofR);
  const ridge = mesh(new THREE.CylinderGeometry(0.07, 0.07, width + 1.05, 6), dark, 0, 3.28, 0);
  ridge.rotation.z = Math.PI / 2;
  root.add(ridge);
  const step = mesh(new THREE.BoxGeometry(1.1, 0.1, 0.38), wood, 0, 0.16, hz + 1.35);
  root.add(step);

  // Stone chimney on the left eave.
  for (let i = 0; i < 5; i++) {
    const block = mesh(
      new THREE.BoxGeometry(0.46, 0.32, 0.46),
      stone,
      -hx + 0.1,
      2.2 + i * 0.3,
      -0.2,
    );
    block.rotation.y = i * 0.15;
    root.add(block);
  }

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.62),
    new THREE.MeshStandardMaterial({
      map: paintSign(opts.sign, opts.accent),
      roughness: 0.7,
    }),
  );
  sign.position.set(0, 2.15, hz + 1.2);
  sign.castShadow = true;
  root.add(sign);

  addBarrel(root, hx + 0.15, hz - 0.2);
  addBarrel(root, -hx - 0.1, hz + 0.4);
  const lantern = addLantern(root, width * 0.22, 1.7, hz + 0.2);

  const ring = markerRing();
  ring.position.z = hz + 1.7;
  root.add(ring);
  return { root, lantern, marker: ring };
}

/** Open-front counter: assayer, pawn shop, general store. */
export function buildShop(opts: { sign: string; accent: number }): BuiltPlace {
  const root = new THREE.Group();
  const wood = timberMaterial();
  const dark = timberDarkMaterial();
  root.add(mesh(new THREE.BoxGeometry(2.6, 0.16, 1.8), stoneMaterial(), 0, 0.08, 0));
  root.add(mesh(new THREE.BoxGeometry(2.2, 0.9, 0.7), wood, 0, 0.6, -0.3));
  for (let i = 0; i < 6; i++) {
    const plank = mesh(new THREE.BoxGeometry(0.1, 1.55, 0.22), dark, -1.05 + i * 0.42, 0.9, -0.72);
    root.add(plank);
  }
  root.add(mesh(new THREE.BoxGeometry(2.4, 0.08, 0.28), wood, 0, 1.7, -0.72));
  // Awning.
  const awning = mesh(new THREE.BoxGeometry(2.5, 0.06, 1.3), canvasMaterial(), 0, 1.85, 0.15);
  awning.rotation.x = -0.18;
  root.add(awning);
  const post = new THREE.CylinderGeometry(0.07, 0.08, 1.7, 6);
  root.add(mesh(post, dark, -1.05, 0.95, 0.7));
  root.add(mesh(post, dark, 1.05, 0.95, 0.7));
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 0.55),
    new THREE.MeshStandardMaterial({ map: paintSign(opts.sign, opts.accent), roughness: 0.65 }),
  );
  sign.position.set(0, 2.15, 0.2);
  root.add(sign);
  // Scale / strongbox on the counter so the stall reads as a business.
  root.add(mesh(new THREE.BoxGeometry(0.28, 0.16, 0.2), dark, -0.45, 1.12, -0.2));
  const pan = mesh(
    new THREE.CylinderGeometry(0.16, 0.12, 0.05, 10),
    stoneMaterial(),
    0.4,
    1.1,
    -0.15,
  );
  root.add(pan);
  addBarrel(root, 1.35, 0.2);
  const lantern = addLantern(root, -1.05, 1.55, 0.7);
  const ring = markerRing();
  ring.position.set(0, 0.05, 1.35);
  root.add(ring);
  return { root, lantern, marker: ring };
}

/** Lean-to and a sluice beside the campfire. Added into the camp group. */
export function addCampWorks(group: THREE.Group): void {
  const wood = timberMaterial();
  const dark = timberDarkMaterial();
  const pole = new THREE.CylinderGeometry(0.05, 0.06, 1.8, 5);
  const left = mesh(pole, dark, -1.6, 0.9, -0.4);
  left.rotation.z = 0.15;
  group.add(left);
  const right = mesh(pole, dark, -0.4, 0.9, -0.4);
  right.rotation.z = -0.1;
  group.add(right);
  const canvas = mesh(new THREE.PlaneGeometry(1.7, 1.5), canvasMaterial(), -1.05, 1.15, -0.15);
  canvas.rotation.x = 0.7;
  group.add(canvas);

  // Sluice: a trough on legs, riffles inside, aimed at the fire clearing.
  const trough = mesh(new THREE.BoxGeometry(0.42, 0.12, 1.8), wood, 1.35, 0.55, 0.2);
  trough.rotation.x = -0.18;
  group.add(trough);
  for (let i = 0; i < 4; i++) {
    const riffle = mesh(new THREE.BoxGeometry(0.34, 0.03, 0.04), dark, 1.35, 0.62, -0.4 + i * 0.35);
    group.add(riffle);
  }
  group.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 5), dark, 1.15, 0.25, 0.85));
  group.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 5), dark, 1.55, 0.35, -0.45));
  addBarrel(group, 1.9, -0.7);
}

/** Timber headframe, rails, and an ore cart in front of a mine mouth. */
export function addMineWorks(group: THREE.Group, sign: string): THREE.MeshStandardMaterial {
  const wood = timberMaterial();
  const dark = timberDarkMaterial();
  const braceL = mesh(new THREE.CylinderGeometry(0.08, 0.09, 3.2, 6), dark, -1.15, 1.7, 0.8);
  braceL.rotation.z = 0.35;
  braceL.rotation.x = -0.15;
  group.add(braceL);
  const braceR = mesh(new THREE.CylinderGeometry(0.08, 0.09, 3.2, 6), dark, 1.15, 1.7, 0.8);
  braceR.rotation.z = -0.35;
  braceR.rotation.x = -0.15;
  group.add(braceR);
  const roof = mesh(new THREE.BoxGeometry(3.1, 0.1, 2.4), dark, 0, 3.05, 0.6);
  roof.rotation.x = -0.12;
  group.add(roof);

  for (let i = 0; i < 5; i++) {
    const tie = mesh(new THREE.BoxGeometry(1.1, 0.08, 0.14), wood, 0, 0.06, 1.3 + i * 0.7);
    group.add(tie);
    const railL = mesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.72),
      stoneMaterial(),
      -0.32,
      0.12,
      1.3 + i * 0.7,
    );
    const railR = railL.clone();
    railR.position.x = 0.32;
    group.add(railL, railR);
  }

  const cart = new THREE.Group();
  cart.position.set(0, 0.28, 3.4);
  cart.add(mesh(new THREE.BoxGeometry(0.7, 0.38, 0.9), dark, 0, 0.32, 0));
  cart.add(
    mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8), stoneMaterial(), -0.28, 0.12, 0.28),
  );
  cart.add(
    mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8), stoneMaterial(), 0.28, 0.12, 0.28),
  );
  cart.add(
    mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8), stoneMaterial(), -0.28, 0.12, -0.28),
  );
  cart.add(
    mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8), stoneMaterial(), 0.28, 0.12, -0.28),
  );
  // Ore lumps.
  cart.add(mesh(new THREE.DodecahedronGeometry(0.12, 0), stoneMaterial(), 0.05, 0.58, 0.05));
  cart.add(mesh(new THREE.DodecahedronGeometry(0.09, 0), stoneMaterial(), -0.12, 0.55, -0.1));
  group.add(cart);

  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 0.4),
    new THREE.MeshStandardMaterial({ map: paintSign(sign, PALETTE.gold), roughness: 0.7 }),
  );
  board.position.set(0, 2.55, 0.95);
  group.add(board);
  return addLantern(group, 1.15, 2.15, 0.35);
}
