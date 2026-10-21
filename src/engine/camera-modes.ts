import * as THREE from 'three';

// Prospect camera. Classify, collect, strike, and extract stay first person
// so their viewmodels keep working. Dig and pan stay third person: a close
// camera in front of the hands, looking at the tool focus the wrist aims at.

const HEAD_HEIGHT = 1.6;
const LOOK_FORWARD = 1.0;
const LOOK_DROP = 0.85;
const PROSPECT_FOV = 120;
const DIG_FOV = 46;
const PAN_FOV = 32;

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
  /** FOV the prospect view authored this frame, or null while the chase camera owns it. */
  authorFov(): number | null;
}

/**
 * Close third-person frame for a dig or pan pose. Used by review shots so
 * the art pass shows the hands and the gold without entering a minigame.
 */
export function frameToolShot(
  camera: THREE.PerspectiveCamera,
  charPos: THREE.Vector3,
  yaw: number,
  step: string,
  focus: THREE.Vector3,
): void {
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const pan = step === 'pan';
  const dist = pan ? 1.16 : 2.05;
  const side = pan ? 0.28 : 0.48;
  const height = pan ? 0.28 : 0.55;
  camera.position.set(
    focus.x + forward.x * dist + right.x * side,
    Math.max(focus.y + height, charPos.y + 0.85),
    focus.z + forward.z * dist + right.z * side,
  );
  camera.lookAt(focus.x, focus.y + (pan ? 0.46 : 0), focus.z);
  const fov = pan ? PAN_FOV : DIG_FOV;
  if (camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

export function createCameraModeController(camera: THREE.PerspectiveCamera): CameraModeController {
  let inProspect = false;
  let lockedYaw = 0;
  let savedFov = camera.fov;
  let authoredFov: number | null = null;
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();

  function setFov(next: number): void {
    authoredFov = next;
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
    const dist = pan ? 1.18 : 1.95;
    const side = pan ? 0.24 : 0.42;
    const height = pan ? 0.34 : 0.85;
    camera.position.set(
      focus.x + forward.x * dist + right.x * side,
      Math.max(focus.y + height, charPos.y + 0.9),
      focus.z + forward.z * dist + right.z * side,
    );
    camera.lookAt(focus.x, focus.y + (pan ? 0.42 : 0), focus.z);
    setFov(pan ? PAN_FOV : DIG_FOV);
  }

  // Player and the world machine, three-quarter, far enough that neither
  // clips the near plane. `focus` is the machine, not the wrist.
  function machineFrame(charPos: THREE.Vector3, focus: THREE.Vector3, step: string): void {
    const spec =
      step === 'sluice'
        ? { back: 2.4, side: 2.7, height: 2.55, fov: 38, look: -0.05 }
        : step === 'tom'
          ? { back: 3.1, side: 2.9, height: 2.7, fov: 36, look: -0.02 }
          : step === 'monitor'
            ? { back: 3.4, side: 2.5, height: 2.05, fov: 40, look: 0.28 }
            : { back: 2.3, side: 2.15, height: 2.25, fov: 36, look: 0.02 };
    forward.set(focus.x - charPos.x, 0, focus.z - charPos.z);
    if (forward.lengthSq() < 0.04) {
      forward.set(-Math.sin(lockedYaw), 0, -Math.cos(lockedYaw));
    } else {
      forward.normalize();
    }
    right.set(-forward.z, 0, forward.x);
    camera.position.set(
      charPos.x - forward.x * spec.back + right.x * spec.side,
      charPos.y + spec.height,
      charPos.z - forward.z * spec.back + right.z * spec.side,
    );
    lookTarget.set(
      charPos.x * 0.38 + focus.x * 0.62,
      charPos.y * 0.45 + focus.y * 0.55 + spec.look,
      charPos.z * 0.38 + focus.z * 0.62,
    );
    camera.lookAt(lookTarget);
    setFov(spec.fov);
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
      authoredFov = null;
      camera.fov = savedFov;
      camera.updateProjectionMatrix();
    },
    authorFov: () => (inProspect ? authoredFov : null),
    updateProspectView(charPos, step, focus) {
      if (!inProspect) return;
      if (step === 'dig' || step === 'pan') closeThird(charPos, focus, step);
      else if (step === 'rocker' || step === 'sluice' || step === 'tom' || step === 'monitor') {
        machineFrame(charPos, focus, step);
      } else firstPerson(charPos);
    },
  };
}
