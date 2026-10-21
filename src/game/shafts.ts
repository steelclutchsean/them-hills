import * as THREE from 'three';
import { RENDER_QUALITY } from '@/engine/quality';
import { canopyPoints } from '@/game/scatter';

// Volumetric shafts. Each one is a soft quad whose long axis is the sun
// direction and whose face is turned toward the camera, placed in a gap
// between tree crowns. They exist at dawn and golden hour only. The cool
// corner of the sky is not where they sit.

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
  mesh.renderOrder = 3;
  return mesh;
}

function findGaps(origin: THREE.Vector3, sunFlat: THREE.Vector3): Gap[] {
  const angled: { along: number; side: number; y: number }[] = [];
  for (const tree of canopyPoints()) {
    const dx = tree.x - origin.x;
    const dz = tree.z - origin.z;
    const along = dx * sunFlat.x + dz * sunFlat.z;
    if (along < 9 || along > 44) continue;
    const side = dx * -sunFlat.z + dz * sunFlat.x;
    if (Math.abs(side) > 22) continue;
    angled.push({ along, side, y: tree.y });
  }
  angled.sort((a, b) => a.side - b.side);
  const gaps: Gap[] = [];
  for (let i = 0; i < angled.length - 1; i++) {
    const a = angled[i];
    const b = angled[i + 1];
    if (!a || !b) continue;
    const sep = b.side - a.side;
    if (sep < 2.4 || sep > 16) continue;
    const side = (a.side + b.side) * 0.5;
    const along = (a.along + b.along) * 0.5;
    gaps.push({
      x: origin.x + sunFlat.x * along + -sunFlat.z * side,
      y: (a.y + b.y) * 0.5,
      z: origin.z + sunFlat.z * along + sunFlat.x * side,
    });
  }
  const picked: Gap[] = [];
  const take = (gap: Gap) => {
    if (picked.some((kept) => Math.hypot(kept.x - gap.x, kept.z - gap.z) < 4.5)) return;
    picked.push(gap);
  };
  for (const gap of gaps) {
    take(gap);
    if (picked.length >= SHAFT_COUNT) return picked;
  }
  // A lone crown still opens a gap beside it. The shaft sits off the trunk.
  for (const tree of angled) {
    const side = tree.side + (tree.side >= 0 ? 3.4 : -3.4);
    take({
      x: origin.x + sunFlat.x * tree.along + -sunFlat.z * side,
      y: tree.y,
      z: origin.z + sunFlat.z * tree.along + sunFlat.x * side,
    });
    if (picked.length >= SHAFT_COUNT) break;
  }
  // Several shafts, even when the crowns are sparse. They stay in the same
  // sunward wedge as the trees so the open sky does not get a wash.
  if (angled.length > 0 && picked.length < SHAFT_COUNT) {
    const crownY = angled.reduce((sum, tree) => sum + tree.y, 0) / angled.length;
    const sides = [-8.5, -3.6, 2.8, 7.4, -0.8, 5.2];
    const alongs = [14, 20, 27, 17, 33, 24];
    for (let i = 0; i < sides.length && picked.length < SHAFT_COUNT; i++) {
      const side = sides[i] ?? 0;
      const along = alongs[i] ?? 18;
      take({
        x: origin.x + sunFlat.x * along + -sunFlat.z * side,
        y: crownY,
        z: origin.z + sunFlat.z * along + sunFlat.x * side,
      });
    }
  }
  return picked;
}

