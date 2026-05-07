import * as THREE from 'three';

export interface RendererBundle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  ambient: THREE.AmbientLight;
  sun: THREE.DirectionalLight;
  render(): void;
  dispose(): void;
}

export function createRenderer(canvas: HTMLCanvasElement): RendererBundle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x88aacc);
  // Soft shadows. The shadow camera bounds + per-mesh castShadow flags are
  // configured in main.ts; here we just enable the pipeline.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x88aacc);
  scene.fog = new THREE.Fog(0x88aacc, 50, 250);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
  // Initial pose; the camera rig (Phase 1) takes over each frame.
  camera.position.set(0, 5, 8);
  camera.lookAt(0, 1.5, 0);

  // Lighting — initial values are placeholders. The sky controller (Phase 7)
  // drives color, intensity, and sun position from the time-of-day clock.
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(50, 80, 30);
  // Shadow camera covers a 120×120m square around the player (set each
  // frame in main.ts by repositioning sun + target relative to charPos).
  // 2048² shadow map is the sweet spot for 60–120m coverage on modern
  // hardware — 1024² is visibly aliased on tree silhouettes from a few
  // meters out.
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  // Bias values tuned to hide acne without producing noticeable peter-pan.
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(sun.target);

  const onResize = (): void => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  };
  window.addEventListener('resize', onResize);

  return {
    scene,
    camera,
    renderer,
    ambient,
    sun,
    render: () => renderer.render(scene, camera),
    dispose: () => {
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    },
  };
}
