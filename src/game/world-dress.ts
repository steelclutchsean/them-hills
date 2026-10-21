import * as THREE from 'three';
import { bankPoint } from '@/game/biomes';
import { poseNpc, spawnNpc } from '@/game/crew';
import { courseById, type Watercourse } from '@/game/watercourse';
import { PALETTE } from '@/render/palette';
import { softDiscTexture } from '@/render/soft-disc';

// Flood, drought, and the rush, as changes to the ground rather than a banner.
// Water level lives on the stream meshes. This module moves the gravel bars,
// and it puts tents and working prospectors on the creek when the rush is on.

interface Bar {
  x: number;
  y: number;
  z: number;
  tx: number;
  tz: number;
  side: number;
}

export interface WorldDress {
  update(eventId: string, time: number, dt: number): { rise: number; spread: number; dry: number };
  /** Jump the dress to the settled state of an event. Gameplay still lerps. */
  snap(eventId: string): { rise: number; spread: number; dry: number };
}

function tentCloth(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[world-dress] no 2d');
  ctx.fillStyle = '#cbb892';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#5c3a22';
  ctx.lineWidth = 3;
  for (let y = 16; y < 128; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y + 4);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(42, 26, 14, 0.55)';
  ctx.lineWidth = 2;
  for (let x = 8; x < 128; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 3, 128);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(70, 42, 22, 0.35)';
  ctx.fillRect(0, 100, 128, 28);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function wallTent(
  canvas: THREE.Material,
  wood: THREE.Material,
  index: number,
): THREE.Group {
  const tent = new THREE.Group();
  tent.name = index === 0 ? 'rush-tent' : `rush-tent-${index}`;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.35, 3.1), canvas);
  wall.position.y = 0.72;
  const roofL = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.06, 3.25), canvas);
  roofL.position.set(-0.55, 1.55, 0);
  roofL.rotation.z = 0.42;
  const roofR = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.06, 3.25), canvas);
  roofR.position.set(0.55, 1.48, 0.05);
  roofR.rotation.z = -0.5;
  const sag = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.04, 2.4), canvas);
  sag.position.set(0, 1.42, 0.1);
  sag.rotation.x = 0.12;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.7, 5), wood);
  pole.position.y = 0.85;
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.85, 6), wood);
  pipe.position.set(0.7, 1.85, -0.9);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.08, 6), wood);
  cap.position.set(0.7, 2.28, -0.9);
  tent.add(wall, roofL, roofR, sag, pole, pipe, cap);
  const guy = new THREE.CylinderGeometry(0.012, 0.012, 1.5, 3);
  for (const [x, z, rot] of [
    [-1.35, 1.4, 0.5],
    [1.35, 1.4, -0.5],
    [-1.35, -1.4, 0.6],
    [1.35, -1.4, -0.55],
  ] as const) {
    const line = new THREE.Mesh(guy, wood);
    line.position.set(x, 0.7, z);
    line.rotation.z = rot;
    tent.add(line);
  }
  const fire = new THREE.Group();
  fire.position.set(1.55, 0, 0.2);
  const ember = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshStandardMaterial({
      color: 0xff7a28,
      emissive: 0xff5a18,
      emissiveIntensity: 1.3,
    }),
  );
  ember.position.y = 0.12;
  ember.scale.y = 0.45;
  const flame = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: softDiscTexture(),
      color: 0xffb25a,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  flame.position.y = 0.45;
  flame.scale.setScalar(0.55);
  fire.add(ember, flame);
  tent.add(fire);
  return tent;
}

