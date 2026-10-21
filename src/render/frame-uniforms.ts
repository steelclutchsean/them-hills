import * as THREE from 'three';

// One set of lighting uniforms, shared by every custom shader (terrain, water,
// grass, and whatever phase 2 adds). The frame loop writes them once via
// syncFrameUniforms(); materials hold references to the same uniform objects.
//
// Built-in MeshStandard materials (trees, character, boulders) do NOT read
// these. They use the scene lights + environment map, which the lighting rig
// keeps in agreement with the values written here.

export interface FrameUniforms {
  uTime: { value: number };
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uSunIntensity: { value: number };
  uAmbientColor: { value: THREE.Color };
  uAmbientIntensity: { value: number };
  uHemiSky: { value: THREE.Color };
  uHemiGround: { value: THREE.Color };
  uHemiIntensity: { value: number };
}

export const FRAME_UNIFORM_GLSL = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  uniform vec3 uAmbientColor;
  uniform float uAmbientIntensity;
  uniform vec3 uHemiSky;
  uniform vec3 uHemiGround;
  uniform float uHemiIntensity;
`;

const FRAME_KEYS = [
  'uTime',
  'uSunDir',
  'uSunColor',
  'uSunIntensity',
  'uAmbientColor',
  'uAmbientIntensity',
  'uHemiSky',
  'uHemiGround',
  'uHemiIntensity',
] as const satisfies readonly (keyof FrameUniforms)[];

let frame: FrameUniforms | null = null;

export function initFrameUniforms(): FrameUniforms {
  if (frame) return frame;
  frame = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.35, 0.86, 0.28).normalize() },
    uSunColor: { value: new THREE.Color(0xfff1d0) },
    uSunIntensity: { value: 1 },
    uAmbientColor: { value: new THREE.Color(0xc5d0dc) },
    uAmbientIntensity: { value: 0.45 },
    uHemiSky: { value: new THREE.Color(0x8eafd0) },
    uHemiGround: { value: new THREE.Color(0x3d4a28) },
    uHemiIntensity: { value: 0.32 },
  };
  return frame;
}

export function getFrameUniforms(): FrameUniforms {
  return frame ?? initFrameUniforms();
}

/** Point a material's uniform table at the shared frame block. */
export function bindFrameUniforms(uniforms: Record<string, THREE.IUniform>): void {
  const shared = getFrameUniforms();
  for (const key of FRAME_KEYS) {
    uniforms[key] = shared[key];
  }
}

export interface FrameLightingInput {
  time: number;
  sunDirection: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  ambientColor: THREE.Color;
  ambientIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
}

export function syncFrameUniforms(input: FrameLightingInput): void {
  const shared = getFrameUniforms();
  shared.uTime.value = input.time;
  shared.uSunDir.value.copy(input.sunDirection);
  if (shared.uSunDir.value.lengthSq() < 1e-6) shared.uSunDir.value.set(0, 1, 0);
  else shared.uSunDir.value.normalize();
  shared.uSunColor.value.copy(input.sunColor);
  shared.uSunIntensity.value = input.sunIntensity;
  shared.uAmbientColor.value.copy(input.ambientColor);
  shared.uAmbientIntensity.value = input.ambientIntensity;
  shared.uHemiSky.value.copy(input.hemiSky);
  shared.uHemiGround.value.copy(input.hemiGround);
  shared.uHemiIntensity.value = input.hemiIntensity;
}
