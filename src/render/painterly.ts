import * as THREE from 'three';
import { PALETTE } from '@/render/palette';

// Low-frequency painted tiles. Broad strokes, not photographs, so a tiled
// ground still reads as one illustration.

function canvasTex(
  paint: (ctx: CanvasRenderingContext2D, size: number) => void,
  size = 128,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[painterly] canvas 2d unavailable');
  paint(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function strokes(
  ctx: CanvasRenderingContext2D,
  size: number,
  base: number,
  marks: readonly number[],
): void {
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 18; i++) {
    ctx.globalAlpha = 0.28 + (i % 3) * 0.08;
    ctx.fillStyle = hex(marks[i % marks.length] ?? base);
    const y = ((i * 37) % size) - 8;
    ctx.beginPath();
    ctx.ellipse(size * 0.5, y, size * 0.62, 7 + (i % 4) * 3, (i % 5) * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

let maps: {
  grass: THREE.CanvasTexture;
  dirt: THREE.CanvasTexture;
  gravel: THREE.CanvasTexture;
  rock: THREE.CanvasTexture;
} | null = null;

export function groundMaps(): {
  grass: THREE.CanvasTexture;
  dirt: THREE.CanvasTexture;
  gravel: THREE.CanvasTexture;
  rock: THREE.CanvasTexture;
} {
  if (maps) return maps;
  maps = {
    grass: canvasTex((ctx, s) =>
      strokes(ctx, s, PALETTE.grassBase, [PALETTE.grassTip, PALETTE.grassShadow, PALETTE.dirt]),
    ),
    dirt: canvasTex((ctx, s) =>
      strokes(ctx, s, PALETTE.dirt, [PALETTE.dirtDeep, PALETTE.gravel, PALETTE.timber]),
    ),
    gravel: canvasTex((ctx, s) =>
      strokes(ctx, s, PALETTE.gravel, [PALETTE.rockLight, PALETTE.rock, PALETTE.foam]),
    ),
    rock: canvasTex((ctx, s) =>
      strokes(ctx, s, PALETTE.rock, [PALETTE.rockLight, PALETTE.dirtDeep, PALETTE.bark]),
    ),
  };
  return maps;
}

const shared = new Map<string, THREE.Material>();

function lit(name: string, color: number, roughness = 0.86): THREE.MeshStandardMaterial {
  const hit = shared.get(name);
  if (hit instanceof THREE.MeshStandardMaterial) return hit;
  const mat = new THREE.MeshStandardMaterial({
    name,
    color,
    roughness,
    metalness: 0,
    flatShading: false,
  });
  shared.set(name, mat);
  return mat;
}

export function barkMaterial(): THREE.MeshStandardMaterial {
  return lit('sierra-bark', PALETTE.bark, 0.92);
}

export function kitRockMaterial(): THREE.MeshStandardMaterial {
  return lit('sierra-rock', PALETTE.rock, 0.94);
}

function woodTextures(weathered: boolean): {
  map: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  ao: THREE.CanvasTexture;
} {
  const size = 128;
  const albedo = document.createElement('canvas');
  albedo.width = size;
  albedo.height = size;
  const actx = albedo.getContext('2d');
  if (!actx) throw new Error('[painterly] canvas 2d unavailable');
  actx.fillStyle = weathered ? '#4a2c18' : '#c48a52';
  actx.fillRect(0, 0, size, size);
  const plank = 32;
  for (let y = 0; y < size; y += plank) {
    const shade = weathered ? (y / size) * 28 : 12;
    actx.fillStyle = `rgb(${156 - shade}, ${92 - shade * 0.4}, ${48 - shade * 0.2})`;
    actx.fillRect(0, y, size, plank - 4);
    actx.fillStyle = weathered ? '#2a160e' : '#3a2416';
    actx.fillRect(0, y + plank - 4, size, 4);
    actx.globalAlpha = 0.35;
    actx.fillStyle = '#3a2414';
    for (let g = 0; g < 5; g++) actx.fillRect(0, y + 3 + g * 5, size, 1);
    actx.globalAlpha = 1;
    if ((y / plank) % 3 === 0) {
      actx.globalAlpha = 0.22;
      actx.fillStyle = '#2a2218';
      actx.fillRect(8, y + 6, 36, 10);
      actx.globalAlpha = 1;
    }
  }
  // Bottom courses pick up dirt.
  const dirt = actx.createLinearGradient(0, size * 0.72, 0, size);
  dirt.addColorStop(0, 'rgba(0,0,0,0)');
  dirt.addColorStop(1, 'rgba(28,18,10,0.55)');
  actx.fillStyle = dirt;
  actx.fillRect(0, 0, size, size);

  const normal = document.createElement('canvas');
  normal.width = size;
  normal.height = size;
  const nctx = normal.getContext('2d');
  if (!nctx) throw new Error('[painterly] canvas 2d unavailable');
  const pixels = nctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const inPlank = y % plank;
    const bevel = inPlank < 3 ? inPlank / 3 : inPlank > plank - 5 ? (plank - inPlank) / 5 : 1;
    const ny = inPlank < 4 ? -0.65 : inPlank > plank - 6 ? 0.65 : Math.sin(y * 0.7) * 0.08;
    const nx = Math.sin(y * 0.31) * 0.12;
    const nz = 0.35 + bevel * 0.65;
    const len = Math.hypot(nx, ny, nz) || 1;
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      pixels.data[o] = Math.round((nx / len) * 127 + 128);
      pixels.data[o + 1] = Math.round((ny / len) * 127 + 128);
      pixels.data[o + 2] = Math.round((nz / len) * 127 + 128);
      pixels.data[o + 3] = 255;
    }
  }
  nctx.putImageData(pixels, 0, 0);

  const aoCanvas = document.createElement('canvas');
  aoCanvas.width = size;
  aoCanvas.height = size;
  const octx = aoCanvas.getContext('2d');
  if (!octx) throw new Error('[painterly] canvas 2d unavailable');
  octx.fillStyle = '#d8d8d8';
  octx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += plank) {
    octx.fillStyle = '#2a2a2a';
    octx.fillRect(0, y + plank - 5, size, 6);
    octx.fillStyle = '#8a8a8a';
    octx.fillRect(0, y, size, 2);
  }
  const dirtAo = octx.createLinearGradient(0, size * 0.7, 0, size);
  dirtAo.addColorStop(0, 'rgba(255,255,255,0)');
  dirtAo.addColorStop(1, 'rgba(40,40,40,0.65)');
  octx.fillStyle = dirtAo;
  octx.fillRect(0, 0, size, size);

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  const normalMap = new THREE.CanvasTexture(normal);
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  const ao = new THREE.CanvasTexture(aoCanvas);
  ao.colorSpace = THREE.NoColorSpace;
  ao.wrapS = THREE.RepeatWrapping;
  ao.wrapT = THREE.RepeatWrapping;
  return { map, normal: normalMap, ao };
}

let woodFresh: {
  map: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  ao: THREE.CanvasTexture;
} | null = null;
let woodOld: {
  map: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  ao: THREE.CanvasTexture;
} | null = null;

function applyWood(
  mat: THREE.MeshStandardMaterial,
  weathered: boolean,
): THREE.MeshStandardMaterial {
  if (mat.map) return mat;
  const tex = weathered ? (woodOld ??= woodTextures(true)) : (woodFresh ??= woodTextures(false));
  mat.map = tex.map;
  mat.normalMap = tex.normal;
  mat.normalScale.set(1.15, 1.15);
  mat.aoMap = tex.ao;
  mat.aoMapIntensity = weathered ? 1.15 : 0.9;
  mat.color.set(0xffffff);
  mat.roughness = weathered ? 0.92 : 0.78;
  mat.needsUpdate = true;
  return mat;
}

export function timberMaterial(): THREE.MeshStandardMaterial {
  return applyWood(lit('sierra-timber', PALETTE.timber, 0.88), false);
}

export function timberDarkMaterial(): THREE.MeshStandardMaterial {
  return applyWood(lit('sierra-timber-dark', PALETTE.timberDark, 0.9), true);
}

const goldGlintUniforms = { uTime: { value: 0 } };

/** Shared metallic flake. The glint child is what the bloom pass catches. */
export function goldFlakeMaterial(): THREE.MeshPhysicalMaterial {
  const hit = shared.get('sierra-gold');
  if (hit instanceof THREE.MeshPhysicalMaterial) return hit;
  const mat = new THREE.MeshPhysicalMaterial({
    name: 'sierra-gold',
    color: 0xffd36a,
    metalness: 1,
    roughness: 0.18,
    emissive: 0xffc14a,
    emissiveIntensity: 0.55,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    reflectivity: 0.85,
  });
  shared.set('sierra-gold', mat);
  return mat;
}

export function goldGlintMaterial(): THREE.ShaderMaterial {
  const existing = shared.get('sierra-gold-glint');
  if (existing instanceof THREE.ShaderMaterial) return existing;
  const mat = new THREE.ShaderMaterial({
    name: 'sierra-gold-glint',
    uniforms: goldGlintUniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vN;
      void main() {
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vN;
      void main() {
        float spark = pow(max(vN.y, 0.0), 18.0);
        float twinkle = 0.55 + 0.45 * sin(uTime * 7.0 + vN.x * 12.0);
        vec3 col = vec3(1.85, 1.25, 0.42) * (0.25 + spark * 2.4 * twinkle);
        gl_FragColor = vec4(col, 0.85);
      }
    `,
  });
  shared.set('sierra-gold-glint', mat);
  return mat;
}

export function pulseGold(time: number): void {
  goldGlintUniforms.uTime.value = time;
}

export function addGoldFlake(
  parent: THREE.Object3D,
  radius: number,
  x: number,
  y: number,
  z: number,
): void {
  const flake = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), goldFlakeMaterial());
  flake.position.set(x, y, z);
  flake.scale.set(1.15, 0.55, 0.9);
  parent.add(flake);
  const glint = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.45, 8, 6), goldGlintMaterial());
  glint.position.set(x, y + radius * 0.15, z);
  parent.add(glint);
}

export function stoneMaterial(): THREE.MeshStandardMaterial {
  return lit('sierra-stone', PALETTE.rockLight, 0.93);
}

export function canvasMaterial(): THREE.MeshStandardMaterial {
  return lit('sierra-canvas', PALETTE.canvas, 0.84);
}

const windMaterials: THREE.Material[] = [];

/**
 * Keep the card's alpha (or its black backdrop) and throw away the photo
 * color, so pines, grass clumps, and flowers stay in the Sierra palette.
 */
function posterCutout(mat: THREE.Material, color: number, wind: boolean): THREE.Material {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return mat;
  if (mat.userData.posterCutout === true) return mat;
  mat.userData.posterCutout = true;
  mat.color.setHex(color);
  mat.vertexColors = false;
  mat.metalness = 0;
  mat.roughness = 0.9;
  mat.normalMap = null;
  mat.roughnessMap = null;
  mat.aoMap = null;
  mat.emissive.setHex(0);
  mat.emissiveMap = null;
  mat.transparent = false;
  mat.alphaTest = 0.45;
  mat.side = THREE.DoubleSide;
  mat.depthWrite = true;
  const sway = wind ? '0.045' : '0.0';
  const swayZ = wind ? '0.03' : '0.0';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = { value: 0 };
    mat.userData.windUniform = shader.uniforms.uWindTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float windH = max(transformed.y, 0.0);
         transformed.x += sin(uWindTime * 1.3 + position.z * 0.7) * windH * ${sway};
         transformed.z += cos(uWindTime * 0.9 + position.x * 0.5) * windH * ${swayZ};`,
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D(map, vMapUv);
        float chroma = smoothstep(0.05, 0.2, max(sampledDiffuseColor.r, max(sampledDiffuseColor.g, sampledDiffuseColor.b)));
        float luma = dot(sampledDiffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        diffuseColor.rgb *= mix(0.42, 1.45, clamp(luma * 1.6, 0.0, 1.0));
        diffuseColor.a *= sampledDiffuseColor.a * chroma;
      #endif`,
    );
  };
  mat.customProgramCacheKey = () => (wind ? 'sierra-cutout-wind' : 'sierra-cutout');
  if (wind) windMaterials.push(mat);
  return mat;
}

function styleOne(mat: THREE.Material, meshName: string): THREE.Material {
  const key = `${mat.name} ${meshName}`.toLowerCase();
  if (
    key.includes('leaf') ||
    key.includes('pine_c') ||
    key.includes('fern') ||
    key.includes('plant') ||
    key.includes('clover')
  ) {
    return posterCutout(mat, PALETTE.pine, true);
  }
  if (key.includes('grass')) return posterCutout(mat, PALETTE.grassTip, true);
  if (key.includes('flower') || key.includes('petal')) {
    return posterCutout(mat, PALETTE.gold, false);
  }
  if (key.includes('mushroom')) return posterCutout(mat, PALETTE.timber, false);
  if (
    key.includes('bark') ||
    key.includes('trunk') ||
    key.includes('wood') ||
    key.includes('log')
  ) {
    return barkMaterial();
  }
  if (key.includes('rock') || key.includes('pebble') || key.includes('stone')) {
    return kitRockMaterial();
  }
  return mat;
}

/** Poster treatment for Quaternius kits: one palette, cutout cards kept. */
export function stylizeKit(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const current = obj.material;
    if (Array.isArray(current)) {
      obj.material = current.map((mat) => styleOne(mat, obj.name));
    } else {
      obj.material = styleOne(current, obj.name);
    }
  });
}

/** Wind uniforms are registered while the kits are stylized. */
export function installFoliageWind(): void {
  // posterCutout registers each swaying material. The loader calls this
  // so the opt-in stays next to stylizeKit.
}

export function setFoliageWindTime(time: number): void {
  for (const mat of windMaterials) {
    const uniform = mat.userData.windUniform as { value: number } | undefined;
    if (uniform) uniform.value = time;
  }
}
