import type { CharacterRig } from './character-asset';

// Hand-coded poses + cyclic animations. Driven by setting bone .rotation values
// each frame; the SkinnedMesh deforms via skin weights so the character looks
// natural. Face has no animatable bones in this rig — we just animate the body.
//
// Forward convention: character forward = local -Z (Three.js camera-default).
// Positive hip.rotation.x swings the leg forward; positive shoulder.rotation.x
// swings the arm forward.

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function approach(
  o: { rotation: { x: number; y: number; z: number } },
  tx: number,
  ty: number,
  tz: number,
  t: number,
): void {
  o.rotation.x = lerp(o.rotation.x, tx, t);
  o.rotation.y = lerp(o.rotation.y, ty, t);
  o.rotation.z = lerp(o.rotation.z, tz, t);
}

// ----- Idle -----
export function applyIdle(rig: CharacterRig, time: number, smoothing = 0.15): void {
  // Subtle head sway only — body stays neutral so the rig's rest pose dominates.
  approach(rig.spine, 0, 0, 0, smoothing);
  approach(rig.head, Math.sin(time * 0.8) * 0.04, Math.sin(time * 0.5) * 0.06, 0, smoothing);

  approach(rig.shoulderL, 0, 0, 0.08, smoothing);
  approach(rig.shoulderR, 0, 0, -0.08, smoothing);
  approach(rig.elbowL, -0.15, 0, 0, smoothing);
  approach(rig.elbowR, -0.15, 0, 0, smoothing);

  approach(rig.hipL, 0, 0, 0, smoothing);
  approach(rig.hipR, 0, 0, 0, smoothing);
  approach(rig.kneeL, 0, 0, 0, smoothing);
  approach(rig.kneeR, 0, 0, 0, smoothing);
}

// ----- Walk -----
export function applyWalk(rig: CharacterRig, time: number, smoothing = 0.3): void {
  const phase = time * 6;
  const sin = Math.sin(phase);

  approach(rig.spine, 0, 0, 0, smoothing);
  approach(rig.head, sin * 0.04, 0, 0, smoothing);

  approach(rig.shoulderL, -sin * 0.5, 0, 0.05, smoothing);
  approach(rig.shoulderR, sin * 0.5, 0, -0.05, smoothing);
  approach(rig.elbowL, -0.25 + Math.max(0, sin) * 0.3, 0, 0, smoothing);
  approach(rig.elbowR, -0.25 + Math.max(0, -sin) * 0.3, 0, 0, smoothing);

  approach(rig.hipL, sin * 0.6, 0, 0, smoothing);
  approach(rig.hipR, -sin * 0.6, 0, 0, smoothing);
  approach(rig.kneeL, Math.max(0, -sin * 0.5), 0, 0, smoothing);
  approach(rig.kneeR, Math.max(0, sin * 0.5), 0, 0, smoothing);
}

// ----- Run -----
export function applyRun(rig: CharacterRig, time: number, smoothing = 0.35): void {
  const phase = time * 9;
  const sin = Math.sin(phase);

  approach(rig.spine, -0.12, 0, 0, smoothing);
  approach(rig.head, -sin * 0.05 + 0.05, 0, 0, smoothing);

  approach(rig.shoulderL, -sin * 0.85, 0, 0.06, smoothing);
  approach(rig.shoulderR, sin * 0.85, 0, -0.06, smoothing);
  approach(rig.elbowL, -0.7 + Math.max(0, sin) * 0.25, 0, 0, smoothing);
  approach(rig.elbowR, -0.7 + Math.max(0, -sin) * 0.25, 0, 0, smoothing);

  approach(rig.hipL, sin * 0.95, 0, 0, smoothing);
  approach(rig.hipR, -sin * 0.95, 0, 0, smoothing);
  approach(rig.kneeL, Math.max(0, -sin * 0.85), 0, 0, smoothing);
  approach(rig.kneeR, Math.max(0, sin * 0.85), 0, 0, smoothing);
}

// ----- Jump / Fall / Land -----
export function applyJumping(rig: CharacterRig, smoothing = 0.25): void {
  approach(rig.spine, -0.05, 0, 0, smoothing);
  approach(rig.head, 0, 0, 0, smoothing);
  approach(rig.shoulderL, -1.6, 0, 0.2, smoothing);
  approach(rig.shoulderR, -1.6, 0, -0.2, smoothing);
  approach(rig.elbowL, -0.8, 0, 0, smoothing);
  approach(rig.elbowR, -0.8, 0, 0, smoothing);
  approach(rig.hipL, 0.4, 0, 0, smoothing);
  approach(rig.hipR, 0.4, 0, 0, smoothing);
  approach(rig.kneeL, 0.7, 0, 0, smoothing);
  approach(rig.kneeR, 0.7, 0, 0, smoothing);
}

export function applyFalling(rig: CharacterRig, smoothing = 0.2): void {
  approach(rig.spine, -0.1, 0, 0, smoothing);
  approach(rig.head, -0.05, 0, 0, smoothing);
  approach(rig.shoulderL, -0.6, 0, 0.5, smoothing);
  approach(rig.shoulderR, -0.6, 0, -0.5, smoothing);
  approach(rig.elbowL, -0.3, 0, 0, smoothing);
  approach(rig.elbowR, -0.3, 0, 0, smoothing);
  approach(rig.hipL, 0.15, 0, 0, smoothing);
  approach(rig.hipR, 0.15, 0, 0, smoothing);
  approach(rig.kneeL, 0.3, 0, 0, smoothing);
  approach(rig.kneeR, 0.3, 0, 0, smoothing);
}

