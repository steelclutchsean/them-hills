import * as THREE from 'three';
import type { WeatherView } from './weather';

// Headlamp light. Becomes available when the player upgrades personal gear
// to tier 2 (which the General Store labels "Waders + headlamp"). The lamp
// auto-activates in dark conditions — at night and during overcast or rainy
// weather — and adds a warm point-light around the player.
//
// Why auto-on rather than a toggle: it's a quality-of-life feature, not a
// strategic one. The decision is "do you have it" (gear T2), not "do you
// have it on right now". Future polish: a dedicated key to manually turn it
// off if the player wants the night-time vibe without illumination.

const NIGHT_HOUR_START = 19.5;
const NIGHT_HOUR_END = 6.5;

export interface HeadlampController {
  update(opts: {
    playerPos: THREE.Vector3;
    skyHour: number;
    weather: WeatherView;
    /** True once the player has bought the standalone Headlamp item
     *  from the General Store. Replaces the previous gear-T2 gate. */
    ownedHeadlamp: boolean;
    /** When true, force-activate regardless of time of day or weather. */
    isInCave: boolean;
  }): void;
  isOn(): boolean;
}

export function createHeadlamp(scene: THREE.Scene): HeadlampController {
  const light = new THREE.PointLight(0xffd9a0, 0, 9.0, 1.6);
  light.visible = false;
  scene.add(light);

  let on = false;
  let intensity = 0;

  return {
    update({ playerPos, skyHour, weather, ownedHeadlamp, isInCave }) {
      const eligible = ownedHeadlamp;
      const isNight = skyHour >= NIGHT_HOUR_START || skyHour < NIGHT_HOUR_END;
      const isStormy = weather.state === 'rain' || weather.state === 'overcast';
      const stormyContribution = isStormy ? weather.intensity : 0;
      // Activate when night, stormy weather is at least half-set, or the
      // player is inside the cave (where ambient is clamped near-dark).
      const shouldBeOn = eligible && (isNight || stormyContribution > 0.5 || isInCave);

      const target = shouldBeOn ? 1.2 : 0;
      intensity += (target - intensity) * 0.1;
      light.intensity = intensity;
      light.visible = intensity > 0.02;
      on = shouldBeOn;

      // Position slightly above the player's feet — read as head-height.
      light.position.set(playerPos.x, playerPos.y + 1.5, playerPos.z);
    },
    isOn() {
      return on;
    },
  };
}
