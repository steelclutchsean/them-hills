import * as THREE from 'three';
import { PALETTE } from '@/render/palette';
import {
  canvasMaterial,
  innTimber,
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
  ctx.fillStyle = 'rgba(62, 36, 18, 0.28)';
  for (let y = 18; y < canvas.height; y += 9) ctx.fillRect(16, y, canvas.width - 32, 2);
  ctx.fillStyle = '#f6e7c1';
  ctx.font = 'bold 54px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = label.split('\n');
  lines.forEach((line, i) => {
    const y = canvas.height / 2 + (i - (lines.length - 1) / 2) * 62;
    ctx.fillStyle = 'rgba(40, 22, 10, 0.45)';
    ctx.fillText(line, canvas.width / 2 + 3, y + 3);
    ctx.fillStyle = '#f6e7c1';
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
  if (geom.getAttribute('uv') && !geom.getAttribute('uv2')) {
    geom.setAttribute('uv2', geom.getAttribute('uv'));
  }
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
  const barrel = new THREE.Group();
  barrel.name = 'ground-barrel';
  barrel.position.set(x, 0, z);
  barrel.add(
    mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.48, 8), timberDarkMaterial(), 0, 0.24, 0),
  );
  const hoop = mesh(new THREE.TorusGeometry(0.23, 0.015, 4, 10), stoneMaterial(), 0, 0.32, 0);
  hoop.rotation.x = Math.PI / 2;
  barrel.add(hoop);
  parent.add(barrel);
}

/** Drop each barrel onto the ground under its own feet. A shared building Y leaves them hanging on a slope. */
export function seatBarrels(root: THREE.Object3D, ground: (x: number, z: number) => number): void {
  const world = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  const found: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (obj.name === 'ground-barrel') found.push(obj);
  });
  for (const obj of found) {
    obj.getWorldPosition(world);
    const y = ground(world.x, world.z);
    const parent = obj.parent;
    if (!parent) {
      obj.position.y = y;
      continue;
    }
    parent.updateWorldMatrix(true, false);
    const local = parent.worldToLocal(new THREE.Vector3(world.x, y, world.z));
    obj.position.y = local.y;
  }
}

const townLights: THREE.PointLight[] = [];
const windowLights: THREE.PointLight[] = [];
const windowPanes: THREE.MeshStandardMaterial[] = [];
const smokeCards: { mesh: THREE.Mesh; base: number; phase: number }[] = [];

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
  const light = new THREE.PointLight(PALETTE.lantern, 0, 8, 2);
  light.position.set(x, y, z);
  light.castShadow = false;
  parent.add(light);
  townLights.push(light);
  return mat;
}

