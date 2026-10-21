import * as THREE from 'three';
import type { BoneJoint, CharacterRig } from './character-asset';

// The Ranger ships in a bind T-pose: upper arms rest straight out to the sides.
// A measured euler on this skeleton drops them only when the shoulder Z is
// about -1.45 on the left and +1.45 on the right. Shoulder X is a forward
// lift on top of that drop. Writing a small X and a zero Z — what the old
// dig keys did — puts the arms back out in a T.
//
// Every clip keeps that Z drop and snaps it (no lerp) so a transition cannot
// pass through the bind pose. Unknown work falls back to idle-hold-tool.

export type PoseClip =
  | 'idle'
  | 'idle-hold-tool'
  | 'walk'
  | 'run'
  | 'jump'
  | 'fall'
  | 'land'
  | 'shovel'
  | 'rock'
  | 'aim'
  | 'pan'
  | 'sort';

const DROP_L = -1.45;
const DROP_R = 1.45;

const shoulderA = new THREE.Vector3();
const shoulderB = new THREE.Vector3();

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

let posedOnce = false;

function applyDelta(j: BoneJoint, dx: number, dy: number, dz: number, t: number): void {
  const tx = j.restX + dx;
  const ty = j.restY + dy;
  const tz = j.restZ + dz;
  for (const bone of j.bones) {
    bone.rotation.x = lerp(bone.rotation.x, tx, t);
    bone.rotation.y = lerp(bone.rotation.y, ty, t);
    bone.rotation.z = lerp(bone.rotation.z, tz, t);
  }
}

interface Gesture {
  shLx: number;
  shLy: number;
  shRx: number;
  shRy: number;
  elbL: number;
  elbR: number;
  spineX: number;
  spineY: number;
  headX: number;
  hipL: number;
  hipR: number;
  kneeL: number;
  kneeR: number;
  hand: number;
}

function still(): Gesture {
  return {
    shLx: 0.08,
    shLy: 0.04,
    shRx: 0.08,
    shRy: -0.04,
    elbL: 0.28,
    elbR: 0.28,
    spineX: 0,
    spineY: 0,
    headX: 0,
    hipL: 0,
    hipR: 0,
    kneeL: 0.04,
    kneeR: 0.04,
    hand: 0.15,
  };
}

// Shoulder X past about 1.0 unfolds this skeleton back into the bind T.
const LIFT_MAX = 0.7;

function write(rig: CharacterRig, g: Gesture, smoothing: number): void {
  const t = posedOnce ? smoothing : 1;
  posedOnce = true;
  g.shLx = Math.max(-0.15, Math.min(LIFT_MAX, g.shLx));
  g.shRx = Math.max(-0.15, Math.min(LIFT_MAX, g.shRx));
  applyDelta(rig.spine, g.spineX, g.spineY, 0, t);
  applyDelta(rig.head, g.headX, 0, 0, t);
  // Snap. A lerped drop spends frames in the bind T.
  applyDelta(rig.shoulderL, g.shLx, g.shLy, DROP_L, 1);
  applyDelta(rig.shoulderR, g.shRx, g.shRy, DROP_R, 1);
  applyDelta(rig.elbowL, g.elbL, 0, 0, t);
  applyDelta(rig.elbowR, g.elbR, 0, 0, t);
  applyDelta(rig.handL, g.hand, 0, 0, t);
  applyDelta(rig.handR, g.hand, 0, 0, t);
  applyDelta(rig.hipL, g.hipL, 0, 0, t);
  applyDelta(rig.hipR, g.hipR, 0, 0, t);
  applyDelta(rig.kneeL, g.kneeL, 0, 0, t);
  applyDelta(rig.kneeR, g.kneeR, 0, 0, t);
}

function breathe(time: number): number {
  return Math.sin(time * 1.35) * 0.035;
}