export function applyLanded(rig: CharacterRig, t01: number, smoothing = 0.5): void {
  approach(rig.spine, -0.25 * (1 - t01), 0, 0, smoothing);
  approach(rig.head, 0, 0, 0, smoothing);
  approach(rig.shoulderL, -0.4 * (1 - t01), 0, 0.1, smoothing);
  approach(rig.shoulderR, -0.4 * (1 - t01), 0, -0.1, smoothing);
  approach(rig.elbowL, -0.35, 0, 0, smoothing);
  approach(rig.elbowR, -0.35, 0, 0, smoothing);
  const hipBend = 0.5 * (1 - t01);
  const kneeBend = 0.9 * (1 - t01);
  approach(rig.hipL, hipBend, 0, 0, smoothing);
  approach(rig.hipR, hipBend, 0, 0, smoothing);
  approach(rig.kneeL, kneeBend, 0, 0, smoothing);
  approach(rig.kneeR, kneeBend, 0, 0, smoothing);
}

// ----- Prospecting -----

export function applyDig(rig: CharacterRig, time: number, progress: number, smoothing = 0.3): void {
  const swing = Math.sin(time * 4);

  approach(rig.spine, -0.25 - swing * 0.08 - progress * 0.05, 0, 0, smoothing);
  approach(rig.head, -0.2, 0, 0, smoothing);

  approach(rig.shoulderL, -1.0 + swing * 0.55, 0, 0.25, smoothing);
  approach(rig.shoulderR, -1.0 + swing * 0.55, 0, -0.25, smoothing);
  approach(rig.elbowL, -0.6 - Math.max(0, -swing) * 0.4, 0, 0, smoothing);
  approach(rig.elbowR, -0.6 - Math.max(0, -swing) * 0.4, 0, 0, smoothing);

  approach(rig.hipL, 0.2, 0, 0.05, smoothing);
  approach(rig.hipR, 0.2, 0, -0.05, smoothing);
  approach(rig.kneeL, 0.45, 0, 0, smoothing);
  approach(rig.kneeR, 0.45, 0, 0, smoothing);
}

export function applyClassify(
  rig: CharacterRig,
  time: number,
  progress: number,
  smoothing = 0.4,
): void {
  const shake = Math.sin(time * 28) * 0.18 * (0.5 + 0.5 * progress);

  approach(rig.spine, -0.15, 0, 0, smoothing);
  approach(rig.head, -0.18, 0, 0, smoothing);

  approach(rig.shoulderL, -1.55 + shake * 0.3, 0, 0.4 + shake, smoothing);
  approach(rig.shoulderR, -1.55 + shake * 0.3, 0, -0.4 - shake, smoothing);
  approach(rig.elbowL, -1.4, 0, 0, smoothing);
  approach(rig.elbowR, -1.4, 0, 0, smoothing);

  approach(rig.hipL, 0.05, 0, 0.08, smoothing);
  approach(rig.hipR, 0.05, 0, -0.08, smoothing);
  approach(rig.kneeL, 0.15, 0, 0, smoothing);
  approach(rig.kneeR, 0.15, 0, 0, smoothing);
}

export function applyPan(
  rig: CharacterRig,
  time: number,
  _progress: number,
  smoothing = 0.4,
): void {
  const TWO_PI = Math.PI * 2;
  const swirl = (time * 1.2) % TWO_PI;
  const cs = Math.cos(swirl) * 0.12;
  const sn = Math.sin(swirl) * 0.12;

  approach(rig.spine, -0.1, 0, 0, smoothing);
  approach(rig.head, -0.22, 0, 0, smoothing);

  approach(rig.shoulderL, -1.4 + sn * 0.4, 0, 0.45 + cs, smoothing);
  approach(rig.shoulderR, -1.4 + sn * 0.4, 0, -0.45 - cs, smoothing);
  approach(rig.elbowL, -1.55, 0, 0, smoothing);
  approach(rig.elbowR, -1.55, 0, 0, smoothing);

  approach(rig.hipL, 0.05, 0, 0.05, smoothing);
  approach(rig.hipR, 0.05, 0, -0.05, smoothing);
  approach(rig.kneeL, 0.12, 0, 0, smoothing);
  approach(rig.kneeR, 0.12, 0, 0, smoothing);
}

export function applyCollect(
  rig: CharacterRig,
  _time: number,
  _progress: number,
  smoothing = 0.35,
): void {
  approach(rig.spine, -0.4, 0, 0, smoothing);
  approach(rig.head, -0.35, 0, 0, smoothing);

  approach(rig.shoulderL, -2.2, 0, 0.18, smoothing);
  approach(rig.shoulderR, -2.2, 0, -0.18, smoothing);
  approach(rig.elbowL, -1.0, 0, 0, smoothing);
  approach(rig.elbowR, -1.0, 0, 0, smoothing);

  approach(rig.hipL, 0.55, 0, 0, smoothing);
  approach(rig.hipR, 0.55, 0, 0, smoothing);
  approach(rig.kneeL, 0.85, 0, 0, smoothing);
  approach(rig.kneeR, 0.85, 0, 0, smoothing);
}
