import * as THREE from 'three';
import type { Terrain } from './terrain';
import { createRng } from './rng';

// Instanced grass-blade field — thousands of thin triangle blades scattered
// across the terrain to break up the polygonal hill silhouette and add the
// lived-in detail the bare heightmap was missing.
//
// Each blade is a single triangle (3 verts, 1 face) in local space, rooted
// at the origin and pointing up to ~0.5m. Per-instance attributes carry the
// world offset, Y rotation, scale, and a per-blade phase so wind ripples
// don't move in lockstep. A small custom shader sways the tip with sin(time)
// scaled by a tip-bias so the base stays anchored.

const DEFAULT_BLADE_HEIGHT = 0.55;
const DEFAULT_BLADE_HALF_BASE = 0.04;

const BASE_VS = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aPhase;
  attribute float aRotY;
  attribute float aScale;
  attribute vec3 aColorBase;
  attribute vec3 aColorTip;
  uniform float uTime;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  uniform vec3 uAmbientColor;
  uniform float uAmbientIntensity;
  uniform float uBladeHeight;
  uniform float uWindAmp;
  varying vec3 vColor;

  void main() {
    // Local position scaled by per-instance scale.
    vec3 pos = position * aScale;
    // Wind sway: more displacement at the tip than the root.
    float tipBias = clamp(pos.y / uBladeHeight, 0.0, 1.0);
    float wind = sin(uTime * 1.4 + aPhase) * uWindAmp * tipBias * tipBias;
    float gust = sin(uTime * 0.7 + aPhase * 0.6) * (uWindAmp * 0.6) * tipBias;
    pos.x += wind;
    pos.z += gust;
    // Rotate around Y by per-instance angle.
    float c = cos(aRotY);
    float s = sin(aRotY);
    vec3 rotated = vec3(c * pos.x + s * pos.z, pos.y, -s * pos.x + c * pos.z);
    vec3 worldPos = aOffset + rotated;
    // Per-vertex color comes from base/tip blend by Y; light weighted by sun.
    vec3 baseCol = mix(aColorBase, aColorTip, tipBias);
    vec3 lit = baseCol * (uAmbientColor * uAmbientIntensity + uSunColor * uSunIntensity * 0.6);
    vColor = lit;
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
  }
