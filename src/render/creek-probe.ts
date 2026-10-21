import * as THREE from 'three';
import { revealFadedMirrorTrees, TREE_MIRROR_LAYER } from '@/render/reflection';

// Baked creek probes. A live mirror of the banks never survived SwiftShader,
// so each probe is a low-res cube rendered once the trees exist, and again
// only when the sun has moved by more than an hour. The water samples the
// nearest cube with a parallax-corrected box projection.

const PROBE_COUNT = 4;
const PROBE_SIZE = 112;
const CULL_RADIUS = 38;

export interface CreekProbePoint {
  x: number;
  y: number;
  z: number;
}

function vecs(): THREE.Vector3[] {
  return Array.from({ length: PROBE_COUNT }, () => new THREE.Vector3());
}

export const creekProbeUniforms = {
  uProbe0: { value: null as THREE.Texture | null },
  uProbe1: { value: null as THREE.Texture | null },
  uProbe2: { value: null as THREE.Texture | null },
  uProbe3: { value: null as THREE.Texture | null },
  uHasProbe: { value: 0 },
  uProbePos: { value: vecs() },
  uProbeMin: { value: vecs() },
  uProbeMax: { value: vecs() },
};

export interface CreekProbe {
  setEnabled(on: boolean): void;
  setPoints(points: readonly CreekProbePoint[]): void;
  invalidate(): void;
  readonly ready: boolean;
  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, hour: number): void;
}

const layerMask = new THREE.Layers();
layerMask.set(TREE_MIRROR_LAYER);

export function createCreekProbe(): CreekProbe {
  const slots = Array.from({ length: PROBE_COUNT }, () => {
    const target = new THREE.WebGLCubeRenderTarget(PROBE_SIZE, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      generateMipmaps: false,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
    });
    target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    const cube = new THREE.CubeCamera(0.45, 70, target);
    cube.layers.set(TREE_MIRROR_LAYER);
    return { cube, target };
  });
  const textures = [
    creekProbeUniforms.uProbe0,
    creekProbeUniforms.uProbe1,
    creekProbeUniforms.uProbe2,
    creekProbeUniforms.uProbe3,
  ];
  slots.forEach((slot, i) => {
    const uniform = textures[i];
    if (uniform) uniform.value = slot.target.texture;
  });

  const points: CreekProbePoint[] = [];
  let enabled = true;
  let dirty = false;
  let ready = false;
  let bakedHour = Number.NaN;
  const scratch = new THREE.Vector3();
  const prevClear = new THREE.Color();

  const hideFar = (scene: THREE.Scene, origin: THREE.Vector3): THREE.Mesh[] => {
    const hidden: THREE.Mesh[] = [];
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible || !mesh.layers.test(layerMask)) return;
      const geom = mesh.geometry;
      if (!geom.boundingSphere) geom.computeBoundingSphere();
      const sphere = geom.boundingSphere;
      if (!sphere) return;
      scratch.copy(sphere.center);
      mesh.localToWorld(scratch);
      const limit = sphere.radius + CULL_RADIUS;
      if (scratch.distanceTo(origin) <= limit) return;
      mesh.visible = false;
      hidden.push(mesh);
    });
    return hidden;
  };

  return {
    setEnabled(on) {
      enabled = on;
      if (!on) creekProbeUniforms.uHasProbe.value = 0;
    },
    setPoints(next) {
      points.length = 0;
      for (const point of next) points.push({ x: point.x, y: point.y, z: point.z });
      if (ready) dirty = true;
    },
    invalidate() {
      dirty = true;
    },
    get ready() {
      return ready;
    },
    update(renderer, scene, hour) {
      if (!enabled || points.length === 0) {
        creekProbeUniforms.uHasProbe.value = ready ? 1 : 0;
        return;
      }
      const hourMoved = ready && Number.isFinite(bakedHour) && Math.abs(hour - bakedHour) >= 1.15;
      if (!dirty && !hourMoved) return;

      const expFog = scene.fog instanceof THREE.FogExp2 ? scene.fog : null;
      const prevDensity = expFog?.density ?? 0;
      if (expFog) expFog.density = 0;
      renderer.getClearColor(prevClear);
      const prevAlpha = renderer.getClearAlpha();
      const sky = expFog ? expFog.color : prevClear;
      const prevShadow = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      scene.updateMatrixWorld(true);
      const restoreTrees = revealFadedMirrorTrees(scene);
      try {
        for (let i = 0; i < PROBE_COUNT; i++) {
          const point = points[i] ?? points[points.length - 1];
          const slot = slots[i];
          if (!point || !slot) continue;
          const pos = creekProbeUniforms.uProbePos.value[i];
          const boxMin = creekProbeUniforms.uProbeMin.value[i];
          const boxMax = creekProbeUniforms.uProbeMax.value[i];
          if (!pos || !boxMin || !boxMax) continue;
          pos.set(point.x, point.y, point.z);
          boxMin.set(point.x - 26, point.y - 3.5, point.z - 26);
          boxMax.set(point.x + 26, point.y + 18, point.z + 26);
          slot.cube.position.copy(pos);
          slot.cube.updateMatrixWorld(true);
          const hidden = hideFar(scene, pos);
          renderer.setClearColor(sky, 1);
          slot.cube.update(renderer, scene);
          for (const mesh of hidden) mesh.visible = true;
        }
        creekProbeUniforms.uHasProbe.value = 1;
        ready = true;
        bakedHour = hour;
        dirty = false;
      } finally {
        restoreTrees();
        renderer.shadowMap.autoUpdate = prevShadow;
        renderer.setClearColor(prevClear, prevAlpha);
        if (expFog) expFog.density = prevDensity;
      }
    },
  };
}
