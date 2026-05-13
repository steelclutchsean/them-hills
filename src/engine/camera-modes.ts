import * as THREE from 'three';

// Camera mode controller. Today's third-person spring-arm rig (camera-rig.ts)
// runs every frame. When a prospect minigame starts, we override it with a
// fixed first-person view anchored at the character's head, pitched down at
// the ground/pan/etc. The captured yaw at entry stays the camera's forward
// direction for the entire minigame — the player can't pan during a stage
// so the view is stable.
//
// Tool meshes mount as children of the camera (camera.add(group)) so they
// inherit the camera's transform — they stay in screen-space "viewmodel"
// positions regardless of where the player is in the world.

const HEAD_HEIGHT = 1.6;
// Look-target offsets in the character's forward direction relative to the
// head. 1m forward and 0.85m below eye level gives roughly a 40° pitch
// down — comfortable for looking at the ground in front of you.
const LOOK_FORWARD = 1.0;
const LOOK_DROP = 0.85;

export interface CameraModeController {
  isInProspectView(): boolean;
  /** Snap to first-person view. `characterYaw` is the camera-rig yaw at
   *  the moment the minigame started — held fixed for the duration. */
  enterProspectView(charPos: THREE.Vector3, characterYaw: number): void;
  exitProspectView(): void;
  /** Per-frame update while in prospect view — follow the character's head
   *  position (movement is locked, but physics may still settle them). */
  updateProspectView(charPos: THREE.Vector3): void;
}

export function createCameraModeController(camera: THREE.PerspectiveCamera): CameraModeController {
  let inProspect = false;
  let lockedYaw = 0;
  // Reusable scratch vectors so the per-frame update doesn't allocate.
  const forward = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();

  function position(charPos: THREE.Vector3): void {
    const eyeY = charPos.y + HEAD_HEIGHT;
    camera.position.set(charPos.x, eyeY, charPos.z);
    // Character forward in XZ derived from camera-rig yaw convention:
    //   yaw=0 → char faces -Z, so forward = (-sin(yaw), 0, -cos(yaw)).
    forward.set(-Math.sin(lockedYaw), 0, -Math.cos(lockedYaw));
    lookTarget.set(
      charPos.x + forward.x * LOOK_FORWARD,
      eyeY - LOOK_DROP,
      charPos.z + forward.z * LOOK_FORWARD,
    );
    camera.lookAt(lookTarget);
  }

  return {
    isInProspectView: () => inProspect,
    enterProspectView(charPos, characterYaw) {
      inProspect = true;
      lockedYaw = characterYaw;
      position(charPos);
    },
    exitProspectView() {
      inProspect = false;
    },
    updateProspectView(charPos) {
      if (!inProspect) return;
      position(charPos);
    },
  };
}
