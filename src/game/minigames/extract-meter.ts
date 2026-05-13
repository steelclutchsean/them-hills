import * as THREE from 'three';
import { forceTopDraw } from './_util';
import type { MinigameViz } from './types';

// Chip-out progress meter for the EXTRACT stage. Differs from the strike
// timing meter: this one is purely a fill bar that grows as the player
// taps INTERACT and slowly slips back without input. No moving target;
// the only feedback is the bar height + a brief gold spark on each tap.

const BAR_WIDTH = 0.42;
const BAR_HEIGHT = 0.05;
const FLASH_DURATION_SEC = 0.18;

type ExtractViz = Extract<MinigameViz, { kind: 'extract' }>;

export interface ExtractMeterView {
  group: THREE.Group;
  update(viz: ExtractViz): void;
  setVisible(v: boolean): void;
}

export function createExtractMeterView(): ExtractMeterView {
  const group = new THREE.Group();
  group.name = 'extract_meter';

  // Dark background.
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(BAR_WIDTH, BAR_HEIGHT),
    new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.85 }),
  );
  group.add(bg);

  // Fill — anchored at left edge so scale-x grows from the start.
  const fillMat = new THREE.MeshBasicMaterial({ color: 0xe6c060 });
  const fillGeom = new THREE.PlaneGeometry(BAR_WIDTH, BAR_HEIGHT);
  // Translate the geometry so its "origin" is the left edge.
  fillGeom.translate(BAR_WIDTH / 2, 0, 0);
  const fill = new THREE.Mesh(fillGeom, fillMat);
  fill.position.set(-BAR_WIDTH / 2, 0, 0.001);
  group.add(fill);

  // Spark — a small bright square that pops at the bar's leading edge
  // when the player taps. Fades within FLASH_DURATION_SEC.
  const sparkMat = new THREE.MeshBasicMaterial({
    color: 0xfff4a0,
    transparent: true,
    opacity: 0,
  });
  const spark = new THREE.Mesh(new THREE.PlaneGeometry(0.024, BAR_HEIGHT * 1.5), sparkMat);
  spark.position.z = 0.002;
  group.add(spark);

  group.position.set(0, 0.08, -0.55);

  function update(viz: ExtractViz): void {
    const p = Math.max(0, Math.min(1, viz.progress));
    fill.scale.x = p > 0 ? p : 0.001;

    // Spark sits at the current fill edge.
    spark.position.x = (p - 0.5) * BAR_WIDTH;

    if (viz.lastTapFlashSec < FLASH_DURATION_SEC) {
      const t = Math.max(0, Math.min(1, viz.lastTapFlashSec / FLASH_DURATION_SEC));
      sparkMat.opacity = 0.85 * (1 - t);
    } else {
      sparkMat.opacity = 0;
    }
  }

  function setVisible(v: boolean): void {
    group.visible = v;
  }

  setVisible(false);
  forceTopDraw(group);
  return { group, update, setVisible };
}
