import * as THREE from 'three';
import type { MinigameViz } from './types';

// In-world timing meter for the DIG stage. Mounted as a camera child so it
// renders as a viewmodel — the player sees a horizontal bar floating in
// their field of view, with the moving indicator and the green "sweet
// zone" overlay. Tap INTERACT when the indicator is inside the zone.
//
// Three rectangular layers stacked at slightly different z so they sort
// cleanly without depthWrite tricks: dark background → green sweet zone →
// bright indicator on top.

const BAR_WIDTH = 0.36;
const BAR_HEIGHT = 0.045;
const FLASH_DURATION_SEC = 0.3;

type DigViz = Extract<MinigameViz, { kind: 'dig' }>;

export interface DigMeterView {
  group: THREE.Group;
  update(viz: DigViz): void;
  setVisible(v: boolean): void;
}

export function createDigMeterView(): DigMeterView {
  const group = new THREE.Group();
  group.name = 'dig_meter';

  // Layer 1 — dark background bar.
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(BAR_WIDTH, BAR_HEIGHT),
    new THREE.MeshBasicMaterial({ color: 0x141414, transparent: true, opacity: 0.75 }),
  );
  bg.position.z = 0;
  group.add(bg);

  // Layer 2 — green sweet zone, scaled per tier on each update.
  const sweetMat = new THREE.MeshBasicMaterial({
    color: 0x52c861,
    transparent: true,
    opacity: 0.55,
  });
  const sweet = new THREE.Mesh(new THREE.PlaneGeometry(BAR_WIDTH, BAR_HEIGHT * 1.08), sweetMat);
  sweet.position.z = 0.001;
  group.add(sweet);

  // Layer 3 — yellow indicator, moves per frame.
  const indicatorMat = new THREE.MeshBasicMaterial({ color: 0xffd84a });
  const indicator = new THREE.Mesh(new THREE.PlaneGeometry(0.01, BAR_HEIGHT * 1.4), indicatorMat);
  indicator.position.z = 0.002;
  group.add(indicator);

  // Mount transform: just above center of view, slight standoff from
  // camera so it doesn't clip the near plane (0.1m).
  group.position.set(0, 0.08, -0.55);

  function update(viz: DigViz): void {
    // Sweet zone width: 2 × halfWidth as a fraction of the bar.
    sweet.scale.x = Math.max(0.01, viz.sweetHalfWidth * 2);
    sweet.position.x = (viz.sweetCenter - 0.5) * BAR_WIDTH;

    indicator.position.x = (viz.indicator - 0.5) * BAR_WIDTH;

    // Flash the indicator brighter for a fraction of a second after a
    // swing — quick visual confirmation that the tap registered.
    if (viz.lastSwingFlashSec < FLASH_DURATION_SEC) {
      const t = Math.max(0, Math.min(1, viz.lastSwingFlashSec / FLASH_DURATION_SEC));
      const w = 1 - t; // 1 → 0 over the flash duration
      indicatorMat.color.setRGB(1, 1, 0.29 + 0.71 * w);
    } else {
      indicatorMat.color.setHex(0xffd84a);
    }
  }

  function setVisible(v: boolean): void {
    group.visible = v;
  }

  // Hidden until DIG stage actively reports its viz.
  setVisible(false);

  return { group, update, setVisible };
}
