import * as THREE from 'three';
import type { WeatherState } from '@/save/schema';

// Weather state machine + rain particle visualization.
//
// Three states for v0: clear (default), overcast (gray-tinted sky, dim sun),
// and rain (overcast + falling streak particles). Fog and snow are typed in
// the save schema but unimplemented.
//
// Transitions: a target state is rolled every 60–180 real-seconds. To switch,
// current intensity ramps to 0 first, then state swaps and intensity ramps
// up to its new target. So the world always cleanly fades through "clear"
// between two non-clear states.
//
// The rain particles live in a single LineSegments mesh repositioned around
// the player each frame, so they look like they follow you regardless of
// where you walk.

const RAIN_COUNT = 250;
const RAIN_AREA_HALF = 25; // half-extent of the rain box around player, meters
const RAIN_TOP_Y = 12;
const RAIN_BOTTOM_Y = -3;
const RAIN_SPEED = 18; // m/s downward
const STREAK_LENGTH = 0.42;

const TRANSITION_RATE_PER_SEC = 1 / 5; // 5 sec to fully ramp in or out
const MIN_INTERVAL_SEC = 60;
const MAX_INTERVAL_SEC = 180;

export interface WeatherView {
  state: WeatherState;
  intensity: number;
}

export interface WeatherController {
  update(worldTime: number, dt: number, playerPos: THREE.Vector3): void;
  getView(): WeatherView;
}

interface WeatherInit {
  scene: THREE.Scene;
  initialState: WeatherState;
  initialIntensity: number;
  lastChangedAt: number;
}

export function createWeatherController(opts: WeatherInit): WeatherController {
  const { scene, initialState, initialIntensity, lastChangedAt } = opts;

  let state: WeatherState = initialState;
  let intensity = Math.max(0, Math.min(1, initialIntensity));
  let targetState: WeatherState = initialState;
  let targetIntensity = initialState === 'clear' ? 0 : 1;
  let nextChangeAt = lastChangedAt + pickInterval();

  const rain = createRainSystem();
  scene.add(rain.mesh);

  function pickInterval(): number {
    return MIN_INTERVAL_SEC + Math.random() * (MAX_INTERVAL_SEC - MIN_INTERVAL_SEC);
  }

  function pickNextState(): WeatherState {
    const r = Math.random();
    if (r < 0.65) return 'clear';
    if (r < 0.9) return 'overcast';
    return 'rain';
  }

  return {
    update(worldTime, dt, playerPos) {
      // Time to roll a new target?
      if (worldTime > nextChangeAt && state === targetState) {
        const next = pickNextState();
        if (next !== state) {
          targetState = next;
          targetIntensity = next === 'clear' ? 0 : 1;
        }
        nextChangeAt = worldTime + pickInterval();
      }

      // Mid-transition: ramp current intensity to 0, then swap state.
      if (state !== targetState) {
        intensity = Math.max(0, intensity - TRANSITION_RATE_PER_SEC * dt);
        if (intensity <= 0.005) {
          state = targetState;
          intensity = 0;
        }
      } else {
        const target = targetIntensity;
        if (Math.abs(intensity - target) > 0.001) {
          const dir = target > intensity ? 1 : -1;
          intensity = Math.max(0, Math.min(1, intensity + dir * TRANSITION_RATE_PER_SEC * dt));
        }
      }

      // Visual: only render rain particles when we're in rain state with
      // non-trivial intensity.
      const rainAlpha = state === 'rain' ? intensity : 0;
      rain.update(dt, rainAlpha, playerPos);
    },
    getView() {
      return { state, intensity };
    },
  };
}

interface RainSystem {
  mesh: THREE.LineSegments;
  update(dt: number, alpha: number, playerPos: THREE.Vector3): void;
}

function createRainSystem(): RainSystem {
  // Each streak is two vertices (top + bottom). Six floats per streak.
  const positions = new Float32Array(RAIN_COUNT * 6);
  for (let i = 0; i < RAIN_COUNT; i++) {
    const x = (Math.random() - 0.5) * RAIN_AREA_HALF * 2;
    const z = (Math.random() - 0.5) * RAIN_AREA_HALF * 2;
    const y = RAIN_BOTTOM_Y + Math.random() * (RAIN_TOP_Y - RAIN_BOTTOM_Y);
    const baseIdx = i * 6;
    positions[baseIdx + 0] = x;
    positions[baseIdx + 1] = y + STREAK_LENGTH;
    positions[baseIdx + 2] = z;
    positions[baseIdx + 3] = x;
    positions[baseIdx + 4] = y;
    positions[baseIdx + 5] = z;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.LineBasicMaterial({
    color: 0xa8c0d0,
    transparent: true,
    opacity: 0,
  });

  const mesh = new THREE.LineSegments(geom, material);
  mesh.frustumCulled = false; // we move it with the player so culling AABB lies
  mesh.visible = false;

  return {
    mesh,
    update(dt, alpha, playerPos) {
      mesh.position.set(playerPos.x, 0, playerPos.z);
      const visible = alpha > 0.005;
      mesh.visible = visible;
      if (!visible) return;

      material.opacity = 0.65 * alpha;

      const dy = RAIN_SPEED * dt;
      for (let i = 0; i < RAIN_COUNT; i++) {
        const baseIdx = i * 6;
        positions[baseIdx + 1]! -= dy;
        positions[baseIdx + 4]! -= dy;
        if (positions[baseIdx + 4]! < RAIN_BOTTOM_Y) {
          const x = (Math.random() - 0.5) * RAIN_AREA_HALF * 2;
          const z = (Math.random() - 0.5) * RAIN_AREA_HALF * 2;
          positions[baseIdx + 0] = x;
          positions[baseIdx + 1] = RAIN_TOP_Y + STREAK_LENGTH;
          positions[baseIdx + 2] = z;
          positions[baseIdx + 3] = x;
          positions[baseIdx + 4] = RAIN_TOP_Y;
          positions[baseIdx + 5] = z;
        }
      }
      geom.attributes.position!.needsUpdate = true;
    },
  };
}
