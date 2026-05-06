import type { CharacterRig } from './character-model';

// Hand-coded poses + cyclic animations for the procedural rig.
// Each function fully specifies the relevant joint rotations so transitions
// between activities don't leak stale poses.
//
// Forward convention: character forward = local -Z. Positive hip.rotation.x
// swings the leg forward (toward -Z); positive shoulder.rotation.x swings the
// arm forward. This matches Three.js camera-default convention.
//
// Inputs:
//   - time     = wall-clock seconds since start (for cyclic motion)
//   - progress = 0..1 within the current step (used by dig/classify/pan/collect)
//   - smoothing = lerp factor for transitions; higher = snappier

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

function approachScale(
  o: { scale: { x: number; y: number; z: number } },
  sx: number,
  sy: number,
  sz: number,
  t: number,
): void {
  o.scale.x = lerp(o.scale.x, sx, t);
  o.scale.y = lerp(o.scale.y, sy, t);
  o.scale.z = lerp(o.scale.z, sz, t);
}

// ----- Face poses -----
//
// Eyebrows are pivots; rotation.z lifts (+) or lowers (-) the inner end. Slight
// rotation.x tilts forward/back. The L brow uses positive z to lift; R brow uses
// negative z (mirrored). Wrapped in helpers so callers stay symmetric.
//
// Mouth is scaled: y for open/close, x for stretch (smile/frown).

interface FacePose {
  brow: number; // -1..+1, neutral 0; +1 = raised, -1 = furrowed
  mouthOpen: number; // 0..1, neutral 0; 1 = open
  mouthSmile: number; // -1..+1, neutral 0; +1 = smile (wider), -1 = frown
}

const FACE_NEUTRAL: FacePose = { brow: 0, mouthOpen: 0, mouthSmile: 0 };
const FACE_FOCUSED: FacePose = { brow: -0.6, mouthOpen: 0.1, mouthSmile: -0.2 };
const FACE_DETERMINED: FacePose = { brow: -0.4, mouthOpen: 0, mouthSmile: -0.1 };
const FACE_SURPRISED: FacePose = { brow: 0.8, mouthOpen: 0.4, mouthSmile: 0 };
const FACE_DELIGHTED: FacePose = { brow: 0.5, mouthOpen: 0.2, mouthSmile: 0.6 };

function applyFace(rig: CharacterRig, pose: FacePose, smoothing = 0.2): void {
  // Brow lift: rotation.z mirrored across L/R
  approach(rig.eyebrowL, 0, 0, pose.brow * 0.4, smoothing);
  approach(rig.eyebrowR, 0, 0, -pose.brow * 0.4, smoothing);
  // Mouth shape: scale Y for openness, X for smile width
  const targetSY = 1 + pose.mouthOpen * 4; // 1..5 (mouth box is thin so a 5x scale reads as "open")
  const targetSX = 1 + pose.mouthSmile * 0.3;
  approachScale(rig.mouth, targetSX, targetSY, 1, smoothing);
}

// ----- Idle -----
export function applyIdle(rig: CharacterRig, time: number, smoothing = 0.15): void {
  const breath = Math.sin(time * 1.6) * 0.012;
  approach(rig.spine, 0, 0, 0, smoothing);
  rig.spine.position.y = 0;
  rig.spine.scale.y = 1 + breath;

  approach(rig.head, Math.sin(time * 0.8) * 0.04, Math.sin(time * 0.5) * 0.06, 0, smoothing);

  approach(rig.shoulderL, 0, 0, 0.08, smoothing);
  approach(rig.shoulderR, 0, 0, -0.08, smoothing);
  approach(rig.elbowL, -0.15, 0, 0, smoothing);
  approach(rig.elbowR, -0.15, 0, 0, smoothing);

  approach(rig.hipL, 0, 0, 0, smoothing);
  approach(rig.hipR, 0, 0, 0, smoothing);
  approach(rig.kneeL, 0, 0, 0, smoothing);
  approach(rig.kneeR, 0, 0, 0, smoothing);

  applyFace(rig, FACE_NEUTRAL, smoothing);
}

