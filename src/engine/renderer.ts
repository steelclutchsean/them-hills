import * as THREE from 'three';

export interface RendererBundle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  render(): void;
  dispose(): void;
}

export function createRenderer(canvas: HTMLCanvasElement): RendererBundle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x88aacc);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x88aacc, 50, 250);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
  // Initial pose; the camera rig (Phase 1) takes over each frame.
  camera.position.set(0, 5, 8);
  camera.lookAt(0, 1.5, 0);

  // Lighting (placeholder — Phase 6 brings the painterly skybox + sun rig)
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(50, 80, 30);
  scene.add(sun);

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
    render: () => renderer.render(scene, camera),
    dispose: () => {
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    },
  };
}
