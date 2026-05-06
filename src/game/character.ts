import * as THREE from 'three';
import { RAPIER } from '@/physics/world';
import type { MoveInput } from '@/input/manager';

// Movement, jump, gravity, stamina, and a tiny state machine driving placeholder visuals.
// Three.js group:
//   - position is set from the Rapier body translation (capsule center)
//   - rotation.y is the character yaw (lerps toward movement direction)
//   - sub-mesh handles bob/lean/squash so the group's transform stays clean

export type CharacterState = 'idle' | 'walking' | 'running' | 'jumping' | 'falling' | 'landed';

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
  postStep(dt: number): void;
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

  // ---- Three.js visuals ----
  const group = new THREE.Group();
  group.position.set(opts.initialPosition.x, opts.initialPosition.y, opts.initialPosition.z);
  group.rotation.y = opts.initialYaw;

  const visualBody = new THREE.Mesh(
    new THREE.CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_HALF_HEIGHT * 2, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0xc89b3b, flatShading: true, roughness: 0.7 }),
  );
  group.add(visualBody);

  // Forward-facing cone — useful as a placeholder for "which way is the character facing"
  // until a proper rigged model is sourced in M3.
  const face = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.35, 8),
    new THREE.MeshStandardMaterial({ color: 0xff5555, flatShading: true }),
  );
  face.rotation.x = -Math.PI / 2;
  face.position.set(0, 0.55, -0.55);
  group.add(face);

  // ---- State ----
  let yaw = opts.initialYaw;
  let stamina = opts.initialStamina;
  let staminaLocked = false;
  let verticalVelocity = 0;
  let grounded = false;
  let wasGrounded = false;
  let wasJumpDown = false;
  let state: CharacterState = 'idle';
  let landedTimer = 0;
  let bobPhase = 0;

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

    // Camera-relative basis. Three.js rotation around +Y by θ takes +X → -Z.
    // cameraForward = (-sin θ, 0, -cos θ); cameraRight = (cos θ, 0, -sin θ).
    const sinY = Math.sin(cameraYaw);
    const cosY = Math.cos(cameraYaw);
    let worldX = 0;
    let worldZ = 0;
    if (moving) {
      // moveInput.y is positive when pressing back; W (forward) is moveInput.y = -1.
      // moveInput.x is positive right (D); A is -1.
      const wx = -sinY * -moveInput.y + cosY * moveInput.x;
      const wz = -cosY * -moveInput.y + -sinY * moveInput.x;
      const len = Math.hypot(wx, wz);
      worldX = (wx / len) * targetSpeed;
      worldZ = (wz / len) * targetSpeed;
      // rotation.y = atan2(-x, -z) so local -Z aligns with world (wx, _, wz).
      const targetYaw = Math.atan2(-wx, -wz);
      yaw = lerpAngle(yaw, targetYaw, TURN_LERP);
    }

    // Edge-triggered jump — released-and-repressed required to re-jump.
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

    // Stamina
    if (sprinting) {
      stamina = Math.max(0, stamina - STAMINA_DRAIN_PER_SEC * dt);
      if (stamina < STAMINA_LOCKOUT_THRESHOLD) staminaLocked = true;
    } else {
      stamina = Math.min(1, stamina + STAMINA_REGEN_PER_SEC * dt);
      if (stamina >= STAMINA_MIN_FOR_SPRINT) staminaLocked = false;
    }

    // State machine
    let next: CharacterState = state;
    if (!grounded) {
      next = verticalVelocity > 0 ? 'jumping' : 'falling';
    } else if (!wasGrounded && (state === 'falling' || state === 'jumping')) {
      next = 'landed';
      landedTimer = 0.18;
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

  function postStep(dt: number): void {
    const t = body.translation();
    group.position.set(t.x, t.y, t.z);
    group.rotation.y = yaw;

    // Visual flourishes — placeholder until a proper rigged model lands in M3.
    if (state === 'walking') {
      bobPhase += dt * 9;
      visualBody.position.y = Math.sin(bobPhase) * 0.04;
    } else if (state === 'running') {
      bobPhase += dt * 13;
      visualBody.position.y = Math.sin(bobPhase) * 0.06;
    } else {
      bobPhase = 0;
      visualBody.position.y *= 0.85;
    }

    if (state === 'running') {
      visualBody.rotation.x = lerpScalar(visualBody.rotation.x, -0.08, 0.2);
    } else {
      visualBody.rotation.x = lerpScalar(visualBody.rotation.x, 0, 0.2);
    }

    if (state === 'jumping' || state === 'falling') {
      visualBody.scale.y = lerpScalar(visualBody.scale.y, 1.06, 0.2);
    } else if (state === 'landed') {
      const t01 = Math.max(0, Math.min(1, 1 - landedTimer / 0.18));
      visualBody.scale.y = 0.85 + 0.15 * t01;
    } else {
      visualBody.scale.y = lerpScalar(visualBody.scale.y, 1.0, 0.25);
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

function lerpScalar(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
