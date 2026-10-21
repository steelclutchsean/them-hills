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
  // Drive every paired bone (Peasant + Superhero skeletons share names) so the
  // outfit and the body+head animate identically.
  const tx = j.restX + dx;
  const ty = j.restY + dy;
  const tz = j.restZ + dz;
  for (const bone of j.bones) {
    bone.rotation.x = lerp(bone.rotation.x, tx, t);
    bone.rotation.y = lerp(bone.rotation.y, ty, t);
    bone.rotation.z = lerp(bone.rotation.z, tz, t);
  }
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
const ARM_SWING_AMP = 0.25;

function applyArmSwing(rig: CharacterRig, sin: number, smoothing: number): void {
  // Compose arm-down baseline + forward/back swing into one delta per shoulder.
  // L and R use the SAME swing sign because the rig's bone-Y axes are already
  // mirrored (L Y is +Y-mostly, R Y is -Y-mostly). Same code value + opposite
  // axes = arms swing in OPPOSITE world directions, which is the natural gait.
  const dL = { x: 0, y: 0, z: 0 };
  const dR = { x: 0, y: 0, z: 0 };
  dL[ARM_DOWN_AXIS] = ARM_DOWN_L;
  dR[ARM_DOWN_AXIS] = ARM_DOWN_R;
  const swing = sin * ARM_SWING_AMP;
  dL[ARM_SWING_AXIS] += swing;
  dR[ARM_SWING_AXIS] += swing;
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

// ----- Jump / Fall / Land -----
// During airborne states (briefly going off the ground while running, jumping,
// landing), keep the leg cycle going so the character doesn't appear to glide.
// Re-uses the same sin-based leg + arm cycle as walking, with knees slightly
// more bent for visual differentiation.
function applyAirborneCycle(rig: CharacterRig, time: number, smoothing: number): void {
  applyRestPose(rig, smoothing);
  const phase = time * 6;
  const sin = Math.sin(phase);
  applyArmSwing(rig, sin, smoothing);
  applyDelta(rig.hipL, -sin * 0.5, 0, 0, smoothing);
  applyDelta(rig.hipR, sin * 0.5, 0, 0, smoothing);
  applyDelta(rig.kneeL, 0.25 + Math.max(0, sin * 0.4), 0, 0, smoothing);
  applyDelta(rig.kneeR, 0.25 + Math.max(0, -sin * 0.4), 0, 0, smoothing);
}

export function applyJumping(rig: CharacterRig, time: number, smoothing = 0.25): void {
  applyAirborneCycle(rig, time, smoothing);
}

export function applyFalling(rig: CharacterRig, time: number, smoothing = 0.2): void {
  applyAirborneCycle(rig, time, smoothing);
}

export function applyLanded(rig: CharacterRig, time: number, _t01: number, smoothing = 0.5): void {
  applyAirborneCycle(rig, time, smoothing);
}

// Dig and pan are keyframe clips: a short list of poses sampled by time.
// Deltas are added on top of the arm-down rest, same as the walk cycle.
type Vec3 = readonly [number, number, number];
interface DigKey {
  t: number;
  shoulderL: Vec3;
  shoulderR: Vec3;
  elbowL: Vec3;
  elbowR: Vec3;
  spine: Vec3;
  kneeL: number;
  kneeR: number;
}

const DIG_CLIP: readonly DigKey[] = [
  {
    t: 0,
    shoulderL: [-1.5, 0, 0],
    shoulderR: [-1.5, 0, 0],
    elbowL: [0, 0, 0],
    elbowR: [0, 0, 0],
    spine: [0, 0, 0],
    kneeL: 0,
    kneeR: 0,
  },
  {
    t: 0.28,
    shoulderL: [-0.2, 0.2, 0.4],
    shoulderR: [-0.15, -0.2, -0.35],
    elbowL: [0.9, 0, 0],
    elbowR: [0.8, 0, 0],
    spine: [0.35, 0, 0],
    kneeL: 0.2,
    kneeR: 0.15,
  },
  {
    t: 0.48,
    shoulderL: [-1.7, 0.1, 0.2],
    shoulderR: [-1.8, -0.1, -0.15],
    elbowL: [0.15, 0, 0],
    elbowR: [0.1, 0, 0],
    spine: [0.7, 0, 0],
    kneeL: 0.45,
    kneeR: 0.4,
  },
  {
    t: 0.78,
    shoulderL: [-1.4, 0, 0.1],
    shoulderR: [-1.45, 0, -0.1],
    elbowL: [0.2, 0, 0],
    elbowR: [0.2, 0, 0],
    spine: [0.2, 0, 0],
    kneeL: 0.1,
    kneeR: 0.1,
  },
  {
    t: 1.15,
    shoulderL: [-1.5, 0, 0],
    shoulderR: [-1.5, 0, 0],
    elbowL: [0, 0, 0],
    elbowR: [0, 0, 0],
    spine: [0, 0, 0],
    kneeL: 0,
    kneeR: 0,
  },
];

function sampleClip(keys: readonly DigKey[], time: number): DigKey {
  const duration = keys[keys.length - 1]!.t;
  const t = time % duration;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1]!.t < t) i++;
  const a = keys[i]!;
  const b = keys[i + 1]!;
  const span = Math.max(0.0001, b.t - a.t);
  const u = (t - a.t) / span;
  const mix = (x: number, y: number) => x + (y - x) * u;
  const mix3 = (x: Vec3, y: Vec3): Vec3 => [mix(x[0], y[0]), mix(x[1], y[1]), mix(x[2], y[2])];
  return {
    t,
    shoulderL: mix3(a.shoulderL, b.shoulderL),
    shoulderR: mix3(a.shoulderR, b.shoulderR),
    elbowL: mix3(a.elbowL, b.elbowL),
    elbowR: mix3(a.elbowR, b.elbowR),
    spine: mix3(a.spine, b.spine),
    kneeL: mix(a.kneeL, b.kneeL),
    kneeR: mix(a.kneeR, b.kneeR),
  };
}