// ----- Walk -----
export function applyWalk(rig: CharacterRig, time: number, smoothing = 0.3): void {
  const phase = time * 6;
  const sin = Math.sin(phase);
  const cos = Math.cos(phase);

  approach(rig.spine, 0, 0, 0, smoothing);
  rig.spine.position.y = Math.abs(cos) * 0.04;
  rig.spine.scale.y = 1;

  approach(rig.head, sin * 0.04, 0, 0, smoothing);

  approach(rig.shoulderL, -sin * 0.5, 0, 0.05, smoothing);
  approach(rig.shoulderR, sin * 0.5, 0, -0.05, smoothing);
  approach(rig.elbowL, -0.25 + Math.max(0, sin) * 0.3, 0, 0, smoothing);
  approach(rig.elbowR, -0.25 + Math.max(0, -sin) * 0.3, 0, 0, smoothing);

  approach(rig.hipL, sin * 0.6, 0, 0, smoothing);
  approach(rig.hipR, -sin * 0.6, 0, 0, smoothing);
  approach(rig.kneeL, Math.max(0, -sin * 0.5), 0, 0, smoothing);
  approach(rig.kneeR, Math.max(0, sin * 0.5), 0, 0, smoothing);

  applyFace(rig, FACE_NEUTRAL, smoothing);
}

// ----- Run -----
export function applyRun(rig: CharacterRig, time: number, smoothing = 0.35): void {
  const phase = time * 9;
  const sin = Math.sin(phase);
  const cos = Math.cos(phase);

  approach(rig.spine, -0.12, 0, 0, smoothing);
  rig.spine.position.y = Math.abs(cos) * 0.07;
  rig.spine.scale.y = 1;

  approach(rig.head, -sin * 0.05 + 0.05, 0, 0, smoothing);

  approach(rig.shoulderL, -sin * 0.85, 0, 0.06, smoothing);
  approach(rig.shoulderR, sin * 0.85, 0, -0.06, smoothing);
  approach(rig.elbowL, -0.7 + Math.max(0, sin) * 0.25, 0, 0, smoothing);
  approach(rig.elbowR, -0.7 + Math.max(0, -sin) * 0.25, 0, 0, smoothing);

  approach(rig.hipL, sin * 0.95, 0, 0, smoothing);
  approach(rig.hipR, -sin * 0.95, 0, 0, smoothing);
  approach(rig.kneeL, Math.max(0, -sin * 0.85), 0, 0, smoothing);
  approach(rig.kneeR, Math.max(0, sin * 0.85), 0, 0, smoothing);

  applyFace(rig, FACE_DETERMINED, smoothing);
}

// ----- Jump / Fall / Land -----
export function applyJumping(rig: CharacterRig, smoothing = 0.25): void {
  approach(rig.spine, -0.05, 0, 0, smoothing);
  rig.spine.position.y = 0;
  rig.spine.scale.y = 1.04;
  approach(rig.head, 0, 0, 0, smoothing);
  approach(rig.shoulderL, -1.6, 0, 0.2, smoothing);
  approach(rig.shoulderR, -1.6, 0, -0.2, smoothing);
  approach(rig.elbowL, -0.8, 0, 0, smoothing);
  approach(rig.elbowR, -0.8, 0, 0, smoothing);
  approach(rig.hipL, 0.4, 0, 0, smoothing);
  approach(rig.hipR, 0.4, 0, 0, smoothing);
  approach(rig.kneeL, 0.7, 0, 0, smoothing);
  approach(rig.kneeR, 0.7, 0, 0, smoothing);
  applyFace(rig, FACE_SURPRISED, smoothing);
}

export function applyFalling(rig: CharacterRig, smoothing = 0.2): void {
  approach(rig.spine, -0.1, 0, 0, smoothing);
  rig.spine.position.y = 0;
  rig.spine.scale.y = 1.03;
  approach(rig.head, -0.05, 0, 0, smoothing);
  approach(rig.shoulderL, -0.6, 0, 0.5, smoothing);
  approach(rig.shoulderR, -0.6, 0, -0.5, smoothing);
  approach(rig.elbowL, -0.3, 0, 0, smoothing);
  approach(rig.elbowR, -0.3, 0, 0, smoothing);
  approach(rig.hipL, 0.15, 0, 0, smoothing);
  approach(rig.hipR, 0.15, 0, 0, smoothing);
  approach(rig.kneeL, 0.3, 0, 0, smoothing);
  approach(rig.kneeR, 0.3, 0, 0, smoothing);
  applyFace(rig, FACE_SURPRISED, smoothing);
}

export function applyLanded(rig: CharacterRig, t01: number, smoothing = 0.5): void {
  const squash = 1 - 0.18 * (1 - t01);
  approach(rig.spine, -0.25 * (1 - t01), 0, 0, smoothing);
  rig.spine.position.y = -0.05 * (1 - t01);
  rig.spine.scale.y = squash;
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
  applyFace(rig, FACE_NEUTRAL, smoothing);
}