let endGrainTex: THREE.CanvasTexture | null = null;
function endGrain(): THREE.CanvasTexture {
  if (endGrainTex) return endGrainTex;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[structures] canvas 2d unavailable');
  ctx.fillStyle = '#6b4328';
  ctx.beginPath();
  ctx.arc(32, 32, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a2414';
  ctx.lineWidth = 2;
  for (let r = 6; r <= 28; r += 5) {
    ctx.beginPath();
    ctx.arc(32, 32, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  endGrainTex = new THREE.CanvasTexture(canvas);
  endGrainTex.colorSpace = THREE.SRGBColorSpace;
  return endGrainTex;
}

const endGrainMat = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ map: endGrain(), roughness: 0.8 });

let logSerial = 0;

function addLog(
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  length: number,
  axis: 'x' | 'z',
  caps: boolean,
): void {
  logSerial += 1;
  const n = Math.abs(Math.sin(logSerial * 12.9898));
  const n2 = Math.abs(Math.sin(logSerial * 78.233 + 1.7));
  const n3 = Math.abs(Math.sin(logSerial * 39.425 + 4.2));
  const radius = 0.048 + n * 0.11;
  const len = length * (0.68 + n2 * 0.48);
  const geom = new THREE.CylinderGeometry(radius, radius * (0.78 + n * 0.28), len, 7);
  const pos = geom.attributes.position;
  if (!pos) return;
  const bow = (n - 0.5) * 0.32;
  for (let i = 0; i < pos.count; i++) {
    const along = (pos.getY(i) + len * 0.5) / Math.max(len, 0.01);
    pos.setX(i, pos.getX(i) + Math.sin(along * Math.PI) * bow);
  }
  pos.needsUpdate = true;
  const uv = geom.attributes.uv;
  if (uv) {
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * 0.62 + n * 0.34, uv.getY(i) * 0.7 + n2 * 0.22);
    }
    uv.needsUpdate = true;
  }
  const ground = y < 0.9;
  const eaves = y > 1.9;
  const grime = ground ? 0.28 : eaves ? 0.52 : 1;
  const tint = 0.42 + n * 0.85;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const shade = grime * tint * (0.82 + (i % 5) * 0.045);
    colors[i * 3] = shade * (ground ? 0.7 : eaves ? 0.78 : 1);
    colors[i * 3 + 1] = shade * (ground ? 0.95 : eaves ? 0.82 : 0.86);
    colors[i * 3 + 2] = shade * (ground ? 0.48 : eaves ? 0.9 : 0.62);
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (axis === 'x') geom.rotateZ(Math.PI / 2);
  else geom.rotateX(Math.PI / 2);
  const mat = (y < 1.05 ? innTimber(true) : innTimber(false)).clone();
  mat.vertexColors = true;
  const log = mesh(geom, mat, x, y, z);
  const slide = (n2 - 0.5) * 0.14;
  if (axis === 'x') log.position.x += slide;
  else log.position.z += slide;
  log.position.y += (n - 0.5) * 0.08;
  log.rotation.y += (n3 - 0.5) * 0.14;
  log.rotation.z += (n - 0.5) * 0.09;
  parent.add(log);
  if (n > 0.48) {
    const knotMat = innTimber(true).clone();
    knotMat.color.setRGB(0.28, 0.16, 0.08);
    knotMat.vertexColors = false;
    const knot = mesh(new THREE.SphereGeometry(0.045 + n * 0.035, 6, 5), knotMat, x, y, z);
    const alongK = (n2 - 0.5) * len * 0.55;
    if (axis === 'x') {
      knot.position.x += alongK;
      knot.position.z += radius * 0.85;
    } else {
      knot.position.z += alongK;
      knot.position.x += radius * 0.85;
    }
    parent.add(knot);
  }
  if (n2 > 0.38) {
    const crackMat = innTimber(true).clone();
    crackMat.color.setRGB(0.12, 0.07, 0.04);
    crackMat.vertexColors = false;
    const check = mesh(
      new THREE.BoxGeometry(
        axis === 'x' ? len * (0.45 + n3 * 0.45) : 0.028,
        0.03,
        axis === 'z' ? len * (0.45 + n3 * 0.45) : 0.028,
      ),
      crackMat,
      x,
      y + radius * 0.72,
      z,
    );
    if (axis === 'x') check.position.x += slide * 0.4;
    else check.position.z += slide * 0.4;
    parent.add(check);
  }
  if (!caps) return;
  const capGeom = new THREE.CircleGeometry(radius * 0.92, 8);
  const capMat = endGrainMat();
  const left = new THREE.Mesh(capGeom, capMat);
  const right = new THREE.Mesh(capGeom, capMat);
  const half = len / 2;
  if (axis === 'x') {
    left.position.set(log.position.x - half, y, z);
    left.rotation.y = -Math.PI / 2;
    right.position.set(log.position.x + half, y, z);
    right.rotation.y = Math.PI / 2;
  } else {
    left.position.set(x, y, log.position.z - half);
    right.position.set(x, y, log.position.z + half);
    right.rotation.y = Math.PI;
  }
  left.castShadow = true;
  right.castShadow = true;
  parent.add(left, right);
}

