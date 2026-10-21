import * as THREE from 'three';

// Planar reflection of the banks and trees. One low-res target, mirrored
// camera, oblique clip so the riverbed is not in the reflection. The water
// shader samples `reflectionUniforms`. Off when the quality preset says so.

export const reflectionUniforms = {
  uReflect: { value: null as THREE.Texture | null },
  uReflProjView: { value: new THREE.Matrix4() },
  uHasReflect: { value: 0 },
};

const SIZE = 192;

export interface WaterReflection {
  setEnabled(on: boolean): void;
  readonly enabled: boolean;
  register(mesh: THREE.Object3D): void;
  update(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    planeY: number,
  ): void;
}

export function createWaterReflection(): WaterReflection {
  const target = new THREE.WebGLRenderTarget(SIZE, SIZE, {
    depthBuffer: true,
    generateMipmaps: false,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
  });
  reflectionUniforms.uReflect.value = target.texture;

  const virtual = new THREE.PerspectiveCamera();
  const hidden: THREE.Object3D[] = [];
  let enabled = false;

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
    register(mesh) {
      hidden.push(mesh);
    },
    update(renderer, scene, camera, planeY) {
      if (!enabled) {
        reflectionUniforms.uHasReflect.value = 0;
        return;
      }
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
      virtual.far = camera.far;
      virtual.near = camera.near;
      virtual.fov = camera.fov;
      virtual.aspect = camera.aspect;
      virtual.updateProjectionMatrix();
      virtual.updateMatrixWorld();
      virtual.projectionMatrix.copy(camera.projectionMatrix);

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
      const prevShadow = renderer.shadowMap.enabled;
      const prevXr = renderer.xr.enabled;
      const prevTone = renderer.toneMapping;
      const prevSpace = renderer.outputColorSpace;
      renderer.getClearColor(prevClear);
      const prevAlpha = renderer.getClearAlpha();

      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.enabled = false;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      for (const mesh of hidden) mesh.visible = false;
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(scene, virtual);
      for (const mesh of hidden) mesh.visible = true;

      renderer.toneMapping = prevTone;
      renderer.outputColorSpace = prevSpace;
      renderer.shadowMap.enabled = prevShadow;
      renderer.shadowMap.autoUpdate = prevShadowAuto;
      renderer.xr.enabled = prevXr;
      renderer.setClearColor(prevClear, prevAlpha);
      renderer.setRenderTarget(prevTarget);
      reflectionUniforms.uHasReflect.value = 1;
    },
  };
}
