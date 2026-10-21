import * as THREE from 'three';
import { poseNpc, spawnNpc } from '@/game/crew';
import { hewnTimberMaterial, innTimber } from '@/render/painterly';
import { softDiscTexture } from '@/render/soft-disc';

// Stamp mill, the company wagon, and the shed that burns. Silas, Mae,
// Pete, and Ada stand in the world. The fire chars the shed; saving the
// town puts the roof back.

export interface TownArc {
  millPos: THREE.Vector3;
  companyPos: THREE.Vector3;
  firePos: THREE.Vector3;
  nearMill(pos: THREE.Vector3): boolean;
  nearCompany(pos: THREE.Vector3): boolean;
  nearFire(pos: THREE.Vector3): boolean;
  actor(id: 'pete' | 'mae' | 'silas' | 'ada' | 'fire'): THREE.Vector3 | null;
  update(time: number, dt: number, act: number, burning: boolean, savedTown: boolean): void;
  quench(): void;
  rebuild(): void;
}

export function createTownArc(
  scene: THREE.Scene,
  groundY: (x: number, z: number) => number,
): TownArc {
  const millPos = new THREE.Vector3(-28, groundY(-28, 16), 16);
  const companyPos = new THREE.Vector3(-6, groundY(-6, 24), 24);
  const firePos = new THREE.Vector3(-11, groundY(-11, 14), 14);
  const petePos = new THREE.Vector3(-4, groundY(-4, 6), 6);
  const maeHome = new THREE.Vector3(-13, groundY(-13, 10), 10);

  const timber = hewnTimberMaterial();
  const iron = new THREE.MeshStandardMaterial({ color: 0x5c6166, roughness: 0.42, metalness: 0.62 });
  const plank = innTimber(false);
  const roofMat = innTimber(true);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x2f8a86,
    roughness: 0.12,
    metalness: 0.18,
    transparent: true,
    opacity: 0.88,
  });

  const mill = new THREE.Group();
  mill.name = 'stamp-mill';
  mill.position.copy(millPos);
  const built = buildMill(mill, timber, iron, plank, roofMat, waterMat);
  const wheel = built.wheel;
  const cams = built.cams;
  const stamps = built.stamps;
  scene.add(mill);

  const company = new THREE.Group();
  company.name = 'company-wagon';
  company.position.copy(companyPos);
  company.visible = false;
  const wagon = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.55, 1.15),
    new THREE.MeshStandardMaterial({ color: 0x2c241c, roughness: 0.86 }),
  );
  wagon.position.y = 0.62;
  const canvas = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.7, 1.05),
    new THREE.MeshStandardMaterial({ color: 0xc8b48a, roughness: 0.9 }),
  );
  canvas.position.y = 1.2;
  const wheelGeom = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 12);
  wheelGeom.rotateZ(Math.PI / 2);
  for (const [x, z] of [
    [-0.85, 0.55],
    [0.85, 0.55],
    [-0.85, -0.55],
    [0.85, -0.55],
  ] as const) {
    const w = new THREE.Mesh(wheelGeom, iron);
    w.position.set(x, 0.32, z);
    company.add(w);
  }
  company.add(wagon, canvas);
  scene.add(company);

  const shedMats = {
    wall: new THREE.MeshStandardMaterial({ color: 0x7a5434, roughness: 0.9 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x6a3a32, roughness: 0.88 }),
  };
  const wallColor = shedMats.wall.color.clone();
  const roofColor = shedMats.roof.color.clone();
  const shed = new THREE.Group();
  shed.name = 'fire-shed';
  shed.position.copy(firePos);
  const shedBuilt = buildBurningShed(shed, shedMats.wall, shedMats.roof);
  const shedRoof = shedBuilt.roof;

  const flames = makeSoftPoints('fire-flame', 140, 0xff7a28, 0.62, THREE.AdditiveBlending);
  const flameMat = flames.material as THREE.PointsMaterial;
  flameMat.toneMapped = false;
  flameMat.opacity = 1;
  flames.visible = false;
  const fireLight = new THREE.PointLight(0xff6a2a, 0, 14, 2);
  fireLight.position.set(0, 3.1, 0.2);
  fireLight.castShadow = false;
  shed.add(flames, fireLight);

  const smoke = makeSoftPoints('fire-smoke', 80, 0x2a2826, 2.6, THREE.NormalBlending);
  (smoke.material as THREE.PointsMaterial).opacity = 0.55;
  const embers = makeSoftPoints('fire-embers', 48, 0xff8a3a, 0.2, THREE.AdditiveBlending);
  smoke.name = 'fire-smoke';
  embers.name = 'fire-embers';
  shed.add(smoke, embers);
  scene.add(shed);

  const bucketLine = new THREE.Group();
  bucketLine.name = 'bucket-line';
  bucketLine.position.copy(firePos);
  bucketLine.visible = false;
  const bucketLooks: [number, number, number][] = [
    [0x8a3030, 0x24160e, 0],
    [0x314238, 0x6a5432, 1],
    [0x243044, 0xd2c29a, 2],
  ];
  for (let i = 0; i < 3; i++) {
    const look = bucketLooks[i] ?? bucketLooks[0]!;
    const figure = spawnNpc(look[0], look[1], look[2]);
    figure.position.set(1.8 + i * 0.7, 0, 1.4);
    figure.rotation.y = Math.PI;
    const bucket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.08, 0.16, 6),
      new THREE.MeshStandardMaterial({ color: 0x8a5a28, roughness: 0.7 }),
    );
    bucket.position.set(0.2, 0.45, 0.15);
    figure.add(bucket);
    bucketLine.add(figure);
  }
  scene.add(bucketLine);

  const pete = spawnNpc(0x6b5344, 0x3a2a1a);
  pete.position.copy(petePos);
  pete.rotation.y = 0.4;
  scene.add(pete);
  const mae = spawnNpc(0x7a3040, 0x2a1818);
  mae.position.set(maeHome.x + 1.1, maeHome.y, maeHome.z + 1.4);
  mae.rotation.y = -0.6;
  scene.add(mae);
  const silas = spawnNpc(0x3e4a52, 0x2a241c);
  silas.position.set(millPos.x + 0.55, millPos.y + 0.16, millPos.z + 2.45);
  silas.rotation.y = 1.05;
  scene.add(silas);
  const ada = spawnNpc(0x1c2a24, 0x111410);
  ada.position.set(companyPos.x + 1.5, companyPos.y, companyPos.z);
  ada.rotation.y = -Math.PI / 2;
  ada.visible = false;
  scene.add(ada);

  let wagonIn = 0;
  let charred = false;
  let wasBurning = false;
  let burningNow = false;
  const actors: Record<string, THREE.Object3D> = { pete, mae, silas, ada, fire: shed };

  function applyChar(): void {
    charred = true;
    shedMats.wall.color.set(0x2a2420);
    shedMats.roof.color.set(0x1c1614);
    shedRoof.rotation.x = 0.42;
    shedRoof.position.y = 1.7;
    flames.visible = false;
    fireLight.intensity = 0;
    smoke.visible = false;
    embers.visible = false;
  }

  function applyRebuild(): void {
    charred = false;
    shedMats.wall.color.copy(wallColor);
    shedMats.roof.color.copy(roofColor);
    shedRoof.rotation.x = 0;
    shedRoof.position.y = 2.35;
  }

  const near = (a: THREE.Vector3, b: THREE.Vector3, r: number) => Math.hypot(a.x - b.x, a.z - b.z) < r;

  return {
    millPos,
    companyPos,
    firePos,
    nearMill: (pos) => near(pos, millPos, 6.2),
    nearCompany: (pos) => company.visible && near(pos, companyPos, 3.2),
    nearFire: (pos) => burningNow && near(pos, firePos, 3.6),
    actor(id) {
      const obj = actors[id];
      if (!obj || !obj.visible) return null;
      return obj.getWorldPosition(new THREE.Vector3());
    },
    quench() {
      wasBurning = false;
      burningNow = false;
      applyChar();
      bucketLine.visible = false;
    },
    rebuild() {
      applyRebuild();
    },
    update(time, dt, act, burning, savedTown) {
      burningNow = burning;
      if (act >= 3) wagonIn = Math.min(1, wagonIn + dt * 0.28);
      company.visible = act >= 3;
      company.position.set(companyPos.x, companyPos.y, companyPos.z + (1 - wagonIn) * 16);
      ada.visible = act >= 3;
      ada.position.set(company.position.x + 1.5, companyPos.y, company.position.z);
      wheel.rotation.z = time * 0.7;
      const pour = mill.getObjectByName('mill-pour');
      pour?.children.forEach((drop, i) => {
        const fall = (time * 1.6 + i * 0.22) % 1;
        drop.position.set(-5.55 - fall * 0.15, 4.9 - fall * 1.55, 0.35);
        drop.scale.setScalar(1 - fall * 0.35);
      });
      wheel.children.forEach((child) => {
        if (child.name !== 'wheel-water') return;
        const a = Math.atan2(child.position.y, child.position.x) + wheel.rotation.z;
        child.visible = Math.sin(a) > 0.05;
      });
      cams.rotation.x = time * 2.4;
      stamps.forEach((stamp, i) => {
        const lift = Math.max(0, Math.sin(time * 2.4 + i * ((Math.PI * 2) / 5)));
        stamp.position.y = 2.05 + lift * 0.7;
      });
      poseNpc(silas, time, 'rock', 1);
      poseNpc(pete, time, 'idle', 0);
      poseNpc(ada, time, 'idle', 2);
      poseNpc(mae, time, 'idle', 3);
      bucketLine.visible = burning;
      bucketLine.children.forEach((figure, i) => {
        poseNpc(figure as THREE.Group, time, 'shovel', i);
        figure.position.y = Math.abs(Math.sin(time * 3 + i)) * 0.04;
      });

      if (burning) {
        wasBurning = true;
        if (charred) applyRebuild();
        flames.visible = true;
        fireLight.intensity = 36 + Math.sin(time * 17) * 10;
        smoke.visible = true;
        embers.visible = true;
        placeCloud(flames, time * 1.7, 0.22, 1.05, FLAME_TONGUES, { x: 0.15, z: 0.05 }, 0.12);
        placeCloud(smoke, time * 0.38, 0.7, 4.6, SMOKE_SOURCES, { x: 1.35, z: 0.55 }, 0.95);
        placeCloud(embers, time * 1.5, 0.85, 2.4, FLAME_TONGUES, { x: 1.6, z: 0.4 }, 0.2);
        const maeTarget = firePos.clone().add(new THREE.Vector3(2.4, 0, 1.6));
        mae.position.lerp(new THREE.Vector3(maeTarget.x, maeHome.y, maeTarget.z), Math.min(1, dt * 0.8));
      } else {
        flames.visible = false;
        if (!charred) fireLight.intensity = 0;
        if (wasBurning && !charred) applyChar();
        if (!burning && !charred) {
          smoke.visible = false;
          embers.visible = false;
        }
        mae.position.lerp(new THREE.Vector3(maeHome.x + 1.1, maeHome.y, maeHome.z + 1.4), Math.min(1, dt * 0.4));
      }
      if (savedTown && charred) applyRebuild();
    },
  };
}

