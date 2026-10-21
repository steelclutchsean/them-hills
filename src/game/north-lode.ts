import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Enclosed north drift. One carved tube, triplanar rock, timber sets,
// lanterns, dust in the beams, drips, and quartz grown in the wall.
// The blast and the cave-in are timelines on this same rig.

interface Chunk {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  spin: number;
}

interface Rig {
  lights: THREE.PointLight[];
  lamps: THREE.Mesh[];
  posts: THREE.InstancedMesh;
  caps: THREE.InstancedMesh;
  postHome: THREE.Matrix4[];
  capHome: THREE.Matrix4[];
  drips: THREE.BufferAttribute;
  drip0: Float32Array;
  bearer: THREE.PointLight;
  sparks: THREE.Points;
  flash: THREE.PointLight;
  flashBall: THREE.Mesh;
  wave: THREE.Mesh;
  rubble: THREE.InstancedMesh;
  chunks: Chunk[];
  dust: THREE.Mesh[];
  ore: THREE.Mesh[];
  phase: 'idle' | 'fuse' | 'blast' | 'cave' | 'buried';
  t: number;
  dig: number;
  fuse: number;
}

const rigs = new WeakMap<THREE.Group, Rig>();
const dummy = new THREE.Object3D();

function rockMaps(): { albedo: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[drift] no 2d context');
  ctx.fillStyle = '#6a6258';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 420; i++) {
    const x = (i * 47) % size;
    const y = (i * 29) % size;
    const r = 2 + (i % 7);
    const tone = 28 + (i % 11) * 8;
    ctx.fillStyle = `rgb(${tone + 18}, ${tone + 12}, ${tone + 8})`;
    ctx.globalAlpha = 0.35 + (i % 5) * 0.08;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.62, (i % 6) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = `rgba(18, 14, 10, ${0.25 + (i % 4) * 0.1})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo((i * 19) % size, 0);
    ctx.bezierCurveTo(40, 30 + i * 4, 80, 70 - i * 3, size, (i * 23) % size);
    ctx.stroke();
  }
  const albedo = new THREE.CanvasTexture(canvas);
  albedo.wrapS = THREE.RepeatWrapping;
  albedo.wrapT = THREE.RepeatWrapping;
  albedo.colorSpace = THREE.SRGBColorSpace;

  const img = ctx.getImageData(0, 0, size, size);
  const height = new Float32Array(size * size);
  for (let i = 0; i < height.length; i++) height[i] = (img.data[i * 4] ?? 0) / 255;
  const normal = document.createElement('canvas');
  normal.width = size;
  normal.height = size;
  const nctx = normal.getContext('2d');
  if (!nctx) throw new Error('[drift] no normal context');
  const out = nctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const l = height[y * size + ((x - 1 + size) % size)] ?? 0;
      const r = height[y * size + ((x + 1) % size)] ?? 0;
      const d = height[((y + 1) % size) * size + x] ?? 0;
      const u = height[((y - 1 + size) % size) * size + x] ?? 0;
      const dx = (l - r) * 2.4;
      const dy = (u - d) * 2.4;
      const nz = 1;
      const len = Math.hypot(dx, dy, nz) || 1;
      const o = i * 4;
      out.data[o] = Math.floor((dx / len) * 127 + 128);
      out.data[o + 1] = Math.floor((dy / len) * 127 + 128);
      out.data[o + 2] = Math.floor((nz / len) * 127 + 128);
      out.data[o + 3] = 255;
    }
  }
  nctx.putImageData(out, 0, 0);
  const normalTex = new THREE.CanvasTexture(normal);
  normalTex.wrapS = THREE.RepeatWrapping;
  normalTex.wrapT = THREE.RepeatWrapping;
  return { albedo, normal: normalTex };
}

function rockMaterial(): THREE.MeshStandardMaterial {
  const maps = rockMaps();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x8a8176,
    roughness: 0.9,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRockMap = { value: maps.albedo };
    shader.uniforms.uRockNormal = { value: maps.normal };
    shader.uniforms.uRockScale = { value: 0.42 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriN;')
      .replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nvTriN = normalize(mat3(modelMatrix) * objectNormal);',
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvTriPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTriPos;
        varying vec3 vTriN;
        uniform sampler2D uRockMap;
        uniform sampler2D uRockNormal;
        uniform float uRockScale;`,
      )
      .replace(
        '#include <map_fragment>',
        `{
          vec3 bw = pow(abs(normalize(vTriN)), vec3(4.0));
          bw /= max(bw.x + bw.y + bw.z, 1e-4);
          vec3 cx = texture2D(uRockMap, vTriPos.zy * uRockScale).rgb;
          vec3 cy = texture2D(uRockMap, vTriPos.xz * uRockScale).rgb;
          vec3 cz = texture2D(uRockMap, vTriPos.xy * uRockScale).rgb;
          diffuseColor.rgb *= cx * bw.x + cy * bw.y + cz * bw.z;
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 bw = pow(abs(normalize(vTriN)), vec3(4.0));
          bw /= max(bw.x + bw.y + bw.z, 1e-4);
          vec3 nx = texture2D(uRockNormal, vTriPos.zy * uRockScale).xyz * 2.0 - 1.0;
          vec3 ny = texture2D(uRockNormal, vTriPos.xz * uRockScale).xyz * 2.0 - 1.0;
          vec3 nz = texture2D(uRockNormal, vTriPos.xy * uRockScale).xyz * 2.0 - 1.0;
          normal = normalize(normal + (nx * bw.x + ny * bw.y + nz * bw.z) * 0.9);
        }`,
      );
  };
  return mat;
}

