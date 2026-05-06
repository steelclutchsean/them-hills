import type { BoneJoint, CharacterRig } from './character-asset';

// Hand-coded poses for the rigged character. Each animation expresses a DELTA
// from the bone's REST rotation captured at load (T-pose). applyDelta() lerps
// `bone.rotation.{x,y,z}` toward `rest + delta` so the rig's natural posture
// is preserved and animations stack on top of it.
//
// Phase 3.2 deliberately STRIPS this back to the bare minimum:
//   - All bones held at rest (T-pose) EXCEPT shoulders, which get rotated
//     down to bring arms to the sides.
//   - Walk/Run add a leg-swing cycle on top.
//   - Jump / fall / land / dig / classify / pan / collect all currently render
//     as the same rest-with-arms-down pose. Adding character-specific motions
//     for those is the next iteration once arm rotation is dialed in.
//
// Two unknowns being pinned down empirically (one Vercel screenshot per try):
//   ARM_DOWN_AXIS  — which bone-local axis swings the arm from horizontal to down
//   ARM_DOWN_VALUE — sign + magnitude (about ±π/2 = ±1.57)
//
// Try sequence (flip these and rebuild on each screenshot):
//   1. axis='x', L=-1.5, R=-1.5  ← currently shipping
//   2. axis='x', L=+1.5, R=+1.5
//   3. axis='z', L=-1.5, R=+1.5  (mirrored)
//   4. axis='z', L=+1.5, R=-1.5  (mirrored, opposite)

const ARM_DOWN_AXIS: 'x' | 'y' | 'z' = 'x';
const ARM_DOWN_L = -1.5;
const ARM_DOWN_R = -1.5;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function applyDelta(j: BoneJoint, dx: number, dy: number, dz: number, t: number): void {
  j.bone.rotation.x = lerp(j.bone.rotation.x, j.restX + dx, t);
  j.bone.rotation.y = lerp(j.bone.rotation.y, j.restY + dy, t);
  j.bone.rotation.z = lerp(j.bone.rotation.z, j.restZ + dz, t);
}

function armDownDelta(side: 'L' | 'R'): { x: number; y: number; z: number } {
  const v = side === 'L' ? ARM_DOWN_L : ARM_DOWN_R;
  return {
    x: ARM_DOWN_AXIS === 'x' ? v : 0,
    y: ARM_DOWN_AXIS === 'y' ? v : 0,
    z: ARM_DOWN_AXIS === 'z' ? v : 0,
  };
}

function applyRestPose(rig: CharacterRig, t: number): void {
  applyDelta(rig.spine, 0, 0, 0, t);
  applyDelta(rig.head, 0, 0, 0, t);

  const dL = armDownDelta('L');
  const dR = armDownDelta('R');
  applyDelta(rig.shoulderL, dL.x, dL.y, dL.z, t);
  applyDelta(rig.shoulderR, dR.x, dR.y, dR.z, t);
  applyDelta(rig.elbowL, 0, 0, 0, t);
  applyDelta(rig.elbowR, 0, 0, 0, t);
  applyDelta(rig.handL, 0, 0, 0, t);
  applyDelta(rig.handR, 0, 0, 0, t);

  applyDelta(rig.hipL, 0, 0, 0, t);
  applyDelta(rig.hipR, 0, 0, 0, t);
  applyDelta(rig.kneeL, 0, 0, 0, t);
  applyDelta(rig.kneeR, 0, 0, 0, t);
}

// ----- Idle -----
export function applyIdle(rig: CharacterRig, _time: number, smoothing = 0.15): void {
  applyRestPose(rig, smoothing);
}

// Arm swing axis when walking. With arm-down on bone-X applied, the perpendicular
// world-X swing axis (which we want for fore/aft motion) lines up with bone-Y in
// the rig's local frame after the rest rotation.
const ARM_SWING_AXIS: 'x' | 'y' | 'z' = 'y';
const ARM_SWING_AMP = 0.5;

function applyArmSwing(rig: CharacterRig, sin: number, smoothing: number): void {
  // Compose arm-down baseline + forward/back swing into one delta per shoulder
  const dL = { x: 0, y: 0, z: 0 };
  const dR = { x: 0, y: 0, z: 0 };
  dL[ARM_DOWN_AXIS] = ARM_DOWN_L;
  dR[ARM_DOWN_AXIS] = ARM_DOWN_R;
  const swing = sin * ARM_SWING_AMP;
  dL[ARM_SWING_AXIS] += swing;
  dR[ARM_SWING_AXIS] -= swing;
  applyDelta(rig.shoulderL, dL.x, dL.y, dL.z, smoothing);
  applyDelta(rig.shoulderR, dR.x, dR.y, dR.z, smoothing);
}

// ----- Walk -----
// Hip and knee values are NEGATED relative to the procedural-rig versions because
// the gltf.scene's 180° Y-flip (to put the model's face on local -Z) also flips
// bone-X in world. So +bone-X rotation now produces backward swing in world; we
// negate so positive `sin` still corresponds to forward swing intent.
export function applyWalk(rig: CharacterRig, time: number, smoothing = 0.3): void {
  applyRestPose(rig, smoothing);
  const phase = time * 6;
  const sin = Math.sin(phase);
  applyArmSwing(rig, sin, smoothing);
  applyDelta(rig.hipL, -sin * 0.6, 0, 0, smoothing);
  applyDelta(rig.hipR, sin * 0.6, 0, 0, smoothing);
  applyDelta(rig.kneeL, Math.max(0, sin * 0.5), 0, 0, smoothing);
  applyDelta(rig.kneeR, Math.max(0, -sin * 0.5), 0, 0, smoothing);
}

// ----- Run -----
export function applyRun(rig: CharacterRig, time: number, smoothing = 0.35): void {
  applyRestPose(rig, smoothing);
  const phase = time * 9;
  const sin = Math.sin(phase);
  applyArmSwing(rig, sin * 1.6, smoothing);
  applyDelta(rig.hipL, -sin * 0.95, 0, 0, smoothing);
  applyDelta(rig.hipR, sin * 0.95, 0, 0, smoothing);
  applyDelta(rig.kneeL, Math.max(0, sin * 0.85), 0, 0, smoothing);
  applyDelta(rig.kneeR, Math.max(0, -sin * 0.85), 0, 0, smoothing);
}

// ----- Jump / Fall / Land — currently identical to rest. -----
export function applyJumping(rig: CharacterRig, smoothing = 0.25): void {
  applyRestPose(rig, smoothing);
}

export function applyFalling(rig: CharacterRig, smoothing = 0.2): void {
  applyRestPose(rig, smoothing);
}

export function applyLanded(rig: CharacterRig, _t01: number, smoothing = 0.5): void {
  applyRestPose(rig, smoothing);
}

// ----- Prospecting — rest pose for now. Iterate once arms-down is dialed in. -----
export function applyDig(
  rig: CharacterRig,
  _time: number,
  _progress: number,
  smoothing = 0.3,
): void {
  applyRestPose(rig, smoothing);
}

export function applyClassify(
  rig: CharacterRig,
  _time: number,
  _progress: number,
  smoothing = 0.4,
): void {
  applyRestPose(rig, smoothing);
}

export function applyPan(
  rig: CharacterRig,
  _time: number,
  _progress: number,
  smoothing = 0.4,
): void {
  applyRestPose(rig, smoothing);
}

export function applyCollect(
  rig: CharacterRig,
  _time: number,
  _progress: number,
  smoothing = 0.35,
): void {
  applyRestPose(rig, smoothing);
}
