import * as THREE from 'three';
import { RAPIER } from '@/physics/world';
import type { MoveInput } from '@/input/manager';
import {
  applyClassify,
  applyCollect,
  applyDig,
  applyFalling,
  applyIdle,
  applyJumping,
  applyLanded,
  applyPan,
  applyRun,
  applyWalk,
} from './character-animations';
import { createCharacterRig, type CharacterRig } from './character-model';

// Movement, jump, gravity, stamina, a state machine for animation selection,
// and an articulated procedural rig (head/torso/limbs as primitives).
//
// The rig spans roughly y ∈ [-0.86, +0.84] from the group origin; the group origin
// matches the Rapier capsule center, so feet sit a few cm above the capsule's
// physics bottom — visually grounded under snap-to-ground.

export type CharacterState = 'idle' | 'walking' | 'running' | 'jumping' | 'falling' | 'landed';

/** Optional task overlay; if non-null it overrides movement-state animation. */
export interface ProspectingActivity {
  step: 'dig' | 'classify' | 'pan' | 'collect';
  progress: number;
}

export interface CharacterOpts {
  world: RAPIER.World;
  initialPosition: { x: number; y: number; z: number };
  initialYaw: number;
  initialStamina: number;
}

export interface Character {
  group: THREE.Group;
  preStep(
    dt: number,
    moveInput: MoveInput,
    jumpDown: boolean,
    sprintDown: boolean,
    cameraYaw: number,
  ): void;
  /** activity overrides movement animation when non-null (e.g. during prospecting). */
  postStep(dt: number, time: number, activity: ProspectingActivity | null): void;
  getPosition(): THREE.Vector3;
  getYaw(): number;
  getState(): CharacterState;
  getStamina(): number;
  /** Used by camera ray-casts to exclude the character's own collider. */
  getColliderHandle(): number;
  serialize(): {
    position: { x: number; y: number; z: number };
    rotation: { yaw: number; pitch: number };
    stamina: number;
  };
}

const WALK_SPEED = 2.5;
const RUN_SPEED = 5.5;
const JUMP_VELOCITY = 7.0;
const GRAVITY = -25;
const MAX_FALL_SPEED = -55;

const STAMINA_DRAIN_PER_SEC = 0.15;
const STAMINA_REGEN_PER_SEC = 0.25;
const STAMINA_MIN_FOR_SPRINT = 0.15;
const STAMINA_LOCKOUT_THRESHOLD = 0.05;

const TURN_LERP = 0.18;
const LANDED_DURATION = 0.18;

const CAPSULE_HALF_HEIGHT = 0.5;
const CAPSULE_RADIUS = 0.4;

