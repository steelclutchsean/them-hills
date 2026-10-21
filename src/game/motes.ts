import * as THREE from 'three';
import { PALETTE } from '@/render/palette';
import { getQualityName } from '@/engine/quality';

// Dust in daylight, fireflies after dusk. A small point cloud that follows
// the camera so the air between the trees is not empty.

export interface Motes {
  points: THREE.Points;
  update(time: number, anchor: THREE.Vector3, sunHeight: number): void;
  resize(): void;
}

const VERT = /* glsl */ `
  attribute float aPhase;
  uniform float uTime;
  uniform float uNight;
  varying float vNight;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.35 + aPhase) * 0.35;
    p.y += sin(uTime * 0.6 + aPhase * 2.0) * 0.18;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (uNight > 0.5 ? 7.0 : 3.2) * (18.0 / max(1.0, -mv.z));
    vNight = uNight;
  }
`;

const FRAG = /* glsl */ `
  varying float vNight;
  uniform vec3 uDay;
  uniform vec3 uNightColor;
  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float d = dot(uv, uv);
    if (d > 1.0) discard;
    float a = (1.0 - d) * (vNight > 0.5 ? 0.85 : 0.35);
    vec3 col = mix(uDay, uNightColor, vNight);
    gl_FragColor = vec4(col, a);
  }
`;

export function createMotes(capacity: number): Motes {
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(capacity * 3);
  const phases = new Float32Array(capacity);
  for (let i = 0; i < capacity; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 18;
    positions[i * 3 + 1] = Math.random() * 4;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 18;
    phases[i] = Math.random() * Math.PI * 2;
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  const mat = new THREE.ShaderMaterial({
    name: 'Motes',
    uniforms: {
      uTime: { value: 0 },
      uNight: { value: 0 },
      uDay: { value: new THREE.Color(PALETTE.dust) },
      uNightColor: { value: new THREE.Color(0xd6e38a) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geom, mat);
  points.frustumCulled = false;
  points.renderOrder = 2;
  let shown = capacity;

  return {
    points,
    resize() {
      const budget =
        getQualityName() === 'low'
          ? 24
          : getQualityName() === 'medium'
            ? 48
            : getQualityName() === 'ultra'
              ? capacity
              : 72;
      shown = Math.min(capacity, budget);
      geom.setDrawRange(0, shown);
    },
    update(time, anchor, sunHeight) {
      mat.uniforms.uTime!.value = time;
      mat.uniforms.uNight!.value = sunHeight < 0.08 ? 1 : 0;
      const pos = geom.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < shown; i++) {
        let x = pos.getX(i);
        let y = pos.getY(i);
        let z = pos.getZ(i);
        if (Math.abs(x - anchor.x) > 12) x = anchor.x + (Math.random() - 0.5) * 16;
        if (Math.abs(z - anchor.z) > 12) z = anchor.z + (Math.random() - 0.5) * 16;
        if (y < anchor.y - 1 || y > anchor.y + 6) y = anchor.y + Math.random() * 3.5;
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
    },
  };
}