function addWindow(parent: THREE.Object3D, x: number, y: number, z: number, yaw: number): void {
  const frame = mesh(new THREE.BoxGeometry(0.62, 0.5, 0.08), timberDarkMaterial(), x, y, z);
  frame.rotation.y = yaw;
  parent.add(frame);
  const paneMat = new THREE.MeshStandardMaterial({
    color: 0xffe2b0,
    roughness: 0.18,
    metalness: 0.02,
    emissive: 0xffb15a,
    emissiveIntensity: 0.85,
    transparent: true,
    opacity: 0.92,
  });
  windowPanes.push(paneMat);
  const pane = mesh(new THREE.PlaneGeometry(0.5, 0.36), paneMat, x, y, z);
  pane.rotation.y = yaw;
  pane.position.z += Math.cos(yaw) * 0.05;
  pane.position.x += Math.sin(yaw) * 0.05;
  pane.castShadow = false;
  parent.add(pane);
  const glow = new THREE.PointLight(0xffb15a, 0, 5.5, 2);
  glow.position.set(pane.position.x, y, pane.position.z);
  glow.castShadow = false;
  parent.add(glow);
  windowLights.push(glow);
  const mullionV = mesh(new THREE.BoxGeometry(0.03, 0.3, 0.03), timberMaterial(), x, y, z);
  const mullionH = mesh(new THREE.BoxGeometry(0.42, 0.03, 0.03), timberMaterial(), x, y, z);
  mullionV.rotation.y = yaw;
  mullionH.rotation.y = yaw;
  parent.add(mullionV, mullionH);
  const sill = mesh(new THREE.BoxGeometry(0.7, 0.05, 0.14), timberMaterial(), x, y - 0.28, z);
  sill.rotation.y = yaw;
  parent.add(sill);
}

/** Second-story balcony and a front dormer. Only the inn calls this. */
function addInnFront(
  parent: THREE.Object3D,
  width: number,
  depth: number,
  wood: THREE.Material,
  dark: THREE.Material,
): void {
  const hz = depth / 2 - 0.12;
  const deckZ = hz + 0.55;
  parent.add(mesh(new THREE.BoxGeometry(width * 0.72, 0.08, 0.9), wood, 0, 2.28, deckZ));
  const railZ = deckZ + 0.4;
  for (const x of [-width * 0.32, 0, width * 0.32]) {
    parent.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.72, 6), dark, x, 2.68, railZ));
  }
  const rail = mesh(
    new THREE.CylinderGeometry(0.022, 0.022, width * 0.64, 6),
    dark,
    0,
    3.02,
    railZ,
  );
  rail.rotation.z = Math.PI / 2;
  parent.add(rail);
  const mid = mesh(new THREE.CylinderGeometry(0.014, 0.014, width * 0.64, 5), dark, 0, 2.66, railZ);
  mid.rotation.z = Math.PI / 2;
  parent.add(mid);
  parent.add(mesh(new THREE.BoxGeometry(0.72, 0.14, 0.18), dark, -width * 0.16, 2.4, railZ));
  const dormerZ = hz + 0.05;
  parent.add(mesh(new THREE.BoxGeometry(1.15, 0.78, 0.62), wood, 0, 2.78, dormerZ));
  parent.add(mesh(new THREE.BoxGeometry(0.08, 0.62, 0.55), dark, -0.52, 2.9, dormerZ));
  parent.add(mesh(new THREE.BoxGeometry(0.08, 0.62, 0.55), dark, 0.52, 2.9, dormerZ));
  const slope = mesh(new THREE.BoxGeometry(1.35, 0.07, 0.62), dark, 0, 3.28, dormerZ + 0.06);
  slope.rotation.x = -0.5;
  parent.add(slope);
  addWindow(parent, 0, 2.82, dormerZ + 0.32, 0);
}

function addShakeRoof(parent: THREE.Object3D, width: number, depth: number, peakY: number): void {
  const dark = innTimber(true);
  const mid = innTimber(false);
  const rows = 9;
  const shakeW = 0.36;
  for (const side of [-1, 1]) {
    for (let r = 0; r < rows; r++) {
      const t = r / (rows - 1);
      const z = side * (0.15 + t * (depth * 0.58 + 0.62));
      const y = peakY - t * 1.12 + ((r * 3) % 3) * 0.012;
      const count = Math.ceil((width + 1.1) / shakeW);
      for (let i = 0; i < count; i++) {
        const x = -width / 2 - 0.4 + i * shakeW + (r % 2) * shakeW * 0.5;
        const shake = mesh(
          new THREE.BoxGeometry(shakeW * 0.92, 0.045, 0.28),
          (i + r) % 3 === 0 ? dark : mid,
          x,
          y,
          z,
        );
        shake.rotation.x = -side * (0.38 + (i % 4) * 0.015);
        shake.rotation.z = ((i % 5) - 2) * 0.02;
        parent.add(shake);
      }
    }
  }
}

