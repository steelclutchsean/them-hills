import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { poseNpc, spawnNpc } from '@/game/crew';

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

  const timber = new THREE.MeshStandardMaterial({ color: 0x6a4324, roughness: 0.88 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.5, metalness: 0.5 });
  const plank = new THREE.MeshStandardMaterial({ color: 0x8a6240, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5c3a28, roughness: 0.92 });

  const mill = new THREE.Group();
  mill.name = 'stamp-mill';
  mill.position.copy(millPos);
  const shell = new THREE.Mesh(millShell(), plank);
  shell.castShadow = true;
  shell.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.16, 3.2), roofMat);
  roof.position.set(0, 2.7, 0);
  roof.rotation.z = 0.08;
  roof.castShadow = true;
  mill.add(shell, roof);

  const wheel = new THREE.Group();
  wheel.name = 'mill-wheel';
  wheel.position.set(-2.15, 1.15, 0.2);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 6, 16), timber);
  wheel.add(rim);
  for (let i = 0; i < 8; i++) {
    const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.28), timber);
    const a = (i / 8) * Math.PI * 2;
    paddle.position.set(Math.cos(a) * 0.72, Math.sin(a) * 0.72, 0);
    paddle.rotation.z = a;
    wheel.add(paddle);
  }
  const cams = new THREE.Group();
  cams.name = 'mill-cams';
  cams.position.set(0, 2.15, 0);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8), iron);
  shaft.rotation.z = Math.PI / 2;
  cams.add(shaft);
  const stamps: THREE.Object3D[] = [];
  for (let i = 0; i < 3; i++) {
    const lobe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.14), iron);
    lobe.position.set(-0.45 + i * 0.45, 0.1, 0);
    cams.add(lobe);
    const stamp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.15, 6), iron);
    stamp.position.set(-0.45 + i * 0.45, 1.2, 0.15);
    stamp.name = `stamp-${i}`;
    stamps.push(stamp);
    mill.add(stamp);
  }
  const mortar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.32, 0.8), iron);
  mortar.position.set(0, 0.2, 0.15);
  const flume = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 2.2), timber);
  flume.position.set(-1.5, 1.7, 0);
  mill.add(wheel, cams, mortar, flume);
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
  const walls = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.1, 2.1), shedMats.wall);
  walls.position.y = 1.05;
  walls.castShadow = true;
  const shedRoof = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.14, 2.4), shedMats.roof);
  shedRoof.position.y = 2.2;
  shedRoof.castShadow = true;
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.3, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.9 }),
  );
  door.position.set(0, 0.65, 1.06);
  shed.add(walls, shedRoof, door);

  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xff6a1a,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16 + (i % 3) * 0.06, 0.7 + (i % 4) * 0.2, 6), flameMat);
    flame.position.set((i - 3) * 0.28, 1.5 + (i % 2) * 0.35, (i % 3) * 0.2 - 0.2);
    flames.push(flame);
    shed.add(flame);
  }
  const fireLight = new THREE.PointLight(0xff6a2a, 0, 12, 2);
  fireLight.position.set(0, 1.8, 0);
  fireLight.castShadow = false;
  shed.add(fireLight);

  const smoke = makePoints(48, 0x6a645c, 0.35);
  const embers = makePoints(32, 0xff8a3a, 0.08);
  smoke.name = 'fire-smoke';
  embers.name = 'fire-embers';
  shed.add(smoke, embers);
  scene.add(shed);

  const bucketLine = new THREE.Group();
  bucketLine.name = 'bucket-line';
  bucketLine.position.copy(firePos);
  bucketLine.visible = false;
  for (let i = 0; i < 3; i++) {
    const figure = spawnNpc(i === 1 ? 0x6a3a34 : 0x4a4038, 0x2a2218);
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
  silas.position.set(millPos.x + 1.35, millPos.y, millPos.z + 0.4);
  silas.rotation.y = Math.PI * 0.85;
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
    flames.forEach((flame) => {
      flame.visible = false;
    });
    fireLight.intensity = 0;
    smoke.visible = false;
    embers.visible = false;
  }

  function applyRebuild(): void {
    charred = false;
    shedMats.wall.color.copy(wallColor);
    shedMats.roof.color.copy(roofColor);
    shedRoof.rotation.x = 0;
    shedRoof.position.y = 2.2;
  }

  const near = (a: THREE.Vector3, b: THREE.Vector3, r: number) => Math.hypot(a.x - b.x, a.z - b.z) < r;

  return {
    millPos,
    companyPos,
    firePos,
    nearMill: (pos) => near(pos, millPos, 3.2),
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
      cams.rotation.x = time * 2.4;
      stamps.forEach((stamp, i) => {
        const lift = Math.max(0, Math.sin(time * 2.4 + i * 2.1));
        stamp.position.y = 0.85 + lift * 0.7;
      });
      poseNpc(silas, time, 'shovel', 1);
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
        flames.forEach((flame, i) => {
          flame.visible = true;
          flame.scale.y = 0.75 + Math.sin(time * 16 + i) * 0.28;
          flame.position.y = 1.35 + Math.abs(Math.sin(time * 9 + i)) * 0.45;
        });
        fireLight.intensity = 22 + Math.sin(time * 17) * 8;
        smoke.visible = true;
        embers.visible = true;
        driftPoints(smoke, time, 0.55, 2.4);
        driftPoints(embers, time * 1.6, 1.1, 1.6);
        const maeTarget = firePos.clone().add(new THREE.Vector3(2.4, 0, 1.6));
        mae.position.lerp(new THREE.Vector3(maeTarget.x, maeHome.y, maeTarget.z), Math.min(1, dt * 0.8));
      } else {
        flames.forEach((flame) => {
          flame.visible = false;
        });
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

function millShell(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const floor = new THREE.BoxGeometry(3.6, 0.2, 2.6);
  floor.translate(0, 0.1, 0);
  parts.push(floor);
  for (const [x, z] of [
    [-1.6, -1.1],
    [1.6, -1.1],
    [-1.6, 1.1],
    [1.6, 1.1],
  ] as const) {
    const post = new THREE.BoxGeometry(0.18, 2.5, 0.18);
    post.translate(x, 1.35, z);
    parts.push(post);
  }
  const back = new THREE.BoxGeometry(3.4, 1.8, 0.12);
  back.translate(0, 1.2, -1.15);
  parts.push(back);
  return mergeBox(parts);
}

function mergeBox(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts) ?? parts[0]!;
}

function makePoints(count: number, color: number, size: number): THREE.Points {
  const positions = new Float32Array(count * 3);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(
    geom,
    new THREE.PointsMaterial({
      color,
      size,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    }),
  );
}

function driftPoints(points: THREE.Points, time: number, rise: number, spread: number): void {
  const attr = points.geometry.getAttribute('position') as THREE.BufferAttribute;
  const n = attr.count;
  for (let i = 0; i < n; i++) {
    const seed = i * 0.37;
    const life = (time * rise + seed) % 1;
    attr.setXYZ(
      i,
      Math.sin(seed * 4) * spread * life,
      life * 3.2,
      Math.cos(seed * 3) * spread * 0.4,
    );
  }
  attr.needsUpdate = true;
}
