import * as THREE from 'three';
import { poseNpc, spawnNpc } from '@/game/crew';
import type { Watercourse } from '@/game/watercourse';

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
  // North of the store, in the open meadow the rush camera looks across.
  const tentSpots = [
    [-6, 21],
    [-1, 24],
    [3, 20],
    [1, 27],
    [6, 23],
  ];
  const canvas = new THREE.MeshStandardMaterial({ color: 0xf0e2c4, roughness: 0.84, side: THREE.DoubleSide });
  const ridge = new THREE.MeshStandardMaterial({ color: 0x6b4428, roughness: 0.9 });
  tentSpots.forEach(([x, z], index) => {
    const tent = new THREE.Group();
    tent.name = index === 0 ? 'rush-tent' : `rush-tent-${index}`;
    const y = groundY(x!, z!);
    tent.position.set(x!, y, z!);
    // The wide canvas faces south, which is the direction the rush camera looks from.
    tent.rotation.y = Math.PI / 2 + index * 0.12;
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.05, 3.3), canvas);
    left.rotation.z = 0.62;
    left.position.set(-0.7, 1.28, 0);
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.05, 3.3), canvas);
    right.rotation.z = -0.62;
    right.position.set(0.7, 1.28, 0);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 5), ridge);
    pole.rotation.z = Math.PI / 2;
    pole.position.y = 2.55;
    tent.add(left, right, pole);
    tents.add(tent);
  });
  scene.add(tents);

  const hands = [
    [2.1, 18.4],
    [0.4, 21.6],
    [-3.2, 22.8],
  ].map(([x, z], i) => {
    const npc = spawnNpc(0xc4a574, 0x4a3420);
    npc.name = i === 0 ? 'rush-prospector' : `rush-prospector-${i}`;
    npc.visible = false;
    npc.position.set(x!, groundY(x!, z!), z!);
    npc.rotation.y = 0;
    scene.add(npc);
    return npc;
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
    hands.forEach((npc, i) => {
      npc.visible = true;
      npc.rotation.y = 0;
      poseNpc(npc, time, 'shovel', i);
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
        hands.forEach((npc) => {
          npc.visible = false;
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
        hands.forEach((npc) => {
          npc.visible = false;
        });
      }
      return levels();
    },
  };
}
