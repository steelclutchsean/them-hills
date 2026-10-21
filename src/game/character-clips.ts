import * as THREE from 'three';
import type { BoneJoint, CharacterRig } from './character-asset';

// Quaternius Universal Animation Library (CC0), retargeted onto the ranger.
// The bake stores qRangerRest * inverse(qSourceRest) * qClip, so a T-pose
// frame lands on the ranger bind and every other frame keeps the mocap swing.
// Root translation is not in the file. Playback is an AnimationMixer crossfade.
// Foot and tool corrections run after the mixer, or they would be overwritten.

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
  | 'sort'
  | 'kneel'
  | 'carry';

export interface MotionOptions {
  time: number;
  carrying: boolean;
  tool: 'none' | 'dig' | 'pan' | 'rock' | 'aim';
  toolTarget: THREE.Vector3 | null;
  ground: ((x: number, z: number) => number) | null;
}

interface ClipDef {
  duration: number;
  loop: boolean;
  bones: Record<string, { times?: number[]; q?: number[]; pt?: number[]; p?: number[] }>;
}

const CLIP_URL = '/assets/animations/ranger-motion.json';
const IDLE_VARIANTS = ['idle', 'idle-talk', 'idle-fold'] as const;

const shoulderA = new THREE.Vector3();
const shoulderB = new THREE.Vector3();
const footPos = new THREE.Vector3();
const footTarget = new THREE.Vector3();
const charPos = new THREE.Vector3();
const rootPos = new THREE.Vector3();
const midPos = new THREE.Vector3();
const endPos = new THREE.Vector3();
const reach = new THREE.Vector3();
const chain = new THREE.Vector3();
const pole = new THREE.Vector3();
const desiredMid = new THREE.Vector3();
const aimFrom = new THREE.Vector3();
const aimTo = new THREE.Vector3();
const aimBonePos = new THREE.Vector3();
const gripOrigin = new THREE.Vector3();
const gripDir = new THREE.Vector3();
const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const qWorld = new THREE.Quaternion();
const axisX = new THREE.Vector3(1, 0, 0);
const axisY = new THREE.Vector3(0, 1, 0);
const gripUp = new THREE.Vector3(0, 1, 0);
const gripInv = new THREE.Matrix4();

/**
 * True when both elbows are stuck out to the sides the way the bind T is.
 * A chop cocks one arm out on the windup. That is the swing, not the bind.
 */
export function armsAreBind(rig: CharacterRig): boolean {
  const yaw = rig.group.rotation.y;
  const rx = -Math.cos(yaw);
  const rz = Math.sin(yaw);
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const side = (shoulder: BoneJoint, elbow: BoneJoint): boolean => {
    const s = shoulder.bones[0];
    const e = elbow.bones[0];
    if (!s || !e) return true;
    s.updateWorldMatrix(true, false);
    e.updateWorldMatrix(true, false);
    shoulderA.setFromMatrixPosition(s.matrixWorld);
    shoulderB.setFromMatrixPosition(e.matrixWorld).sub(shoulderA);
    const lateral = Math.abs(shoulderB.x * rx + shoulderB.z * rz);
    const ahead = Math.abs(shoulderB.x * fx + shoulderB.z * fz);
    return lateral > 0.18 && ahead < lateral * 0.45 && Math.abs(shoulderB.y) < lateral * 0.45;
  };
  return side(rig.shoulderL, rig.elbowL) && side(rig.shoulderR, rig.elbowR);
}

function clipFromJson(name: string, def: ClipDef): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const [bone, keys] of Object.entries(def.bones)) {
    if (keys.times && keys.q && keys.q.length >= 4) {
      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, keys.times, keys.q));
    }
    if (keys.pt && keys.p && keys.p.length >= 3) {
      tracks.push(new THREE.VectorKeyframeTrack(`${bone}.position`, keys.pt, keys.p));
    }
  }
  return new THREE.AnimationClip(name, def.duration, tracks);
}

function fadeFor(name: string): number {
  if (name === 'jump' || name === 'fall' || name === 'land') return 0.12;
  if (name === 'shovel' || name === 'rock' || name === 'aim' || name === 'pan' || name === 'sort') return 0.22;
  return 0.28;
}

export interface MotionPlayer {
  update(dt: number, clip: PoseClip, opts: MotionOptions): PoseClip;
}

