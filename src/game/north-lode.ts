import * as THREE from 'three';
import { hewnTimberMaterial } from '@/render/painterly';
import { softDiscTexture } from '@/render/soft-disc';

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
  lagging: THREE.InstancedMesh;
  lagHome: THREE.Matrix4[];
  wedges: THREE.InstancedMesh;
  wedgeHome: THREE.Matrix4[];
  floorLights: THREE.PointLight[];
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
  pin: number | null;
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
  ctx.fillStyle = '#5c5852';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 420; i++) {
    const x = (i * 47) % size;
    const y = (i * 29) % size;
    const r = 2 + (i % 7);
    const tone = 48 + (i % 9) * 7;
    ctx.fillStyle = `rgb(${tone}, ${tone - 2}, ${tone - 6})`;
    ctx.globalAlpha = 0.28 + (i % 5) * 0.06;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.62, (i % 6) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = `rgba(22, 20, 18, ${0.28 + (i % 4) * 0.1})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo((i * 19) % size, 0);
    ctx.bezierCurveTo(40, 30 + i * 4, 80, 70 - i * 3, size, (i * 23) % size);
    ctx.stroke();
  }
  // Quartz lives in the stone, not as a row of glowing boxes.
  const veins = ['rgba(214, 210, 200, 0.72)', 'rgba(168, 164, 156, 0.8)', 'rgba(186, 142, 64, 0.62)'];
  veins.forEach((stroke, i) => {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = i === 2 ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(8 + i * 18, 0);
    ctx.bezierCurveTo(30 + i * 12, 40, 70 - i * 8, 78, 20 + i * 30, size);
    ctx.stroke();
  });
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

function muckMaterial(): THREE.MeshStandardMaterial {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[drift] no 2d context');
  ctx.fillStyle = '#3a2c22';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 240; i++) {
    const x = (i * 53) % size;
    const y = (i * 31) % size;
    const tone = 42 + (i % 6) * 8;
    ctx.fillStyle = `rgba(${tone + 10}, ${tone - 4}, ${tone - 14}, 0.45)`;
    ctx.beginPath();
    ctx.ellipse(x, y, 6 + (i % 5), 3 + (i % 3), i * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(18, 14, 10, 0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (i * 17) % size);
    ctx.bezierCurveTo(40, 20 + i * 8, 80, 60 - i * 4, size, (i * 23) % size);
    ctx.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.repeat.set(2.2, 3.4);
  return new THREE.MeshStandardMaterial({
    map,
    color: 0x6a5344,
    roughness: 0.72,
    metalness: 0.06,
  });
}

function rockMaterial(): THREE.MeshStandardMaterial {
  const maps = rockMaps();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x6a645c,
    roughness: 0.34,
    metalness: 0.16,
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

function quartzCrystals(): THREE.Group {
  const group = new THREE.Group();
  const spots: { z: number; side: number; color: number; honey: boolean }[] = [
    { z: -3.2, side: -1, color: 0xc8c4ba, honey: false },
    { z: -4.4, side: 1, color: 0x8e8b86, honey: false },
    { z: -5.7, side: -1, color: 0xc4a15a, honey: true },
    { z: -6.9, side: 1, color: 0xd8d4cc, honey: false },
    { z: -7.8, side: -1, color: 0xb8883a, honey: true },
    { z: -8.6, side: 1, color: 0xa89878, honey: true },
  ];
  for (const spot of spots) {
    const mat = new THREE.MeshStandardMaterial({
      color: spot.color,
      roughness: 0.22,
      metalness: 0.08,
      emissive: spot.honey ? 0x6a4a16 : 0x000000,
      emissiveIntensity: spot.honey ? 0.12 : 0,
    });
    for (let i = 0; i < 3; i++) {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.045 + (i % 2) * 0.02, 0), mat);
      shard.position.set(
        spot.side * 1.84,
        0.95 + i * 0.22,
        spot.z + (i - 1) * 0.12,
      );
      shard.rotation.set(i * 0.4, spot.side, 0.6);
      shard.castShadow = true;
      group.add(shard);
    }
  }
  return group;
}

function layTimber(rig: {
  posts: THREE.InstancedMesh;
  caps: THREE.InstancedMesh;
  postHome: THREE.Matrix4[];
  capHome: THREE.Matrix4[];
  lagging: THREE.InstancedMesh;
  lagHome: THREE.Matrix4[];
  wedges: THREE.InstancedMesh;
  wedgeHome: THREE.Matrix4[];
}): void {
  const sets = 5;
  for (let i = 0; i < sets; i++) {
    const z = -1.7 - i * 1.5;
    for (const side of [-1, 1]) {
      const index = i * 2 + (side < 0 ? 0 : 1);
      dummy.position.set(side * 1.08, 1.22, z);
      dummy.rotation.set(0, (index % 3) * 0.02, 0);
      dummy.scale.set(0.92 + (index % 3) * 0.06, 1, 0.9 + (index % 2) * 0.1);
      dummy.updateMatrix();
      rig.posts.setMatrixAt(index, dummy.matrix);
      rig.postHome[index] = dummy.matrix.clone();

      dummy.position.set(side * 0.62, 2.02, z);
      dummy.rotation.set(0, 0, side * 0.78);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      rig.wedges.setMatrixAt(index, dummy.matrix);
      rig.wedgeHome[index] = dummy.matrix.clone();
    }
    dummy.position.set(0, 2.46, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    rig.caps.setMatrixAt(i, dummy.matrix);
    rig.capHome[i] = dummy.matrix.clone();
  }

  let lag = 0;
  const courses = [0.34, 0.6, 0.86, 1.12, 1.38, 1.64, 1.9, 2.14];
  for (let i = 0; i < sets - 1; i++) {
    const z = -1.7 - i * 1.5 - 0.75;
    for (const side of [-1, 1]) {
      for (const y of courses) {
        dummy.position.set(side * 1.24, y, z);
        dummy.rotation.set(0, 0, Math.PI / 2);
        dummy.scale.set(1, 1, 0.96 + (lag % 3) * 0.03);
        dummy.updateMatrix();
        rig.lagging.setMatrixAt(lag, dummy.matrix);
        rig.lagHome[lag] = dummy.matrix.clone();
        lag += 1;
      }
    }
    for (let b = 0; b < 7; b++) {
      dummy.position.set(-0.9 + b * 0.28, 2.28, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      rig.lagging.setMatrixAt(lag, dummy.matrix);
      rig.lagHome[lag] = dummy.matrix.clone();
      lag += 1;
    }
  }
  rig.posts.count = sets * 2;
  rig.caps.count = sets;
  rig.wedges.count = sets * 2;
  rig.lagging.count = lag;
  rig.posts.instanceMatrix.needsUpdate = true;
  rig.caps.instanceMatrix.needsUpdate = true;
  rig.wedges.instanceMatrix.needsUpdate = true;
  rig.lagging.instanceMatrix.needsUpdate = true;
}

export function dressNorthLode(group: THREE.Group): void {
  const rock = rockMaterial();
  const shell = new THREE.Mesh(carveTunnel(), rock);
  shell.name = 'drift-shell';
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);

  const quartz = quartzCrystals();
  quartz.name = 'drift-quartz';
  group.add(quartz);

  const wood = hewnTimberMaterial();
  const aged = hewnTimberMaterial().clone();
  aged.color.set(0x8a6240);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 2.32, 0.24), wood, 10);
  posts.name = 'drift-posts';
  posts.castShadow = true;
  posts.receiveShadow = true;
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(2.55, 0.22, 0.26), aged, 5);
  caps.name = 'drift-caps';
  caps.castShadow = true;
  caps.receiveShadow = true;
  const wedges = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.78, 0.16), wood, 10);
  wedges.name = 'drift-wedges';
  wedges.castShadow = true;
  const lagging = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.07, 1.3), aged, 120);
  lagging.name = 'drift-lagging';
  lagging.castShadow = true;
  lagging.receiveShadow = true;
  group.add(posts, caps, wedges, lagging);
  const postHome: THREE.Matrix4[] = [];
  const capHome: THREE.Matrix4[] = [];
  const lagHome: THREE.Matrix4[] = [];
  const wedgeHome: THREE.Matrix4[] = [];
  layTimber({ posts, caps, postHome, capHome, lagging, lagHome, wedges, wedgeHome });

  const muck = muckMaterial();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.85, 0.1, 8.7), muck);
  floor.name = 'drift-muck';
  floor.position.set(0, 0.08, -4.85);
  floor.receiveShadow = true;
  group.add(floor);
  const puddleMat = new THREE.MeshStandardMaterial({
    color: 0x1c2428,
    roughness: 0.05,
    metalness: 0.62,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const puddleGeom = new THREE.CircleGeometry(1, 14);
  puddleGeom.rotateX(-Math.PI / 2);
  const puddles: [number, number, number, number][] = [
    [-0.15, -3.15, 0.42, 0.7],
    [0.22, -4.55, 0.55, 1],
    [-0.28, -6.15, 0.38, 0.85],
    [0.08, -7.45, 0.48, 0.75],
  ];
  for (const [x, z, rx, rz] of puddles) {
    const puddle = new THREE.Mesh(puddleGeom, puddleMat);
    puddle.position.set(x, 0.145, z);
    puddle.scale.set(rx, 1, rz);
    puddle.receiveShadow = true;
    group.add(puddle);
  }
  const floorLights: THREE.PointLight[] = [];
  for (const z of [-3.1, -5.4, -7.5]) {
    const fill = new THREE.PointLight(0xffd2a4, 3.1, 5.2, 2);
    fill.position.set(0, 0.72, z);
    fill.castShadow = false;
    floorLights.push(fill);
    group.add(fill);
  }

  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffe1a8,
    emissive: 0xffb45a,
    emissiveIntensity: 0.35,
    roughness: 0.4,
  });
  const lights: THREE.PointLight[] = [];
  const lamps: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const z = -1.7 - i * 2.05;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), lampMat);
    lamp.name = i === 2 ? 'drift-lantern' : `drift-lantern-${i}`;
    lamp.position.set(0, 1.92, z);
    const light = new THREE.PointLight(0xffe2cc, 4.2, 6.0, 2);
    light.position.set(0, 1.78, z);
    light.castShadow = false;
    lamps.push(lamp);
    lights.push(light);
    group.add(lamp, light);
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
      color: 0xd5ebe8,
      size: 0.08,
      map: softDiscTexture(),
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      sizeAttenuation: true,
      alphaTest: 0.02,
    }),
  );
  dropPts.name = 'drift-drips';
  group.add(dropPts);

  const railMat = new THREE.MeshStandardMaterial({ color: 0xa39e96, roughness: 0.28, metalness: 0.74 });
  const railGeom = new THREE.BoxGeometry(0.06, 0.05, 7.6);
  const leftRail = new THREE.Mesh(railGeom, railMat);
  leftRail.position.set(-0.28, 0.2, -4.6);
  leftRail.receiveShadow = true;
  const rightRail = new THREE.Mesh(railGeom, railMat);
  rightRail.position.set(0.28, 0.2, -4.6);
  rightRail.receiveShadow = true;
  group.add(leftRail, rightRail);
  const tieGeom = new THREE.BoxGeometry(0.9, 0.04, 0.1);
  const tieMat = new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.95 });
  const ties = new THREE.InstancedMesh(tieGeom, tieMat, 8);
  for (let i = 0; i < 8; i++) {
    dummy.position.set(0, 0.16, -1.5 - i * 0.95);
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
  cart.position.set(0, 0.16, -3.4);
  group.add(cart);

  const bearer = new THREE.PointLight(0xffe2cc, 0, 4.6, 2);
  bearer.name = 'bearer-lantern';
  group.add(bearer);

  const sparkGeom = new THREE.BufferGeometry();
  sparkGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
  const sparks = new THREE.Points(
    sparkGeom,
    new THREE.PointsMaterial({
      color: 0xfff6d2,
      size: 0.28,
      map: softDiscTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      alphaTest: 0.02,
    }),
  );
  sparks.name = 'fuse-sparks';
  for (let i = 0; i < 8; i++) {
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshBasicMaterial({ color: i === 0 ? 0xfff6d8 : 0xffa040 }),
    );
    bead.name = 'fuse-bead';
    bead.visible = false;
    sparks.add(bead);
  }
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
    lagging,
    lagHome,
    wedges,
    wedgeHome,
    floorLights,
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
    pin: null,
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
  const sag = (homes: THREE.Matrix4[], mesh: THREE.InstancedMesh, drop: number, tilt: number) => {
    homes.forEach((home, i) => {
      dummy.matrix.copy(home);
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
      const side = i % 2 === 0 ? -1 : 1;
      dummy.position.y -= fall * drop;
      dummy.rotateX(fall * tilt * 0.45);
      dummy.rotateZ(side * fall * tilt);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  sag(rig.lagHome, rig.lagging, 0.55, 0.35);
  sag(rig.wedgeHome, rig.wedges, 0.9, 0.8);
}

export function driftOf(group: THREE.Group): Rig | undefined {
  return rigs.get(group);
}

export function playDriftBlast(group: THREE.Group, leadIn = false): void {
  const rig = rigs.get(group);
  if (!rig) return;
  rig.pin = null;
  rig.phase = leadIn ? 'fuse' : 'blast';
  rig.t = 0;
  rig.fuse = leadIn ? 0 : 1;
  if (!leadIn) kickChunks(rig, true);
}

/** Freeze a drift beat so a slow screenshot cannot walk past it. */
export function pinDrift(group: THREE.Group, phase: Rig['phase'], t: number): void {
  const rig = rigs.get(group);
  if (!rig) return;
  rig.phase = phase;
  rig.t = t;
  rig.pin = t;
  rig.fuse = phase === 'fuse' ? 0 : 1;
  if (phase === 'blast') kickChunks(rig, true);
  if (phase === 'cave') {
    rig.dig = 0;
    kickChunks(rig, false);
  }
}

export function playDriftCaveIn(group: THREE.Group): void {
  const rig = rigs.get(group);
  if (!rig) return;
  rig.pin = null;
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
  rig.bearer.intensity = 1.5;
}

/** Eye height inside the air of the drift, looking deeper in. */
export function frameDriftWalk(origin: THREE.Vector3, player: THREE.Vector3, camera: THREE.Camera): void {
  const lx = THREE.MathUtils.clamp(player.x - origin.x, -0.55, 0.55);
  const lz = THREE.MathUtils.clamp(player.z - origin.z, -8.2, -0.35);
  const eyeZ = THREE.MathUtils.clamp(lz + 0.12, -8.0, -0.5);
  camera.position.set(origin.x + lx * 0.2, origin.y + 1.48, origin.z + eyeZ);
  camera.lookAt(origin.x + lx * 0.15, origin.y + 1.72, origin.z + Math.min(-0.2, lz - 2.6));
}

/** Centered look down the lantern line, used when the review camera is outside the mouth. */
export function frameDriftInterior(origin: THREE.Vector3, camera: THREE.Camera): void {
  camera.position.set(origin.x, origin.y + 1.48, origin.z - 2.05);
  camera.lookAt(origin.x, origin.y + 1.7, origin.z - 8.0);
}

export function frameDriftShow(group: THREE.Group, origin: THREE.Vector3, camera: THREE.Camera): boolean {
  const rig = rigs.get(group);
  if (!rig) return false;
  if (rig.phase !== 'fuse' && rig.phase !== 'blast' && rig.phase !== 'cave') return false;
  const look = new THREE.Vector3();
  if (rig.phase === 'fuse') {
    camera.position.set(origin.x + 0.15, origin.y + 1.42, origin.z - 4.35);
    look.set(origin.x + 0.62, origin.y + 1.22, origin.z - 7.1);
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
  const show = along > 0.02 && along < 0.98;
  const headZ = -5.0 - 3.2 * along;
  for (let i = 0; i < 12; i++) {
    const trail = i / 11;
    attr.setXYZ(i, 0.62, 1.22 + Math.sin(i * 1.3) * 0.05, headZ + trail * 1.7);
  }
  attr.needsUpdate = true;
  const mat = rig.sparks.material as THREE.PointsMaterial;
  mat.color.set(0xfff6d2);
  mat.size = 0.28;
  mat.opacity = show ? 1 : 0;
  rig.sparks.children.forEach((child, i) => {
    const trail = i / Math.max(1, rig.sparks.children.length - 1);
    child.position.set(0.62, 1.22, headZ + trail * 1.7);
    child.visible = show;
    child.scale.setScalar(i === 0 ? 1.9 : 1);
  });
}

export function updateNorthLode(group: THREE.Group, time: number, creak: number, dt: number): void {
  const rig = rigs.get(group);
  if (!rig) return;
  const flicker = 0.82 + Math.sin(time * 9.5) * 0.08 + Math.sin(time * 23) * 0.04;
  rig.lights.forEach((light, i) => {
    light.intensity = (4.0 + flicker * 0.55 + Math.sin(time * 7 + i) * 0.18) * (rig.phase === 'blast' && rig.t < 0.2 ? 0.35 : 1);
  });
  rig.lamps.forEach((lamp) => {
    const mat = lamp.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.7 + flicker * 0.45;
  });
  rig.floorLights.forEach((light, i) => {
    light.intensity = 3.05 + Math.sin(time * 5.5 + i) * 0.28;
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

  if (rig.pin !== null) rig.t = rig.pin;
  const step = rig.pin !== null ? 0 : Math.min(Math.max(0, dt), 0.08);
  if (rig.phase === 'fuse') {
    rig.t += step;
    const along = Math.min(1, rig.fuse > 0 ? rig.fuse : rig.t / 1.45);
    paintSparks(rig, along);
    // A fuse amount of 0 means this timeline is driving itself. The prospect
    // path sets fuse above 0 and only detonates once the fuse is spent.
    const spent = rig.fuse === 0 || rig.fuse >= 0.99;
    if (rig.t > 1.15 && spent) {
      rig.phase = 'blast';
      rig.t = 0;
      rig.fuse = 1;
      kickChunks(rig, true);
    }
  } else if (rig.phase === 'blast') {
    rig.t += step;
    paintSparks(rig, 1);
    const flash = Math.max(0, 1 - rig.t / 1.2);
    rig.flash.intensity = flash * 180;
    rig.flash.distance = 18;
    (rig.flashBall.material as THREE.MeshBasicMaterial).opacity = Math.min(1, flash * 1.35);
    rig.flashBall.scale.setScalar(2.6 + Math.min(rig.t, 0.4) * 5);
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