function applyKeyed(rig: CharacterRig, pose: DigKey, smoothing: number): void {
  applyDelta(rig.spine, pose.spine[0], pose.spine[1], pose.spine[2], smoothing);
  applyDelta(rig.shoulderL, pose.shoulderL[0], pose.shoulderL[1], pose.shoulderL[2], smoothing);
  applyDelta(rig.shoulderR, pose.shoulderR[0], pose.shoulderR[1], pose.shoulderR[2], smoothing);
  applyDelta(rig.elbowL, pose.elbowL[0], pose.elbowL[1], pose.elbowL[2], smoothing);
  applyDelta(rig.elbowR, pose.elbowR[0], pose.elbowR[1], pose.elbowR[2], smoothing);
  applyDelta(rig.kneeL, pose.kneeL, 0, 0, smoothing);
  applyDelta(rig.kneeR, pose.kneeR, 0, 0, smoothing);
}

export function applyDig(
  rig: CharacterRig,
  time: number,
  _progress: number,
  smoothing = 0.45,
): void {
  applyRestPose(rig, smoothing);
  applyKeyed(rig, sampleClip(DIG_CLIP, time), smoothing);
}

export function applyClassify(
  rig: CharacterRig,
  _time: number,
  _progress: number,
  smoothing = 0.4,
): void {
  applyRestPose(rig, smoothing);
}

const PAN_CLIP: readonly DigKey[] = [
  {
    t: 0,
    shoulderL: [-0.7, 0.35, 0.5],
    shoulderR: [-0.55, -0.4, -0.45],
    elbowL: [0.7, 0, 0],
    elbowR: [0.85, 0, 0],
    spine: [0.25, 0.15, 0],
    kneeL: 0.15,
    kneeR: 0.1,
  },
  {
    t: 0.5,
    shoulderL: [-0.55, -0.2, 0.2],
    shoulderR: [-0.7, 0.25, -0.2],
    elbowL: [0.9, 0, 0],
    elbowR: [0.7, 0, 0],
    spine: [0.3, -0.2, 0],
    kneeL: 0.1,
    kneeR: 0.2,
  },
  {
    t: 1.0,
    shoulderL: [-0.8, 0.4, 0.55],
    shoulderR: [-0.5, -0.45, -0.5],
    elbowL: [0.65, 0, 0],
    elbowR: [0.95, 0, 0],
    spine: [0.22, 0.22, 0],
    kneeL: 0.2,
    kneeR: 0.08,
  },
  {
    t: 1.5,
    shoulderL: [-0.6, 0.1, 0.3],
    shoulderR: [-0.65, -0.1, -0.3],
    elbowL: [0.8, 0, 0],
    elbowR: [0.8, 0, 0],
    spine: [0.28, 0, 0],
    kneeL: 0.12,
    kneeR: 0.12,
  },
  {
    t: 2.0,
    shoulderL: [-0.7, 0.35, 0.5],
    shoulderR: [-0.55, -0.4, -0.45],
    elbowL: [0.7, 0, 0],
    elbowR: [0.85, 0, 0],
    spine: [0.25, 0.15, 0],
    kneeL: 0.15,
    kneeR: 0.1,
  },
];

export function applyPan(
  rig: CharacterRig,
  time: number,
  _progress: number,
  smoothing = 0.4,
): void {
  applyRestPose(rig, smoothing);
  applyKeyed(rig, sampleClip(PAN_CLIP, time), smoothing);
}

export function applyCollect(
  rig: CharacterRig,
  _time: number,
  _progress: number,
  smoothing = 0.35,
): void {
  applyRestPose(rig, smoothing);
}