export function createWorldDress(
  scene: THREE.Scene,
  courses: readonly Watercourse[],
  groundY: (x: number, z: number) => number,
): WorldDress {
  const bars: Bar[] = [];
  for (const course of courses) {
    course.samples.forEach((sample, index) => {
      if (sample.bar === 0 || index % 3 !== 0) return;
      const side = sample.bar;
      const nx = -sample.tz;
      const nz = sample.tx;
      const x = sample.x + nx * side * (sample.halfWidth + 0.8);
      const z = sample.z + nz * side * (sample.halfWidth + 0.8);
      bars.push({
        x,
        z,
        y: groundY(x, z),
        tx: sample.tx,
        tz: sample.tz,
        side,
      });
    });
  }
  const gravel = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.42, 0),
    new THREE.MeshStandardMaterial({ color: 0xb7a48a, roughness: 0.95 }),
    Math.max(1, bars.length),
  );
  gravel.name = 'gravel-bars';
  gravel.castShadow = true;
  gravel.receiveShadow = true;
  gravel.count = bars.length;
  scene.add(gravel);
  const dummy = new THREE.Object3D();

  const tents = new THREE.Group();
  tents.name = 'rush-tents';
  tents.visible = false;
  const coyote = courseById(courses, 'coyote_creek');
  // Wall tents on the town-side bar, clear of the channel.
  const tentSpots = [4, 9, 14, 19, 24].map((z) => bankPoint(coyote, z, 3.1));
  const canvas = new THREE.MeshStandardMaterial({
    map: tentCloth(),
    color: 0xffffff,
    roughness: 0.9,
    flatShading: true,
    side: THREE.DoubleSide,
    transparent: false,
  });
  const ridgeMat = new THREE.MeshStandardMaterial({ color: PALETTE.timberDark, roughness: 0.9 });
  tentSpots.forEach((spot, index) => {
    const tent = wallTent(canvas, ridgeMat, index);
    tent.position.set(spot.x, groundY(spot.x, spot.z), spot.z);
    tent.rotation.y = 0.4 + index * 0.18;
    tents.add(tent);
  });
  scene.add(tents);

  const rockerMat = new THREE.MeshStandardMaterial({ color: PALETTE.timber, roughness: 0.86 });
  const hands = [7, 13, 20].map((z, i) => {
    const spot = bankPoint(coyote, z, 2.2);
    const rocker = new THREE.Group();
    rocker.name = i === 0 ? 'rush-rocker' : `rush-rocker-${i}`;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.95), rockerMat);
    box.position.y = 0.55;
    box.rotation.z = 0.18;
    const leg = new THREE.BoxGeometry(0.06, 0.5, 0.06);
    for (const [lx, lz] of [
      [-0.16, 0.35],
      [0.16, 0.35],
      [-0.16, -0.35],
      [0.16, -0.35],
    ] as const) {
      const mesh = new THREE.Mesh(leg, ridgeMat);
      mesh.position.set(lx, 0.25, lz);
      rocker.add(mesh);
    }
    rocker.add(box);
    rocker.position.set(spot.x, groundY(spot.x, spot.z), spot.z);
    rocker.visible = false;
    scene.add(rocker);
    const stand = bankPoint(coyote, z + 0.7, 3.3);
    const npc = spawnNpc(0xc4a574, 0x4a3420);
    npc.name = i === 0 ? 'rush-prospector' : `rush-prospector-${i}`;
    npc.visible = false;
    npc.position.set(stand.x, groundY(stand.x, stand.z), stand.z);
    npc.rotation.y = Math.atan2(spot.x - stand.x, spot.z - stand.z);
    scene.add(npc);
    return { npc, rocker };
  });

  let stage = 0;
  let dry = 0;

  function placeBars(shift: number): void {
    bars.forEach((bar, i) => {
      const along = shift * 6;
      const out = shift * 1.4;
      const nx = -bar.tz;
      const nz = bar.tx;
      dummy.position.set(
        bar.x + bar.tx * along + nx * bar.side * out,
        bar.y + shift * 0.45,
        bar.z + bar.tz * along + nz * bar.side * out,
      );
      dummy.rotation.set(0.2, i, 0.4);
      dummy.scale.setScalar(0.7 + (i % 4) * 0.18);
      dummy.updateMatrix();
      gravel.setMatrixAt(i, dummy.matrix);
    });
    gravel.instanceMatrix.needsUpdate = true;
  }
  placeBars(0);

  function levels(): { rise: number; spread: number; dry: number } {
    const rise = stage > 0 ? 0.12 + stage * 0.5 : stage * 0.4;
    const spread = 1 + (stage > 0 ? stage * 0.4 : stage * 0.28);
    return { rise, spread, dry };
  }

  function showRush(time: number): void {
    tents.visible = true;
    hands.forEach(({ npc, rocker }, i) => {
      npc.visible = true;
      rocker.visible = true;
      poseNpc(npc, time, 'rock', i);
    });
  }

  return {
    snap(eventId) {
      stage = eventId === 'flood' ? 1 : eventId === 'drought' ? -1 : 0;
      dry = eventId === 'drought' ? 1 : 0;
      placeBars(Math.max(0, stage));
      if (eventId === 'rush') showRush(0);
      else {
        tents.visible = false;
        hands.forEach(({ npc, rocker }) => {
          npc.visible = false;
          rocker.visible = false;
        });
      }
      return levels();
    },
    update(eventId, time, dt) {
      const target = eventId === 'flood' ? 1 : eventId === 'drought' ? -1 : 0;
      stage += (target - stage) * Math.min(1, dt * 0.45);
      dry += ((eventId === 'drought' ? 1 : 0) - dry) * Math.min(1, dt * 0.35);
      placeBars(Math.max(0, stage));
      if (eventId === 'rush') showRush(time);
      else {
        tents.visible = false;
        hands.forEach(({ npc, rocker }) => {
          npc.visible = false;
          rocker.visible = false;
        });
      }
      return levels();
    },
  };
}
