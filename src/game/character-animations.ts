import type { BoneJoint, CharacterRig } from './character-asset';

// Hand-coded poses + cyclic animations for the rigged character.
//
// Each animation expresses a DELTA from the bone's REST rotation. The rest pose
// (a T-pose: arms extended, body straight) is captured at load by character-asset.ts.
// applyDelta() lerps `bone.rotation` toward `rest + delta` so the rig's natural
// posture is preserved and animation curves stack on top of it instead of erasing it.
//
// Forward convention: character forward = local -Z.
//
// Inputs:
//   - time     = seconds since start (cyclic motion)
//   - progress = 0..1 within the active prospecting step

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function applyDelta(j: BoneJoint, dx: number, dy: number, dz: number, t: number): void {
  j.bone.rotation.x = lerp(j.bone.rotation.x, j.restX + dx, t);
  j.bone.rotation.y = lerp(j.bone.rotation.y, j.restY + dy, t);
  j.bone.rotation.z = lerp(j.bone.rotation.z, j.restZ + dz, t);
}

// Bring the upper arms from T-pose horizontal down to hanging-by-side position.
// Sign and axis here are educated guesses for an Unreal-style rig; if the arms end
// up facing the wrong way, flip the axis or sign of these constants and rebuild.
//
// Convention assumed: rotating the L upperarm by ~+1.4 rad around its bone-local Z
// axis brings the arm from horizontal-out to hanging-down. R arm mirrors the sign.
const ARM_DOWN_L_Z = 1.4;
const ARM_DOWN_R_Z = -1.4;

// Slight forward bend at the elbow so arms aren't ramrod straight at rest.
const ELBOW_REST_X = -0.15;

// ----- Idle -----
export function applyIdle(rig: CharacterRig, time: number, smoothing = 0.15): void {
  applyDelta(rig.spine, 0, 0, 0, smoothing);
  applyDelta(rig.head, Math.sin(time * 0.8) * 0.04, Math.sin(time * 0.5) * 0.06, 0, smoothing);

  applyDelta(rig.shoulderL, 0, 0, ARM_DOWN_L_Z, smoothing);
  applyDelta(rig.shoulderR, 0, 0, ARM_DOWN_R_Z, smoothing);
  applyDelta(rig.elbowL, ELBOW_REST_X, 0, 0, smoothing);
  applyDelta(rig.elbowR, ELBOW_REST_X, 0, 0, smoothing);

  applyDelta(rig.hipL, 0, 0, 0, smoothing);
  applyDelta(rig.hipR, 0, 0, 0, smoothing);
  applyDelta(rig.kneeL, 0, 0, 0, smoothing);
  applyDelta(rig.kneeR, 0, 0, 0, smoothing);
}

// ----- Walk -----
export function applyWalk(rig: CharacterRig, time: number, smoothing = 0.3): void {
  const phase = time * 6;
  const sin = Math.sin(phase);

  applyDelta(rig.spine, 0, 0, 0, smoothing);
  applyDelta(rig.head, sin * 0.04, 0, 0, smoothing);

  // Arms swing forward/back on rotation.x while staying in arms-down rest position
  applyDelta(rig.shoulderL, -sin * 0.5, 0, ARM_DOWN_L_Z, smoothing);
  applyDelta(rig.shoulderR, sin * 0.5, 0, ARM_DOWN_R_Z, smoothing);
  applyDelta(rig.elbowL, ELBOW_REST_X - 0.1 + Math.max(0, sin) * 0.3, 0, 0, smoothing);
  applyDelta(rig.elbowR, ELBOW_REST_X - 0.1 + Math.max(0, -sin) * 0.3, 0, 0, smoothing);

  applyDelta(rig.hipL, sin * 0.6, 0, 0, smoothing);
  applyDelta(rig.hipR, -sin * 0.6, 0, 0, smoothing);
  applyDelta(rig.kneeL, Math.max(0, -sin * 0.5), 0, 0, smoothing);
  applyDelta(rig.kneeR, Math.max(0, sin * 0.5), 0, 0, smoothing);
}

