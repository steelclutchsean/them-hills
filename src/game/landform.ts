import * as THREE from 'three';
import type { Watercourse } from '@/game/watercourse';
import { buildRidgeRing, seatRidgePines } from '@/game/ridge-pines';
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

function rangeMaps(): {
  strata: THREE.Texture;
  rock: THREE.Texture;
  detail: THREE.Texture;
  scree: THREE.Texture;
  grass: THREE.Texture;
} {
  const strata = rangeTile((ctx, s) => {
    ctx.fillStyle = '#6a5344';
    ctx.fillRect(0, 0, s, s);
    let y = 0;
    let i = 0;
    while (y < s) {
      const band = 28 + ((i * 17) % 36);
      ctx.fillStyle = i % 3 === 0 ? '#5a4638' : i % 3 === 1 ? '#7d6552' : '#4a3a30';
      ctx.fillRect(0, y, s, band);
      ctx.fillStyle = 'rgba(30, 20, 14, 0.45)';
      ctx.fillRect(0, y + band - 3, s, 3);
      y += band;
      i++;
    }
    ctx.strokeStyle = '#2a1c16';
    ctx.lineWidth = 3;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.moveTo((k * 50) % s, 0);
      ctx.lineTo((k * 50 + 30) % s, s);
      ctx.stroke();
    }
  });
  const rock = rangeTile((ctx, s) => {
    ctx.fillStyle = '#6e5846';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = i % 3 === 0 ? '#3a2c24' : i % 3 === 1 ? '#8d7360' : '#574438';
      const w = 48 + (i % 4) * 18;
      const h = 22 + (i % 3) * 14;
      ctx.fillRect((i * 37) % (s - 8), (i * 53) % (s - 8), w, h);
    }
    ctx.strokeStyle = '#24160e';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo((i * 31) % s, (i * 19) % s);
      ctx.lineTo((i * 31 + 40) % s, (i * 19 + 16) % s);
      ctx.stroke();
    }
  });
  const detail = rangeTile((ctx, s) => {
    ctx.fillStyle = '#6a5442';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#3e3026' : '#9a846c';
      ctx.fillRect((i * 17) % s, (i * 29) % s, 2, 2);
    }
  });
  const scree = rangeTile((ctx, s) => {
    ctx.fillStyle = '#a09080';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#6e5c4c' : '#d4c6b4';
      ctx.fillRect((i * 23) % (s - 10), (i * 19) % (s - 10), 8 + (i % 3) * 4, 5 + (i % 2) * 3);
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
  return { strata, rock, detail, scree, grass };
}

function rangeMaterial(maps: {
  strata: THREE.Texture;
  rock: THREE.Texture;
  detail: THREE.Texture;
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
  mat.customProgramCacheKey = () => 'them-hills-range-7';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uStrata = { value: maps.strata };
    shader.uniforms.uRock = { value: maps.rock };
    shader.uniforms.uDetail = { value: maps.detail };
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
         uniform sampler2D uStrata;
         uniform sampler2D uRock;
         uniform sampler2D uDetail;
         uniform sampler2D uScree;
         uniform sampler2D uGrass;
         varying vec3 vWorldPos;
         varying vec3 vWorldN;
         varying float vCrest;
         vec3 themTri(sampler2D tex, vec3 pos, vec3 n, float scale) {
           vec3 w = abs(n);
           w = pow(w, vec3(4.0));
           w /= max(w.x + w.y + w.z, 1e-4);
           vec3 x = texture2D(tex, pos.zy * scale).rgb;
           vec3 y = texture2D(tex, pos.xz * scale).rgb;
           vec3 z = texture2D(tex, pos.xy * scale).rgb;
           return x * w.x + y * w.y + z * w.z;
         }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         {
           vec3 n = normalize(vWorldN);
           float slope = 1.0 - abs(n.y);
           float dist = distance(cameraPosition, vWorldPos);
           float nearDetail = 1.0 - smoothstep(32.0, 120.0, dist);
           vec3 strata = themTri(uStrata, vWorldPos, n, 0.012);
           vec3 crag = themTri(uRock, vWorldPos, n, 0.04);
           vec3 fine = themTri(uDetail, vWorldPos, n, 0.16);
           vec3 rock = mix(strata, crag, mix(0.22, 0.72, nearDetail));
           rock = mix(rock, fine, 0.42 * nearDetail);
           vec3 scree = themTri(uScree, vWorldPos, n, 0.05);
           vec3 grass = themTri(uGrass, vWorldPos, n, 0.06);
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

function buildRange(groundY: (x: number, z: number) => number): {
  geom: THREE.BufferGeometry;
  trees: THREE.Vector3[];
} {
  const built = buildRidgeRing(groundY);
  return { geom: built.geometry, trees: seatRidgePines(built.geometry, built.candidates) };
}

const ridgePines: THREE.Vector3[] = [];

/** Slope points for the valley pine cards. Filled by addLandform. */
export function ridgePinePoints(): readonly THREE.Vector3[] {
  return ridgePines;
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
  ridgePines.splice(0, ridgePines.length, ...built.trees);
  const range = new THREE.Mesh(built.geom, rangeMaterial(rangeMaps()));
  range.name = 'ridgeline';
  range.castShadow = false;
  range.receiveShadow = true;
  range.frustumCulled = false;
  scene.add(range);

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