export function createCharacter(opts: CharacterOpts): Character {
  // ---- Rapier body + collider ----
  const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
  bodyDesc.setTranslation(opts.initialPosition.x, opts.initialPosition.y, opts.initialPosition.z);
  const body = opts.world.createRigidBody(bodyDesc);

  const colliderDesc = RAPIER.ColliderDesc.capsule(CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS);
  const collider = opts.world.createCollider(colliderDesc, body);

  // ---- Character controller ----
  const controller = opts.world.createCharacterController(0.01);
  controller.setUp(new RAPIER.Vector3(0, 1, 0));
  controller.setSlideEnabled(true);
  controller.enableAutostep(0.3, 0.2, true);
  controller.enableSnapToGround(0.5);

  // ---- Visual rig ----
  const rig: CharacterRig = createCharacterRig();
  const group = rig.group;
  group.position.set(opts.initialPosition.x, opts.initialPosition.y, opts.initialPosition.z);
  group.rotation.y = opts.initialYaw;

  // ---- Sim state ----
  let yaw = opts.initialYaw;
  let stamina = opts.initialStamina;
  let staminaLocked = false;
  let verticalVelocity = 0;
  let grounded = false;
  let wasGrounded = false;
  let wasJumpDown = false;
  let state: CharacterState = 'idle';
  let landedTimer = 0;

  const desiredMove = new RAPIER.Vector3(0, 0, 0);

  function preStep(
    dt: number,
    moveInput: MoveInput,
    jumpDown: boolean,
    sprintDown: boolean,
    cameraYaw: number,
  ): void {
    const inputMag = Math.hypot(moveInput.x, moveInput.y);
    const moving = inputMag > 0.05;

    let sprinting = false;
    if (moving && sprintDown && !staminaLocked && stamina > 0) {
      sprinting = true;
    }
    const targetSpeed = moving ? (sprinting ? RUN_SPEED : WALK_SPEED) : 0;

    const sinY = Math.sin(cameraYaw);
    const cosY = Math.cos(cameraYaw);
    let worldX = 0;
    let worldZ = 0;
    if (moving) {
      const wx = -sinY * -moveInput.y + cosY * moveInput.x;
      const wz = -cosY * -moveInput.y + -sinY * moveInput.x;
      const len = Math.hypot(wx, wz);
      worldX = (wx / len) * targetSpeed;
      worldZ = (wz / len) * targetSpeed;
      const targetYaw = Math.atan2(-wx, -wz);
      yaw = lerpAngle(yaw, targetYaw, TURN_LERP);
    }

    if (jumpDown && !wasJumpDown && grounded) {
      verticalVelocity = JUMP_VELOCITY;
    }
    wasJumpDown = jumpDown;

    verticalVelocity += GRAVITY * dt;
    if (verticalVelocity < MAX_FALL_SPEED) verticalVelocity = MAX_FALL_SPEED;
    if (grounded && verticalVelocity < 0) verticalVelocity = 0;

    desiredMove.x = worldX * dt;
    desiredMove.y = verticalVelocity * dt;
    desiredMove.z = worldZ * dt;

    controller.computeColliderMovement(collider, desiredMove);
    const corrected = controller.computedMovement();

    const t = body.translation();
    body.setNextKinematicTranslation(
      new RAPIER.Vector3(t.x + corrected.x, t.y + corrected.y, t.z + corrected.z),
    );

    wasGrounded = grounded;
    grounded = controller.computedGrounded();

    if (sprinting) {
      stamina = Math.max(0, stamina - STAMINA_DRAIN_PER_SEC * dt);
      if (stamina < STAMINA_LOCKOUT_THRESHOLD) staminaLocked = true;
    } else {
      stamina = Math.min(1, stamina + STAMINA_REGEN_PER_SEC * dt);
      if (stamina >= STAMINA_MIN_FOR_SPRINT) staminaLocked = false;
    }

    let next: CharacterState = state;
    if (!grounded) {
      next = verticalVelocity > 0 ? 'jumping' : 'falling';
    } else if (!wasGrounded && (state === 'falling' || state === 'jumping')) {
      next = 'landed';
      landedTimer = LANDED_DURATION;
    } else if (landedTimer > 0) {
      landedTimer -= dt;
      next = landedTimer <= 0 ? 'idle' : 'landed';
    } else if (moving) {
      next = sprinting ? 'running' : 'walking';
    } else {
      next = 'idle';
    }
    state = next;
  }

  function postStep(_dt: number, time: number, activity: ProspectingActivity | null): void {
    const t = body.translation();
    group.position.set(t.x, t.y, t.z);
    group.rotation.y = yaw;

    // Animation dispatch — task overlay wins over movement state.
    if (activity) {
      switch (activity.step) {
        case 'dig':
          applyDig(rig, time, activity.progress);
          break;
        case 'classify':
          applyClassify(rig, time, activity.progress);
          break;
        case 'pan':
          applyPan(rig, time, activity.progress);
          break;
        case 'collect':
          applyCollect(rig, time, activity.progress);
          break;
      }
      return;
    }

    switch (state) {
      case 'walking':
        applyWalk(rig, time);
        break;
      case 'running':
        applyRun(rig, time);
        break;
      case 'jumping':
        applyJumping(rig);
        break;
      case 'falling':
        applyFalling(rig);
        break;
      case 'landed': {
        const t01 = Math.max(0, Math.min(1, 1 - landedTimer / LANDED_DURATION));
        applyLanded(rig, t01);
        break;
      }
      case 'idle':
      default:
        applyIdle(rig, time);
        break;
    }
  }

  return {
    group,
    preStep,
    postStep,
    getPosition: () => {
      const t = body.translation();
      return new THREE.Vector3(t.x, t.y, t.z);
    },
    getYaw: () => yaw,
    getState: () => state,
    getStamina: () => stamina,
    getColliderHandle: () => collider.handle,
    serialize() {
      const t = body.translation();
      return {
        position: { x: t.x, y: t.y, z: t.z },
        rotation: { yaw, pitch: 0 },
        stamina,
      };
    },
  };
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}