export async function loadMotion(rig: CharacterRig): Promise<MotionPlayer> {
  const response = await fetch(CLIP_URL);
  if (!response.ok) throw new Error(`[motion] ${CLIP_URL} ${response.status}`);
  const file = (await response.json()) as { clips: Record<string, ClipDef> };
  const mixer = new THREE.AnimationMixer(rig.group);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const [name, def] of Object.entries(file.clips)) {
    const clip = clipFromJson(name, def);
    const action = mixer.clipAction(clip);
    action.setLoop(def.loop ? THREE.LoopRepeat : THREE.LoopOnce, def.loop ? Infinity : 1);
    action.clampWhenFinished = !def.loop;
    actions.set(name, action);
  }
  for (const required of ['idle', 'shovel', 'rock', 'aim', 'pan', 'carry', 'sort', 'walk', 'run']) {
    if (!actions.has(required)) throw new Error(`[motion] missing clip ${required}`);
  }

  let active = 'idle-hold-tool';
  let idleFor = 0;
  let idleIndex = 0;

  function snap(name: string): void {
    const next = actions.get(name);
    if (!next) return;
    for (const action of actions.values()) action.stop();
    next.reset().setEffectiveWeight(1).play();
    mixer.update(0);
    active = name;
  }

  function fadeTo(name: string): void {
    if (name === active) return;
    const next = actions.get(name);
    const prev = actions.get(active);
    if (!next) return;
    next.reset().setEffectiveWeight(1).fadeIn(fadeFor(name)).play();
    prev?.fadeOut(fadeFor(name));
    active = name;
  }

  snap(actions.has('idle-hold-tool') ? 'idle-hold-tool' : 'idle');

  return {
    update(dt, clip, opts) {
      if (clip === 'idle' && opts.tool === 'none') {
        idleFor += dt;
        if (idleFor > 9) {
          idleFor = 0;
          idleIndex = (idleIndex + 1) % IDLE_VARIANTS.length;
        }
      } else {
        idleFor = 0;
      }

      let play = clip as string;
      let reported: PoseClip = clip;
      if ((clip === 'walk' || clip === 'run') && opts.carrying && actions.has('carry')) {
        play = 'carry';
        reported = 'carry';
      } else if (clip === 'idle' && opts.tool === 'none') {
        play = IDLE_VARIANTS[idleIndex] ?? 'idle';
        reported = 'idle';
      } else if (clip === 'idle') {
        play = 'idle-hold-tool';
        reported = 'idle-hold-tool';
      }

      fadeTo(play);
      mixer.update(dt);
      rig.group.updateWorldMatrix(true, true);
      applyAdditive(rig, reported, opts.time);
      applyFeet(rig, opts.ground);
      applyTool(rig, opts);
      return reported;
    },
  };
}

function applyAdditive(rig: CharacterRig, clip: PoseClip, time: number): void {
  const spine = rig.spine.bones[0];
  if (spine && (clip === 'idle' || clip === 'idle-hold-tool')) {
    qA.setFromAxisAngle(axisX, Math.sin(time * 1.35) * 0.04);
    spine.quaternion.multiply(qA);
  }
  const hand = rig.handR.bones[0];
  if (hand && clip === 'pan') {
    qA.setFromAxisAngle(axisY, Math.sin(time * 3.1) * 0.5);
    hand.quaternion.multiply(qA);
  }
}

function applyFeet(rig: CharacterRig, ground: ((x: number, z: number) => number) | null): void {
  if (!ground) return;
  charPos.setFromMatrixPosition(rig.group.matrixWorld);
  const charGround = ground(charPos.x, charPos.z);
  plantFoot(rig.hipL.bones[0], rig.kneeL.bones[0], rig.footL.bones[0], ground, charGround);
  plantFoot(rig.hipR.bones[0], rig.kneeR.bones[0], rig.footR.bones[0], ground, charGround);
}

function plantFoot(
  thigh: THREE.Object3D | undefined,
  calf: THREE.Object3D | undefined,
  foot: THREE.Object3D | undefined,
  ground: (x: number, z: number) => number,
  charGround: number,
): void {
  if (!thigh || !calf || !foot) return;
  foot.updateWorldMatrix(true, false);
  footPos.setFromMatrixPosition(foot.matrixWorld);
  const under = ground(footPos.x, footPos.z);
  if (Math.abs(under - charGround) < 0.025) return;
  const clearance = footPos.y - under;
  const weight = clearance < 0.08 ? 0.85 : clearance < 0.25 ? 0.35 : 0;
  if (weight <= 0) return;
  footTarget.set(footPos.x, footPos.y + (under - charGround), footPos.z);
  solveTwoBone(thigh, calf, foot, footTarget, weight);
}

