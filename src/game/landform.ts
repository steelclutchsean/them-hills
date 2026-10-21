import * as THREE from 'three';
import type { Watercourse } from '@/game/watercourse';
import { groundMaps } from '@/render/painterly';
import { PALETTE } from '@/render/palette';

// One solid ring. The old ridgeline was a stack of thin cards, which read as
// translucent jagged blobs and z-fought a dotted seam where the cards met.

function ridgeRockMap(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[landform] no 2d');
  ctx.fillStyle = '#a56b45';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 36; i++) {
    ctx.fillStyle = i % 3 === 0 ? '#3a2418' : i % 3 === 1 ? '#e4c49a' : '#6e4632';
    const x = (i * 47) % 256;
    ctx.fillRect(x, (i * 19) % 256, 18 + (i % 5) * 6, 40 + (i % 7) * 12);
  }
  ctx.strokeStyle = '#24160e';
  ctx.lineWidth = 4;
  for (let i = 0; i < 11; i++) {
    ctx.beginPath();
    ctx.moveTo(0, 12 + i * 22);
    ctx.lineTo(256, i * 24);
    ctx.stroke();
  }
  ctx.strokeStyle = '#f0e2c8';
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.moveTo((i * 30) % 256, 0);
    ctx.lineTo((i * 30 + 80) % 256, 256);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function rangeMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map,
    color: 0xffffff,
    roughness: 0.94,
    metalness: 0,
    flatShading: true,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    fog: true,
    side: THREE.DoubleSide,
  });
  mat.customProgramCacheKey = () => 'them-hills-range-4';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldN;',
      )
      .replace(
        '#include <project_vertex>',
        `vec4 themWorld = modelMatrix * vec4(transformed, 1.0);
         vWorldPos = themWorld.xyz;
         vWorldN = normalize(mat3(modelMatrix) * objectNormal);
         #include <project_vertex>`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldN;\nvec3 themAlbedo;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         {
           vec3 n = normalize(vWorldN);
           float slope = 1.0 - abs(n.y);
           float snow = smoothstep(16.0, 34.0, vWorldPos.y) * (1.0 - smoothstep(0.22, 0.7, slope));
           float trees = smoothstep(8.0, 14.0, vWorldPos.y) * (1.0 - smoothstep(22.0, 34.0, vWorldPos.y));
           trees *= 1.0 - smoothstep(0.15, 0.55, slope);
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.32, 0.14), trees * 0.78);
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.97, 0.98, 0.96), snow);
           themAlbedo = diffuseColor.rgb;
         }`,
      )
      .replace(
        '#include <fog_fragment>',
        `vec3 themLit = gl_FragColor.rgb;
         #include <fog_fragment>
         float themDist = length(vWorldPos.xz);
         float themLow = 1.0 - smoothstep(14.0, 46.0, vWorldPos.y);
         float themFog = smoothstep(26.0, 150.0, themDist) * mix(0.55, 1.0, themLow);
         gl_FragColor.rgb = mix(themLit, gl_FragColor.rgb, clamp(themFog, 0.0, 1.0));
         float peakKeep = smoothstep(18.0, 42.0, vWorldPos.y);
         gl_FragColor.rgb = mix(gl_FragColor.rgb, max(gl_FragColor.rgb, themAlbedo * 0.5), peakKeep);`,
      );
  };
  return mat;
}

function peakAmount(angle: number): number {
  const raw =
    0.58 +
    0.24 * Math.sin(angle * 2.0 + 0.4) +
    0.16 * Math.sin(angle * 5.0 + 1.1) +
    0.1 * Math.sin(angle * 11.0 + 0.2) +
    0.05 * Math.sin(angle * 19.0);
  return Math.max(0.32, Math.min(1, raw));
}

function buildRange(
  groundY: (x: number, z: number) => number,
): { geom: THREE.BufferGeometry; trees: THREE.Vector3[] } {
  const segA = 256;
  const segR = 20;
  const inner = 78;
  const span = 92;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const trees: THREE.Vector3[] = [];
  for (let i = 0; i <= segA; i++) {
    const a = i === segA ? 0 : (i / segA) * Math.PI * 2;
    const amount = peakAmount(a);
    for (let j = 0; j <= segR; j++) {
      const u = j / segR;
      const radius = inner + u * span;
      const crest = Math.exp(-((u - 0.62) * (u - 0.62)) / 0.045);
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      const y = groundY(x, z) + crest * amount * 86;
      pos.push(x, y, z);
      uv.push(a * 6.5, u * 4 + y * 0.03);
      if (crest > 0.35 && crest < 0.72 && i % 6 === 0 && j % 2 === 0) {
        trees.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  const row = segR + 1;
  for (let i = 0; i < segA; i++) {
    for (let j = 0; j < segR; j++) {
      const a = i * row + j;
      const b = a + row;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  const normals = geom.getAttribute('normal');
  let up = 0;
  for (let i = 0; i < normals.count; i += 40) up += normals.getY(i);
  if (up < 0) {
    for (let k = 0; k < idx.length; k += 3) {
      const swap = idx[k + 1] ?? 0;
      idx[k + 1] = idx[k + 2] ?? 0;
      idx[k + 2] = swap;
    }
    geom.setIndex(idx);
    geom.computeVertexNormals();
  }
  return { geom, trees };
}

function pineGeometry(): THREE.BufferGeometry {
  const low = new THREE.ConeGeometry(0.9, 2.4, 6);
  low.translate(0, 1.5, 0);
  return low;
}

function pineMaterial(): THREE.MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[landform] no 2d');
  ctx.fillStyle = '#243c28';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#4f7d46';
  for (let i = 0; i < 10; i++) ctx.fillRect(4, i * 6, 56, 3);
  ctx.fillStyle = '#6e7a38';
  for (let i = 0; i < 6; i++) ctx.fillRect(8, 4 + i * 10, 24, 3);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.9,
    flatShading: true,
    transparent: false,
  });
}

function rockGeometry(): THREE.BufferGeometry {
  const geom = new THREE.IcosahedronGeometry(1.35, 1);
  const pos = geom.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const len = Math.hypot(x, y, z) || 1;
    const wobble = 1 + 0.34 * Math.sin(x * 2.7 + y * 1.4) * Math.cos(z * 2.2 + 0.6);
    const squash = y > 0.2 ? 0.72 : 1;
    pos.setXYZ(i, (x / len) * wobble, (y / len) * wobble * squash, (z / len) * wobble);
  }
  geom.computeVertexNormals();
  return geom;
}

export function addLandform(
  scene: THREE.Scene,
  courses: readonly Watercourse[],
  groundY: (x: number, z: number) => number,
): void {
  const built = buildRange(groundY);
  const range = new THREE.Mesh(built.geom, rangeMaterial(ridgeRockMap()));
  range.name = 'ridgeline';
  range.castShadow = false;
  range.receiveShadow = true;
  range.frustumCulled = false;
  scene.add(range);

  if (built.trees.length > 0) {
    const pines = new THREE.InstancedMesh(pineGeometry(), pineMaterial(), built.trees.length);
    pines.name = 'ridge-trees';
    pines.castShadow = true;
    pines.receiveShadow = true;
    const dummy = new THREE.Object3D();
    built.trees.forEach((p, i) => {
      dummy.position.set(p.x, p.y + 0.4, p.z);
      dummy.rotation.y = (i % 7) * 0.7;
      const s = 2.2 + (i % 5) * 0.7;
      dummy.scale.set(s, s * (0.85 + (i % 3) * 0.2), s);
      dummy.updateMatrix();
      pines.setMatrixAt(i, dummy.matrix);
    });
    pines.instanceMatrix.needsUpdate = true;
    scene.add(pines);
  }

  const coyote = courses.find((c) => c.id === 'coyote_creek');
  if (!coyote) return;
  const spots: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  coyote.samples.forEach((sample, index) => {
    if (index % 9 !== 0) return;
    if (Math.abs(sample.z) < 30 && sample.z > -8) return;
    const side = sample.x > 0 ? 1 : -1;
    const x = sample.x + side * (sample.halfWidth + 2.4);
    const z = sample.z;
    const y = groundY(x, z);
    dummy.position.set(x, y + 0.35, z);
    dummy.rotation.set(0.2 * (index % 3), index * 0.9, 0.15);
    const s = 1.1 + (index % 4) * 0.45;
    dummy.scale.set(s * 1.4, s * 0.85, s);
    dummy.updateMatrix();
    spots.push(dummy.matrix.clone());
  });
  if (spots.length === 0) return;
  const rockMat = new THREE.MeshStandardMaterial({
    map: groundMaps().rock,
    color: PALETTE.rockLight,
    roughness: 0.94,
    flatShading: true,
    transparent: false,
  });
  const cliffs = new THREE.InstancedMesh(rockGeometry(), rockMat, spots.length);
  cliffs.name = 'creek-cliff';
  cliffs.castShadow = true;
  cliffs.receiveShadow = true;
  spots.forEach((m, i) => cliffs.setMatrixAt(i, m));
  cliffs.instanceMatrix.needsUpdate = true;
  scene.add(cliffs);
}
