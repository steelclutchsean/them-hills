import * as THREE from 'three';
import { RAPIER } from '@/physics/world';
import type { LookDelta } from '@/input/manager';

// Third-person spring-arm camera. Pivot at character head height; camera sits behind
// at armLength, with yaw/pitch driven by getLookDelta. A Rapier ray-cast from the
// pivot toward the desired camera position prevents clipping into terrain.
//
// Conventions (Three.js right-handed, +Y up):
//   yaw=0     → camera behind character at +Z (character faces -Z = "north")
//   yaw<0     → camera orbits CCW viewed from above; the camera's view direction
//               rotates clockwise from N → E → S → W (matches "mouse right = turn right")
//   pitch=0   → camera level with pivot
//   pitch>0   → camera higher than pivot (looking down at character)
//
// Compass bearing (degrees, 0=N, 90=E, 180=S, 270=W) is derived from yaw via
// `bearingFromYaw()` exported below.
//
// Frame ordering: applyLook() updates yaw/pitch immediately so the character can
// read getYaw() for its movement basis, then placeCamera() runs after physics step
// to position the camera using the character's final translation.

const PITCH_MIN = -0.45;
const PITCH_MAX = 1.35;
const RAY_BUFFER = 0.25;
const MIN_CAMERA_DISTANCE = 0.6;

export interface CameraRigOpts {
  camera: THREE.PerspectiveCamera;
  initialYaw: number;
  initialPitch: number;
  armLength?: number;
  pivotHeight?: number;
}

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  applyLook(look: LookDelta): void;
  placeCamera(targetPos: THREE.Vector3, world: RAPIER.World, excludeColliderHandle: number): void;
  getYaw(): number;
  getPitch(): number;
}

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Convert camera yaw (radians) to compass bearing (degrees, 0=N, 90=E, 180=S, 270=W). */
export function bearingFromYaw(yawRad: number): number {
  const deg = (-yawRad * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

export function createCameraRig(opts: CameraRigOpts): CameraRig {
  const armLength = opts.armLength ?? 5;
  const pivotHeight = opts.pivotHeight ?? 1.4;

  const camera = opts.camera;
  let yaw = opts.initialYaw;
  let pitch = opts.initialPitch;

  const offset = new THREE.Vector3();
  const pivot = new THREE.Vector3();
  const rayOrigin = new RAPIER.Vector3(0, 0, 0);
  const rayDir = new RAPIER.Vector3(0, 0, 0);

  return {
    camera,
    applyLook(look) {
      // Mouse right (+dx) → camera view turns right (yaw decreases).
      // Mouse down (+dy) → camera looks down at character (pitch increases).
      yaw -= look.dx;
      pitch += look.dy;
      if (pitch < PITCH_MIN) pitch = PITCH_MIN;
      else if (pitch > PITCH_MAX) pitch = PITCH_MAX;
    },
    placeCamera(targetPos, world, excludeColliderHandle) {
      pivot.set(targetPos.x, targetPos.y + pivotHeight, targetPos.z);

      offset.set(0, 0, armLength);
      offset.applyAxisAngle(X_AXIS, -pitch);
      offset.applyAxisAngle(Y_AXIS, yaw);

      const dirX = offset.x / armLength;
      const dirY = offset.y / armLength;
      const dirZ = offset.z / armLength;

      rayOrigin.x = pivot.x;
      rayOrigin.y = pivot.y;
      rayOrigin.z = pivot.z;
      rayDir.x = dirX;
      rayDir.y = dirY;
      rayDir.z = dirZ;

      const ray = new RAPIER.Ray(rayOrigin, rayDir);
      const excludeCollider = world.getCollider(excludeColliderHandle);
      const hit = world.castRay(ray, armLength, true, undefined, undefined, excludeCollider);

      const distance =
        hit !== null ? Math.max(MIN_CAMERA_DISTANCE, hit.timeOfImpact - RAY_BUFFER) : armLength;

      camera.position.set(
        pivot.x + dirX * distance,
        pivot.y + dirY * distance,
        pivot.z + dirZ * distance,
      );
      camera.lookAt(pivot);
    },
    getYaw: () => yaw,
    getPitch: () => pitch,
  };
}
