import * as THREE from 'three';
import type { Aabb } from '@/game/clearance';
import { innTimber } from '@/render/painterly';
import { PALETTE } from '@/render/palette';

// A false-front main street, instanced so the extra buildings share a
// handful of draw calls. The working store, assay office, and inn stay
// where the player already finds them, on the east side of this row.

interface Lot {
  name: string;
  accent: number;
  height: number;
  forge?: boolean;
}

const LOTS: readonly Lot[] = [
  { name: 'SALOON', accent: 0x8c3030, height: 4.8 },
  { name: 'BANK', accent: 0xc6a24a, height: 5.5 },
  { name: 'LIVERY', accent: 0x6a5030, height: 4.15 },
  { name: 'SMITHY', accent: 0xb85a28, height: 4.05, forge: true },
  { name: 'CABIN', accent: 0x8a6238, height: 3.55 },
  { name: 'BOARDING', accent: 0x4a6a78, height: 4.7 },
  { name: 'FREIGHT', accent: 0x5c4030, height: 4.2 },
  { name: 'BARBER', accent: 0xd7c7a2, height: 3.85 },
  { name: 'CABIN', accent: 0x7a5340, height: 3.45 },
  { name: 'ASSAY', accent: 0xd4a647, height: 4.45 },
  { name: 'DRY GOODS', accent: 0x4a8c2a, height: 4.35 },
  { name: 'CABIN', accent: 0x6e4a32, height: 3.7 },
];

const ROW_X = -27.6;
const Z0 = -16;
const STEP = 3.55;

function signTexture(label: string, accent: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[town-street] no 2d');
  ctx.fillStyle = '#1c140e';
  ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = `#${accent.toString(16).padStart(6, '0')}`;
  ctx.fillRect(6, 6, 244, 84);
  ctx.fillStyle = '#1a120c';
  ctx.font = '700 36px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 50);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function instanced(
  geom: THREE.BufferGeometry,
  mat: THREE.Material,
  matrices: readonly THREE.Matrix4[],
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geom, mat, Math.max(1, matrices.length));
  mesh.count = matrices.length;
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildTownStreet(
  scene: THREE.Scene,
  groundY: (x: number, z: number) => number,
): void {
  const root = new THREE.Group();
  root.name = 'town-street';
  const wall = innTimber(false);
  const roofMat = innTimber(true);
  const dark = new THREE.MeshStandardMaterial({ color: PALETTE.timberDark, roughness: 0.9 });
  const dirt = new THREE.MeshStandardMaterial({ color: PALETTE.dirtDeep, roughness: 1 });
  const dummy = new THREE.Object3D();
  const lots: Aabb[] = [];

  const bodies: THREE.Matrix4[] = [];
  const fronts: THREE.Matrix4[] = [];
  const roofs: THREE.Matrix4[] = [];
  const doors: THREE.Matrix4[] = [];
  const walks: THREE.Matrix4[] = [];
  const ruts: THREE.Matrix4[] = [];
  const posts: THREE.Matrix4[] = [];
  const rails: THREE.Matrix4[] = [];
  const crates: THREE.Matrix4[] = [];
  const stumps: THREE.Matrix4[] = [];
  const fences: THREE.Matrix4[] = [];

  const put = (list: THREE.Matrix4[], x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rotY = 0) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    list.push(dummy.matrix.clone());
  };

  LOTS.forEach((lot, i) => {
    const x = ROW_X;
    const z = Z0 + i * STEP;
    const y = groundY(x, z);
    const h = lot.height;
    put(bodies, x - 0.7, y + h * 0.42, z, 3.4, h * 0.84, 2.7);
    put(fronts, x + 1.15, y + h * 0.55, z, 0.16, h, 3.15);
    put(roofs, x - 0.55, y + h * 0.86, z, 3.7, 0.12, 3.05);
    put(doors, x + 1.28, y + 1.05, z, 0.08, 1.9, 0.85);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.55),
      new THREE.MeshStandardMaterial({ map: signTexture(lot.name, lot.accent), roughness: 0.7 }),
    );
    sign.position.set(x + 1.32, y + h * 0.72, z);
    sign.name = `street-sign-${i}`;
    root.add(sign);
    lots.push({
      minX: x - 2.5,
      maxX: x + 1.35,
      minY: y,
      maxY: y + h + 0.4,
      minZ: z - 1.6,
      maxZ: z + 1.6,
    });
    if (i % 2 === 0) {
      put(posts, x + 2.15, y + 0.55, z - 1.15, 1, 1, 1);
      put(posts, x + 2.15, y + 0.55, z + 1.15, 1, 1, 1);
      put(rails, x + 2.15, y + 0.95, z, 1, 1, 1);
    }
    if (i % 3 === 1) {
      put(crates, x + 1.7, y + 0.2, z + 1.15, 1, 0.8, 0.9);
      put(crates, x + 1.85, y + 0.52, z + 1.2, 0.7, 0.55, 0.7);
    }
    if (lot.forge) {
      const forge = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.55, 0.55),
        new THREE.MeshStandardMaterial({
          color: 0x3a2418,
          emissive: 0xff6a2a,
          emissiveIntensity: 1.4,
          roughness: 0.6,
        }),
      );
      forge.position.set(x + 1.55, y + 0.7, z);
      forge.name = 'smithy-forge';
      const glow = new THREE.PointLight(0xff7a3a, 7, 9, 2);
      glow.position.set(x + 1.7, y + 1.1, z);
      root.add(forge, glow);
    }
  });

  for (let z = Z0 - 1; z <= Z0 + (LOTS.length - 1) * STEP + 1; z += 0.85) {
    const yW = groundY(-24.3, z);
    put(walks, -24.3, yW + 0.08, z, 1.15, 0.08, 0.78);
    const yE = groundY(-17.7, z);
    put(walks, -17.7, yE + 0.08, z, 1.05, 0.08, 0.78);
  }
  for (let z = Z0 - 2; z <= Z0 + (LOTS.length - 1) * STEP + 2; z += 1.6) {
    const y = groundY(-21.2, z);
    put(ruts, -21.35, y + 0.02, z, 0.38, 0.05, 1.45);
    put(ruts, -19.85, y + 0.02, z, 0.34, 0.05, 1.45);
  }
  for (let z = Z0; z <= Z0 + (LOTS.length - 1) * STEP; z += 2.4) {
    const x = -31.2;
    const y = groundY(x, z);
    put(fences, x, y + 0.45, z, 0.08, 0.9, 2.2);
    put(stumps, x + rngless(z) * 1.4 - 0.4, y + 0.16, z + 0.8, 0.7, 0.45, 0.7);
  }

  root.add(instanced(new THREE.BoxGeometry(1, 1, 1), wall, bodies));
  root.add(instanced(new THREE.BoxGeometry(1, 1, 1), wall, fronts));
  root.add(instanced(new THREE.BoxGeometry(1, 1, 1), roofMat, roofs));
  root.add(instanced(new THREE.BoxGeometry(1, 1, 1), dark, doors));
  root.add(instanced(new THREE.BoxGeometry(1, 1, 1), dark, walks));
  root.add(instanced(new THREE.BoxGeometry(1, 1, 1), dirt, ruts));
  root.add(instanced(new THREE.CylinderGeometry(0.06, 0.07, 1.1, 5), dark, posts));
  root.add(instanced(new THREE.BoxGeometry(0.08, 0.08, 2.3), dark, rails));
  root.add(instanced(new THREE.BoxGeometry(0.48, 0.36, 0.42), wall, crates));
  root.add(instanced(new THREE.CylinderGeometry(0.28, 0.34, 0.4, 6), dark, stumps));
  root.add(instanced(new THREE.BoxGeometry(1, 1, 1), dark, fences));

  const wagon = wagonMesh(wall, dark);
  wagon.position.set(-20.4, groundY(-20.4, -6), -6);
  wagon.rotation.y = 0.15;
  const wagon2 = wagonMesh(wall, dark);
  wagon2.position.set(-20.1, groundY(-20.1, 8.5), 8.5);
  wagon2.rotation.y = 2.6;
  root.add(wagon, wagon2);

  const well = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: PALETTE.rock, roughness: 0.95 });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.78, 0.7, 8), stone);
  ring.position.y = 0.35;
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(0.48, 10),
    new THREE.MeshStandardMaterial({ color: 0x245e62, roughness: 0.15, metalness: 0.2 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.62;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 0.08), dark);
  arm.position.set(0.55, 1.1, 0);
  well.add(ring, water, arm);
  well.position.set(-30.4, groundY(-30.4, 2), 2);
  well.name = 'town-well';
  root.add(well);

  const privy = new THREE.Group();
  privy.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.8, 1.05), wall));
  const privyRoof = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 1.25), roofMat);
  privyRoof.position.y = 0.95;
  privyRoof.rotation.z = 0.12;
  privy.add(privyRoof);
  privy.position.set(-31.4, groundY(-31.4, 14) + 0.9, 14);
  privy.name = 'outhouse';
  root.add(privy);

  const line = laundry(dark);
  line.position.set(-30.2, groundY(-30.2, -8), -8);
  root.add(line);

  const trough = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.38, 0.55), dark);
  trough.position.set(-24.6, groundY(-24.6, 4) + 0.28, 4);
  root.add(trough);

  root.userData.lots = lots;
  scene.add(root);
}

