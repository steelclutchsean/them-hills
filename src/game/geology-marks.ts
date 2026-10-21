import * as THREE from 'three';
import { payMarks, type BoulderPoint, type PayMark } from '@/game/geology';
import type { ColorSample } from '@/save/schema';
import type { StreamConfig } from '@/game/stream';

// Visual tells for the pay streak. These sit on the banks and stick up
// through the creek so a player can learn them on foot. Sampling leaves
// a hole and a board with the color count. Terrain itself is untouched.

export interface GeologyMarks {
  sync(payShift: Record<string, number>, samples: readonly ColorSample[]): void;
  counts(): { marks: number; holes: number };
}

export function createGeologyMarks(
  scene: THREE.Scene,
  streams: readonly StreamConfig[],
  boulders: readonly BoulderPoint[],
  groundY: (x: number, z: number) => number,
): GeologyMarks {
  const root = new THREE.Group();
  root.name = 'geology-marks';
  scene.add(root);

  const sand = makeBatch(root, new THREE.BoxGeometry(1.35, 0.035, 0.28), 0x1c1814, 80);
  const shore = makeBatch(root, new THREE.CircleGeometry(0.85, 7), 0xc4a36a, 80);
  const gravel = makeBatch(root, new THREE.DodecahedronGeometry(0.11, 0), 0xb08960, 120);
  const bedrock = makeBatch(root, new THREE.BoxGeometry(0.9, 0.42, 0.55), 0x7d848c, 40);
  const quartz = makeBatch(root, new THREE.OctahedronGeometry(0.1, 0), 0xf3efe4, 60);
  const lee = makeBatch(root, new THREE.CircleGeometry(0.42, 8), 0x2a241c, 24);

  const holes = new THREE.Group();
  holes.name = 'sample-holes';
  root.add(holes);

  let markCount = 0;
  let holeCount = 0;
  let shiftKey = '';
  let sampleKey = '';

  function lay(marks: readonly PayMark[]): void {
    const buckets = {
      sand: [] as THREE.Matrix4[],
      shore: [] as THREE.Matrix4[],
      gravel: [] as THREE.Matrix4[],
      bedrock: [] as THREE.Matrix4[],
      quartz: [] as THREE.Matrix4[],
      lee: [] as THREE.Matrix4[],
    };
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const place = (list: THREE.Matrix4[], x: number, y: number, z: number, yaw: number, sx = 1, sy = 1, sz = 1) => {
      if (list.length >= 120) return;
      p.set(x, y, z);
      q.setFromEuler(new THREE.Euler(list === buckets.shore || list === buckets.lee ? -Math.PI / 2 : 0, yaw, 0));
      s.set(sx, sy, sz);
      list.push(m.clone().compose(p, q, s));
    };
    for (const mark of marks) {
      const y = groundY(mark.x, mark.z);
      if (mark.habitat === 'inside_bend') {
        place(buckets.sand, mark.x, y + 0.05, mark.z, mark.flowYaw);
        place(buckets.shore, mark.x, y + 0.04, mark.z, mark.flowYaw, 1, 1, 1);
      } else if (mark.habitat === 'gravel_bar') {
        place(buckets.gravel, mark.x, y + 0.08, mark.z, mark.flowYaw, 1, 0.7, 1);
        place(buckets.gravel, mark.x + 0.18, y + 0.06, mark.z + 0.1, 0.4, 0.7, 0.5, 0.7);
      } else if (mark.habitat === 'bedrock') {
        place(buckets.bedrock, mark.x, y + 0.22, mark.z, mark.flowYaw);
      } else if (mark.habitat === 'boulder_lee') {
        place(buckets.lee, mark.x, y + 0.05, mark.z, mark.flowYaw);
      }
      if (mark.pay > 0.62 && mark.habitat !== 'tail') {
        place(buckets.quartz, mark.x + 0.22, y + 0.1, mark.z - 0.12, 0.6);
      }
    }
    sand.set(buckets.sand);
    shore.set(buckets.shore);
    gravel.set(buckets.gravel);
    bedrock.set(buckets.bedrock);
    quartz.set(buckets.quartz);
    lee.set(buckets.lee);
    markCount =
      buckets.sand.length +
      buckets.shore.length +
      buckets.gravel.length +
      buckets.bedrock.length +
      buckets.quartz.length +
      buckets.lee.length;
  }

  return {
    sync(payShift, samples) {
      const key = `${payShift.coyote_creek ?? 0}|${payShift.buckeye_run ?? 0}`;
      if (key !== shiftKey) {
        shiftKey = key;
        lay(payMarks(streams, payShift, boulders));
      }
      const sKey = samples.map((s) => s.id).join(',');
      if (sKey === sampleKey) return;
      sampleKey = sKey;
      while (holes.children.length > 0) {
        const child = holes.children[0]!;
        holes.remove(child);
      }
      for (const sample of samples) {
        const y = groundY(sample.x, sample.z);
        const hole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.2, 0.08, 8),
          new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1, flatShading: true }),
        );
        hole.position.set(sample.x, y + 0.03, sample.z);
        hole.name = 'sample-hole';
        holes.add(hole);
        const board = new THREE.Mesh(
          new THREE.PlaneGeometry(0.28, 0.16),
          new THREE.MeshBasicMaterial({ map: countTexture(sample.colors), transparent: true }),
        );
        board.position.set(sample.x, y + 0.42, sample.z);
        board.name = 'sample-count';
        holes.add(board);
        const peg = new THREE.Mesh(
          new THREE.BoxGeometry(0.02, 0.36, 0.02),
          new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.8 }),
        );
        peg.position.set(sample.x, y + 0.22, sample.z);
        holes.add(peg);
      }
      holeCount = samples.length;
    },
    counts: () => ({ marks: markCount, holes: holeCount }),
  };
}

function makeBatch(
  parent: THREE.Group,
  geometry: THREE.BufferGeometry,
  color: number,
  capacity: number,
): { set(matrices: readonly THREE.Matrix4[]): void } {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.count = 0;
  mesh.name = `geo-${color.toString(16)}`;
  parent.add(mesh);
  const dummy = new THREE.Matrix4();
  return {
    set(matrices) {
      const n = Math.min(capacity, matrices.length);
      for (let i = 0; i < n; i++) mesh.setMatrixAt(i, matrices[i] ?? dummy);
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

function countTexture(colors: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#2a2118';
    ctx.fillRect(0, 0, 128, 64);
    ctx.strokeStyle = '#e2c27a';
    ctx.strokeRect(3, 3, 122, 58);
    ctx.fillStyle = colors >= 6 ? '#f0d060' : '#d9d2c5';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(colors), 64, 34);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