function bevelBoard(w: number, h: number, depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -h / 2);
  shape.lineTo(w / 2, -h / 2);
  shape.lineTo(w / 2, h / 2);
  shape.lineTo(-w / 2, h / 2);
  shape.closePath();
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.016,
    bevelSegments: 2,
    curveSegments: 1,
  });
  geom.translate(0, 0, -depth / 2);
  return geom;
}

function addStoneCourse(parent: THREE.Object3D, width: number, depth: number): void {
  const stone = stoneMaterial();
  const sides: { x: number; z: number; len: number; axis: 'x' | 'z' }[] = [
    { x: 0, z: depth / 2, len: width, axis: 'x' },
    { x: 0, z: -depth / 2, len: width, axis: 'x' },
    { x: width / 2, z: 0, len: depth, axis: 'z' },
    { x: -width / 2, z: 0, len: depth, axis: 'z' },
  ];
  for (const side of sides) {
    const count = Math.max(3, Math.round(side.len / 0.7));
    for (let i = 0; i < count; i++) {
      const u = (i + 0.5) / count - 0.5;
      const jitter = ((i * 17) % 5) * 0.02;
      const sx = side.axis === 'x' ? side.x + u * side.len : side.x;
      const sz = side.axis === 'z' ? side.z + u * side.len : side.z;
      const block = mesh(new THREE.BoxGeometry(0.62, 0.22, 0.36), stone, sx, 0.16, sz + jitter);
      block.rotation.y = ((i % 3) - 1) * 0.08;
      parent.add(block);
    }
  }
}

function addChimneySmoke(parent: THREE.Object3D, x: number, y: number, z: number): void {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xd9d4cc,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 4; i++) {
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.55 + i * 0.16, 0.62), mat.clone());
    card.position.set(x, y + i * 0.32, z);
    card.castShadow = false;
    parent.add(card);
    smokeCards.push({ mesh: card, base: y, phase: i * 0.4 });
  }
}

