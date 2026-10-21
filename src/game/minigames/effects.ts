import * as THREE from 'three';
import type { BurstStyle } from './types';

// Two particle pools:
//   - camera-local motes for the first-person minigames
//   - world-space bursts so a find or a dig still reads after the camera
//     leaves the prospect view
//
// Styles change gravity, blending, and size. The pools themselves are
// allocated once.

const CAMERA_POOL = 96;
const WORLD_POOL = 80;
const SHAKE_FREQ_HZ = 38;

export interface BurstOpts {
  /** Camera-local origin for the burst. */
  origin: { x: number; y: number; z: number };
  /** Hex RGB. */
  color: number;
  /** Number of particles emitted (clamped to pool capacity). */
  count: number;
  /** Outward speed, in camera-local units / second. */
  speed?: number;
  /** Lifetime in seconds (linear fade-out). */
  lifetimeSec?: number;
  /** Particle radius. Defaults to a small mote (0.012). */
  radius?: number;
  style?: BurstStyle;
}

export interface EffectSystem {
  /** Group parented to the camera — add to the camera at boot. */
  particlesGroup: THREE.Group;
  /** Group parented to the scene — world-space celebratory bursts. */
  worldGroup: THREE.Group;
  burst(opts: BurstOpts): void;
  burstWorld(
    origin: { x: number; y: number; z: number },
    color: number,
    count?: number,
    style?: BurstStyle,
  ): void;
  shake(intensity: number, durationSec?: number): void;
  update(dt: number): void;
  applyShakeTo(camera: THREE.PerspectiveCamera): void;
}

interface StylePreset {
  gravity: number;
  speed: number;
  life: number;
  radius: number;
  additive: boolean;
}

const STYLES: Record<BurstStyle, StylePreset> = {
  mote: { gravity: 1.8, speed: 1.2, life: 0.5, radius: 0.012, additive: false },
  dirt: { gravity: 4.8, speed: 1.7, life: 0.55, radius: 0.02, additive: false },
  spark: { gravity: -0.4, speed: 0.95, life: 0.72, radius: 0.01, additive: true },
  droplet: { gravity: 3.4, speed: 1.35, life: 0.42, radius: 0.014, additive: true },
};

interface Particle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  ageSec: number;
  lifetimeSec: number;
  gravity: number;
  baseRadius: number;
  style: BurstStyle;
  spin: number;
  active: boolean;
}

function makePool(count: number, depthTest: boolean): { group: THREE.Group; pool: Particle[] } {
  const group = new THREE.Group();
  group.frustumCulled = false;
  const pool: Particle[] = [];
  const sphereGeom = new THREE.SphereGeometry(1, 6, 5);
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(sphereGeom, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    group.add(mesh);
    pool.push({
      mesh,
      mat,
      vx: 0,
      vy: 0,
      vz: 0,
      ageSec: 0,
      lifetimeSec: 0,
      gravity: 1.8,
      baseRadius: 0.012,
      style: 'mote',
      spin: Math.random() * 6,
      active: false,
    });
  }
  return { group, pool };
}

function spawn(
  pool: Particle[],
  origin: { x: number; y: number; z: number },
  color: number,
  count: number,
  style: BurstStyle,
  radiusScale: number,
): void {
  const preset = STYLES[style];
  const n = Math.min(count, pool.length);
  let spawned = 0;
  for (const p of pool) {
    if (p.active) continue;
    if (spawned >= n) break;
    spawned += 1;
    p.active = true;
    p.style = style;
    p.gravity = preset.gravity;
    p.ageSec = 0;
    p.lifetimeSec = preset.life * (0.75 + Math.random() * 0.5);
    p.baseRadius = preset.radius * radiusScale * (0.7 + Math.random() * 0.6);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const dx = Math.sin(phi) * Math.cos(theta);
    const dy = Math.abs(Math.cos(phi)) * 0.85 + 0.25;
    const dz = Math.sin(phi) * Math.sin(theta);
    const v = preset.speed * (0.65 + Math.random() * 0.7);
    p.vx = dx * v;
    p.vy = dy * v;
    p.vz = dz * v;
    p.mesh.position.set(origin.x, origin.y, origin.z);
    p.mesh.scale.setScalar(p.baseRadius);
    p.mesh.visible = true;
    p.mat.color.setHex(color);
    p.mat.opacity = 1;
    p.mat.blending = preset.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.mat.depthTest = p.mesh.parent === null ? true : p.mat.depthTest;
  }
}

function advance(pool: Particle[], dt: number): void {
  for (const p of pool) {
    if (!p.active) continue;
    p.ageSec += dt;
    if (p.ageSec >= p.lifetimeSec) {
      p.active = false;
      p.mesh.visible = false;
      continue;
    }
    p.vy -= p.gravity * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    const lifeFrac = p.ageSec / p.lifetimeSec;
    const twinkle = p.style === 'spark' ? 0.55 + 0.45 * Math.sin(p.ageSec * 28 + p.spin) : 1;
    p.mat.opacity = (1 - lifeFrac) * twinkle;
    const shrink = p.style === 'dirt' ? 1 - lifeFrac * 0.55 : 1 - lifeFrac * 0.2;
    p.mesh.scale.setScalar(p.baseRadius * Math.max(0.2, shrink));
  }
}

export function createEffectSystem(): EffectSystem {
  const cameraPool = makePool(CAMERA_POOL, false);
  cameraPool.group.name = 'fx_particles';
  cameraPool.group.renderOrder = 999;
  const worldPool = makePool(WORLD_POOL, true);
  worldPool.group.name = 'fx_world';

  let shakeT = 0;
  let shakeDuration = 0;
  let shakeIntensity = 0;
  let shakePhase = Math.random() * 10;

  return {
    particlesGroup: cameraPool.group,
    worldGroup: worldPool.group,
    burst(opts) {
      spawn(
        cameraPool.pool,
        opts.origin,
        opts.color,
        opts.count,
        opts.style ?? 'mote',
        opts.radius != null ? opts.radius / (STYLES[opts.style ?? 'mote'].radius || 0.012) : 1,
      );
    },
    burstWorld(origin, color, count = 12, style = 'spark') {
      // World units are ~5× the viewmodel scale, so motes read at arm's length.
      spawn(worldPool.pool, origin, color, count, style, 3.2);
    },
    shake(intensity, durationSec = 0.18) {
      if (intensity * durationSec > shakeIntensity * (shakeDuration - shakeT)) {
        shakeIntensity = intensity;
        shakeDuration = durationSec;
        shakeT = 0;
      }
    },
    update(dt) {
      advance(cameraPool.pool, dt);
      advance(worldPool.pool, dt);
      if (shakeT < shakeDuration) {
        shakeT += dt;
        shakePhase += dt * SHAKE_FREQ_HZ * Math.PI * 2;
      }
    },
    applyShakeTo(camera) {
      if (shakeT >= shakeDuration) return;
      const t = 1 - shakeT / shakeDuration;
      const amp = shakeIntensity * t;
      camera.position.x += Math.sin(shakePhase) * amp;
      camera.position.y += Math.cos(shakePhase * 1.3) * amp * 0.7;
    },
  };
}
