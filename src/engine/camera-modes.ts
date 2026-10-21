import * as THREE from 'three';

// Prospect camera. Classify, collect, strike, and extract stay first person
// so their viewmodels keep working. Dig and pan stay third person: a close
// camera in front of the hands, looking at the tool focus the wrist aims at.

const HEAD_HEIGHT = 1.6;
const LOOK_FORWARD = 1.0;
const LOOK_DROP = 0.85;
const PROSPECT_FOV = 120;
const DIG_FOV = 46;
const PAN_FOV = 38;

export interface CameraModeController {
  isInProspectView(): boolean;
  /** Snap into a prospect view. `characterYaw` is held for the whole minigame. */
  enterProspectView(charPos: THREE.Vector3, characterYaw: number): void;
  exitProspectView(): void;
  /**
   * Follow the character. `step` selects the framing: dig and pan are the
   * close third-person shots; every other step is the first-person view.
   */
  updateProspectView(charPos: THREE.Vector3, step: string | null, focus: THREE.Vector3): void;
}

export function createCameraModeController(camera: THREE.PerspectiveCamera): CameraModeController {
  let inProspect = false;
  let lockedYaw = 0;
  let savedFov = camera.fov;
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();

  function setFov(next: number): void {
    if (camera.fov === next) return;
    camera.fov = next;
    camera.updateProjectionMatrix();
  }

  function firstPerson(charPos: THREE.Vector3): void {
    const eyeY = charPos.y + HEAD_HEIGHT;
    camera.position.set(charPos.x, eyeY, charPos.z);
    forward.set(-Math.sin(lockedYaw), 0, -Math.cos(lockedYaw));
    lookTarget.set(
      charPos.x + forward.x * LOOK_FORWARD,
      eyeY - LOOK_DROP,
      charPos.z + forward.z * LOOK_FORWARD,
    );
    camera.lookAt(lookTarget);
    setFov(PROSPECT_FOV);
  }

  function closeThird(charPos: THREE.Vector3, focus: THREE.Vector3, step: string): void {
    forward.set(-Math.sin(lockedYaw), 0, -Math.cos(lockedYaw));
    right.set(-forward.z, 0, forward.x);
    const pan = step === 'pan';
    const dist = pan ? 1.55 : 1.95;
    const side = 0.42;
    const height = pan ? 0.62 : 0.85;
    camera.position.set(
      focus.x + forward.x * dist + right.x * side,
      Math.max(focus.y + height, charPos.y + 0.9),
      focus.z + forward.z * dist + right.z * side,
    );
    camera.lookAt(focus);
    setFov(pan ? PAN_FOV : DIG_FOV);
  }

  return {
    isInProspectView: () => inProspect,
    enterProspectView(charPos, characterYaw) {
      inProspect = true;
      lockedYaw = characterYaw;
      savedFov = camera.fov;
      firstPerson(charPos);
    },
    exitProspectView() {
      inProspect = false;
      camera.fov = savedFov;
      camera.updateProjectionMatrix();
    },
    updateProspectView(charPos, step, focus) {
      if (!inProspect) return;
      if (step === 'dig' || step === 'pan') closeThird(charPos, focus, step);
      else firstPerson(charPos);
    },
  };
}
