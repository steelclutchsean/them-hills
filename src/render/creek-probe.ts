import * as THREE from 'three';

// A cube of the banks and trees, sampled by the water shader. The planar
// mirror was rendering, and the creek still came back gray: the reflected
// view was a fog wash of the near meadow. This probe sits in the channel
// and looks out at the timber, on every quality tier including software GL.
// It does not flip tone mapping, output color space, or shadow maps.

export const creekProbeUniforms = {
  uProbe: { value: null as THREE.Texture | null },
  uHasProbe: { value: 0 },
};

export interface CreekProbe {
  setEnabled(on: boolean): void;
  setSize(pixels: number): void;
  setStride(frames: number): void;
  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, x: number, y: number, z: number): void;
}

export function createCreekProbe(): CreekProbe {
  let size = 64;
  const target = new THREE.WebGLCubeRenderTarget(size, {
    depthBuffer: true,
    generateMipmaps: false,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
  });
  // The cube is written as linear HDR (render targets skip tone mapping).
  // Leave it linear so the water shader can grade it once with the frame.
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;
  creekProbeUniforms.uProbe.value = target.texture;

  const cube = new THREE.CubeCamera(0.35, 140, target);
  let enabled = true;
  let stride = 4;
  let tick = 0;
  const hidden: THREE.Object3D[] = [];

  return {
    setEnabled(on) {
      enabled = on;
      if (!on) creekProbeUniforms.uHasProbe.value = 0;
    },
    setSize(pixels) {
      const next = Math.max(32, Math.min(128, Math.round(pixels)));
      if (next === size) return;
      size = next;
      target.setSize(next, next);
    },
    setStride(frames) {
      stride = Math.max(1, Math.round(frames));
    },
    update(renderer, scene, x, y, z) {
      if (!enabled) {
        creekProbeUniforms.uHasProbe.value = 0;
        return;
      }
      tick += 1;
      if (tick > 2 && tick % stride !== 0) return;
      cube.position.set(x, y + 2.6, z);
      cube.updateMatrixWorld(true);

      scene.traverse((obj) => {
        if (!obj.visible) return;
        const name = obj.name;
        // Grass is thousands of blades. The banks and trees are the reflection.
        if (name.startsWith('water_') || name === 'guide-beacon' || name === 'grass-field') {
          obj.visible = false;
          hidden.push(obj);
        }
      });

      const expFog = scene.fog instanceof THREE.FogExp2 ? scene.fog : null;
      const prevDensity = expFog?.density ?? 0;
      if (expFog) expFog.density = prevDensity * 0.1;
      const prevShadow = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      cube.update(renderer, scene);
      renderer.shadowMap.autoUpdate = prevShadow;
      if (expFog) expFog.density = prevDensity;
      for (const obj of hidden) obj.visible = true;
      hidden.length = 0;
      creekProbeUniforms.uHasProbe.value = 1;
    },
  };
}
