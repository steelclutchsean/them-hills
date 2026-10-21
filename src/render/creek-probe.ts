import * as THREE from 'three';
import { revealFadedMirrorTrees, TREE_MIRROR_LAYER } from '@/render/reflection';

// Baked creek probes. A live mirror never survived SwiftShader, so each probe
// is a low-res cube rendered once the trees exist, and again only when the
// sun has moved by more than an hour. One face is drawn per frame so the
// bake cannot stall the prospect loop. The water samples the nearest cube
// with a parallax-corrected box projection.
//
// A single planar capture, mirrored from the camera that is actually looking
// at the creek, is the sharp picture. It is only applied while that camera
// is still there. Walking away falls back to the cubes.

const PROBE_COUNT = 4;
const PROBE_SIZE = 160;
const CULL_RADIUS = 42;
const FACES = 6;

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
  uPlanar: { value: null as THREE.Texture | null },
  uPlanarVP: { value: new THREE.Matrix4() },
  uHasPlanar: { value: 0 },
  /** 1 when the live camera still matches the camera the planar was mirrored from. */
  uPlanarMatch: { value: 0 },
};

export interface CreekProbe {
  setEnabled(on: boolean): void;
  setPoints(points: readonly CreekProbePoint[]): void;
  invalidate(): void;
  readonly ready: boolean;
  readonly planarMatch: number;
  update(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    hour: number,
    camera: THREE.Camera | null,
    waterY: number,
  ): void;
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
    const cube = new THREE.CubeCamera(0.45, 80, target);
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
  let phase: 'idle' | 'cubes' | 'planar' = 'idle';
  let faceCursor = 0;
  let planarMatch = 0;

