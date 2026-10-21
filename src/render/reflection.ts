import * as THREE from 'three';

// Planar reflection of the banks and trees. One low-res target, mirrored
// camera, oblique clip so the riverbed is not in the reflection.
//
// The pass must not change tone mapping, output color space, or whether
// shadows are enabled. Each of those rebuilds every material program, and
// on SwiftShader that rebuild never returned a frame. Objects opt in with
// layer 1. Grass, the character, and the water stay on layer 0.

export const REFLECTION_LAYER = 1;

export const reflectionUniforms = {
  uReflect: { value: null as THREE.Texture | null },
  uReflProjView: { value: new THREE.Matrix4() },
  uHasReflect: { value: 0 },
};

export interface WaterReflection {
  setEnabled(on: boolean): void;
  readonly enabled: boolean;
  setSize(pixels: number): void;
  /** Reuse the last mirror for this many frames. Software GL uses 2. */
  setStride(frames: number): void;
  update(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    planeY: number,
  ): void;
}

/** Anything under a skipped root is left out of the mirror. */
export function skipReflection(root: THREE.Object3D): void {
  root.userData.skipReflection = true;
}

/** Enable layer 1 on a subtree that should appear in the creek mirror. */
export function markReflective(root: THREE.Object3D): void {
  root.traverse((obj) => {
    obj.layers.enable(REFLECTION_LAYER);
  });
}

/** Enable layer 1 on everything that should mirror, honoring skipReflection. */
export function markSceneReflections(scene: THREE.Scene): void {
  scene.traverse((obj) => {
    let cursor: THREE.Object3D | null = obj;
    while (cursor) {
      if (cursor.userData.skipReflection) return;
      cursor = cursor.parent;
    }
    obj.layers.enable(REFLECTION_LAYER);
  });
}

export function createWaterReflection(): WaterReflection {
  let size = 160;
  const target = new THREE.WebGLRenderTarget(size, size, {
    depthBuffer: true,
    generateMipmaps: false,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
  });
  reflectionUniforms.uReflect.value = target.texture;

  const virtual = new THREE.PerspectiveCamera();
  virtual.layers.set(REFLECTION_LAYER);
  let enabled = false;
  let stride = 1;
  let tick = 0;

  const normal = new THREE.Vector3(0, 1, 0);
  const reflectorWorldPosition = new THREE.Vector3();
  const cameraWorldPosition = new THREE.Vector3();
  const rotationMatrix = new THREE.Matrix4();
  const lookAtPosition = new THREE.Vector3(0, 0, -1);
  const targetPos = new THREE.Vector3();
  const view = new THREE.Vector3();
  const clipPlane = new THREE.Vector4();
  const q = new THREE.Vector4();
  const reflectorPlane = new THREE.Plane();
  const textureMatrix = new THREE.Matrix4();
  const prevClear = new THREE.Color();

  return {
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = on;
      reflectionUniforms.uHasReflect.value = on ? 1 : 0;
    },
    setSize(pixels) {
      const next = Math.max(64, Math.min(256, Math.round(pixels)));
      if (next === size) return;
      size = next;
      target.setSize(next, next);
    },
    setStride(frames) {
      stride = Math.max(1, Math.round(frames));
    },
    update(renderer, scene, camera, planeY) {
      if (!enabled) {
        reflectionUniforms.uHasReflect.value = 0;
        return;
      }
      tick += 1;
      if (tick % stride !== 0) return;
      reflectorWorldPosition.set(camera.position.x, planeY, camera.position.z);
      cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
      rotationMatrix.extractRotation(camera.matrixWorld);
      lookAtPosition.set(0, 0, -1);
      lookAtPosition.applyMatrix4(rotationMatrix);
      lookAtPosition.add(cameraWorldPosition);

      view.subVectors(reflectorWorldPosition, cameraWorldPosition);
      view.reflect(normal).negate();
      view.add(reflectorWorldPosition);

      targetPos.subVectors(reflectorWorldPosition, lookAtPosition);
      targetPos.reflect(normal).negate();
      targetPos.add(reflectorWorldPosition);

      virtual.position.copy(view);
      virtual.up.set(0, 1, 0);
      virtual.up.reflect(normal);
      virtual.lookAt(targetPos);
      // Near banks and trees only. A 650m mirror redrew the whole forest
      // and the prospect loop missed its budget on software GL.
      virtual.far = 42;
      virtual.near = camera.near;
      virtual.fov = camera.fov;
      virtual.aspect = camera.aspect;
      virtual.updateProjectionMatrix();
      virtual.updateMatrixWorld();

      textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      textureMatrix.multiply(virtual.projectionMatrix);
      textureMatrix.multiply(virtual.matrixWorldInverse);
      reflectionUniforms.uReflProjView.value.copy(textureMatrix);

      reflectorPlane.setFromNormalAndCoplanarPoint(normal, reflectorWorldPosition);
      reflectorPlane.applyMatrix4(virtual.matrixWorldInverse);
      clipPlane.set(
        reflectorPlane.normal.x,
        reflectorPlane.normal.y,
        reflectorPlane.normal.z,
        reflectorPlane.constant,
      );
      const projectionMatrix = virtual.projectionMatrix;
      const el = projectionMatrix.elements;
      q.x = (Math.sign(clipPlane.x) + el[8]!) / el[0]!;
      q.y = (Math.sign(clipPlane.y) + el[9]!) / el[5]!;
      q.z = -1;
      q.w = (1 + el[10]!) / el[14]!;
      const denom = clipPlane.dot(q);
      if (Math.abs(denom) > 1e-6) clipPlane.multiplyScalar(2 / denom);
      el[2] = clipPlane.x;
      el[6] = clipPlane.y;
      el[10] = clipPlane.z + 1 - 0.003;
      el[14] = clipPlane.w;

      const prevTarget = renderer.getRenderTarget();
      const prevShadowAuto = renderer.shadowMap.autoUpdate;
      const prevXr = renderer.xr.enabled;
      renderer.getClearColor(prevClear);
      const prevAlpha = renderer.getClearAlpha();
      const fog = scene.fog instanceof THREE.FogExp2 ? scene.fog.color : prevClear;

      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(target);
      renderer.setClearColor(fog, 1);
      renderer.clear();
      renderer.render(scene, virtual);

      renderer.shadowMap.autoUpdate = prevShadowAuto;
      renderer.xr.enabled = prevXr;
      renderer.setClearColor(prevClear, prevAlpha);
      renderer.setRenderTarget(prevTarget);
      reflectionUniforms.uHasReflect.value = 1;
    },
  };
}
