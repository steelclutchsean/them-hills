import * as THREE from 'three';
import type { SkyGrade } from '@/render/atmosphere';

// Outdoor image-based light, rebuilt only when the sky crosses a coarse
// bucket (night / golden / day, clear / overcast). A per-frame PMREM would
// hitch; four to six cubes per day-night cycle is enough for the trees,
// character, and boulders to track the sun.

const ENV_FRAG = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uGround;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  varying vec3 vDir;
  void main() {
    vec3 dir = normalize(vDir);
    float h = smoothstep(-0.15, 0.65, dir.y);
    vec3 col = mix(uHorizon, uZenith, h);
    col = mix(uGround, col, smoothstep(-0.4, 0.05, dir.y));
    float sun = pow(max(dot(dir, normalize(uSunDir)), 0.0), 28.0);
    col += uSunColor * sun * 1.6;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const ENV_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export interface EnvironmentController {
  update(grade: SkyGrade): void;
  dispose(): void;
}

export function createEnvironmentController(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
): EnvironmentController {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const uniforms = {
    uHorizon: { value: new THREE.Color(0x9bb8d3) },
    uZenith: { value: new THREE.Color(0x6a92c4) },
    uGround: { value: new THREE.Color(0x3d4a28) },
    uSunDir: { value: new THREE.Vector3(0.2, 0.9, 0.1) },
    uSunColor: { value: new THREE.Color(0xfff1d0) },
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(8, 16, 12),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: ENV_VERT,
      fragmentShader: ENV_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  envScene.add(mesh);

  let bucket = '';
  let current: THREE.Texture | null = null;

  function key(grade: SkyGrade): string {
    const elev = grade.sunDirection.y;
    const band = elev < -0.02 ? 'night' : elev < 0.22 ? 'golden' : elev < 0.7 ? 'day' : 'noon';
    const cover = grade.cloudCover > 0.72 ? 'storm' : grade.cloudCover > 0.5 ? 'gray' : 'clear';
    return `${band}:${cover}`;
  }

  function rebuild(grade: SkyGrade): void {
    (uniforms.uHorizon.value as THREE.Color).copy(grade.horizon);
    const zenith = uniforms.uZenith.value as THREE.Color;
    zenith.copy(grade.horizon).multiplyScalar(0.55);
    zenith.r *= 0.7;
    zenith.b = Math.min(1, zenith.b * 1.35 + 0.05);
    (uniforms.uGround.value as THREE.Color).copy(grade.ground);
    (uniforms.uSunDir.value as THREE.Vector3).copy(grade.sunDirection);
    (uniforms.uSunColor.value as THREE.Color).copy(grade.sunColor);
    const next = pmrem.fromScene(envScene, 0.06).texture;
    const prev = current;
    current = next;
    scene.environment = next;
    if (prev) prev.dispose();
  }

  return {
    update(grade) {
      const nextKey = key(grade);
      if (nextKey === bucket && current) return;
      bucket = nextKey;
      rebuild(grade);
    },
    dispose() {
      if (current) current.dispose();
      pmrem.dispose();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    },
  };
}