function archPoint(j: number, seg: number, z: number): THREE.Vector3 {
  const a = (j / seg) * Math.PI * 2;
  const c = Math.cos(a);
  const s = Math.sin(a);
  let x = c * 1.92;
  let y = s * 1.42 + 1.22;
  if (s < -0.28) {
    y = 0.05;
    x = c * 1.55;
  }
  const n =
    Math.sin(x * 2.6 + z * 1.35) * 0.11 +
    Math.sin(y * 3.4 - z * 1.9) * 0.07 +
    Math.sin(z * 0.7 + j) * 0.04;
  if (y > 0.2) {
    x += c * n;
    y += Math.max(0, s) * n;
  }
  return new THREE.Vector3(x, y, z);
}

function carveTunnel(): THREE.BufferGeometry {
  const rings = 20;
  const seg = 18;
  const depth = 9.15;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const z = -0.2 - (i / rings) * depth;
    for (let j = 0; j <= seg; j++) {
      const p = archPoint(j, seg, z);
      positions.push(p.x, p.y, p.z);
    }
  }
  const row = seg + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * row + j;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const faceRing = rings * row;
  const cx = positions.length / 3;
  positions.push(0.05, 1.15, -0.2 - depth);
  for (let j = 0; j < seg; j++) {
    indices.push(cx, faceRing + j, faceRing + j + 1);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function quartzVeins(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const veins: { z: number; side: number; color: THREE.Color; h: number }[] = [
    { z: -3.1, side: -1, color: new THREE.Color(0xf4f1ea), h: 0.7 },
    { z: -4.3, side: 1, color: new THREE.Color(0x8d8a84), h: 0.55 },
    { z: -5.6, side: -1, color: new THREE.Color(0xe2b15a), h: 0.9 },
    { z: -6.8, side: 1, color: new THREE.Color(0xf7f4ee), h: 0.5 },
    { z: -7.7, side: -1, color: new THREE.Color(0xd7a441), h: 1.05 },
    { z: -8.7, side: 0.2, color: new THREE.Color(0xc9842a), h: 0.8 },
  ];
  for (const vein of veins) {
    const boxes: THREE.BufferGeometry[] = [];
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const along = (i - (steps - 1) / 2) * 0.22;
      const box = new THREE.BoxGeometry(0.16, vein.h * (0.45 + (i % 3) * 0.18), 0.34);
      const y = 0.85 + (i % 2) * 0.28 + vein.h * 0.15;
      const x = vein.side * (1.42 - i * 0.02) + Math.sin(vein.z + i) * 0.05;
      box.translate(x, y, vein.z + along);
      const colors = new Float32Array(box.getAttribute('position').count * 3);
      for (let v = 0; v < colors.length; v += 3) {
        colors[v] = vein.color.r;
        colors[v + 1] = vein.color.g;
        colors[v + 2] = vein.color.b;
      }
      box.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      boxes.push(box);
    }
    const merged = mergeGeometries(boxes);
    if (merged) parts.push(merged);
  }
  return mergeGeometries(parts) ?? new THREE.BufferGeometry();
}

function beamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[drift] no beam context');
  const grd = ctx.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, 'rgba(255, 214, 150, 0.0)');
  grd.addColorStop(0.35, 'rgba(255, 196, 120, 0.55)');
  grd.addColorStop(1, 'rgba(255, 170, 80, 0.0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 64, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function layTimber(rig: { posts: THREE.InstancedMesh; caps: THREE.InstancedMesh; postHome: THREE.Matrix4[]; capHome: THREE.Matrix4[] }): void {
  const postCount = 10;
  for (let i = 0; i < 5; i++) {
    const z = -1.7 - i * 1.5;
    for (const side of [-1, 1]) {
      const index = i * 2 + (side < 0 ? 0 : 1);
      dummy.position.set(side * 1.05, 1.2, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      rig.posts.setMatrixAt(index, dummy.matrix);
      rig.postHome[index] = dummy.matrix.clone();
    }
    dummy.position.set(0, 2.42, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    rig.caps.setMatrixAt(i, dummy.matrix);
    rig.capHome[i] = dummy.matrix.clone();
  }
  rig.posts.count = postCount;
  rig.caps.count = 5;
  rig.posts.instanceMatrix.needsUpdate = true;
  rig.caps.instanceMatrix.needsUpdate = true;
}

export function dressNorthLode(group: THREE.Group): void {
  const rock = rockMaterial();
  const shell = new THREE.Mesh(carveTunnel(), rock);
  shell.name = 'drift-shell';
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);

  const quartz = new THREE.Mesh(
    quartzVeins(),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.42,
      metalness: 0.05,
      emissive: 0xffd7a2,
      emissiveIntensity: 0.45,
    }),
  );
  quartz.name = 'drift-quartz';
  const quartzMat = quartz.material as THREE.MeshStandardMaterial;
  quartzMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      totalEmissiveRadiance *= vec3(clamp(vColor.r - vColor.b, 0.0, 1.0));`,
    );
  };
  group.add(quartz);

  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a28, roughness: 0.9 });
  const aged = new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.95 });
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.11, 2.45, 6), wood, 10);
  posts.name = 'drift-posts';
  posts.castShadow = true;
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(2.35, 0.14, 0.18), aged, 5);
  caps.name = 'drift-caps';
  caps.castShadow = true;
  group.add(posts, caps);
  const postHome: THREE.Matrix4[] = [];
  const capHome: THREE.Matrix4[] = [];
  layTimber({ posts, caps, postHome, capHome });

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffe1a8,
    emissive: 0xffb45a,
    emissiveIntensity: 1.1,
    roughness: 0.4,
  });
  const lights: THREE.PointLight[] = [];
  const lamps: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const z = -1.7 - i * 2.05;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), lampMat);
    lamp.name = i === 1 ? 'drift-lantern' : `drift-lantern-${i}`;
    lamp.position.set(0, 2.18, z);
    const light = new THREE.PointLight(0xffc27a, 36, 12, 2);
    light.position.set(0, 2.05, z);
    light.castShadow = false;
    lamps.push(lamp);
    lights.push(light);
    group.add(lamp, light);
  }
  const beamMat = new THREE.MeshBasicMaterial({
    map: beamTexture(),
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const light of lights) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.1, 8, 1, true), beamMat);
    cone.position.set(light.position.x, light.position.y - 1.05, light.position.z);
    cone.rotation.x = 0.15;
    group.add(cone);
  }

  const dripCount = 18;
  const drip0 = new Float32Array(dripCount * 3);
  for (let i = 0; i < dripCount; i++) {
    drip0[i * 3] = (i % 2 === 0 ? -1 : 1) * (0.7 + (i % 5) * 0.12);
    drip0[i * 3 + 1] = 2.3;
    drip0[i * 3 + 2] = -1.4 - i * 0.42;
  }
  const dripGeom = new THREE.BufferGeometry();
  const drips = new THREE.BufferAttribute(drip0.slice(), 3);
  dripGeom.setAttribute('position', drips);
  const dropPts = new THREE.Points(
    dripGeom,
    new THREE.PointsMaterial({
      color: 0xc5e7f2,
      size: 0.045,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  dropPts.name = 'drift-drips';
  group.add(dropPts);

  const railMat = new THREE.MeshStandardMaterial({ color: 0x3a3532, roughness: 0.65, metalness: 0.45 });
  const railGeom = new THREE.BoxGeometry(0.05, 0.04, 7.6);
  const leftRail = new THREE.Mesh(railGeom, railMat);
  leftRail.position.set(-0.28, 0.1, -4.6);
  const rightRail = new THREE.Mesh(railGeom, railMat);
  rightRail.position.set(0.28, 0.1, -4.6);
  group.add(leftRail, rightRail);
  const tieGeom = new THREE.BoxGeometry(0.9, 0.04, 0.1);
  const tieMat = new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.95 });
  const ties = new THREE.InstancedMesh(tieGeom, tieMat, 8);
  for (let i = 0; i < 8; i++) {
    dummy.position.set(0, 0.05, -1.5 - i * 0.95);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    ties.setMatrixAt(i, dummy.matrix);
  }
  group.add(ties);
  const cart = new THREE.Group();
  cart.name = 'ore-cart';
  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.28, 0.95),
    new THREE.MeshStandardMaterial({ color: 0x6e4a22, roughness: 0.88 }),
  );
  bed.position.y = 0.32;
  cart.add(bed);
  cart.position.set(0, 0.08, -3.4);
  group.add(cart);

  const bearer = new THREE.PointLight(0xffd2a0, 0, 6.5, 2);
  bearer.name = 'bearer-lantern';
  group.add(bearer);

  const sparkGeom = new THREE.BufferGeometry();
  sparkGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
  const sparks = new THREE.Points(
    sparkGeom,
    new THREE.PointsMaterial({
      color: 0xffb45a,
      size: 0.16,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  sparks.name = 'fuse-sparks';
  group.add(sparks);

  const flash = new THREE.PointLight(0xfff1d2, 0, 14, 2);
  flash.position.set(0.2, 1.2, -8.4);
  const flashBall = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 8, 6),
    new THREE.MeshBasicMaterial({
      color: 0xfff6e4,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  flashBall.name = 'drift-flash';
  flashBall.position.copy(flash.position);
  const wave = new THREE.Mesh(
    new THREE.TorusGeometry(0.4, 0.05, 6, 18),
    new THREE.MeshBasicMaterial({
      color: 0xffe2b0,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  wave.position.set(0.1, 1.15, -8.2);
  group.add(flash, flashBall, wave);

  const rubble = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.22, 0),
    rock,
    12,
  );
  rubble.name = 'drift-rubble';
  rubble.count = 0;
  rubble.castShadow = true;
  group.add(rubble);
  const chunks: Chunk[] = [];
  for (let i = 0; i < 12; i++) {
    chunks.push({
      x: (i % 4) * 0.28 - 0.4,
      y: 1.4,
      z: -8.2,
      vx: 0,
      vy: 0,
      vz: 0,
      rx: 0,
      ry: 0,
      spin: (i % 5) * 0.4,
    });
  }

  const dustMat = new THREE.MeshBasicMaterial({
    color: 0xb7ab9e,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const dust: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), dustMat);
    puff.position.set((i - 1.5) * 0.35, 1.1 + (i % 2) * 0.2, -7.6 - i * 0.15);
    puff.visible = false;
    dust.push(puff);
    group.add(puff);
  }

  const oreMat = new THREE.MeshStandardMaterial({
    color: 0xe2b15a,
    emissive: 0x8a5a12,
    emissiveIntensity: 0.7,
    roughness: 0.45,
  });
  const ore: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const nug = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + i * 0.04, 0), oreMat);
    nug.name = i === 0 ? 'drift-ore' : `drift-ore-${i}`;
    nug.position.set(-0.35 + i * 0.32, 1.15 + (i % 2) * 0.28, -8.35);
    nug.visible = false;
    ore.push(nug);
    group.add(nug);
  }

  rigs.set(group, {
    lights,
    lamps,
    posts,
    caps,
    postHome,
    capHome,
    drips,
    drip0,
    bearer,
    sparks,
    flash,
    flashBall,
    wave,
    rubble,
    chunks,
    dust,
    ore,
    phase: 'idle',
    t: 0,
    dig: 1,
    fuse: 0,
  });
}

function kickChunks(rig: Rig, towardPortal: boolean): void {
  rig.rubble.count = rig.chunks.length;
  rig.chunks.forEach((chunk, i) => {
    chunk.x = (i % 4) * 0.32 - 0.48;
    chunk.y = 1.6 + (i % 3) * 0.15;
    chunk.z = towardPortal ? -6.2 : -8.3;
    chunk.vx = (i % 2 === 0 ? -1 : 1) * (0.4 + (i % 3) * 0.25);
    chunk.vy = 1.2 + (i % 4) * 0.35;
    chunk.vz = towardPortal ? 2.4 + (i % 5) * 0.3 : 0.4;
    chunk.rx = Math.random();
    chunk.ry = Math.random();
  });
}

function stepChunks(rig: Rig, dt: number): void {
  const floor = 0.16;
  rig.chunks.forEach((chunk, i) => {
    chunk.vy -= 9.8 * dt;
    chunk.x += chunk.vx * dt;
    chunk.y += chunk.vy * dt;
    chunk.z += chunk.vz * dt;
    chunk.rx += chunk.spin * dt;
    chunk.ry += chunk.spin * 0.7 * dt;
    if (chunk.y < floor) {
      chunk.y = floor;
      chunk.vy *= -0.22;
      chunk.vx *= 0.62;
      chunk.vz *= 0.62;
    }
    dummy.position.set(chunk.x, chunk.y, chunk.z);
    dummy.rotation.set(chunk.rx, chunk.ry, 0);
    dummy.scale.setScalar(0.85 + (i % 3) * 0.15);
    dummy.updateMatrix();
    rig.rubble.setMatrixAt(i, dummy.matrix);
  });
  rig.rubble.instanceMatrix.needsUpdate = true;
}

function dropTimber(rig: Rig, fall: number): void {
  rig.postHome.forEach((home, i) => {
    dummy.matrix.copy(home);
    dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
    const side = i % 2 === 0 ? -1 : 1;
    dummy.position.y -= fall * 0.85;
    dummy.position.x += side * fall * 0.25;
    dummy.rotation.set(fall * 0.9, 0, side * fall * 0.7);
    dummy.updateMatrix();
    rig.posts.setMatrixAt(i, dummy.matrix);
  });
  rig.capHome.forEach((home, i) => {
    dummy.matrix.copy(home);
    dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
    dummy.position.y -= fall * 1.5;
    dummy.rotation.set(0, 0, (i % 2 === 0 ? 1 : -1) * fall * 0.8);
    dummy.updateMatrix();
    rig.caps.setMatrixAt(i, dummy.matrix);
  });
  rig.posts.instanceMatrix.needsUpdate = true;
  rig.caps.instanceMatrix.needsUpdate = true;
}

export function driftOf(group: THREE.Group): Rig | undefined {
  return rigs.get(group);
}

export function playDriftBlast(group: THREE.Group, leadIn = false): void {
  const rig = rigs.get(group);
  if (!rig) return;
  rig.phase = leadIn ? 'fuse' : 'blast';
  rig.t = 0;
  rig.fuse = leadIn ? 0 : 1;
  if (!leadIn) kickChunks(rig, true);
}

export function playDriftCaveIn(group: THREE.Group): void {
  const rig = rigs.get(group);
  if (!rig) return;
  rig.phase = 'cave';
  rig.t = 0;
  rig.dig = 0;
  kickChunks(rig, false);
}

export function setDriftFuse(group: THREE.Group, amount: number): void {
  const rig = rigs.get(group);
  if (!rig || rig.phase === 'blast' || rig.phase === 'cave') return;
  rig.phase = 'fuse';
  rig.fuse = amount;
  rig.t = amount * 1.4;
}

export function digDrift(group: THREE.Group): number {
  const rig = rigs.get(group);
  if (!rig || (rig.phase !== 'buried' && rig.phase !== 'cave')) return 1;
  rig.dig = Math.min(1, rig.dig + 0.26);
  if (rig.dig >= 1) rig.phase = 'idle';
  return rig.dig;
}

export function driftBuried(group: THREE.Group): boolean {
  const rig = rigs.get(group);
  return !!rig && rig.phase === 'buried' && rig.dig < 1;
}

export function driftPhase(group: THREE.Group): string {
  return rigs.get(group)?.phase ?? 'missing';
}

export function driftClock(group: THREE.Group): number {
  return rigs.get(group)?.t ?? 0;
}

export function driftNearFall(originZ: number, playerZ: number): boolean {
  const local = playerZ - originZ;
  return local < -3.1 && local > -7.2;
}

/** The settled fall is a wall. The portal side walks out. The face side digs. */
export function driftKeepOut(group: THREE.Group, origin: THREE.Vector3, player: THREE.Vector3): boolean {
  const rig = rigs.get(group);
  if (!rig || rig.phase !== 'buried' || rig.dig >= 1) return false;
  const localZ = player.z - origin.z;
  if (localZ < -4.5 && localZ > -5.15) {
    player.z = origin.z + (localZ > -4.8 ? -4.4 : -5.25);
    return true;
  }
  return false;
}

export function setDriftBearer(group: THREE.Group, local: THREE.Vector3 | null): void {
  const rig = rigs.get(group);
  if (!rig) return;
  if (!local) {
    rig.bearer.intensity = 0;
    return;
  }
  rig.bearer.position.copy(local);
  rig.bearer.intensity = 9;
}

/** Eye height inside the air of the drift, looking deeper in. */
export function frameDriftWalk(origin: THREE.Vector3, player: THREE.Vector3, camera: THREE.Camera): void {
  const lx = THREE.MathUtils.clamp(player.x - origin.x, -0.55, 0.55);
  const lz = THREE.MathUtils.clamp(player.z - origin.z, -8.2, -0.35);
  const eyeZ = THREE.MathUtils.clamp(lz + 0.12, -8.0, -0.5);
  camera.position.set(origin.x + lx * 0.2, origin.y + 1.55, origin.z + eyeZ);
  camera.lookAt(origin.x + lx * 0.15, origin.y + 1.25, origin.z + Math.min(-0.2, lz - 2.6));
}

/** Centered look down the lantern line, used when the review camera is outside the mouth. */
export function frameDriftInterior(origin: THREE.Vector3, camera: THREE.Camera): void {
  camera.position.set(origin.x, origin.y + 1.55, origin.z - 2.05);
  camera.lookAt(origin.x, origin.y + 1.22, origin.z - 8.0);
}

export function frameDriftShow(group: THREE.Group, origin: THREE.Vector3, camera: THREE.Camera): boolean {
  const rig = rigs.get(group);
  if (!rig) return false;
  if (rig.phase !== 'fuse' && rig.phase !== 'blast' && rig.phase !== 'cave') return false;
  const look = new THREE.Vector3();
  if (rig.phase === 'fuse') {
    camera.position.set(origin.x + 0.35, origin.y + 1.35, origin.z - 4.6);
    look.set(origin.x + 0.7, origin.y + 1.15, origin.z - 8.4);
  } else if (rig.phase === 'blast') {
    const pull = Math.min(1.6, rig.t * 0.9);
    camera.position.set(origin.x + 0.15, origin.y + 1.4, origin.z - 3.1 + pull);
    look.set(origin.x + 0.1, origin.y + 1.15, origin.z - 8.2);
  } else {
    camera.position.set(origin.x + 0.2, origin.y + 1.55, origin.z - 2.3);
    look.set(origin.x, origin.y + 1.35, origin.z - 6.4);
  }
  camera.lookAt(look);
  return true;
}

function paintSparks(rig: Rig, along: number): void {
  const attr = rig.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
  const headZ = -4.8 + -3.6 * along;
  for (let i = 0; i < 12; i++) {
    const trail = i / 12;
    attr.setXYZ(i, 1.15 + Math.sin(i) * 0.04, 1.05 + trail * 0.15, headZ + trail * 0.85);
  }
  attr.needsUpdate = true;
  (rig.sparks.material as THREE.PointsMaterial).opacity = along > 0.02 && along < 0.98 ? 1 : 0;
}

export function updateNorthLode(group: THREE.Group, time: number, creak: number, dt: number): void {
  const rig = rigs.get(group);
  if (!rig) return;
  const flicker = 0.82 + Math.sin(time * 9.5) * 0.08 + Math.sin(time * 23) * 0.04;
  rig.lights.forEach((light, i) => {
    light.intensity = (34 + flicker * 8 + Math.sin(time * 7 + i) * 2) * (rig.phase === 'blast' && rig.t < 0.2 ? 0.45 : 1);
  });
  rig.lamps.forEach((lamp) => {
    const mat = lamp.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.7 + flicker * 0.45;
  });
  for (let i = 0; i < rig.drip0.length / 3; i++) {
    const speed = 0.85 + (i % 4) * 0.2;
    let y = 2.35 - ((time * speed + i * 0.37) % 2.2);
    if (y < 0.08) y = 2.35;
    rig.drips.setXYZ(i, rig.drip0[i * 3] ?? 0, y, rig.drip0[i * 3 + 2] ?? 0);
  }
  rig.drips.needsUpdate = true;

  const talk = creak > 0.55 && rig.phase === 'idle' ? Math.sin(time * 18) * creak * 0.04 : 0;
  if (rig.phase === 'idle' && talk !== 0) {
    rig.capHome.forEach((home, i) => {
      dummy.matrix.copy(home);
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
      dummy.rotation.z = talk * (i % 2 === 0 ? 1 : -1);
      dummy.updateMatrix();
      rig.caps.setMatrixAt(i, dummy.matrix);
    });
    rig.caps.instanceMatrix.needsUpdate = true;
  }

  const cart = group.getObjectByName('ore-cart');
  if (cart && rig.phase === 'idle') cart.position.z = -3.4 + Math.sin(time * 0.6) * 0.12;

  const step = Math.min(Math.max(0, dt), 0.08);
  if (rig.phase === 'fuse') {
    rig.t += step;
    const along = Math.min(1, rig.fuse > 0 ? rig.fuse : rig.t / 1.45);
    paintSparks(rig, along);
    if (rig.t > 1.55 && rig.fuse >= 0.99) {
      rig.phase = 'blast';
      rig.t = 0;
      kickChunks(rig, true);
    }
  } else if (rig.phase === 'blast') {
    rig.t += step;
    paintSparks(rig, 1);
    const flash = Math.max(0, 1 - rig.t / 0.5);
    rig.flash.intensity = flash * 180;
    rig.flash.distance = 18;
    (rig.flashBall.material as THREE.MeshBasicMaterial).opacity = Math.min(1, flash * 1.35);
    rig.flashBall.scale.setScalar(3.4 + rig.t * 7);
    const waveMat = rig.wave.material as THREE.MeshBasicMaterial;
    waveMat.opacity = Math.max(0, 0.85 - rig.t / 1.1);
    rig.wave.scale.setScalar(1 + rig.t * 7);
    stepChunks(rig, dt);
    rig.dust.forEach((puff, i) => {
      puff.visible = rig.t < 3.2;
      const grow = Math.min(1, rig.t / 0.8);
      puff.scale.setScalar(0.4 + grow * (1.6 + i * 0.25));
      (puff.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.55 * (1 - rig.t / 3.1));
      puff.position.y += dt * 0.15;
    });
    const reveal = Math.max(0, Math.min(1, (rig.t - 1.3) / 1.4));
    rig.ore.forEach((nug) => {
      nug.visible = reveal > 0.05;
      nug.scale.setScalar(0.2 + reveal);
    });
    if (rig.t > 3.4) rig.phase = 'idle';
  } else if (rig.phase === 'cave') {
    rig.t += step;
    const fall = Math.min(1, rig.t / 1.15);
    dropTimber(rig, fall);
    stepChunks(rig, dt);
    rig.dust.forEach((puff, i) => {
      puff.visible = true;
      puff.position.set((i - 1.5) * 0.4, 1.2, -5.2);
      puff.scale.setScalar(0.3 + fall * 2.2);
      (puff.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.5 * (1 - Math.max(0, rig.t - 1.2) / 1.6));
    });
    if (rig.t > 1.7) rig.phase = 'buried';
  } else if (rig.phase === 'buried') {
    const open = rig.dig;
    dropTimber(rig, 1 - open);
    rig.chunks.forEach((chunk, i) => {
      chunk.y = 0.16 + (1 - open) * (0.15 + (i % 3) * 0.12);
      dummy.position.set(chunk.x * (1 - open * 0.3), chunk.y, -5.4 + open * 0.8);
      dummy.rotation.set(chunk.rx, chunk.ry, 0);
      dummy.scale.setScalar((1 - open) * (0.9 + (i % 3) * 0.2));
      dummy.updateMatrix();
      rig.rubble.setMatrixAt(i, dummy.matrix);
    });
    rig.rubble.count = open >= 1 ? 0 : rig.chunks.length;
    rig.rubble.instanceMatrix.needsUpdate = true;
  }
}

/** Kept so older call sites compile. The north shell replaces the box. */
export function darkenCaveMeshes(meshes: readonly THREE.Mesh[]): void {
  for (const mesh of meshes) {
    const src = mesh.material as THREE.MeshStandardMaterial;
    const mat = src.clone();
    mat.color.multiplyScalar(0.16);
    mat.roughness = 1;
    mesh.material = mat;
  }
}