function rngless(z: number): number {
  const s = Math.sin(z * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function wagonMesh(wood: THREE.Material, dark: THREE.Material): THREE.Group {
  const wagon = new THREE.Group();
  wagon.name = 'street-wagon';
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.36, 2.15), wood);
  bed.position.y = 0.7;
  wagon.add(bed);
  const wheelGeom = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 8);
  wheelGeom.rotateZ(Math.PI / 2);
  for (const [x, z] of [
    [-0.55, 0.65],
    [0.55, 0.65],
    [-0.55, -0.65],
    [0.55, -0.65],
  ] as const) {
    const wheel = new THREE.Mesh(wheelGeom, dark);
    wheel.position.set(x, 0.32, z);
    wagon.add(wheel);
  }
  return wagon;
}

function laundry(dark: THREE.Material): THREE.Group {
  const line = new THREE.Group();
  line.name = 'laundry-line';
  const post = new THREE.CylinderGeometry(0.04, 0.05, 1.8, 5);
  const a = new THREE.Mesh(post, dark);
  a.position.y = 0.9;
  const b = new THREE.Mesh(post, dark);
  b.position.set(2.6, 0.9, -0.4);
  const rope = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.02, 0.02), dark);
  rope.position.set(1.3, 1.7, -0.2);
  rope.rotation.y = -0.15;
  line.add(a, b, rope);
  const cloth = new THREE.MeshStandardMaterial({
    color: PALETTE.canvas,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 3; i++) {
    const shirt = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.5), cloth);
    shirt.position.set(0.45 + i * 0.7, 1.35, -0.15);
    shirt.rotation.y = -0.2;
    shirt.rotation.z = (i - 1) * 0.08;
    line.add(shirt);
  }
  return line;
}