`;

const BASE_FS = /* glsl */ `
  varying vec3 vColor;
  void main() {
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

export interface GrassFieldOpts {
  count: number;
  /** Half-extent of the world bounds; blades sample within ±extent on X and Z. */
  extent: number;
  /** Reject sampler — return true to skip this position (e.g. stream water). */
  reject?: (x: number, z: number) => boolean;
  seed?: number;
  /** Blade height in meters. Default 0.55 (knee-high). Use 0.08–0.12 for ground cover. */
  bladeHeight?: number;
  /** Half-base width in meters. Default 0.04. */
  bladeHalfBase?: number;
  /** Per-instance scale jitter range. Default 0.85–1.4. */
  scaleRange?: { min: number; max: number };
  /** Wind sway tip-displacement (meters). Default 0.10; lower for short blades. */
  windAmplitude?: number;
  /** Override the per-instance color jitter palette. Each component is rgb min..max. */
  baseColor?: { r: [number, number]; g: [number, number]; b: [number, number] };
  tipColor?: { r: [number, number]; g: [number, number]; b: [number, number] };
}

export interface GrassField {
  mesh: THREE.Mesh;
  update(opts: {
    time: number;
    sunColor: THREE.Color;
    sunIntensity: number;
    ambientColor: THREE.Color;
    ambientIntensity: number;
  }): void;
}

export function createGrassField(terrain: Terrain, opts: GrassFieldOpts): GrassField {
  const {
    count,
    extent,
    reject,
    seed = 0xa9,
    bladeHeight = DEFAULT_BLADE_HEIGHT,
    bladeHalfBase = DEFAULT_BLADE_HALF_BASE,
    scaleRange = { min: 0.85, max: 1.4 },
    windAmplitude = 0.1,
    baseColor = { r: [0.12, 0.18], g: [0.32, 0.44], b: [0.08, 0.13] },
    tipColor = { r: [0.42, 0.52], g: [0.55, 0.73], b: [0.16, 0.24] },
  } = opts;

  // Single-triangle blade in local space — base centered on origin, tip up.
  const baseGeom = new THREE.BufferGeometry();
  baseGeom.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array([-bladeHalfBase, 0, 0, bladeHalfBase, 0, 0, 0, bladeHeight, 0]),
      3,
    ),
  );
  baseGeom.setIndex([0, 1, 2]);

  // Per-instance attributes
  const offsets = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const rotsY = new Float32Array(count);
  const scales = new Float32Array(count);
  const colorBase = new Float32Array(count * 3);
  const colorTip = new Float32Array(count * 3);

  const rng = createRng(seed);

  let placed = 0;
  let attempts = 0;
  const maxAttempts = count * 6;
  while (placed < count && attempts < maxAttempts) {
    attempts++;
    const x = (rng.next() - 0.5) * extent * 2;
    const z = (rng.next() - 0.5) * extent * 2;
    if (reject && reject(x, z)) continue;
    const y = terrain.getHeightAt(x, z);
    offsets[placed * 3 + 0] = x;
    offsets[placed * 3 + 1] = y;
    offsets[placed * 3 + 2] = z;
    phases[placed] = rng.next() * Math.PI * 2;
    rotsY[placed] = rng.next() * Math.PI;
    scales[placed] = scaleRange.min + rng.next() * (scaleRange.max - scaleRange.min);

    colorBase[placed * 3 + 0] = baseColor.r[0] + rng.next() * (baseColor.r[1] - baseColor.r[0]);
    colorBase[placed * 3 + 1] = baseColor.g[0] + rng.next() * (baseColor.g[1] - baseColor.g[0]);
    colorBase[placed * 3 + 2] = baseColor.b[0] + rng.next() * (baseColor.b[1] - baseColor.b[0]);
    colorTip[placed * 3 + 0] = tipColor.r[0] + rng.next() * (tipColor.r[1] - tipColor.r[0]);
    colorTip[placed * 3 + 1] = tipColor.g[0] + rng.next() * (tipColor.g[1] - tipColor.g[0]);
    colorTip[placed * 3 + 2] = tipColor.b[0] + rng.next() * (tipColor.b[1] - tipColor.b[0]);

    placed++;
  }

  const instGeom = new THREE.InstancedBufferGeometry();
  // Manually copy attributes from the base geometry — InstancedBufferGeometry
  // doesn't have a `.copy(BufferGeometry)` overload that preserves index.
  instGeom.setAttribute('position', baseGeom.getAttribute('position'));
  if (baseGeom.index) instGeom.setIndex(baseGeom.index);
  instGeom.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
  instGeom.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  instGeom.setAttribute('aRotY', new THREE.InstancedBufferAttribute(rotsY, 1));
  instGeom.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 1));
  instGeom.setAttribute('aColorBase', new THREE.InstancedBufferAttribute(colorBase, 3));
  instGeom.setAttribute('aColorTip', new THREE.InstancedBufferAttribute(colorTip, 3));
  instGeom.instanceCount = placed;

  // Bounding sphere is required for some renderers; we set a generous one
  // since per-instance offsets aren't part of the local geometry bounds.
  instGeom.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), extent * 1.5);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunColor: { value: new THREE.Color(0xffffff) },
      uSunIntensity: { value: 1.0 },
      uAmbientColor: { value: new THREE.Color(0xffffff) },
      uAmbientIntensity: { value: 0.5 },
      uBladeHeight: { value: bladeHeight },
      uWindAmp: { value: windAmplitude },
    },
    vertexShader: BASE_VS,
    fragmentShader: BASE_FS,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(instGeom, material);
  mesh.frustumCulled = false; // per-instance offsets defeat AABB culling
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  return {
    mesh,
    update(state) {
      material.uniforms.uTime!.value = state.time;
      (material.uniforms.uSunColor!.value as THREE.Color).copy(state.sunColor);
      material.uniforms.uSunIntensity!.value = state.sunIntensity;
      (material.uniforms.uAmbientColor!.value as THREE.Color).copy(state.ambientColor);
      material.uniforms.uAmbientIntensity!.value = state.ambientIntensity;
    },
  };
}