/** Woodshed, hitch rail, and a woodpile so the inn is not a single box. */
function addInnYard(
  root: THREE.Object3D,
  width: number,
  depth: number,
  wood: THREE.Material,
  dark: THREE.Material,
  stone: THREE.Material,
): void {
  const hx = width / 2;
  const hz = depth / 2;
  const shedX = hx + 1.15;
  const post = new THREE.CylinderGeometry(0.07, 0.09, 1.7, 6);
  root.add(mesh(post, dark, shedX - 0.7, 0.85, hz - 0.2));
  root.add(mesh(post, dark, shedX + 0.85, 0.85, hz - 0.15));
  root.add(mesh(post, dark, shedX + 0.8, 0.85, hz - 1.55));
  const roof = mesh(new THREE.BoxGeometry(2.15, 0.08, 1.9), dark, shedX + 0.1, 1.78, hz - 0.85);
  roof.rotation.z = -0.28;
  roof.rotation.y = 0.04;
  root.add(roof);
  for (let i = 0; i < 5; i++) {
    const log = mesh(
      new THREE.CylinderGeometry(0.07, 0.08, 0.85, 6),
      i % 2 === 0 ? wood : dark,
      shedX - 0.15 + (i % 2) * 0.12,
      0.12 + Math.floor(i / 2) * 0.16,
      hz - 0.7 - (i % 3) * 0.16,
    );
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i % 3) * 0.08;
    root.add(log);
  }
  const railZ = hz + 2.15;
  const rail = mesh(
    new THREE.CylinderGeometry(0.035, 0.035, width * 0.7, 6),
    dark,
    -0.2,
    0.85,
    railZ,
  );
  rail.rotation.z = Math.PI / 2;
  root.add(rail);
  root.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6), dark, -width * 0.38, 0.45, railZ));
  root.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6), dark, width * 0.28, 0.45, railZ));
  const trough = mesh(
    new THREE.BoxGeometry(0.95, 0.28, 0.38),
    wood,
    width * 0.15,
    0.22,
    railZ + 0.15,
  );
  root.add(trough);
  root.add(mesh(new THREE.BoxGeometry(0.78, 0.08, 0.22), stone, width * 0.15, 0.32, railZ + 0.15));
  const stump = mesh(
    new THREE.CylinderGeometry(0.22, 0.26, 0.42, 7),
    dark,
    -hx - 0.55,
    0.21,
    hz + 0.4,
  );
  root.add(stump);
  const axe = mesh(new THREE.BoxGeometry(0.04, 0.55, 0.08), dark, -hx - 0.55, 0.62, hz + 0.4);
  axe.rotation.z = 0.15;
  root.add(axe);
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

  addStoneCourse(root, width + 0.3, depth + 0.35);

  const hx = width / 2 - 0.12;
  const hz = depth / 2 - 0.12;
  const corner = new THREE.CylinderGeometry(0.11, 0.13, 2.55, 8);
  for (const [x, z] of [
    [-hx, -hz],
    [hx, -hz],
    [-hx, hz],
    [hx, hz],
  ] as const) {
    root.add(mesh(corner, dark, x, 1.5, z));
  }

  for (let i = 0; i < 7; i++) {
    const y = 0.42 + i * 0.28;
    const doorCourse = y < 1.75;
    if (doorCourse) {
      const seg = width * 0.32;
      addLog(root, -width * 0.27, y, hz, seg, 'x', true);
      addLog(root, width * 0.27, y, hz, seg, 'x', true);
    } else {
      addLog(root, 0, y, hz, width - 0.05, 'x', true);
    }
    if (i < 6) {
      const yChink = y + 0.15;
      const zChink = hz + 0.04;
      if (doorCourse) {
        root.add(
          mesh(
            new THREE.BoxGeometry(width * 0.28, 0.05, 0.05),
            stone,
            -width * 0.27,
            yChink,
            zChink,
          ),
        );
        root.add(
          mesh(
            new THREE.BoxGeometry(width * 0.28, 0.05, 0.05),
            stone,
            width * 0.27,
            yChink,
            zChink,
          ),
        );
      } else {
        root.add(mesh(new THREE.BoxGeometry(width - 0.4, 0.05, 0.05), stone, 0, yChink, zChink));
      }
    }
    addLog(root, 0, y, -hz, width - 0.05, 'x', true);
    addLog(root, -hx, y, 0, depth - 0.2, 'z', false);
    addLog(root, hx, y, 0, depth - 0.2, 'z', false);
  }

  const door = new THREE.Mesh(bevelBoard(0.78, 1.55, 0.07), innTimber(true));
  door.position.set(0, 0.98, hz + 0.1);
  door.castShadow = true;
  root.add(door);
  for (const [px, py] of [
    [-0.16, 1.22],
    [0.16, 1.22],
    [-0.16, 0.72],
    [0.16, 0.72],
  ] as const) {
    const panel = new THREE.Mesh(bevelBoard(0.26, 0.38, 0.025), innTimber(false));
    panel.position.set(px, py, hz + 0.15);
    panel.castShadow = true;
    root.add(panel);
  }
  const hinge = new THREE.BoxGeometry(0.05, 0.16, 0.03);
  root.add(mesh(hinge, stone, -0.36, 1.35, hz + 0.16));
  root.add(mesh(hinge, stone, -0.36, 0.7, hz + 0.16));
  root.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), stone, 0.28, 0.95, hz + 0.18));
  const jambL = mesh(new THREE.BoxGeometry(0.08, 1.55, 0.12), wood, -0.4, 0.95, hz + 0.06);
  const jambR = mesh(new THREE.BoxGeometry(0.08, 1.55, 0.12), wood, 0.4, 0.95, hz + 0.06);
  const header = mesh(new THREE.BoxGeometry(0.9, 0.1, 0.12), wood, 0, 1.7, hz + 0.06);
  root.add(jambL, jambR, header);
  addWindow(root, width * 0.28, 1.35, hz + 0.02, 0);
  addWindow(root, hx + 0.02, 1.4, 0.15, Math.PI / 2);

  const deckZ = hz + 0.72;
  for (let i = 0; i < 6; i++) {
    const board = mesh(
      new THREE.BoxGeometry(width * 0.76, 0.045, 0.18),
      i % 2 === 0 ? innTimber(false) : innTimber(true),
      0,
      0.34,
      deckZ - 0.5 + i * 0.2,
    );
    root.add(board);
  }
  const porchPost = new THREE.CylinderGeometry(0.07, 0.085, 2.15, 8);
  const postL = -width * 0.32;
  const postR = width * 0.32;
  const postZ = hz + 1.2;
  root.add(mesh(porchPost, dark, postL, 1.42, postZ));
  root.add(mesh(porchPost, dark, postR, 1.42, postZ));
  const porchRoof = mesh(new THREE.BoxGeometry(width * 0.9, 0.08, 1.45), dark, 0, 2.58, hz + 0.78);
  porchRoof.rotation.x = 0.22;
  root.add(porchRoof);
  for (const railY of [0.72, 1.15]) {
    const rail = mesh(
      new THREE.CylinderGeometry(0.025, 0.025, postR - postL, 6),
      dark,
      0,
      railY,
      postZ,
    );
    rail.rotation.z = Math.PI / 2;
    root.add(rail);
  }
  const step = mesh(new THREE.BoxGeometry(1.15, 0.1, 0.4), wood, 0, 0.18, hz + 1.45);
  root.add(step);

  addInnFront(root, width, depth, wood, dark);
  addShakeRoof(root, width, depth, 3.05);
  const ridge = mesh(new THREE.CylinderGeometry(0.06, 0.06, width + 1.1, 6), dark, 0, 3.12, 0);
  ridge.rotation.z = Math.PI / 2;
  root.add(ridge);

  for (let i = 0; i < 6; i++) {
    const block = mesh(
      new THREE.BoxGeometry(0.42, 0.28, 0.42),
      stone,
      -hx + 0.15,
      2.15 + i * 0.26,
      -0.15,
    );
    block.rotation.y = (i % 2) * 0.2;
    root.add(block);
  }
  addChimneySmoke(root, -hx + 0.15, 3.7, -0.15);

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 0.78, 0.07),
    new THREE.MeshStandardMaterial({ map: paintSign(opts.sign, opts.accent), roughness: 0.72 }),
  );
  sign.position.set(0, 1.72, hz + 1.55);
  sign.rotation.z = -0.03;
  sign.castShadow = true;
  root.add(sign);
  for (const sx of [-0.78, 0.78]) {
    const rope = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.85, 4), dark, sx, 2.15, hz + 1.55);
    rope.rotation.z = sx < 0 ? 0.12 : -0.12;
    root.add(rope);
  }

  addBarrel(root, hx + 0.2, hz - 0.15);
  addBarrel(root, -hx - 0.15, hz + 0.35);
  const crate = mesh(new THREE.BoxGeometry(0.42, 0.32, 0.38), wood, hx + 0.05, 0.5, hz + 0.85);
  root.add(crate);
  const lantern = addLantern(root, width * 0.22, 1.75, hz + 0.25);

  if (width > 4.2) addInnYard(root, width, depth, wood, dark, stone);

  const ring = markerRing();
  ring.position.z = hz + 1.85;
  root.add(ring);
  return { root, lantern, marker: ring };
}

