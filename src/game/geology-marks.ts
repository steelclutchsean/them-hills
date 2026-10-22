import * as THREE from 'three';
import { payMarks, type BoulderPoint, type PayMark } from '@/game/geology';
import type { ColorSample, Habitat } from '@/save/schema';
import type { StreamConfig } from '@/game/stream';

// Pay streaks are splats in the terrain shader. Sample holes stay as flat
// decals on the ground so a color count is readable without a prop.

export interface PaySplat {
  x: number;
  z: number;
  radius: number;
  kind: number;
}

export interface GeologyMarks {
  sync(payShift: Record<string, number>, samples: readonly ColorSample[]): void;
  counts(): { marks: number; holes: number };
}

const KIND: Partial<Record<Habitat, number>> = {
  inside_bend: 1,
  boulder_lee: 1,
  gravel_bar: 2,
  bedrock: 4,
};

export function createGeologyMarks(
  scene: THREE.Scene,
  streams: readonly StreamConfig[],
  boulders: readonly BoulderPoint[],
  groundY: (x: number, z: number) => number,
  paint: (splats: readonly PaySplat[]) => void,
): GeologyMarks {
  const root = new THREE.Group();
  root.name = 'geology-marks';
  scene.add(root);
  const holes = new THREE.Group();
  holes.name = 'sample-holes';
  root.add(holes);

  let markCount = 0;
  let holeCount = 0;
  let shiftKey = '';
  let sampleKey = '';

  function lay(marks: readonly PayMark[]): void {
    const ranked = [...marks].sort((a, b) => b.pay - a.pay);
    const chosen: PaySplat[] = [];
    const take = (mark: PayMark, kind: number, radius: number, spacing: number) => {
      if (chosen.length >= 32) return;
      for (const have of chosen) {
        if (Math.hypot(have.x - mark.x, have.z - mark.z) < spacing) return;
      }
      chosen.push({ x: mark.x, z: mark.z, radius, kind });
    };
    for (const spacing of [7, 4, 2.2]) {
      for (const mark of ranked) {
        const kind = KIND[mark.habitat];
        if (!kind) continue;
        const radius = kind === 2 ? 2.1 : kind === 4 ? 1.5 : 2.4;
        take(mark, kind, radius, spacing);
      }
      if (chosen.length >= 24) break;
    }
    for (const mark of ranked) {
      if (mark.pay < 0.62 || mark.habitat === 'tail') continue;
      take(mark, 3, 0.85, 3.5);
    }
    paint(chosen);
    markCount = chosen.length;
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
        const y = groundY(sample.x, sample.z) + 0.025;
        const disc = new THREE.Mesh(
          new THREE.CircleGeometry(0.34, 12),
          new THREE.MeshStandardMaterial({
            color: 0x241910,
            roughness: 1,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          }),
        );
        disc.rotation.x = -Math.PI / 2;
        disc.position.set(sample.x, y, sample.z);
        disc.name = 'sample-hole';
        const tag = new THREE.Mesh(
          new THREE.CircleGeometry(0.16, 10),
          new THREE.MeshBasicMaterial({
            map: countTexture(sample.colors),
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
          }),
        );
        tag.rotation.x = -Math.PI / 2;
        tag.position.set(sample.x, y + 0.01, sample.z);
        tag.name = 'sample-count';
        holes.add(disc, tag);
      }
      holeCount = samples.length;
    },
    counts: () => ({ marks: markCount, holes: holeCount }),
  };
}

function countTexture(colors: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#3a2a1c';
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors >= 6 ? '#e2b34a' : '#e7d7b4';
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(colors), 64, 68);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
