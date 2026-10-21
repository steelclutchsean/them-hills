import * as THREE from 'three';
import { RENDER_QUALITY } from '@/engine/quality';
import { createEnvironmentController, type EnvironmentController } from '@/engine/environment';
import { createPostPipeline, type PostPipeline } from '@/engine/post';
import type { SkyGrade } from '@/render/atmosphere';
import { initFrameUniforms, syncFrameUniforms } from '@/render/frame-uniforms';

export interface RendererBundle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  ambient: THREE.AmbientLight;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  /**
   * Sky writes the sun's arc position every frame. Call this after that,
   * before syncFrame, to slide the shadow frustum onto the player and
   * return the un-offset world sun direction.
   */
  followSun(target: THREE.Vector3): THREE.Vector3;
  /** Copy light objects into the shared custom-shader uniform block. */
  syncFrame(time: number, sunDirection: THREE.Vector3): void;
  /** Coarse sky bucket → PMREM. Safe to call every frame. */
  updateEnvironment(grade: SkyGrade): void;
  render(): void;
  dispose(): void;
}

export function createRenderer(canvas: HTMLCanvasElement): RendererBundle {
  initFrameUniforms();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER_QUALITY.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x9bb8d3);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = RENDER_QUALITY.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = null;
  scene.fog = new THREE.FogExp2(0x9bb8d3, 0.0085);
  scene.environmentIntensity = RENDER_QUALITY.environmentIntensity;

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 650);
  camera.position.set(0, 5, 8);
  camera.lookAt(0, 1.5, 0);

  const ambient = new THREE.AmbientLight(0xc5d0dc, 0.45);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0x8eafd0, 0x3d4a28, 0.32);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1d0, 1.15);
  sun.position.set(40, 80, 24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(RENDER_QUALITY.shadowMapSize, RENDER_QUALITY.shadowMapSize);
  const ext = RENDER_QUALITY.shadowExtent;
  sun.shadow.camera.left = -ext;
  sun.shadow.camera.right = ext;
  sun.shadow.camera.top = ext;
  sun.shadow.camera.bottom = -ext;
  sun.shadow.camera.near = RENDER_QUALITY.shadowNear;
  sun.shadow.camera.far = RENDER_QUALITY.shadowFar;
  sun.shadow.bias = RENDER_QUALITY.shadowBias;
  sun.shadow.normalBias = RENDER_QUALITY.shadowNormalBias;
  sun.shadow.radius = RENDER_QUALITY.shadowRadius;
  sun.shadow.intensity = RENDER_QUALITY.shadowIntensity;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);

  const environment: EnvironmentController = createEnvironmentController(renderer, scene);
  const post: PostPipeline = createPostPipeline(renderer, scene, camera);

  const sunDir = new THREE.Vector3();

  const onResize = (): void => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    post.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  return {
    scene,
    camera,
    renderer,
    ambient,
    hemi,
    sun,
    followSun(target) {
      sunDir.copy(sun.position);
      if (sunDir.lengthSq() < 1e-4) sunDir.set(0.2, 1, 0.2);
      sunDir.normalize();
      sun.position.x += target.x;
      sun.position.z += target.z;
      sun.target.position.set(target.x, 0, target.z);
      sun.target.updateMatrixWorld();
      return sunDir;
    },
    syncFrame(time, direction) {
      syncFrameUniforms({
        time,
        sunDirection: direction,
        sunColor: sun.color,
        sunIntensity: sun.intensity,
        ambientColor: ambient.color,
        ambientIntensity: ambient.intensity,
        hemiSky: hemi.color,
        hemiGround: hemi.groundColor,
        hemiIntensity: hemi.intensity,
      });
    },
    updateEnvironment(grade) {
      environment.update(grade);
    },
    render: () => post.render(),
    dispose: () => {
      window.removeEventListener('resize', onResize);
      post.dispose();
      environment.dispose();
      renderer.dispose();
    },
  };
}
