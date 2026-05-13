import * as THREE from 'three';
import type { MinigameViz } from './types';

// In-world rhythm meter for the CLASSIFY stage. Two concentric rings sit
// above the classifier:
//
//   - Outer target ring (static): the beat lands here.
//   - Inner pulsing ring (animates): grows from small to outer-target size
//     across each beat period. When the inner ring meets the outer, that's
//     the beat moment — tap INTERACT then.
//
// A flash overlay strobes briefly after a tap to confirm the input. A small
// row of bars below the rings counts remaining taps.

const TARGET_RADIUS = 0.13;
const INNER_MIN_FACTOR = 0.35;
const FLASH_DURATION_SEC = 0.25;

type ClassifyViz = Extract<MinigameViz, { kind: 'classify' }>;

export interface ClassifyMeterView {
  group: THREE.Group;
  update(viz: ClassifyViz): void;
  setVisible(v: boolean): void;
}

function makeRing(
  innerRadius: number,
  outerRadius: number,
  color: number,
  opacity: number,
): THREE.Mesh {
  const geom = new THREE.RingGeometry(innerRadius, outerRadius, 32);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geom, mat);
}

export function createClassifyMeterView(): ClassifyMeterView {
  const group = new THREE.Group();
  group.name = 'classify_meter';

  // Target ring — fat, dim. The beat lands when the inner pulse aligns.
  const targetRing = makeRing(TARGET_RADIUS * 0.92, TARGET_RADIUS, 0xeacf66, 0.6);
  targetRing.position.z = 0;
  group.add(targetRing);

  // Pulsing ring — bright, scales each frame from 0.35 → 1.0 of target.
  const pulseRing = makeRing(0.018, 0.022, 0xfff2b0, 0.95);
  pulseRing.position.z = 0.002;
  group.add(pulseRing);

  // Flash overlay — fills the target ring briefly when a tap registers.
  const flashGeom = new THREE.CircleGeometry(TARGET_RADIUS * 0.95, 24);
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  });
  const flash = new THREE.Mesh(flashGeom, flashMat);
  flash.position.z = 0.001;
  group.add(flash);

  // Position: just above center of view, slightly higher than the dig
  // meter since the classifier viewmodel sits low.
  group.position.set(0, 0.06, -0.55);

  function update(viz: ClassifyViz): void {
    // Inner pulse: small at phase=0/1, fully expanded at phase=0.5.
    // Triangle wave: scale = MIN + (1 - MIN) × (1 - |0.5 - phase| × 2).
    const tri = 1 - Math.abs(0.5 - viz.beatPhase) * 2;
    const scale = INNER_MIN_FACTOR + (1 - INNER_MIN_FACTOR) * tri;
    pulseRing.scale.setScalar(scale * (TARGET_RADIUS / 0.022));

    // Flash decay — pop white when a tap fires, fade to invisible.
    if (viz.lastTapFlashSec < FLASH_DURATION_SEC) {
      const t = viz.lastTapFlashSec / FLASH_DURATION_SEC;
      flashMat.opacity = 0.45 * (1 - t);
      // Tint by tap quality: green for good (≥1.5), yellow (≥1.0), red.
      const c =
        viz.lastTapScore >= 1.5
          ? 0x9bf08c
          : viz.lastTapScore >= 1.0
            ? 0xfff2b0
            : 0xff8b6b;
      flashMat.color.setHex(c);
    } else {
      flashMat.opacity = 0;
    }
  }

  function setVisible(v: boolean): void {
    group.visible = v;
  }

  setVisible(false);
  return { group, update, setVisible };
}