// ----- Run -----
export function applyRun(rig: CharacterRig, time: number, smoothing = 0.35): void {
  const phase = time * 9;
  const sin = Math.sin(phase);

  applyDelta(rig.spine, -0.12, 0, 0, smoothing);
  applyDelta(rig.head, -sin * 0.05 + 0.05, 0, 0, smoothing);

  applyDelta(rig.shoulderL, -sin * 0.85, 0, ARM_DOWN_L_Z, smoothing);
  applyDelta(rig.shoulderR, sin * 0.85, 0, ARM_DOWN_R_Z, smoothing);
  applyDelta(rig.elbowL, ELBOW_REST_X - 0.55 + Math.max(0, sin) * 0.25, 0, 0, smoothing);
  applyDelta(rig.elbowR, ELBOW_REST_X - 0.55 + Math.max(0, -sin) * 0.25, 0, 0, smoothing);

  applyDelta(rig.hipL, sin * 0.95, 0, 0, smoothing);
  applyDelta(rig.hipR, -sin * 0.95, 0, 0, smoothing);
  applyDelta(rig.kneeL, Math.max(0, -sin * 0.85), 0, 0, smoothing);
  applyDelta(rig.kneeR, Math.max(0, sin * 0.85), 0, 0, smoothing);
}

// ----- Jump / Fall / Land -----
export function applyJumping(rig: CharacterRig, smoothing = 0.25): void {
  applyDelta(rig.spine, -0.05, 0, 0, smoothing);
  applyDelta(rig.head, 0, 0, 0, smoothing);
  applyDelta(rig.shoulderL, -1.6, 0, ARM_DOWN_L_Z + 0.2, smoothing);
  applyDelta(rig.shoulderR, -1.6, 0, ARM_DOWN_R_Z - 0.2, smoothing);
  applyDelta(rig.elbowL, -0.8, 0, 0, smoothing);
  applyDelta(rig.elbowR, -0.8, 0, 0, smoothing);
  applyDelta(rig.hipL, 0.4, 0, 0, smoothing);
  applyDelta(rig.hipR, 0.4, 0, 0, smoothing);
  applyDelta(rig.kneeL, 0.7, 0, 0, smoothing);
  applyDelta(rig.kneeR, 0.7, 0, 0, smoothing);
}

export function applyFalling(rig: CharacterRig, smoothing = 0.2): void {
  applyDelta(rig.spine, -0.1, 0, 0, smoothing);
  applyDelta(rig.head, -0.05, 0, 0, smoothing);
  applyDelta(rig.shoulderL, -0.6, 0, ARM_DOWN_L_Z + 0.5, smoothing);
  applyDelta(rig.shoulderR, -0.6, 0, ARM_DOWN_R_Z - 0.5, smoothing);
  applyDelta(rig.elbowL, -0.3, 0, 0, smoothing);
  applyDelta(rig.elbowR, -0.3, 0, 0, smoothing);
  applyDelta(rig.hipL, 0.15, 0, 0, smoothing);
  applyDelta(rig.hipR, 0.15, 0, 0, smoothing);
  applyDelta(rig.kneeL, 0.3, 0, 0, smoothing);
  applyDelta(rig.kneeR, 0.3, 0, 0, smoothing);
}

export function applyLanded(rig: CharacterRig, t01: number, smoothing = 0.5): void {
  applyDelta(rig.spine, -0.25 * (1 - t01), 0, 0, smoothing);
  applyDelta(rig.head, 0, 0, 0, smoothing);
  applyDelta(rig.shoulderL, -0.4 * (1 - t01), 0, ARM_DOWN_L_Z + 0.1, smoothing);
  applyDelta(rig.shoulderR, -0.4 * (1 - t01), 0, ARM_DOWN_R_Z - 0.1, smoothing);
  applyDelta(rig.elbowL, -0.35, 0, 0, smoothing);
  applyDelta(rig.elbowR, -0.35, 0, 0, smoothing);
  const hipBend = 0.5 * (1 - t01);
  const kneeBend = 0.9 * (1 - t01);
  applyDelta(rig.hipL, hipBend, 0, 0, smoothing);
  applyDelta(rig.hipR, hipBend, 0, 0, smoothing);
  applyDelta(rig.kneeL, kneeBend, 0, 0, smoothing);
  applyDelta(rig.kneeR, kneeBend, 0, 0, smoothing);
}

// ----- Prospecting -----