/** Open-front counter: assayer, pawn shop, general store. */
export function buildShop(opts: { sign: string; accent: number }): BuiltPlace {
  const root = new THREE.Group();
  const wood = timberMaterial();
  const dark = timberDarkMaterial();
  addStoneCourse(root, 2.8, 2.0);
  root.add(mesh(new THREE.BoxGeometry(2.2, 0.9, 0.7), wood, 0, 0.7, -0.3));
  for (let i = 0; i < 8; i++) {
    const plank = mesh(new THREE.BoxGeometry(0.08, 1.7, 0.18), dark, -1.15 + i * 0.32, 1.05, -0.78);
    plank.position.x += (i % 2) * 0.015;
    root.add(plank);
  }
  root.add(mesh(new THREE.BoxGeometry(2.5, 0.08, 0.16), wood, 0, 1.95, -0.78));
  root.add(mesh(new THREE.BoxGeometry(2.5, 0.06, 0.1), wood, 0, 0.32, -0.78));
  const front = mesh(new THREE.BoxGeometry(2.65, 0.95, 0.1), wood, 0, 2.62, -0.2);
  root.add(front);
  root.add(mesh(new THREE.BoxGeometry(2.8, 0.08, 0.22), dark, 0, 3.12, -0.16));
  addWindow(root, 0.55, 2.68, -0.12, 0);
  const awning = mesh(new THREE.BoxGeometry(2.7, 0.05, 1.45), canvasMaterial(), 0, 2.05, 0.1);
  awning.rotation.x = -0.16;
  awning.position.y -= 0.04;
  root.add(awning);
  const post = new THREE.CylinderGeometry(0.065, 0.08, 1.85, 8);
  root.add(mesh(post, dark, -1.15, 1.05, 0.75));
  root.add(mesh(post, dark, 1.15, 1.05, 0.75));
  const rail = mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.3, 5), dark, 0, 0.85, 0.75);
  rail.rotation.z = Math.PI / 2;
  root.add(rail);
  addWindow(root, 0, 1.35, -0.9, 0);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 0.55),
    new THREE.MeshStandardMaterial({ map: paintSign(opts.sign, opts.accent), roughness: 0.65 }),
  );
  sign.position.set(0, 2.35, 0.15);
  root.add(sign);
  root.add(mesh(new THREE.BoxGeometry(0.28, 0.16, 0.2), dark, -0.45, 1.22, -0.2));
  const pan = mesh(
    new THREE.CylinderGeometry(0.16, 0.12, 0.05, 10),
    stoneMaterial(),
    0.4,
    1.2,
    -0.15,
  );
  root.add(pan);
  addBarrel(root, 1.45, 0.25);
  addBarrel(root, 1.7, 0.55);
  const crate = mesh(new THREE.BoxGeometry(0.36, 0.28, 0.32), wood, -1.4, 0.4, 0.2);
  root.add(crate);
  const crate2 = mesh(new THREE.BoxGeometry(0.32, 0.24, 0.28), dark, -1.28, 0.66, 0.28);
  crate2.rotation.y = 0.2;
  root.add(crate2);
  const walk = mesh(new THREE.BoxGeometry(2.4, 0.06, 0.9), wood, 0, 0.08, 1.15);
  root.add(walk);
  const lantern = addLantern(root, -1.15, 1.65, 0.75);
  const ring = markerRing();
  ring.position.set(0, 0.05, 1.45);
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
  addLantern(group, 0.15, 1.15, 0.35);
}