/** True when either upper arm is still out to the side like the bind pose. */
export function armsAreBind(rig: CharacterRig): boolean {
  const flat = (shoulder: BoneJoint, elbow: BoneJoint): boolean => {
    const s = shoulder.bones[0];
    const e = elbow.bones[0];
    if (!s || !e) return true;
    s.updateWorldMatrix(true, false);
    e.updateWorldMatrix(true, false);
    shoulderA.setFromMatrixPosition(s.matrixWorld);
    shoulderB.setFromMatrixPosition(e.matrixWorld).sub(shoulderA);
    const horizontal = Math.hypot(shoulderB.x, shoulderB.z);
    return Math.abs(shoulderB.y) < horizontal * 0.55;
  };
  return flat(rig.shoulderL, rig.elbowL) || flat(rig.shoulderR, rig.elbowR);
}

export function applyIdle(rig: CharacterRig, time: number, smoothing = 0.2): PoseClip {
  const g = still();
  g.spineX = breathe(time);
  write(rig, g, smoothing);
  return 'idle';
}

export function applyIdleHold(rig: CharacterRig, time: number, smoothing = 0.2): PoseClip {
  const g = still();
  g.shLx = 0.42;
  g.shRx = 0.48;
  g.elbL = 0.95;
  g.elbR = 1.05;
  g.hand = 0.55;
  g.spineX = 0.08 + breathe(time);
  write(rig, g, smoothing);
  return 'idle-hold-tool';
}

function gait(time: number, speed: number, amp: number): Gesture {
  const g = still();
  const sin = Math.sin(time * speed);
  g.shLx = 0.12 + sin * amp;
  g.shRx = 0.12 - sin * amp;
  g.elbL = 0.4 + Math.max(0, sin) * 0.35;
  g.elbR = 0.4 + Math.max(0, -sin) * 0.35;
  g.hipL = -sin * (0.55 + amp);
  g.hipR = sin * (0.55 + amp);
  g.kneeL = Math.max(0, sin) * (0.45 + amp);
  g.kneeR = Math.max(0, -sin) * (0.45 + amp);
  g.spineX = 0.06;
  g.spineY = sin * 0.06;
  return g;
}

export function applyWalk(rig: CharacterRig, time: number, smoothing = 0.3): PoseClip {
  write(rig, gait(time, 6, 0.28), smoothing);
  return 'walk';
}

export function applyRun(rig: CharacterRig, time: number, smoothing = 0.35): PoseClip {
  const g = gait(time, 9, 0.42);
  g.spineX = 0.14;
  g.kneeL += 0.08;
  g.kneeR += 0.08;
  write(rig, g, smoothing);
  return 'run';
}

function airborne(time: number, tuck: number): Gesture {
  const g = gait(time, 6, 0.18);
  g.kneeL = tuck;
  g.kneeR = tuck * 0.85;
  g.shLx = 0.2;
  g.shRx = 0.2;
  g.elbL = 0.55;
  g.elbR = 0.55;
  g.hipL = -0.2;
  g.hipR = 0.15;
  return g;
}

export function applyJumping(rig: CharacterRig, time: number, smoothing = 0.25): PoseClip {
  write(rig, airborne(time, 0.7), smoothing);
  return 'jump';
}

export function applyFalling(rig: CharacterRig, time: number, smoothing = 0.2): PoseClip {
  const g = airborne(time, 0.35);
  g.shLx = 0.55;
  g.shRx = 0.55;
  g.elbL = 0.3;
  g.elbR = 0.3;
  write(rig, g, smoothing);
  return 'fall';
}

export function applyLanded(rig: CharacterRig, time: number, t01: number, smoothing = 0.45): PoseClip {
  const g = still();
  g.kneeL = 0.55 * (1 - t01);
  g.kneeR = 0.5 * (1 - t01);
  g.spineX = 0.25 * (1 - t01);
  g.hipL = 0.2 * (1 - t01);
  g.hipR = -0.15 * (1 - t01);
  void time;
  write(rig, g, smoothing);
  return 'land';
}