const millDummy = new THREE.Object3D();

interface Emitter {
  x: number;
  y: number;
  z: number;
}

const FLAME_TONGUES: readonly Emitter[] = [
  { x: -0.9, y: 2.55, z: -0.1 },
  { x: -0.4, y: 2.72, z: 0.15 },
  { x: 0.1, y: 2.6, z: -0.2 },
  { x: 0.55, y: 2.7, z: 0.1 },
  { x: 1.0, y: 2.5, z: 0.28 },
  { x: 1.24, y: 1.38, z: -0.42 },
  { x: 1.24, y: 1.42, z: 0.42 },
  { x: 0.05, y: 1.55, z: 1.08 },
];

const SMOKE_SOURCES: readonly Emitter[] = [
  { x: -0.7, y: 2.9, z: 0 },
  { x: -0.15, y: 3.05, z: 0.1 },
  { x: 0.4, y: 2.95, z: -0.1 },
  { x: 0.9, y: 2.85, z: 0.2 },
];

function buildMill(
  mill: THREE.Group,
  timber: THREE.Material,
  iron: THREE.Material,
  plank: THREE.Material,
  roofMat: THREE.Material,
  waterMat: THREE.Material,
): { wheel: THREE.Group; cams: THREE.Group; stamps: THREE.Object3D[] } {
  const box = (
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mill.add(mesh);
    return mesh;
  };

  const run = (
    geom: THREE.BufferGeometry,
    mat: THREE.Material,
    places: readonly [number, number, number, number?][],
  ) => {
    const mesh = new THREE.InstancedMesh(geom, mat, places.length);
    places.forEach(([x, y, z, rot], i) => {
      millDummy.position.set(x, y, z);
      millDummy.rotation.set(0, rot ?? 0, 0);
      millDummy.scale.set(1, 1, 1);
      millDummy.updateMatrix();
      mesh.setMatrixAt(i, millDummy.matrix);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mill.add(mesh);
  };

  box(8.2, 0.18, 6.2, plank, 0, 0.09, 0.15);
  const posts: [number, number][] = [
    [-3.75, -2.75],
    [3.75, -2.75],
    [-3.75, 2.75],
    [3.75, 2.75],
    [0, -2.75],
    [0, 2.75],
    [-3.75, 0],
    [3.75, 0],
  ];
  for (const [x, z] of posts) box(0.32, 4.9, 0.32, timber, x, 2.55, z);
  box(8.0, 0.28, 0.28, timber, 0, 5.05, -2.75);
  box(8.0, 0.28, 0.28, timber, 0, 5.05, 2.75);
  box(0.28, 0.28, 5.8, timber, -3.75, 5.05, 0);
  box(0.28, 0.28, 5.8, timber, 3.75, 5.05, 0);

  const wallBoard = new THREE.BoxGeometry(0.24, 3.7, 0.07);
  const batten = new THREE.BoxGeometry(0.06, 3.75, 0.04);
  const back: [number, number, number, number?][] = [];
  const backBatten: [number, number, number, number?][] = [];
  for (let i = 0; i < 30; i++) {
    const x = -3.5 + i * 0.24;
    back.push([x, 2.15, -2.82]);
    if (i % 2 === 0) backBatten.push([x, 2.15, -2.76]);
  }
  run(wallBoard, plank, back);
  run(batten, timber, backBatten);

  const sideBoard = new THREE.BoxGeometry(0.07, 3.7, 0.24);
  const sideBatten = new THREE.BoxGeometry(0.04, 3.75, 0.06);
  for (const side of [-1, 1]) {
    const boards: [number, number, number, number?][] = [];
    const battens: [number, number, number, number?][] = [];
    for (let i = 0; i < 22; i++) {
      const z = -2.5 + i * 0.24;
      boards.push([side * 3.88, 2.15, z]);
      if (i % 2 === 0) battens.push([side * 3.94, 2.15, z]);
    }
    run(sideBoard, plank, boards);
    run(sideBatten, timber, battens);
  }

  const front: [number, number, number, number?][] = [];
  const frontHeader: [number, number, number, number?][] = [];
  for (let i = 0; i < 32; i++) {
    const x = -3.7 + i * 0.24;
    if (Math.abs(x) < 2.15) frontHeader.push([x, 4.15, 2.82]);
    else front.push([x, 2.15, 2.82]);
  }
  run(wallBoard, plank, front);
  run(new THREE.BoxGeometry(0.24, 1.15, 0.07), plank, frontHeader);
  const door = box(1.15, 2.7, 0.08, timber, 2.15, 1.4, 2.95);
  door.rotation.y = -0.85;

  const roofL = box(4.7, 0.1, 6.6, roofMat, -1.85, 5.85, 0);
  roofL.rotation.z = 0.42;
  const roofR = box(4.7, 0.1, 6.6, roofMat, 1.85, 5.85, 0);
  roofR.rotation.z = -0.42;

  const wheel = new THREE.Group();
  wheel.name = 'mill-wheel';
  wheel.position.set(-5.45, 3.25, 0.35);
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(1.72, 0.09, 8, 28), timber));
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.05, 6, 24), timber));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.45, 0.08), timber);
    spoke.position.set(Math.cos(a) * 0.72, Math.sin(a) * 0.72, 0);
    spoke.rotation.z = a;
    wheel.add(spoke);
    const bucket = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.34), plank);
    bucket.position.set(Math.cos(a) * 1.58, Math.sin(a) * 1.58, 0);
    bucket.rotation.z = a + Math.PI / 2;
    wheel.add(bucket);
    const slug = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.24), waterMat);
    slug.name = 'wheel-water';
    slug.position.set(Math.cos(a) * 1.48, Math.sin(a) * 1.48, 0);
    wheel.add(slug);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 8), iron);
  axle.rotation.x = Math.PI / 2;
  wheel.add(axle);

  box(0.28, 3.5, 0.28, timber, -5.45, 1.75, -0.55);
  box(0.28, 3.5, 0.28, timber, -5.45, 1.75, 1.25);
  box(0.22, 0.22, 2.1, timber, -5.45, 3.25, 0.35);

  const flumeY = 5.05;
  box(3.6, 0.1, 0.62, timber, -7.15, flumeY, 0.35);
  box(3.6, 0.22, 0.06, timber, -7.15, flumeY + 0.14, 0.08);
  box(3.6, 0.22, 0.06, timber, -7.15, flumeY + 0.14, 0.62);
  const flumeWater = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.08, 0.4), waterMat);
  flumeWater.position.set(-7.15, flumeY + 0.1, 0.35);
  mill.add(flumeWater);
  for (const x of [-8.4, -6.5]) {
    box(0.16, flumeY, 0.16, timber, x, flumeY * 0.5, -0.15);
    box(0.16, flumeY, 0.16, timber, x, flumeY * 0.5, 0.85);
    box(0.16, 0.14, 1.2, timber, x, flumeY - 0.05, 0.35);
  }
  const pour = new THREE.Group();
  pour.name = 'mill-pour';
  for (let i = 0; i < 6; i++) {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), waterMat);
    drop.position.set(-5.55, 4.85 - i * 0.28, 0.35);
    pour.add(drop);
  }
  mill.add(pour);
  const tail = new THREE.Mesh(new THREE.CircleGeometry(1.15, 16), waterMat);
  tail.rotation.x = -Math.PI / 2;
  tail.position.set(-5.45, 0.04, 0.55);
  mill.add(tail);

  const cams = new THREE.Group();
  cams.name = 'mill-cams';
  cams.position.set(0, 3.65, 0.15);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.5, 10), iron);
  shaft.rotation.z = Math.PI / 2;
  cams.add(shaft);
  const stamps: THREE.Object3D[] = [];
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x3e4246, roughness: 0.35, metalness: 0.7 });
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xd9d4c6, roughness: 0.22, metalness: 0.82 });
  for (let i = 0; i < 5; i++) {
    const x = -1.6 + i * 0.8;
    const lobe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.16), iron);
    const phase = (i / 5) * Math.PI * 2;
    lobe.position.set(x, Math.sin(phase) * 0.2, Math.cos(phase) * 0.2);
    cams.add(lobe);
    const stamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.15, 0.16), iron);
    stamp.position.set(x, 2.05, 0.2);
    stamp.name = `stamp-${i}`;
    const tappet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.28), iron);
    tappet.position.y = 0.92;
    stamp.add(tappet);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.32), shoeMat);
    shoe.position.y = -1.05;
    stamp.add(shoe);
    stamps.push(stamp);
    mill.add(stamp);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.72), plateMat);
    plate.position.set(x, 0.78, 0.2);
    mill.add(plate);
  }
  box(0.16, 1.6, 0.16, timber, -2.15, 3.85, 0.15);
  box(0.16, 1.6, 0.16, timber, 2.15, 3.85, 0.15);
  const mortar = box(4.7, 0.62, 1.2, iron, 0, 0.5, 0.22);
  mortar.name = 'mortar-box';
  const apron = box(4.5, 0.08, 0.85, plank, 0, 0.28, 1.05);
  apron.rotation.x = -0.42;
  const pulpMat = new THREE.MeshStandardMaterial({ color: 0x8d7a52, roughness: 0.38, metalness: 0.08 });
  for (let i = 0; i < 7; i++) {
    const pulp = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1 + (i % 3) * 0.04, 0), pulpMat);
    pulp.position.set(-1.5 + i * 0.5, 0.16, 1.35 + (i % 2) * 0.12);
    mill.add(pulp);
  }
  for (let i = 0; i < 4; i++) {
    const lump = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09, 0), shoeMat);
    lump.position.set(0.7 + (i % 2) * 0.2, 0.95, 1.15);
    mill.add(lump);
  }

  const workLight = new THREE.PointLight(0xffc48a, 8, 14, 2);
  workLight.position.set(0.2, 2.8, 1.5);
  workLight.castShadow = false;
  mill.add(workLight);
  mill.add(wheel, cams);
  return { wheel, cams, stamps };
}

