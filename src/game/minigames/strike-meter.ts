import * as THREE from 'three';
import type { MinigameViz } from './types';

// Rock-themed timing meter for the STRIKE stage. Same mechanic as the
// dig meter (oscillating indicator → green sweet zone → flash on hit)
// but recolored to a grit-grey palette to read as "inside a mine" not
// "out at the creek".

const BAR_WIDTH = 0.42;
const BAR_HEIGHT = 0.05;
const FLASH_DURATION_SEC = 0.3;

type StrikeViz = Extract<MinigameViz, { kind: 'strike' }>;

export interface StrikeMeterView {
  group: THREE.Group;
  update(viz: StrikeViz): void;
  setVisible(v: boolean): void;
}

export function createStrikeMeterView(): StrikeMeterView {
  const group = new THREE.Group();
  group.name = 'strike_meter';

  // Background — dark stone color, fuller opacity than the dig meter.
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(BAR_WIDTH, BAR_HEIGHT),
    new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.85 }),
  );
  group.add(bg);

  // Sweet zone — ember orange (the spot where the seam fractures clean).
  const sweetMat = new THREE.MeshBasicMaterial({
    color: 0xd97a3a,
    transparent: true,
    opacity: 0.65,
  });
  const sweet = new THREE.Mesh(new THREE.PlaneGeometry(BAR_WIDTH, BAR_HEIGHT * 1.1), sweetMat);
  sweet.position.z = 0.001;
  group.add(sweet);

  // Indicator — pale steel.
  const indicatorMat = new THREE.MeshBasicMaterial({ color: 0xeaeaea });
  const indicator = new THREE.Mesh(new THREE.PlaneGeometry(0.011, BAR_HEIGHT * 1.5), indicatorMat);
  indicator.position.z = 0.002;
  group.add(indicator);

  group.position.set(0, 0.08, -0.55);

  function update(viz: StrikeViz): void {
    sweet.scale.x = Math.max(0.01, viz.sweetHalfWidth * 2);
    sweet.position.x = (viz.sweetCenter - 0.5) * BAR_WIDTH;
    indicator.position.x = (viz.indicator - 0.5) * BAR_WIDTH;

    if (viz.lastSwingFlashSec < FLASH_DURATION_SEC) {
      const t = Math.max(0, Math.min(1, viz.lastSwingFlashSec / FLASH_DURATION_SEC));
      const w = 1 - t;
      // Pale steel → spark white briefly.
      indicatorMat.color.setRGB(1, 0.95 - 0.2 * t, 0.6 + 0.4 * w);
    } else {
      indicatorMat.color.setHex(0xeaeaea);
    }
  }

  function setVisible(v: boolean): void {
    group.visible = v;
  }

  setVisible(false);
  return { group, update, setVisible };
}