export function applyDig(rig: CharacterRig, time: number, progress: number, smoothing = 0.3): void {
  const swing = Math.sin(time * 4);

  applyDelta(rig.spine, -0.25 - swing * 0.08 - progress * 0.05, 0, 0, smoothing);
  applyDelta(rig.head, -0.2, 0, 0, smoothing);

  // Arms forward + slightly inward for two-handed shovel grip
  applyDelta(rig.shoulderL, -1.0 + swing * 0.55, 0, ARM_DOWN_L_Z + 0.25, smoothing);
  applyDelta(rig.shoulderR, -1.0 + swing * 0.55, 0, ARM_DOWN_R_Z - 0.25, smoothing);
  applyDelta(rig.elbowL, -0.6 - Math.max(0, -swing) * 0.4, 0, 0, smoothing);
  applyDelta(rig.elbowR, -0.6 - Math.max(0, -swing) * 0.4, 0, 0, smoothing);

  applyDelta(rig.hipL, 0.2, 0, 0.05, smoothing);
  applyDelta(rig.hipR, 0.2, 0, -0.05, smoothing);
  applyDelta(rig.kneeL, 0.45, 0, 0, smoothing);
  applyDelta(rig.kneeR, 0.45, 0, 0, smoothing);
}

export function applyClassify(
  rig: CharacterRig,
  time: number,
  progress: number,
  smoothing = 0.4,
): void {
  const shake = Math.sin(time * 28) * 0.18 * (0.5 + 0.5 * progress);

  applyDelta(rig.spine, -0.15, 0, 0, smoothing);
  applyDelta(rig.head, -0.18, 0, 0, smoothing);

  applyDelta(rig.shoulderL, -1.55 + shake * 0.3, 0, ARM_DOWN_L_Z + 0.4 + shake, smoothing);
  applyDelta(rig.shoulderR, -1.55 + shake * 0.3, 0, ARM_DOWN_R_Z - 0.4 - shake, smoothing);
  applyDelta(rig.elbowL, -1.4, 0, 0, smoothing);
  applyDelta(rig.elbowR, -1.4, 0, 0, smoothing);

  applyDelta(rig.hipL, 0.05, 0, 0.08, smoothing);
  applyDelta(rig.hipR, 0.05, 0, -0.08, smoothing);
  applyDelta(rig.kneeL, 0.15, 0, 0, smoothing);
  applyDelta(rig.kneeR, 0.15, 0, 0, smoothing);
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

  applyDelta(rig.spine, -0.1, 0, 0, smoothing);
  applyDelta(rig.head, -0.22, 0, 0, smoothing);

  applyDelta(rig.shoulderL, -1.4 + sn * 0.4, 0, ARM_DOWN_L_Z + 0.45 + cs, smoothing);
  applyDelta(rig.shoulderR, -1.4 + sn * 0.4, 0, ARM_DOWN_R_Z - 0.45 - cs, smoothing);
  applyDelta(rig.elbowL, -1.55, 0, 0, smoothing);
  applyDelta(rig.elbowR, -1.55, 0, 0, smoothing);

  applyDelta(rig.hipL, 0.05, 0, 0.05, smoothing);
  applyDelta(rig.hipR, 0.05, 0, -0.05, smoothing);
  applyDelta(rig.kneeL, 0.12, 0, 0, smoothing);
  applyDelta(rig.kneeR, 0.12, 0, 0, smoothing);
}

export function applyCollect(
  rig: CharacterRig,
  _time: number,
  _progress: number,
  smoothing = 0.35,
): void {
  applyDelta(rig.spine, -0.4, 0, 0, smoothing);
  applyDelta(rig.head, -0.35, 0, 0, smoothing);

  applyDelta(rig.shoulderL, -2.2, 0, ARM_DOWN_L_Z + 0.18, smoothing);
  applyDelta(rig.shoulderR, -2.2, 0, ARM_DOWN_R_Z - 0.18, smoothing);
  applyDelta(rig.elbowL, -1.0, 0, 0, smoothing);
  applyDelta(rig.elbowR, -1.0, 0, 0, smoothing);

  applyDelta(rig.hipL, 0.55, 0, 0, smoothing);
  applyDelta(rig.hipR, 0.55, 0, 0, smoothing);
  applyDelta(rig.kneeL, 0.85, 0, 0, smoothing);
  applyDelta(rig.kneeR, 0.85, 0, 0, smoothing);
}