function buildBurningShed(
  shed: THREE.Group,
  wall: THREE.Material,
  roofMat: THREE.Material,
): { roof: THREE.Group } {
  const board = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    shed.add(mesh);
  };
  for (const [x, z] of [
    [-1.15, -1.02],
    [1.15, -1.02],
    [-1.15, 1.02],
    [1.15, 1.02],
  ] as const) {
    board(0.14, 2.35, 0.14, x, 1.18, z);
  }
  for (let i = 0; i < 9; i++) board(0.26, 2.2, 0.06, -1.02 + i * 0.25, 1.12, -1.05);
  for (let i = 0; i < 8; i++) board(0.06, 2.2, 0.24, -1.18, 1.12, -0.85 + i * 0.24);
  for (let i = 0; i < 9; i++) {
    const z = -0.95 + i * 0.23;
    const windowed = Math.abs(z + 0.42) < 0.2 || Math.abs(z - 0.42) < 0.2;
    if (windowed) {
      board(0.06, 0.72, 0.2, 1.18, 0.4, z);
      board(0.06, 0.42, 0.2, 1.18, 1.95, z);
    } else {
      board(0.06, 2.2, 0.22, 1.18, 1.12, z);
    }
  }
  for (const z of [-0.42, 0.42]) {
    board(0.08, 0.08, 0.55, 1.22, 1.62, z);
    board(0.08, 0.08, 0.55, 1.22, 1.12, z);
    board(0.08, 0.55, 0.08, 1.22, 1.37, z - 0.24);
    board(0.08, 0.55, 0.08, 1.22, 1.37, z + 0.24);
  }
  for (let i = 0; i < 9; i++) {
    const x = -1.02 + i * 0.25;
    if (Math.abs(x) < 0.38) board(0.24, 0.55, 0.06, x, 1.9, 1.05);
    else board(0.24, 2.2, 0.06, x, 1.12, 1.05);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.45, 0.06), wall);
  door.position.set(0.85, 0.75, 1.15);
  door.rotation.y = -0.7;
  door.castShadow = true;
  shed.add(door);

  const roof = new THREE.Group();
  roof.position.y = 2.35;
  const left = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 2.55), roofMat);
  left.position.set(-0.62, 0.26, 0);
  left.rotation.z = 0.4;
  left.castShadow = true;
  const right = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 2.55), roofMat);
  right.position.set(0.62, 0.26, 0);
  right.rotation.z = -0.4;
  right.castShadow = true;
  roof.add(left, right);
  shed.add(roof);
  return { roof };
}