/** Timber headframe, rails, and an ore cart in front of a mine mouth. */
export function addMineWorks(group: THREE.Group, sign: string): THREE.MeshStandardMaterial {
  const wood = timberMaterial();
  const dark = timberDarkMaterial();
  const braceL = mesh(new THREE.CylinderGeometry(0.08, 0.09, 3.2, 6), dark, -1.15, 1.7, 1.85);
  braceL.rotation.z = 0.35;
  braceL.rotation.x = -0.04;
  group.add(braceL);
  const braceR = mesh(new THREE.CylinderGeometry(0.08, 0.09, 3.2, 6), dark, 1.15, 1.7, 1.85);
  braceR.rotation.z = -0.35;
  braceR.rotation.x = -0.04;
  group.add(braceR);
  // The slab sits in front of the mouth. A roof centered on the portal
  // puts the chase camera inside the timber.
  const roof = mesh(new THREE.BoxGeometry(3.1, 0.1, 2.0), dark, 0, 3.2, 2.2);
  roof.rotation.x = -0.05;
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
  board.position.set(0, 2.45, 2.55);
  group.add(board);
  return addLantern(group, 1.15, 2.15, 0.35);
}

function smooth01(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Crates, a hitching rail, a wagon, and a laundry line so the street is occupied. */
export function dressTown(scene: THREE.Scene, ground: (x: number, z: number) => number): void {
  const root = new THREE.Group();
  root.name = 'town-dressing';
  const wood = timberMaterial();
  const dark = timberDarkMaterial();
  const canvas = canvasMaterial();

  const place = (obj: THREE.Object3D, x: number, z: number): void => {
    obj.position.x += x;
    obj.position.z += z;
    obj.position.y += ground(x, z);
    root.add(obj);
  };

  const hitch = new THREE.Group();
  hitch.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.15, 6), dark, -0.7, 0.55, 0));
  hitch.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.15, 6), dark, 0.7, 0.55, 0));
  const hitchRail = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6), dark, 0, 0.95, 0);
  hitchRail.rotation.z = Math.PI / 2;
  hitch.add(hitchRail);
  place(hitch, -13, 13.1);

  const wagon = new THREE.Group();
  wagon.add(mesh(new THREE.BoxGeometry(1.3, 0.38, 2.1), wood, 0, 0.72, 0));
  wagon.add(mesh(new THREE.BoxGeometry(1.35, 0.28, 0.08), dark, 0, 0.95, 1.0));
  wagon.add(mesh(new THREE.BoxGeometry(1.35, 0.28, 0.08), dark, 0, 0.95, -0.85));
  const tongue = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 5), dark, 0, 0.55, 1.55);
  tongue.rotation.x = Math.PI / 2;
  wagon.add(tongue);
  for (const [wx, wz] of [
    [-0.55, 0.6],
    [0.55, 0.6],
    [-0.55, -0.6],
    [0.55, -0.6],
  ] as const) {
    const wheel = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 10), dark, wx, 0.32, wz);
    wheel.rotation.z = Math.PI / 2;
    wagon.add(wheel);
  }
  wagon.rotation.y = 0.4;
  place(wagon, -17.2, 2.4);

  const crates = new THREE.Group();
  crates.add(mesh(new THREE.BoxGeometry(0.48, 0.36, 0.42), wood, 0, 0.18, 0));
  crates.add(mesh(new THREE.BoxGeometry(0.4, 0.3, 0.36), dark, 0.1, 0.5, 0.05));
  crates.add(mesh(new THREE.BoxGeometry(0.34, 0.28, 0.3), wood, -0.45, 0.14, 0.2));
  place(crates, -8.4, -4.4);

  const line = new THREE.Group();
  line.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.7, 5), dark, 0, 0.85, 0));
  line.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.7, 5), dark, 2.4, 0.85, -1.1));
  const rope = mesh(new THREE.BoxGeometry(2.6, 0.02, 0.02), dark, 1.2, 1.55, -0.55);
  rope.rotation.y = -0.42;
  line.add(rope);
  for (let i = 0; i < 3; i++) {
    const shirt = mesh(
      new THREE.PlaneGeometry(0.38, 0.48),
      canvas,
      0.45 + i * 0.7,
      1.25,
      -0.2 - i * 0.32,
    );
    shirt.rotation.y = -0.4;
    line.add(shirt);
  }
  place(line, -12.2, 8.2);

  scene.add(root);
}

export function updateTownDressing(time: number, camera: THREE.Camera): void {
  for (const card of smokeCards) {
    const cycle = ((time * 0.28 + card.phase) % 1.7) / 1.7;
    card.mesh.position.y = card.base + cycle * 1.5;
    card.mesh.quaternion.copy(camera.quaternion);
    const mat = card.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.32 * (1 - cycle);
  }
}

export function updateTownLights(sunY: number): void {
  const night = 1 - smooth01(-0.02, 0.22, sunY);
  for (const light of townLights) light.intensity = 2.4 * night;
  for (const light of windowLights) light.intensity = 7.5 * night;
  for (const pane of windowPanes) pane.emissiveIntensity = 0.08 + 8.5 * night;
}
