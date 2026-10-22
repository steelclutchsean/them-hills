import * as THREE from 'three';

// Planar reflection of the banks and trees. One low-res target, mirrored
// camera, oblique clip so the riverbed is not in the reflection.
//
// The pass must not change tone mapping, output color space, or whether
// shadows are enabled. Each of those rebuilds every material program, and
// on SwiftShader that rebuild never returned a frame. Objects opt in with
// layer 1. Grass, the character, and the water stay on layer 0.

export const REFLECTION_LAYER = 1;
/** Trees only. The software mirror uses this so the target is trunks, not meadow. */
export const TREE_MIRROR_LAYER = 2;

export const reflectionUniforms = {
  uReflect: { value: null as THREE.Texture | null },
  uReflProjView: { value: new THREE.Matrix4() },
  uHasReflect: { value: 0 },
  /** 1 = screen-space flip of a tree prepass. 0 = projective planar mirror. */
  uMirrorMode: { value: 0 },
  uHorizon: { value: 0.55 },
  uResolution: { value: new THREE.Vector2(1280, 720) },
};

export interface WaterReflection {
  setEnabled(on: boolean): void;
  readonly enabled: boolean;
  /** Software GL mirrors trees only. A full-scene mirror filled the target with meadow. */
  setTreesOnly(on: boolean): void;
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

/**
 * The beauty pass hides trees that sit in a scene camera. The mirror still
 * needs those trunks. Only the fade clones are touched, so LOD impostors
 * stay hidden, and opacity is restored before the beauty draw.
 */
export function revealFadedMirrorTrees(scene: THREE.Scene): () => void {
  const mask = new THREE.Layers();
  mask.set(TREE_MIRROR_LAYER);
  const touched: { mesh: THREE.Mesh; visible: boolean; opacity: number }[] = [];
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.layers.test(mask)) return;
    if (mesh.userData.baseMat === undefined) return;
    const mat = mesh.material as THREE.Material & { opacity?: number };
    if (Array.isArray(mesh.material)) return;
    touched.push({
      mesh,
      visible: mesh.visible,
      opacity: typeof mat.opacity === 'number' ? mat.opacity : 1,
    });
    mesh.visible = true;
    if (typeof mat.opacity === 'number') mat.opacity = 1;
  });
  return () => {
    for (const item of touched) {
      item.mesh.visible = item.visible;
      const mat = item.mesh.material as THREE.Material & { opacity?: number };
      if (!Array.isArray(item.mesh.material) && typeof mat.opacity === 'number') {
        mat.opacity = item.opacity;
      }
    }
  };
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