function makeSoftPoints(
  name: string,
  count: number,
  color: number,
  size: number,
  blending: THREE.Blending,
): THREE.Points {
  const positions = new Float32Array(count * 3);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pts = new THREE.Points(
    geom,
    new THREE.PointsMaterial({
      color,
      size,
      map: softDiscTexture(),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending,
      sizeAttenuation: true,
      alphaTest: 0.02,
    }),
  );
  pts.name = name;
  pts.frustumCulled = false;
  return pts;
}

function placeCloud(
  points: THREE.Points,
  time: number,
  spread: number,
  height: number,
  emitters: readonly Emitter[],
  wind: { x: number; z: number },
  billow: number,
): void {
  const attr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
  const sources = Math.max(1, emitters.length);
  for (let i = 0; i < attr.count; i++) {
    const src = emitters[i % sources]!;
    const seed = i * 1.37;
    const life = (time + seed) % 1;
    const curl = Math.sin(seed * 2.1 + time * 1.4) * billow * life;
    attr.setXYZ(
      i,
      src.x + Math.sin(seed * 4) * spread * (0.4 + life) + wind.x * life * life + curl * 0.35,
      src.y + life * height + Math.sin(time * 3 + seed) * 0.06,
      src.z + Math.cos(seed * 3) * spread * 0.7 + wind.z * life * life + curl,
    );
  }
  attr.needsUpdate = true;
}
