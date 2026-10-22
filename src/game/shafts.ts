import * as THREE from 'three';
import { RENDER_QUALITY } from '@/engine/quality';
import { canopyPoints } from '@/game/scatter';

// Crepuscular rays. Each shaft is one soft ribbon: the far end sits in a
// canopy gap, the near end follows the sun down and fades out in the air.
// The ribbon faces the camera so it still has area when we look along it.
// It is never pulled toward the lens and it never lies on the ground.
// Strength is a few percent of added light. Looking away, the view term
// kills it.

export interface LightShafts {
  group: THREE.Group;
  update(
    sunDir: THREE.Vector3,
    anchor: THREE.Vector3,
    enabled: boolean,
    camera: THREE.Camera,
    hour: number,
  ): void;
}

const SHAFT_COUNT = 6;

interface Gap {
  x: number;
  y: number;
  z: number;
}

function shaftNoise(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[shafts] canvas 2d unavailable');
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n =
        Math.sin(x * 0.37 + y * 0.21) * 0.5 +
        Math.sin(x * 0.11 - y * 0.47) * 0.3 +
        Math.sin((x + y) * 0.73) * 0.2;
      const v = Math.round((n * 0.5 + 0.5) * 255);
      const i = (y * size + x) * 4;
      image.data[i] = v;
      image.data[i + 1] = v;
      image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function makeQuad(): THREE.Mesh {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
  geom.setIndex([0, 1, 2, 2, 1, 3]);
  const mesh = new THREE.Mesh(geom);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 2;
  return mesh;
}

function findGaps(origin: THREE.Vector3, sunFlat: THREE.Vector3): Gap[] {
  const angled: { along: number; side: number; y: number }[] = [];
  for (const tree of canopyPoints()) {
    const dx = tree.x - origin.x;
    const dz = tree.z - origin.z;
    const along = dx * sunFlat.x + dz * sunFlat.z;
    if (along < 8 || along > 48) continue;
    const side = dx * -sunFlat.z + dz * sunFlat.x;
    if (Math.abs(side) > 24) continue;
    angled.push({ along, side, y: tree.y });
  }
  angled.sort((a, b) => a.side - b.side);
  const gaps: Gap[] = [];
  for (let i = 0; i < angled.length - 1; i++) {
    const a = angled[i];
    const b = angled[i + 1];
    if (!a || !b) continue;
    const sep = b.side - a.side;
    if (sep < 2.2 || sep > 16) continue;
    const side = (a.side + b.side) * 0.5;
    const along = (a.along + b.along) * 0.5;
    gaps.push({
      x: origin.x + sunFlat.x * along + -sunFlat.z * side,
      y: Math.max(a.y, b.y),
      z: origin.z + sunFlat.z * along + sunFlat.x * side,
    });
  }
  const picked: Gap[] = [];
  const take = (gap: Gap) => {
    if (picked.some((kept) => Math.hypot(kept.x - gap.x, kept.z - gap.z) < 4.2)) return;
    picked.push(gap);
  };
  for (const gap of gaps) {
    take(gap);
    if (picked.length >= SHAFT_COUNT) return picked;
  }
  for (const tree of angled) {
    const side = tree.side + (tree.side >= 0 ? 3.2 : -3.2);
    take({
      x: origin.x + sunFlat.x * tree.along + -sunFlat.z * side,
      y: tree.y,
      z: origin.z + sunFlat.z * tree.along + sunFlat.x * side,
    });
    if (picked.length >= SHAFT_COUNT) break;
  }
  return picked;
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
    toneMapped: false,
    uniforms: {
      // Warm dust. The core, after the view and haze gates, adds about a tenth.
      uColor: { value: new THREE.Color(0.85, 0.68, 0.38) },
      uStrength: { value: 0.82 },
      uView: { value: 0 },
      uHaze: { value: 0.8 },
      uTime: { value: 0 },
      uNoise: { value: shaftNoise() },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vDist;
      void main() {
        vUv = uv;
        vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
        vDist = length(viewPos.xyz);
        gl_Position = projectionMatrix * viewPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      uniform float uView;
      uniform float uHaze;
      uniform float uTime;
      uniform sampler2D uNoise;
      varying vec2 vUv;
      varying float vDist;
      void main() {
        float across = abs(vUv.x - 0.5) * 2.0;
        float soft = exp(-across * across * 1.7);
        // vUv.y is 0 at the low end and 1 at the canopy. Die before the ground.
        float along = smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.42, vUv.y);
        float n = texture2D(uNoise, vUv * vec2(0.8, 2.4) + vec2(0.0, uTime * 0.015)).r;
        float depthFade = smoothstep(3.0, 10.0, vDist) * (1.0 - smoothstep(42.0, 88.0, vDist));
        float alpha = soft * along * (0.84 + 0.16 * n) * depthFade * uView * uHaze * uStrength;
        if (alpha < 0.003) discard;
        // Premultiplied. Additive blending on this renderer is ONE, ONE,
        // so the rgb already carries the coverage.
        gl_FragColor = vec4(uColor * alpha, 1.0);
      }
    `,
  });

  const beams: THREE.Mesh[] = [];
  const widths = [1.15, 1.7, 1.3, 2.05, 1.2, 1.55];
  for (let i = 0; i < SHAFT_COUNT; i++) {
    const mesh = makeQuad();
    mesh.name = `shaft-${i}`;
    mesh.material = material;
    group.add(mesh);
    beams.push(mesh);
  }

  const sunFlat = new THREE.Vector3();
  const toCam = new THREE.Vector3();
  const widthDir = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const crown = new THREE.Vector3();
  const ndcA = new THREE.Vector3();
  const ndcB = new THREE.Vector3();
  const spans: { x0: number; y0: number; x1: number; y1: number }[] = [];
  let clock = 0;

  return {
    group,
    update(sunDir, _anchor, enabled, camera, hour) {
      clock += 0.016;
      const dawn = hour > 5.7 && hour < 8.1;
      const golden = hour > 16.3 && hour < 18.15;
      const show = enabled && RENDER_QUALITY.shafts && sunDir.y > 0.02 && (dawn || golden);
      spans.length = 0;
      if (!show) {
        group.visible = false;
        publishSpans(spans);
        return;
      }
      camera.updateMatrixWorld();
      camera.getWorldDirection(forward);
      const toward = Math.max(0, forward.dot(sunDir));
      // Strongest looking into the sun. Looking away, nothing.
      const viewTerm = Math.pow(toward, 1.7);
      if (viewTerm < 0.05) {
        group.visible = false;
        material.uniforms.uView!.value = 0;
        publishSpans(spans);
        return;
      }
      group.visible = true;
      material.uniforms.uTime!.value = clock;
      material.uniforms.uView!.value = viewTerm;
      const elev = Math.max(0, sunDir.y);
      material.uniforms.uHaze!.value = 0.45 + (1 - Math.min(elev / 0.42, 1)) * 0.7;
      sunFlat.set(sunDir.x, 0, sunDir.z);
      if (sunFlat.lengthSq() < 1e-4) sunFlat.set(1, 0, 0);
      sunFlat.normalize();
      ndcA.copy(camera.position).addScaledVector(sunDir, 80);
      ndcA.project(camera);
      const sunX = ndcA.x;
      camUp.setFromMatrixColumn(camera.matrixWorld, 1);
      const gaps = findGaps(camera.position, sunFlat);
      const floorY = camera.position.y - 0.35;
      for (let i = 0; i < beams.length; i++) {
        const beam = beams[i];
        const gap = gaps[i];
        if (!beam || !gap) {
          if (beam) beam.visible = false;
          continue;
        }
        crown.set(gap.x, Math.max(gap.y, floorY + 6), gap.z);
        const length = 14 + (i % 3) * 3.5;
        end.copy(crown).addScaledVector(sunDir, 1.6);
        start.copy(crown).addScaledVector(sunDir, -length);
        if (start.y < floorY) {
          const spanY = end.y - start.y;
          const climb = spanY > 0.4 ? Math.min(0.78, (floorY - start.y) / spanY) : 1;
          start.lerp(end, climb);
          if (start.y < floorY) start.y = floorY;
        }
        if (end.distanceTo(start) < 4) {
          beam.visible = false;
          continue;
        }
        axis.copy(end).sub(start);
        mid.copy(start).add(end).multiplyScalar(0.5);
        toCam.copy(camera.position).sub(mid);
        widthDir.crossVectors(axis, toCam);
        if (widthDir.lengthSq() < axis.lengthSq() * 0.04) widthDir.crossVectors(axis, camUp);
        if (widthDir.lengthSq() < 1e-6) {
          widthDir.set(-sunFlat.z, 0, sunFlat.x);
        }
        widthDir.normalize();
        ndcA.copy(start).project(camera);
        ndcB.copy(end).project(camera);
        const behind = ndcB.z > 1;
        const midX = (ndcA.x + ndcB.x) * 0.5;
        const farFromSun = Math.abs(midX - sunX) > 0.9 && Math.abs(ndcB.x - sunX) > 0.75;
        if (behind || farFromSun) {
          beam.visible = false;
          continue;
        }
        beam.visible = true;
        spans.push({ x0: ndcA.x, y0: ndcA.y, x1: ndcB.x, y1: ndcB.y });
        const half = widths[i] ?? 1.4;
        const attr = beam.geometry.getAttribute('position') as THREE.BufferAttribute;
        const place = (index: number, base: THREE.Vector3, span: number) => {
          attr.setXYZ(
            index,
            base.x + widthDir.x * span,
            base.y + widthDir.y * span,
            base.z + widthDir.z * span,
          );
        };
        // Equal world width. Perspective narrows the far end. The near end
        // is not dragged at the camera, so the streaks do not converge on it.
        place(0, start, -half);
        place(1, start, half);
        place(2, end, -half * 0.72);
        place(3, end, half * 0.72);
        attr.needsUpdate = true;
        beam.position.set(0, 0, 0);
        beam.quaternion.identity();
        beam.scale.set(1, 1, 1);
        beam.updateMatrix();
      }
      publishSpans(spans);
    },
  };
}

function publishSpans(spans: readonly { x0: number; y0: number; x1: number; y1: number }[]): void {
  const host = globalThis as { __creekDebug?: { shafts?: unknown } };
  const debug = host.__creekDebug ?? {};
  debug.shafts = spans.map((span) => ({ ...span }));
  host.__creekDebug = debug;
}
