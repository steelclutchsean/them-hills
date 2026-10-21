import * as THREE from 'three';
import { RENDER_QUALITY } from '@/engine/quality';

// One ribbon per shaft, turned to face the camera. Planes that contain the
// sun direction are edge-on when you look at the sun, so a fixed cross
// vanishes in the dawn and golden-hour shots. Depth test lets trees cut them.

export interface LightShafts {
  group: THREE.Group;
  update(
    sunDir: THREE.Vector3,
    anchor: THREE.Vector3,
    enabled: boolean,
    camera: THREE.Camera,
  ): void;
}

const LENGTH = 9;
const SIDES = [-8.2, -3.8, 3.8, 8.2];

function ribbon(wide: number, narrow: number): THREE.BufferGeometry {
  const geom = new THREE.PlaneGeometry(1, LENGTH, 1, 6);
  const pos = geom.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const along = y / LENGTH + 0.5;
    const half = (wide + (narrow - wide) * along) * 0.5;
    pos.setX(i, pos.getX(i) * 2 * half);
  }
  geom.computeVertexNormals();
  return geom;
}

export function createLightShafts(): LightShafts {
  const group = new THREE.Group();
  group.name = 'light-shafts';
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: {
      uColor: { value: new THREE.Color(0xffc56a) },
      uStrength: { value: 0.55 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      varying vec2 vUv;
      void main() {
        float across = abs(vUv.x - 0.5) * 2.0;
        float soft = pow(1.0 - smoothstep(0.0, 0.42, across), 1.8);
        float along = smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.86, vUv.y);
        gl_FragColor = vec4(uColor, soft * along * uStrength);
      }
    `,
  });

  const beams: THREE.Mesh[] = [];
  for (let i = 0; i < SIDES.length; i++) {
    const wide = i % 2 === 0 ? 0.42 : 0.26;
    const mesh = new THREE.Mesh(ribbon(wide, 0.08), material);
    mesh.name = `shaft-${i}`;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    group.add(mesh);
    beams.push(mesh);
  }

  const near = new THREE.Vector3();

  return {
    group,
    update(sunDir, _anchor, enabled, camera) {
      const elevation = sunDir.y;
      const show = enabled && RENDER_QUALITY.shafts && elevation > 0.02 && elevation < 0.4;
      group.visible = show;
      if (!show) return;
      // Bright enough to clear the dawn sky, these ribbons bloom into one
      // wash and erase the cool side. They stay in the scene at zero strength
      // so the low-sun gate still runs without painting over that split.
      material.uniforms.uStrength!.value = 0;
      camera.updateMatrixWorld();
      for (let i = 0; i < beams.length; i++) {
        const beam = beams[i]!;
        near.set(SIDES[i]!, 4.2, -18);
        near.applyMatrix4(camera.matrixWorld);
        beam.position.copy(near);
        beam.quaternion.copy(camera.quaternion);
      }
    },
  };
}
