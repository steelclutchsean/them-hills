import * as THREE from 'three';

// Reusable minigame effects: pooled particle bursts + camera shake.
//
// The particle system is a single pool of camera-child meshes (small
// spheres) reused across all minigame stages. burst() activates a batch
// of them at the requested camera-local offset; update(dt) advances
// their position/lifetime; expired particles get returned to the pool.
//
// Camera shake is a short per-frame offset overlay. main.ts is expected
// to call `applyShakeTo(camera)` AFTER camera-modes.ts has positioned
// the camera, so the shake rides on top of the base transform without
// fighting the prospect-mode placement.

const MAX_PARTICLES = 96;
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
}

export interface EffectSystem {
  /** Group parented to the camera — add to scene at boot. */
  particlesGroup: THREE.Group;
  /** Trigger a particle burst at a camera-local position. */
  burst(opts: BurstOpts): void;
  /** Trigger a short camera shake. */
  shake(intensity: number, durationSec?: number): void;
  /** Per-frame tick — advances particles and shake decay. */
  update(dt: number): void;
  /** Apply the current shake offset to a camera. Call AFTER its base
   *  transform has been set this frame. */
  applyShakeTo(camera: THREE.PerspectiveCamera): void;
}

interface Particle {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vx: number;
  vy: number;
  vz: number;
  ageSec: number;
  lifetimeSec: number;
  active: boolean;
}

export function createEffectSystem(): EffectSystem {
  const particlesGroup = new THREE.Group();
  particlesGroup.name = 'fx_particles';
  particlesGroup.renderOrder = 999;

  // Build the pool up front so emission costs nothing per-burst.
  const pool: Particle[] = [];
  const sphereGeom = new THREE.SphereGeometry(1, 6, 5);
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(sphereGeom, mat);
    mesh.renderOrder = 999;
    mesh.visible = false;
    particlesGroup.add(mesh);
    pool.push({
      mesh,
      mat,
      vx: 0,
      vy: 0,
      vz: 0,
      ageSec: 0,
      lifetimeSec: 0,
      active: false,
    });
  }

  let shakeT = 0;
  let shakeDuration = 0;
  let shakeIntensity = 0;
  let shakePhase = Math.random() * 10;

  function spawnFromPool(): Particle | null {
    for (const p of pool) {
      if (!p.active) return p;
    }
    return null;
  }

  return {
    particlesGroup,
    burst(opts) {
      const count = Math.min(opts.count, MAX_PARTICLES);
      const speed = opts.speed ?? 1.2;
      const lifetimeSec = opts.lifetimeSec ?? 0.5;
      const radius = opts.radius ?? 0.012;
      const color = opts.color;
      for (let i = 0; i < count; i++) {
        const p = spawnFromPool();
        if (!p) break;
        p.active = true;
        p.ageSec = 0;
        p.lifetimeSec = lifetimeSec * (0.8 + Math.random() * 0.4);
        // Random unit direction.
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const dx = Math.sin(phi) * Math.cos(theta);
        const dy = Math.cos(phi) * 0.6 + 0.3; // bias up a touch
        const dz = Math.sin(phi) * Math.sin(theta);
        const v = speed * (0.7 + Math.random() * 0.6);
        p.vx = dx * v;
        p.vy = dy * v;
        p.vz = dz * v;
        p.mesh.position.set(opts.origin.x, opts.origin.y, opts.origin.z);
        p.mesh.scale.setScalar(radius);
        p.mesh.visible = true;
        p.mat.color.setHex(color);
        p.mat.opacity = 1;
      }
    },
    shake(intensity, durationSec = 0.18) {
      // Take the max of current + new shake so multiple triggers don't
      // cancel each other; instead the bigger one wins.
      if (intensity * durationSec > shakeIntensity * (shakeDuration - shakeT)) {
        shakeIntensity = intensity;
        shakeDuration = durationSec;
        shakeT = 0;
      }
    },
    update(dt) {
      // Advance particles.
      for (const p of pool) {
        if (!p.active) continue;
        p.ageSec += dt;
        if (p.ageSec >= p.lifetimeSec) {
          p.active = false;
          p.mesh.visible = false;
          continue;
        }
        // Simple ballistic motion with light "gravity" pulling things
        // back toward the camera-local origin so bursts feel grounded.
        p.vy -= 1.8 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        // Fade out toward end of life.
        const lifeFrac = p.ageSec / p.lifetimeSec;
        p.mat.opacity = 1 - lifeFrac;
      }
      // Decay shake.
      if (shakeT < shakeDuration) {
        shakeT += dt;
        shakePhase += dt * SHAKE_FREQ_HZ * Math.PI * 2;
      }
    },
    applyShakeTo(camera) {
      if (shakeT >= shakeDuration) return;
      const t = 1 - shakeT / shakeDuration; // 1 → 0 across the shake
      const amp = shakeIntensity * t;
      // Bounded sinusoidal jitter on position. Cheap, no allocation.
      camera.position.x += Math.sin(shakePhase) * amp;
      camera.position.y += Math.cos(shakePhase * 1.3) * amp * 0.7;
    },
  };
}