function applyTool(rig: CharacterRig, opts: MotionOptions): void {
  if (opts.tool === 'none' || !opts.toolTarget) return;
  const shoulder = rig.shoulderR.bones[0];
  const elbow = rig.elbowR.bones[0];
  const hand = rig.handR.bones[0];
  if (!shoulder || !elbow || !hand) return;
  hand.updateWorldMatrix(true, false);
  const gap = gripOrigin.setFromMatrixPosition(hand.matrixWorld).distanceTo(opts.toolTarget);
  const cap = opts.tool === 'pan' ? 0.78 : opts.tool === 'dig' ? 0.62 : opts.tool === 'rock' ? 0.42 : 0.34;
  // Far from the tool, reach for it. Close in, leave the mocap swing alone.
  const weight = Math.max(0.12, Math.min(cap, (gap - 0.12) / 0.38));
  solveTwoBone(shoulder, elbow, hand, opts.toolTarget, weight);
  if (opts.tool === 'dig' || opts.tool === 'pan') blendGrip(hand, opts.toolTarget, Math.min(0.45, weight));
}

function solveTwoBone(
  root: THREE.Object3D,
  mid: THREE.Object3D,
  end: THREE.Object3D,
  target: THREE.Vector3,
  weight: number,
): void {
  if (weight <= 0 || !root.parent) return;
  root.updateWorldMatrix(true, true);
  rootPos.setFromMatrixPosition(root.matrixWorld);
  midPos.setFromMatrixPosition(mid.matrixWorld);
  endPos.setFromMatrixPosition(end.matrixWorld);
  const upperLen = rootPos.distanceTo(midPos);
  const lowerLen = midPos.distanceTo(endPos);
  if (upperLen < 1e-4 || lowerLen < 1e-4) return;

  reach.copy(target).sub(rootPos);
  let distance = reach.length();
  const maxReach = upperLen + lowerLen - 1e-4;
  const minReach = Math.abs(upperLen - lowerLen) + 1e-4;
  distance = Math.min(maxReach, Math.max(minReach, distance));
  if (reach.lengthSq() < 1e-8) return;
  reach.multiplyScalar(1 / reach.length());

  chain.copy(endPos).sub(rootPos);
  const chainLenSq = chain.lengthSq();
  const midRel = pole.copy(midPos).sub(rootPos);
  const along = chainLenSq < 1e-8 ? 0 : midRel.dot(chain) / chainLenSq;
  pole.copy(midPos).sub(rootPos).addScaledVector(chain, -along);
  if (pole.lengthSq() < 1e-6) pole.set(0, 1, 0);
  pole.normalize();

  const cosRoot = clamp(
    (upperLen * upperLen + distance * distance - lowerLen * lowerLen) / (2 * upperLen * distance),
    -1,
    1,
  );
  const bend = Math.acos(cosRoot);
  desiredMid.copy(rootPos).addScaledVector(reach, Math.cos(bend) * upperLen).addScaledVector(pole, Math.sin(bend) * upperLen);
  aimChild(root, mid, desiredMid, weight);
  root.updateWorldMatrix(true, true);
  aimChild(mid, end, target, weight);
}

function aimChild(bone: THREE.Object3D, child: THREE.Object3D, want: THREE.Vector3, weight: number): void {
  if (!bone.parent) return;
  bone.updateWorldMatrix(true, false);
  child.updateWorldMatrix(true, false);
  aimBonePos.setFromMatrixPosition(bone.matrixWorld);
  aimFrom.setFromMatrixPosition(child.matrixWorld).sub(aimBonePos);
  aimTo.copy(want).sub(aimBonePos);
  if (aimFrom.lengthSq() < 1e-8 || aimTo.lengthSq() < 1e-8) return;
  aimFrom.normalize();
  aimTo.normalize();
  qA.setFromUnitVectors(aimFrom, aimTo);
  bone.getWorldQuaternion(qWorld);
  qA.multiply(qWorld);
  bone.parent.getWorldQuaternion(qB);
  qB.invert().multiply(qA);
  bone.quaternion.slerp(qB, weight);
}

function blendGrip(hand: THREE.Object3D, target: THREE.Vector3, weight: number): void {
  if (!hand.parent) return;
  hand.updateWorldMatrix(true, false);
  gripOrigin.setFromMatrixPosition(hand.matrixWorld);
  gripDir.copy(target).sub(gripOrigin);
  if (gripDir.lengthSq() < 1e-5) return;
  gripDir.normalize();
  gripInv.copy(hand.parent.matrixWorld).invert();
  gripDir.transformDirection(gripInv);
  qA.setFromUnitVectors(gripUp, gripDir);
  hand.quaternion.slerp(qA, weight);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