export function createLightShafts(): LightShafts {
  const group = new THREE.Group();
  group.name = 'light-shafts';
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color(1.55, 0.72, 0.22) },
      uStrength: { value: 0.85 },
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
      uniform float uTime;
      uniform sampler2D uNoise;
      varying vec2 vUv;
      varying float vDist;
      void main() {
        float across = abs(vUv.x - 0.5) * 2.0;
        float soft = pow(1.0 - smoothstep(0.05, 0.92, across), 1.7);
        float along = smoothstep(0.0, 0.07, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
        float n = texture2D(uNoise, vUv * vec2(1.1, 3.2) + vec2(0.0, uTime * 0.04)).r;
        float depthFade = smoothstep(1.5, 6.0, vDist) * (1.0 - smoothstep(48.0, 78.0, vDist));
        float alpha = soft * along * (0.62 + 0.38 * n) * depthFade * uStrength;
        if (alpha < 0.02) discard;
        // Premultiplied. Additive blending on this renderer is ONE, ONE.
        gl_FragColor = vec4(uColor * alpha, 1.0);
      }
    `,
  });

  const beams: THREE.Mesh[] = [];
  const widths = [0.55, 1.05, 0.72, 1.35, 0.62, 0.95];
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
  const forward = new THREE.Vector3();
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const crown = new THREE.Vector3();
  const ndcA = new THREE.Vector3();
  const ndcB = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  const spans: { x0: number; y0: number; x1: number; y1: number }[] = [];
  let clock = 0;

  return {
    group,
    update(sunDir, _anchor, enabled, camera, hour) {
      clock += 0.016;
      const dawn = hour > 5.7 && hour < 8.1;
      const golden = hour > 16.3 && hour < 18.15;
      const show = enabled && RENDER_QUALITY.shafts && sunDir.y > 0.02 && (dawn || golden);
      group.visible = show;
      spans.length = 0;
      if (!show) {
        publishSpans(spans);
        return;
      }
      material.uniforms.uTime!.value = clock;
      sunFlat.set(sunDir.x, 0, sunDir.z);
      if (sunFlat.lengthSq() < 1e-4) sunFlat.set(1, 0, 0);
      sunFlat.normalize();
      camera.updateMatrixWorld();
      camera.getWorldDirection(forward);
      ndcA.copy(camera.position).addScaledVector(sunDir, 80);
      ndcA.project(camera);
      const sunX = ndcA.x;
      const sunInFront = ndcA.z < 1 && sunDir.dot(forward) > 0.12;
      const gaps = findGaps(camera.position, sunFlat);
      const sideX = -sunFlat.z;
      const sideZ = sunFlat.x;
      camRight.setFromMatrixColumn(camera.matrixWorld, 0);
      camRight.y = 0;
      if (camRight.lengthSq() < 1e-4) camRight.set(sideX, 0, sideZ);
      camRight.normalize();
      for (let i = 0; i < beams.length; i++) {
        const beam = beams[i];
        if (!beam) continue;
        const gap = gaps[i];
        const lateral = (i - 2.5) * 5.4;
        const along = 13 + (i % 3) * 6.5;
        if (gap) crown.set(gap.x, gap.y, gap.z);
        else {
          crown.set(
            camera.position.x + sunFlat.x * along + sideX * lateral,
            camera.position.y + 3.4,
            camera.position.z + sunFlat.z * along + sideZ * lateral,
          );
        }
        // The shaft follows the sun through a crown gap. The near end steps
        // toward the camera so the streak stays open when we look into the sun.
        toCam.copy(camera.position).sub(crown);
        toCam.y = 0;
        if (toCam.lengthSq() < 1e-4) toCam.set(forward.x, 0, forward.z);
        if (toCam.lengthSq() < 1e-4) toCam.set(sideX, 0, sideZ);
        toCam.normalize();
        end.copy(crown).addScaledVector(sunDir, 36);
        start.copy(crown).addScaledVector(sunDir, -9);
        start.y -= 8;
        start.addScaledVector(toCam, 4.2);
        widthDir.copy(end).sub(start);
        widthDir.cross(toCam);
        if (widthDir.lengthSq() < 1e-6) widthDir.set(sideX, 0, sideZ);
        widthDir.normalize();
        ndcA.copy(start).project(camera);
        ndcB.copy(end).project(camera);
        if (Math.hypot(ndcA.x - ndcB.x, ndcA.y - ndcB.y) < 0.18) {
          start.addScaledVector(toCam, 10);
          start.y -= 4;
          ndcA.copy(start).project(camera);
        }
        const off =
          (ndcA.x < -1 && ndcB.x < -1) || (ndcA.x > 1 && ndcB.x > 1) || (ndcA.z > 1 && ndcB.z > 1);
        if (sunInFront && off) {
          // Slide the gap sideways until the streak sits on the sun. The
          // world quad is what actually draws; an off-screen crown does not.
          for (let n = 0; n < 6; n++) {
            const aim = sunX + (i - 2.5) * 0.14;
            const dx = THREE.MathUtils.clamp(aim - ndcB.x, -1.4, 1.4);
            if (Math.abs(ndcA.x) < 1.05 && Math.abs(ndcB.x) < 1.05 && Math.abs(dx) < 0.22) break;
            crown.addScaledVector(camRight, dx * 18);
            toCam.copy(camera.position).sub(crown);
            toCam.y = 0;
            if (toCam.lengthSq() < 1e-4) toCam.set(sideX, 0, sideZ);
            toCam.normalize();
            end.copy(crown).addScaledVector(sunDir, 36);
            start.copy(crown).addScaledVector(sunDir, -9);
            start.y -= 8;
            start.addScaledVector(toCam, 4.2);
            widthDir.copy(end).sub(start);
            widthDir.cross(toCam);
            if (widthDir.lengthSq() < 1e-6) widthDir.copy(camRight);
            widthDir.normalize();
            ndcA.copy(start).project(camera);
            ndcB.copy(end).project(camera);
          }
        }
        const midX = (ndcA.x + ndcB.x) * 0.5;
        const farFromSun = Math.abs(midX - sunX) > 0.95 && Math.abs(ndcB.x - sunX) > 0.85;
        const behind = ndcA.z > 1 && ndcB.z > 1;
        if (!sunInFront || farFromSun || behind) {
          beam.visible = false;
          continue;
        }
        beam.visible = true;
        spans.push({ x0: ndcA.x, y0: ndcA.y, x1: ndcB.x, y1: ndcB.y });
        const half = (widths[i] ?? 0.8) * 2.2;
        const attr = beam.geometry.getAttribute('position') as THREE.BufferAttribute;
        const place = (index: number, base: THREE.Vector3, span: number) => {
          attr.setXYZ(
            index,
            base.x + widthDir.x * span,
            base.y + widthDir.y * span,
            base.z + widthDir.z * span,
          );
        };
        place(0, start, -half);
        place(1, start, half);
        place(2, end, -half * 0.32);
        place(3, end, half * 0.32);
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