function shovelGesture(time: number): Gesture {
  const g = still();
  const u = (time % 1.25) / 1.25;
  let lift = 0;
  if (u < 0.34) lift = u / 0.34;
  else if (u < 0.48) lift = 1 - (u - 0.34) / 0.14;
  else lift = 0;
  const strike = u >= 0.34 && u < 0.56 ? Math.sin(((u - 0.34) / 0.22) * Math.PI) : 0;
  g.shLx = 0.28 + lift * 0.9;
  g.shRx = 0.4 + lift * 1.05;
  g.shLy = 0.12;
  g.shRy = -0.16;
  g.elbL = 0.5 + lift * 0.85;
  g.elbR = 0.65 + lift * 1.0;
  g.spineX = 0.16 + strike * 0.62;
  g.kneeL = 0.1 + strike * 0.38;
  g.kneeR = 0.14 + strike * 0.3;
  g.hand = 0.7;
  g.headX = 0.18 + strike * 0.15;
  return g;
}

export function applyDig(rig: CharacterRig, time: number, _progress: number, smoothing = 0.35): PoseClip {
  write(rig, shovelGesture(time), smoothing);
  return 'shovel';
}

export function applyRock(rig: CharacterRig, time: number, smoothing = 0.3): PoseClip {
  const g = still();
  const sway = Math.sin(time * 3.6);
  g.shLx = 0.5;
  g.shRx = 0.55;
  g.shLy = sway * 0.38;
  g.shRy = sway * 0.38;
  g.elbL = 0.9;
  g.elbR = 0.95;
  g.spineY = sway * 0.42;
  g.spineX = 0.12;
  g.kneeL = 0.12 + Math.max(0, sway) * 0.15;
  g.kneeR = 0.12 + Math.max(0, -sway) * 0.15;
  g.hand = 0.65;
  g.headX = 0.12;
  write(rig, g, smoothing);
  return 'rock';
}

export function applyAim(rig: CharacterRig, time: number, smoothing = 0.3): PoseClip {
  const g = still();
  const sway = Math.sin(time * 1.5) * 0.08;
  g.shLx = 0.95;
  g.shRx = 1.05;
  g.shLy = 0.22 + sway;
  g.shRy = -0.18 + sway;
  g.elbL = 1.05;
  g.elbR = 0.85;
  g.spineX = 0.1;
  g.spineY = sway;
  g.headX = 0.06;
  g.hand = 0.45;
  g.kneeL = 0.08;
  g.kneeR = 0.1;
  write(rig, g, smoothing);
  return 'aim';
}

export function applyPan(rig: CharacterRig, time: number, _progress: number, smoothing = 0.35): PoseClip {
  const g = still();
  const swirl = Math.sin(time * 2.3);
  g.shLx = 0.62;
  g.shRx = 0.7;
  g.shLy = 0.28 + swirl * 0.32;
  g.shRy = -0.22 + swirl * 0.32;
  g.elbL = 0.95;
  g.elbR = 1.05;
  g.spineX = 0.22;
  g.spineY = swirl * 0.2;
  g.headX = 0.28;
  g.kneeL = 0.16;
  g.kneeR = 0.12;
  g.hand = 0.4;
  write(rig, g, smoothing);
  return 'pan';
}

export function applyClassify(
  rig: CharacterRig,
  time: number,
  _progress: number,
  smoothing = 0.35,
): PoseClip {
  const g = still();
  const sort = Math.sin(time * 2.8);
  g.shLx = 0.55;
  g.shRx = 0.6;
  g.shLy = 0.2 + sort * 0.12;
  g.shRy = -0.16 - sort * 0.12;
  g.elbL = 1.15;
  g.elbR = 1.2;
  g.spineX = 0.4;
  g.headX = 0.38;
  g.hand = 0.5;
  g.kneeL = 0.18;
  g.kneeR = 0.16;
  write(rig, g, smoothing);
  return 'sort';
}

export function applyCollect(
  rig: CharacterRig,
  time: number,
  progress: number,
  smoothing = 0.35,
): PoseClip {
  return applyClassify(rig, time, progress, smoothing);
}