// ----- Prospecting steps -----

export function applyDig(rig: CharacterRig, time: number, progress: number, smoothing = 0.3): void {
  const swingPhase = time * 4;
  const swing = Math.sin(swingPhase);

  approach(rig.spine, -0.25 - swing * 0.08, 0, 0, smoothing);
  rig.spine.position.y = 0;
  rig.spine.scale.y = 1;
  approach(rig.head, -0.2, 0, 0, smoothing);

  approach(rig.shoulderL, -1.0 + swing * 0.55, 0, 0.25, smoothing);
  approach(rig.shoulderR, -1.0 + swing * 0.55, 0, -0.25, smoothing);
  approach(rig.elbowL, -0.6 - Math.max(0, -swing) * 0.4, 0, 0, smoothing);
  approach(rig.elbowR, -0.6 - Math.max(0, -swing) * 0.4, 0, 0, smoothing);

  approach(rig.hipL, 0.2, 0, 0.05, smoothing);
  approach(rig.hipR, 0.2, 0, -0.05, smoothing);
  approach(rig.kneeL, 0.45, 0, 0, smoothing);
  approach(rig.kneeR, 0.45, 0, 0, smoothing);

  rig.spine.rotation.x -= progress * 0.05;

  applyFace(rig, FACE_FOCUSED, smoothing);
}

export function applyClassify(
  rig: CharacterRig,
  time: number,
  progress: number,
  smoothing = 0.4,
): void {
  const shake = Math.sin(time * 28) * 0.18 * (0.5 + 0.5 * progress);

  approach(rig.spine, -0.15, 0, 0, smoothing);
  rig.spine.position.y = 0;
  rig.spine.scale.y = 1;
  approach(rig.head, -0.18, 0, 0, smoothing);

  approach(rig.shoulderL, -1.55 + shake * 0.3, 0, 0.4 + shake, smoothing);
  approach(rig.shoulderR, -1.55 + shake * 0.3, 0, -0.4 - shake, smoothing);
  approach(rig.elbowL, -1.4, 0, 0, smoothing);
  approach(rig.elbowR, -1.4, 0, 0, smoothing);

  approach(rig.hipL, 0.05, 0, 0.08, smoothing);
  approach(rig.hipR, 0.05, 0, -0.08, smoothing);
  approach(rig.kneeL, 0.15, 0, 0, smoothing);
  approach(rig.kneeR, 0.15, 0, 0, smoothing);

  applyFace(rig, FACE_DETERMINED, smoothing);
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
  rig.spine.position.y = 0;
  rig.spine.scale.y = 1;
  approach(rig.head, -0.22, 0, 0, smoothing);

  approach(rig.shoulderL, -1.4 + sn * 0.4, 0, 0.45 + cs, smoothing);
  approach(rig.shoulderR, -1.4 + sn * 0.4, 0, -0.45 - cs, smoothing);
  approach(rig.elbowL, -1.55, 0, 0, smoothing);
  approach(rig.elbowR, -1.55, 0, 0, smoothing);

  approach(rig.hipL, 0.05, 0, 0.05, smoothing);
  approach(rig.hipR, 0.05, 0, -0.05, smoothing);
  approach(rig.kneeL, 0.12, 0, 0, smoothing);
  approach(rig.kneeR, 0.12, 0, 0, smoothing);

  applyFace(rig, FACE_FOCUSED, smoothing);
}

export function applyCollect(
  rig: CharacterRig,
  _time: number,
  _progress: number,
  smoothing = 0.35,
): void {
  approach(rig.spine, -0.4, 0, 0, smoothing);
  rig.spine.position.y = -0.05;
  rig.spine.scale.y = 1;
  approach(rig.head, -0.35, 0, 0, smoothing);

  approach(rig.shoulderL, -2.2, 0, 0.18, smoothing);
  approach(rig.shoulderR, -2.2, 0, -0.18, smoothing);
  approach(rig.elbowL, -1.0, 0, 0, smoothing);
  approach(rig.elbowR, -1.0, 0, 0, smoothing);

  approach(rig.hipL, 0.55, 0, 0, smoothing);
  approach(rig.hipR, 0.55, 0, 0, smoothing);
  approach(rig.kneeL, 0.85, 0, 0, smoothing);
  approach(rig.kneeR, 0.85, 0, 0, smoothing);

  applyFace(rig, FACE_DELIGHTED, smoothing);
}
