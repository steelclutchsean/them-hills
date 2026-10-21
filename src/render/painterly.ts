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

const shared = new Map<string, THREE.MeshStandardMaterial>();

function lit(name: string, color: number, roughness = 0.86): THREE.MeshStandardMaterial {
  const hit = shared.get(name);
  if (hit) return hit;
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

export function timberMaterial(): THREE.MeshStandardMaterial {
  return lit('sierra-timber', PALETTE.timber, 0.88);
}

export function timberDarkMaterial(): THREE.MeshStandardMaterial {
  return lit('sierra-timber-dark', PALETTE.timberDark, 0.9);
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
