import * as THREE from 'three';
import type { Watercourse } from '@/game/watercourse';
import { groundMaps } from '@/render/painterly';
import { PALETTE } from '@/render/palette';

// One solid ring. The old ridgeline was a stack of thin cards, which read as
// translucent jagged blobs and z-fought a dotted seam where the cards met.

function rangeTile(
  paint: (ctx: CanvasRenderingContext2D, size: number) => void,
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[landform] no 2d');
  paint(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function rangeMaps(): { rock: THREE.Texture; scree: THREE.Texture; grass: THREE.Texture } {
  const rock = rangeTile((ctx, s) => {
    ctx.fillStyle = '#7a5c48';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = i % 3 === 0 ? '#2a1c16' : i % 3 === 1 ? '#e4d2bc' : '#8d6a52';
      ctx.beginPath();
      ctx.ellipse((i * 47) % s, (i * 29) % s, 12 + (i % 6) * 5, 8 + (i % 4) * 4, i * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#24160e';
    ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      const x = (i * 41) % s;
      const y = (i * 23) % s;
      ctx.moveTo(x, y);
      ctx.lineTo(x + 16 + (i % 5) * 4, y + 10 + (i % 3) * 6);
      ctx.stroke();
    }
  });
  const scree = rangeTile((ctx, s) => {
    ctx.fillStyle = '#a89078';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#6e5a48' : '#d2c2aa';
      ctx.beginPath();
      ctx.ellipse((i * 37) % s, (i * 19) % s, 3 + (i % 4), 2 + (i % 3), i, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const grass = rangeTile((ctx, s) => {
    ctx.fillStyle = '#5c6a32';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#8a9a48';
    for (let i = 0; i < 90; i++) {
      const x = (i * 29) % s;
      const y = (i * 17) % s;
      ctx.fillRect(x, y, 2, 7 + (i % 4));
    }
    ctx.fillStyle = '#3e4a28';
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 53) % s, (i * 31) % s, 3, 5);
  });
  return { rock, scree, grass };
}

function rangeMaterial(maps: {
  rock: THREE.Texture;
  scree: THREE.Texture;
  grass: THREE.Texture;
}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map: maps.rock,
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    depthTest: true,
    fog: true,
    side: THREE.DoubleSide,
  });
  mat.customProgramCacheKey = () => 'them-hills-range-6';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRock = { value: maps.rock };
    shader.uniforms.uScree = { value: maps.scree };
    shader.uniforms.uGrass = { value: maps.grass };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float crest;\nvarying vec3 vWorldPos;\nvarying vec3 vWorldN;\nvarying float vCrest;',
      )
      .replace(
        '#include <project_vertex>',
        `vec4 themWorld = modelMatrix * vec4(transformed, 1.0);
         vWorldPos = themWorld.xyz;
         vWorldN = normalize(mat3(modelMatrix) * objectNormal);
         vCrest = crest;
         #include <project_vertex>`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D uRock;
         uniform sampler2D uScree;
         uniform sampler2D uGrass;
         varying vec3 vWorldPos;
         varying vec3 vWorldN;
         varying float vCrest;
         vec3 themTri(sampler2D tex, vec3 pos, vec3 n) {
           vec3 w = abs(n);
           w = pow(w, vec3(4.0));
           w /= max(w.x + w.y + w.z, 1e-4);
           vec3 x = texture2D(tex, pos.zy * 0.16).rgb;
           vec3 y = texture2D(tex, pos.xz * 0.16).rgb;
           vec3 z = texture2D(tex, pos.xy * 0.16).rgb;
           return x * w.x + y * w.y + z * w.z;
         }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         {
           vec3 n = normalize(vWorldN);
           float slope = 1.0 - abs(n.y);
           vec3 rock = themTri(uRock, vWorldPos, n);
           vec3 scree = themTri(uScree, vWorldPos, n);
           vec3 grass = themTri(uGrass, vWorldPos, n);
           float rockW = smoothstep(0.34, 0.72, slope);
           float grassW = (1.0 - smoothstep(0.08, 0.42, slope)) * (1.0 - smoothstep(0.45, 0.7, vCrest));
           float screeW = (1.0 - rockW) * (1.0 - grassW);
           float sumW = max(rockW + screeW + grassW, 1e-3);
           vec3 albedo = (rock * rockW + scree * screeW + grass * grassW) / sumW;
           float snow = smoothstep(0.46, 0.7, vCrest) * (1.0 - smoothstep(0.55, 0.92, slope));
           snow = max(snow, smoothstep(0.7, 0.88, vCrest));
           albedo = mix(albedo, vec3(0.97, 0.98, 0.99), snow);
           diffuseColor.rgb = albedo;
         }`,
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
  const crestAttr: number[] = [];
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
      uv.push(a * 2, u * 2);
      const height01 = crest * amount;
      crestAttr.push(height01);
      if (height01 > 0.22 && height01 < 0.64 && i % 4 === 0 && j % 2 === 0) {
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
  geom.setAttribute('crest', new THREE.Float32BufferAttribute(crestAttr, 1));
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
  const range = new THREE.Mesh(built.geom, rangeMaterial(rangeMaps()));
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