export function markTreeMirror(root: THREE.Object3D): void {
  root.traverse((obj) => {
    obj.layers.enable(TREE_MIRROR_LAYER);
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      // One-time. The mirror camera sits under the creek, so front faces
      // point away from it. DoubleSide compiles once and is the same picture
      // from outside the trunk.
      if (mat && mat.side === THREE.FrontSide) mat.side = THREE.DoubleSide;
    }
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
    format: THREE.RGBAFormat,
    depthBuffer: true,
    generateMipmaps: false,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
  });
  reflectionUniforms.uReflect.value = target.texture;

  const virtual = new THREE.PerspectiveCamera();
  virtual.layers.set(REFLECTION_LAYER);
  let enabled = false;
  let treesOnly = false;
  let stride = 1;
  let tick = 0;

  const rotationMatrix = new THREE.Matrix4();
  const targetPos = new THREE.Vector3();
  const view = new THREE.Vector3();
  const prevClear = new THREE.Color();
  const normal = new THREE.Vector3(0, 1, 0);
  const reflectorPos = new THREE.Vector3();
  const cameraPos = new THREE.Vector3();
  const lookAtPosition = new THREE.Vector3(0, 0, -1);

  return {
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = on;
      reflectionUniforms.uHasReflect.value = on ? 1 : 0;
    },
    setTreesOnly(on) {
      treesOnly = on;
      virtual.layers.set(on ? TREE_MIRROR_LAYER : REFLECTION_LAYER);
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
      // Software GL flips the frame the beauty pass already drew. A second
      // render of the trees kept the main thread busy long enough that the
      // boot screen never went idle. Real GPUs keep the projective mirror.
      if (treesOnly) {
        reflectionUniforms.uMirrorMode.value = 1;
        reflectionUniforms.uHasReflect.value = 0;
        return;
      }
      reflectionUniforms.uMirrorMode.value = 0;
      if (tick % stride !== 0) return;

      virtual.layers.set(treesOnly ? TREE_MIRROR_LAYER : REFLECTION_LAYER);
      virtual.fov = camera.fov;
      virtual.aspect = camera.aspect;
      virtual.near = Math.max(0.05, camera.near);
      virtual.far = treesOnly ? Math.min(camera.far, 160) : 120;

      if (treesOnly) {
        virtual.position.copy(camera.position);
        virtual.quaternion.copy(camera.quaternion);
        virtual.up.copy(camera.up);
        const mirrorW = 320;
        const mirrorH = Math.max(120, Math.round(mirrorW / Math.max(camera.aspect, 0.5)));
        if (target.width !== mirrorW || target.height !== mirrorH) target.setSize(mirrorW, mirrorH);
      } else {
        // Reflect the view camera across the creek plane.
        cameraPos.copy(camera.position);
        reflectorPos.set(cameraPos.x, planeY, cameraPos.z);
        view.subVectors(reflectorPos, cameraPos);
        if (view.dot(normal) > 0) return;

        view.reflect(normal).negate();
        view.add(reflectorPos);

        rotationMatrix.extractRotation(camera.matrixWorld);
        lookAtPosition.set(0, 0, -1);
        lookAtPosition.applyMatrix4(rotationMatrix);
        lookAtPosition.add(cameraPos);
        targetPos.subVectors(reflectorPos, lookAtPosition);
        targetPos.reflect(normal).negate();
        targetPos.add(reflectorPos);

        virtual.position.copy(view);
        virtual.up.set(0, 1, 0).applyMatrix4(rotationMatrix);
        virtual.up.reflect(normal);
        virtual.lookAt(targetPos);
      }
      virtual.updateProjectionMatrix();
      virtual.updateMatrixWorld();

      // Clip space, not the 0.5-biased texture matrix. The water shader applies
      // that bias once. Applying it here as well pinned every sample on the
      // sky clear.
      reflectionUniforms.uReflProjView.value.multiplyMatrices(
        virtual.projectionMatrix,
        virtual.matrixWorldInverse,
      );

      const prevTarget = renderer.getRenderTarget();
      const prevShadowAuto = renderer.shadowMap.autoUpdate;
      const prevXr = renderer.xr.enabled;
      renderer.getClearColor(prevClear);
      const prevAlpha = renderer.getClearAlpha();
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(target);
      // Alpha 0 means the water shader ignores the sample and uses the
      // screen-space mirror instead.
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      // Full scene fog turns the far bank into a flat wash, so the mirror
      // keeps the trees dark and green instead of the fog color.
      const expFog = scene.fog instanceof THREE.FogExp2 ? scene.fog : null;
      const prevDensity = expFog?.density ?? 0;
      if (expFog) expFog.density = prevDensity * 0.08;
      const restoreTrees = treesOnly ? revealFadedMirrorTrees(scene) : null;
      renderer.render(scene, virtual);
      restoreTrees?.();
      if (expFog) expFog.density = prevDensity;

      renderer.shadowMap.autoUpdate = prevShadowAuto;
      renderer.xr.enabled = prevXr;
      renderer.setClearColor(prevClear, prevAlpha);
      renderer.setRenderTarget(prevTarget);
      reflectionUniforms.uHasReflect.value = 1;
    },
  };
}