  const scratch = new THREE.Vector3();
  const prevClear = new THREE.Color();
  const planarTarget = new THREE.WebGLRenderTarget(768, 432, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    generateMipmaps: false,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
  });
  planarTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
  creekProbeUniforms.uPlanar.value = planarTarget.texture;
  const planarCam = new THREE.PerspectiveCamera(60, 768 / 432, 0.1, 120);
  planarCam.layers.set(TREE_MIRROR_LAYER);
  const synthCam = new THREE.PerspectiveCamera(60, 768 / 432, 0.1, 120);

  const normal = new THREE.Vector3(0, 1, 0);
  const planePoint = new THREE.Vector3();
  const view = new THREE.Vector3();
  const look = new THREE.Vector3();
  const target = new THREE.Vector3();
  const rotation = new THREE.Matrix4();
  const sampleProj = new THREE.Matrix4();
  const reflectorPlane = new THREE.Plane();
  const clipPlane = new THREE.Vector4();
  const q = new THREE.Vector4();
  const planarEye = new THREE.Vector3();
  const planarFwd = new THREE.Vector3();
  const liveFwd = new THREE.Vector3();

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

  const mirrorOf = (camera: THREE.Camera, planeY: number): void => {
    planePoint.set(camera.position.x, planeY, camera.position.z);
    view.subVectors(planePoint, camera.position);
    view.reflect(normal).negate();
    view.add(planePoint);

    rotation.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rotation);
    look.add(camera.position);
    target.subVectors(planePoint, look);
    target.reflect(normal).negate();
    target.add(planePoint);

    planarCam.position.copy(view);
    planarCam.up.set(0, 1, 0).applyMatrix4(rotation);
    planarCam.up.reflect(normal);
    planarCam.lookAt(target);
    const src = camera as THREE.PerspectiveCamera;
    planarCam.far = src.far || 200;
    planarCam.near = src.near || 0.1;
    planarCam.updateMatrixWorld();
    planarCam.projectionMatrix.copy(src.projectionMatrix);
    planarCam.projectionMatrixInverse.copy(src.projectionMatrixInverse);

    sampleProj.copy(planarCam.projectionMatrix);
    creekProbeUniforms.uPlanarVP.value.multiplyMatrices(sampleProj, planarCam.matrixWorldInverse);

    // Oblique near plane on the water, so the bake keeps the banks and the
    // crowns and drops the underground the mirrored camera is sitting in.
    reflectorPlane.setFromNormalAndCoplanarPoint(normal, planePoint);
    reflectorPlane.applyMatrix4(planarCam.matrixWorldInverse);
    clipPlane.set(
      reflectorPlane.normal.x,
      reflectorPlane.normal.y,
      reflectorPlane.normal.z,
      reflectorPlane.constant,
    );
    const pe = planarCam.projectionMatrix.elements;
    q.set(
      (Math.sign(clipPlane.x) + pe[8]!) / pe[0]!,
      (Math.sign(clipPlane.y) + pe[9]!) / pe[5]!,
      -1,
      (1 + pe[10]!) / pe[14]!,
    );
    const denom = clipPlane.dot(q);
    if (Math.abs(denom) > 1e-6) {
      clipPlane.multiplyScalar(2 / denom);
      pe[2] = clipPlane.x;
      pe[6] = clipPlane.y;
      pe[10] = clipPlane.z + 1 - 0.02;
      pe[14] = clipPlane.w;
    }

    planarEye.copy(camera.position);
    camera.getWorldDirection(planarFwd);
  };

  const refreshMatch = (camera: THREE.Camera | null): void => {
    planarMatch = 0;
    if (camera && creekProbeUniforms.uHasPlanar.value > 0.5) {
      camera.getWorldDirection(liveFwd);
      const dist = camera.position.distanceTo(planarEye);
      const aim = liveFwd.dot(planarFwd);
      if (dist < 8 && aim > 0.92) planarMatch = 1;
    }
    creekProbeUniforms.uPlanarMatch.value = planarMatch;
  };

  const placeProbe = (index: number): THREE.Vector3 | null => {
    const point = points[index] ?? points[points.length - 1];
    const slot = slots[index];
    if (!point || !slot) return null;
    const pos = creekProbeUniforms.uProbePos.value[index];
    const boxMin = creekProbeUniforms.uProbeMin.value[index];
    const boxMax = creekProbeUniforms.uProbeMax.value[index];
    if (!pos || !boxMin || !boxMax) return null;
    pos.set(point.x, point.y, point.z);
    boxMin.set(point.x - 26, point.y - 3.5, point.z - 26);
    boxMax.set(point.x + 26, point.y + 18, point.z + 26);
    slot.cube.position.copy(pos);
    slot.cube.updateMatrixWorld(true);
    return pos;
  };

  return {
    setEnabled(on) {
      enabled = on;
      if (!on) {
        creekProbeUniforms.uHasProbe.value = 0;
        creekProbeUniforms.uHasPlanar.value = 0;
        creekProbeUniforms.uPlanarMatch.value = 0;
        planarMatch = 0;
      }
    },
    setPoints(next) {
      points.length = 0;
      for (const point of next) points.push({ x: point.x, y: point.y, z: point.z });
      if (ready) dirty = true;
    },
    invalidate() {
      dirty = true;
      ready = false;
      phase = 'idle';
      faceCursor = 0;
      creekProbeUniforms.uHasPlanar.value = 0;
      creekProbeUniforms.uPlanarMatch.value = 0;
      planarMatch = 0;
    },
    get ready() {
      return ready;
    },
    get planarMatch() {
      return planarMatch;
    },
    update(renderer, scene, hour, camera, waterY) {
      refreshMatch(camera);
      if (!enabled || points.length === 0) {
        creekProbeUniforms.uHasProbe.value = ready ? 1 : 0;
        return;
      }
      if (phase === 'idle') {
        const hourMoved = ready && Number.isFinite(bakedHour) && Math.abs(hour - bakedHour) >= 1.15;
        if (!dirty && !hourMoved) return;
        phase = 'cubes';
        faceCursor = 0;
        ready = false;
        creekProbeUniforms.uHasPlanar.value = 0;
        creekProbeUniforms.uPlanarMatch.value = 0;
        planarMatch = 0;
      }

      const expFog = scene.fog instanceof THREE.FogExp2 ? scene.fog : null;
      const prevDensity = expFog?.density ?? 0;
      if (expFog) expFog.density = 0;
      renderer.getClearColor(prevClear);
      const prevAlpha = renderer.getClearAlpha();
      const sky = expFog ? expFog.color : prevClear;
      const prevShadow = renderer.shadowMap.autoUpdate;
      renderer.shadowMap.autoUpdate = false;
      const prevXr = renderer.xr.enabled;
      renderer.xr.enabled = false;
      scene.updateMatrixWorld(true);
      const restoreTrees = revealFadedMirrorTrees(scene);
      const prevTarget = renderer.getRenderTarget();
      const prevFace = renderer.getActiveCubeFace();
      const prevMip = renderer.getActiveMipmapLevel();
      try {
        if (phase === 'cubes') {
          const probeIndex = Math.floor(faceCursor / FACES);
          const face = faceCursor % FACES;
          const slot = slots[probeIndex];
          const origin = placeProbe(probeIndex);
          if (slot && origin) {
            const cube = slot.cube;
            if (cube.coordinateSystem !== renderer.coordinateSystem) {
              cube.coordinateSystem = renderer.coordinateSystem;
              cube.updateCoordinateSystem();
              cube.position.copy(origin);
              cube.updateMatrixWorld(true);
            }
            const faceCam = cube.children[face] as THREE.PerspectiveCamera | undefined;
            if (faceCam) {
              const hidden = hideFar(scene, origin);
              try {
                renderer.setClearColor(sky, 1);
                renderer.setRenderTarget(slot.target, face);
                renderer.clear(true, true, true);
                renderer.render(scene, faceCam);
              } finally {
                for (const mesh of hidden) mesh.visible = true;
              }
            }
          }
          faceCursor += 1;
          if (faceCursor >= PROBE_COUNT * FACES) phase = 'planar';
        } else {
          const hero = points[2] ?? points[0];
          const planeY = Number.isFinite(waterY) ? waterY : (hero?.y ?? 0) - 0.45;
          let source: THREE.Camera | null = null;
          if (camera && hero) {
            const nearCreek = points.some(
              (point) => Math.hypot(camera.position.x - point.x, camera.position.z - point.z) < 48,
            );
            if (nearCreek && camera.position.y > planeY + 0.8) source = camera;
          }
          if (!source && hero) {
            synthCam.position.set(hero.x - 9, planeY + 2.6, hero.z + 1.2);
            synthCam.up.set(0, 1, 0);
            synthCam.lookAt(hero.x + 10, planeY + 1.4, hero.z - 0.4);
            synthCam.updateProjectionMatrix();
            synthCam.updateMatrixWorld(true);
            source = synthCam;
          }
          if (source) {
            mirrorOf(source, planeY);
            const hidden = hideFar(scene, planarEye);
            try {
              renderer.setRenderTarget(planarTarget);
              renderer.setClearColor(sky, 1);
              renderer.clear(true, true, true);
              renderer.render(scene, planarCam);
            } finally {
              for (const mesh of hidden) mesh.visible = true;
            }
            creekProbeUniforms.uHasPlanar.value = 1;
          }
          creekProbeUniforms.uHasProbe.value = 1;
          ready = true;
          bakedHour = hour;
          dirty = false;
          phase = 'idle';
          refreshMatch(camera);
        }
      } finally {
        renderer.setRenderTarget(prevTarget, prevFace, prevMip);
        renderer.xr.enabled = prevXr;
        restoreTrees();
        renderer.shadowMap.autoUpdate = prevShadow;
        renderer.setClearColor(prevClear, prevAlpha);
        if (expFog) expFog.density = prevDensity;
      }
    },
  };
}
