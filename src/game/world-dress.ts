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
  const tentSpots = [
    [-18, 22],
    [8, 18],
    [4, 30],
    [-16, 30],
    [14, 26],
  ];
  const canvas = new THREE.MeshStandardMaterial({ color: 0xcbb892, roughness: 0.9, side: THREE.DoubleSide });
  for (const [x, z] of tentSpots) {
    const tent = new THREE.Group();
    const y = groundY(x!, z!);
    tent.position.set(x!, y, z!);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.3), canvas);
    left.rotation.z = 0.7;
    left.position.set(-0.35, 0.7, 0);
    const right = left.clone();
    right.rotation.z = -0.7;
    right.position.x = 0.35;
    tent.add(left, right);
    tents.add(tent);
  }
  scene.add(tents);

  const hands = [-1, 0, 1].map((i) => {
    const npc = spawnNpc(0xc4a574, 0x4a3420);
    npc.visible = false;
    npc.position.set(24 + i * 3.2, groundY(24 + i * 3.2, 8 + i * 6), 8 + i * 6);
    npc.rotation.y = -0.4;
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

  return {
    update(eventId, time, dt) {
      const target = eventId === 'flood' ? 1 : eventId === 'drought' ? -1 : 0;
      stage += (target - stage) * Math.min(1, dt * 0.45);
      dry += ((eventId === 'drought' ? 1 : 0) - dry) * Math.min(1, dt * 0.35);
      placeBars(Math.max(0, stage));
      tents.visible = eventId === 'rush';
      hands.forEach((npc, i) => {
        npc.visible = eventId === 'rush';
        if (npc.visible) poseNpc(npc, time, 'shovel', i);
      });
      const rise = stage > 0 ? 0.12 + stage * 0.5 : stage * 0.4;
      const spread = 1 + (stage > 0 ? stage * 0.4 : stage * 0.28);
      return { rise, spread, dry };
    },
  };
}
