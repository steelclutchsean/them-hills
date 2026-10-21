import * as THREE from 'three';
import { registerObstacle } from '@/game/obstacles';
import { markReflective, markTreeMirror } from '@/render/reflection';
import { kitRockMaterial, timberDarkMaterial } from '@/render/painterly';
import { PALETTE } from '@/render/palette';
import { configureShadows, loadModels } from './assets';
import { createRng, type Rng } from './rng';
import type { Terrain } from './terrain';

// Deterministic asset scatter. Each call samples (x, z) with a configurable strategy,
// rejects positions in excluded zones, looks up the terrain height, and adds a cloned
// model instance to the scene. Reproducible across reloads via the seed.

export interface ScatterConfig {
  /** Target number of instances placed (may be lower if exclusion zones are dense). */
  count: number;
  /** Pool of model URLs; each instance picks one at random. */
  models: readonly string[];
  scale: { min: number; max: number };
  /** Vertical offset added to terrain height (e.g., negative to slightly bury rocks). */
  yOffset?: number;
  /** Position sampler. Default: uniform over the whole terrain. */
  sampleXZ?: (rng: Rng) => { x: number; z: number };
  /** Rejection predicate. Returns true if the candidate position should be skipped. */
  reject?: (x: number, z: number) => boolean;
  /** Random Y rotation. Default: true. */
  randomYaw?: boolean;
  /** Cast/receive shadow flags. Default: cast=false, receive=true. */
  shadows?: { cast?: boolean; receive?: boolean };
  /** Impostor swapped in past a few dozen meters. Trees, rocks, and brush. */
  lod?: 'tree' | 'rock' | 'brush';
  /**
   * Returns the approximate ground-footprint radius (meters) of an instance
   * placed at the given world scale. Reported back in `ScatterResult.positions`
   * so downstream consumers (e.g. the ground-cover grass field) can avoid
   * placing detail inside this object.
   */
  exclusionRadius?: (worldScale: number) => number;
}

export interface ScatteredPosition {
  x: number;
  z: number;
  radius: number;
}

export interface ScatterResult {
  placed: number;
  skipped: number;
  positions: ScatteredPosition[];
}

const TERRAIN_EXTENT_HALF = 95; // a bit inside the 100×100 half-extent to keep models off the edge

interface SwayNode {
  obj: THREE.Object3D;
  detail: THREE.Object3D | null;
  impostor: THREE.Object3D | null;
  phase: number;
  baseX: number;
  baseZ: number;
  ordinal: number;
  budget: number;
  lodDistance: number;
  kind: 'tree' | 'rock' | 'brush' | 'log';
}

const swayNodes: SwayNode[] = [];
let density = 1;

/** Hide the tail of each scatter so a quality change can reveal instances already placed. */
export function setScatterDensity(keepFraction: number): void {
  density = Math.max(0, Math.min(1.05, keepFraction));
}

const pineMat = new THREE.MeshStandardMaterial({ color: PALETTE.pine, roughness: 0.9 });
const barkMat = timberDarkMaterial();
const rockImpostorMat = kitRockMaterial();

let impostorRenderer: THREE.WebGLRenderer | null = null;
let treeCardMat: THREE.MeshStandardMaterial | null = null;
let treeCardWidth = 1.6;
let treeCardHeight = 3.2;
let treeCardCenterY = 1.6;
const treeCardGeom = new THREE.PlaneGeometry(1, 1);
const billboardPos = new THREE.Vector3();

/** The renderer used for the one-shot tree-card bake. Call before scatter. */
export function prepareImpostors(renderer: THREE.WebGLRenderer): void {
  impostorRenderer = renderer;
}

async function bakeTreeCard(source: THREE.Object3D): Promise<void> {
  if (treeCardMat || !impostorRenderer) return;
  const renderer = impostorRenderer;
  const clone = source.clone(true);
  clone.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(clone);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  if (size.y < 0.2) return;
  const widthPx = 128;
  const heightPx = 256;
  const aspect = widthPx / heightPx;
  const pad = 1.06;
  let halfH = (size.y * pad) / 2;
  let halfW = halfH * aspect;
  const halfWNeeded = (Math.max(size.x, size.z) * pad) / 2;
  if (halfWNeeded > halfW) {
    halfW = halfWNeeded;
    halfH = halfW / aspect;
  }
  treeCardWidth = halfW * 2;
  treeCardHeight = halfH * 2;
  treeCardCenterY = center.y;
  const rt = new THREE.WebGLRenderTarget(widthPx, heightPx, {
    depthBuffer: true,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  rt.texture.generateMipmaps = false;
  const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.05, 80);
  cam.position.set(center.x, center.y, center.z + Math.max(size.z, 1) + 6);
  cam.lookAt(center);
  cam.updateProjectionMatrix();
  const bakeScene = new THREE.Scene();
  bakeScene.add(clone);
  const key = new THREE.DirectionalLight(0xfff1d0, 1.35);
  key.position.set(3, 6, 4);
  bakeScene.add(key);
  bakeScene.add(new THREE.AmbientLight(0xc5d4e4, 0.85));
  const prevTarget = renderer.getRenderTarget();
  const prevColor = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevAuto = renderer.autoClear;
  renderer.autoClear = true;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  renderer.render(bakeScene, cam);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevColor, prevAlpha);
  renderer.autoClear = prevAuto;
  bakeScene.remove(clone);
  treeCardMat = new THREE.MeshStandardMaterial({
    map: rt.texture,
    emissiveMap: rt.texture,
    emissive: 0xffffff,
    emissiveIntensity: 1,
    color: 0x000000,
    roughness: 1,
    metalness: 0,
    transparent: true,
    alphaTest: 0.28,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
}

function makeImpostor(kind: 'tree' | 'rock' | 'brush', scale: number): THREE.Object3D {
  const group = new THREE.Group();
  if (kind === 'tree' && treeCardMat) {
    const card = new THREE.Mesh(treeCardGeom, treeCardMat);
    card.scale.set(treeCardWidth * scale, treeCardHeight * scale, 1);
    card.position.y = treeCardCenterY * scale;
    card.castShadow = false;
    card.receiveShadow = false;
    group.add(card);
    group.userData.billboard = true;
  } else if (kind === 'tree') {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08 * scale, 0.12 * scale, 0.9 * scale, 5),
      barkMat,
    );
    trunk.position.y = 0.45 * scale;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.75 * scale, 2.4 * scale, 6), pineMat);
    crown.position.y = 1.9 * scale;
    group.add(trunk, crown);
  } else if (kind === 'rock') {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45 * scale, 0), rockImpostorMat);
    rock.position.y = 0.2 * scale;
    group.add(rock);
  } else {
    const bush = new THREE.Mesh(new THREE.ConeGeometry(0.35 * scale, 0.55 * scale, 5), pineMat);
    bush.position.y = 0.25 * scale;
    group.add(bush);
  }
  return group;
}

/** Whole-tree sway, density, and an impostor swap. Grass wind is separate. */
export function updateScatterWind(
  time: number,
  camera: THREE.Vector3,
  view: THREE.Vector3 = camera,
  sunLift = 1,
): void {
  if (treeCardMat) treeCardMat.emissiveIntensity = Math.max(0.72, Math.min(1.15, sunLift));
  for (const node of swayNodes) {
    const keep = node.ordinal < Math.ceil(node.budget * density);
    if (!keep) {
      node.obj.visible = false;
      continue;
    }
    const dx = node.obj.position.x - camera.x;
    const dz = node.obj.position.z - camera.z;
    const dist = Math.hypot(dx, dz);
    node.obj.visible = dist < 98;
    if (!node.obj.visible) continue;
    const far = node.impostor !== null && dist > node.lodDistance;
    if (node.detail) node.detail.visible = !far;
    if (node.impostor) {
      node.impostor.visible = far;
      if (far && node.impostor.userData.billboard === true) {
        node.impostor.getWorldPosition(billboardPos);
        node.impostor.lookAt(view.x, billboardPos.y, view.z);
      }
    }
    if (node.detail?.visible) {
      const cast = dist < 42;
      node.detail.traverse((child) => {
        if (child instanceof THREE.Mesh) child.castShadow = cast;
      });
    }
    const amp = dist > 60 ? 0 : 0.012;
    node.obj.rotation.z = node.baseZ + Math.sin(time * 0.7 + node.phase) * amp;
    node.obj.rotation.x = node.baseX + Math.cos(time * 0.55 + node.phase) * amp * 0.6;
  }
}

const defaultSample = (rng: Rng): { x: number; z: number } => ({
  x: rng.range(-TERRAIN_EXTENT_HALF, TERRAIN_EXTENT_HALF),
  z: rng.range(-TERRAIN_EXTENT_HALF, TERRAIN_EXTENT_HALF),
});

export async function scatterAssets(
  scene: THREE.Scene,
  terrain: Terrain,
  config: ScatterConfig,
  seed: number,
): Promise<ScatterResult> {
  if (config.models.length === 0) return { placed: 0, skipped: 0, positions: [] };

  const rng = createRng(seed);
  const models = await loadModels(config.models);
  if (config.lod === 'tree' && models[0] && !treeCardMat) {
    try {
      await bakeTreeCard(models[0]);
    } catch (err) {
      console.warn('[scatter] tree card bake failed, using cone stand-ins', err);
    }
  }
  const sample = config.sampleXZ ?? defaultSample;
  const reject = config.reject;
  const yawRandom = config.randomYaw !== false;
  const yOffset = config.yOffset ?? 0;
  const shadowCast = config.shadows?.cast ?? false;
  const shadowReceive = config.shadows?.receive ?? true;
  const exclusionRadius = config.exclusionRadius;

  const root = new THREE.Group();
  root.name = `scatter:${seed.toString(16)}`;

  let placed = 0;
  let skipped = 0;
  const positions: ScatteredPosition[] = [];
  const maxAttempts = config.count * 6;
  let attempts = 0;

  while (placed < config.count && attempts < maxAttempts) {
    attempts++;
    const { x, z } = sample(rng);
    if (reject && reject(x, z)) {
      skipped++;
      continue;
    }
    const y = terrain.getHeightAt(x, z) + yOffset;
    const modelIdx = rng.int(0, config.models.length);
    const modelRoot = models[modelIdx];
    if (!modelRoot) continue;

    const worldScale = rng.range(config.scale.min, config.scale.max);
    const inst = modelRoot.clone(true);
    inst.position.set(0, 0, 0);
    inst.rotation.set(0, 0, 0);
    inst.scale.setScalar(worldScale);
    configureShadows(inst, shadowCast, shadowReceive);
    const wrap = new THREE.Group();
    wrap.position.set(x, y, z);
    if (yawRandom) wrap.rotation.y = rng.range(0, Math.PI * 2);
    wrap.add(inst);
    let impostor: THREE.Object3D | null = null;
    let lodDistance = 0;
    if (config.lod) {
      impostor = makeImpostor(config.lod, worldScale);
      impostor.visible = false;
      wrap.add(impostor);
      lodDistance = config.lod === 'tree' ? 42 : config.lod === 'rock' ? 40 : 34;
    }
    swayNodes.push({
      obj: wrap,
      detail: inst,
      impostor,
      phase: rng.next() * Math.PI * 2,
      baseX: 0,
      baseZ: 0,
      ordinal: placed,
      budget: config.count,
      lodDistance,
      kind: config.lod ?? 'brush',
    });
    root.add(wrap);
    if (exclusionRadius) {
      positions.push({ x, z, radius: exclusionRadius(worldScale) });
    }
    placed++;
  }

  scene.add(root);
  markReflective(root);
  if (config.lod === 'tree') markTreeMirror(root);
  registerObstacle(root);
  return { placed, skipped, positions };
}

/** Fallen timber in the meadow. Same density list as the glTF scatter. */
export function scatterLogs(
  scene: THREE.Scene,
  terrain: Terrain,
  count: number,
  reject: ((x: number, z: number) => boolean) | undefined,
  seed: number,
): ScatterResult {
  const rng = createRng(seed);
  const root = new THREE.Group();
  root.name = 'scatter-logs';
  const positions: ScatteredPosition[] = [];
  let placed = 0;
  let skipped = 0;
  const maxAttempts = count * 8;
  let attempts = 0;
  const mat = timberDarkMaterial();
  while (placed < count && attempts < maxAttempts) {
    attempts++;
    const x = rng.range(-90, 90);
    const z = rng.range(-90, 90);
    if (reject?.(x, z)) {
      skipped++;
      continue;
    }
    const y = terrain.getHeightAt(x, z);
    const length = rng.range(1.1, 2.4);
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, length, 6), mat);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = rng.range(0, Math.PI);
    log.castShadow = true;
    log.receiveShadow = true;
    const wrap = new THREE.Group();
    wrap.position.set(x, y + 0.08, z);
    wrap.add(log);
    const impostor = new THREE.Mesh(new THREE.BoxGeometry(length, 0.16, 0.16), mat);
    impostor.visible = false;
    wrap.add(impostor);
    swayNodes.push({
      obj: wrap,
      detail: log,
      impostor,
      phase: rng.next() * Math.PI * 2,
      baseX: 0,
      baseZ: 0,
      ordinal: placed,
      budget: count,
      lodDistance: 36,
      kind: 'log',
    });
    root.add(wrap);
    positions.push({ x, z, radius: length * 0.35 });
    placed++;
  }
  scene.add(root);
  markReflective(root);
  registerObstacle(root);
  return { placed, skipped, positions };
}

const fadedFoliage: THREE.Mesh[] = [];

/** Soften trees and brush the lens is sitting in. Shared materials stay on the far copies. */
export function fadeFoliageNear(camera: THREE.Vector3 | null, radius = 2.5): void {
  for (const mesh of fadedFoliage) {
    const base = mesh.userData.baseMat as THREE.Material | undefined;
    if (base) mesh.material = base;
  }
  fadedFoliage.length = 0;
  if (!camera) return;
  const radiusSq = radius * radius;
  for (const node of swayNodes) {
    if (node.kind !== 'tree' && node.kind !== 'brush') continue;
    const dx = node.obj.position.x - camera.x;
    const dy = node.obj.position.y + 1.6 - camera.y;
    const dz = node.obj.position.z - camera.z;
    if (dx * dx + dy * dy + dz * dz > radiusSq) continue;
    const dist = Math.hypot(dx, dy, dz);
    const fade = 1 - dist / radius;
    node.obj.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const current = obj.material;
      if (Array.isArray(current)) return;
      if (!obj.userData.baseMat) obj.userData.baseMat = current;
      const fadeMat =
        (obj.userData.fadeMat as THREE.Material | undefined) ?? (current as THREE.Material).clone();
      obj.userData.fadeMat = fadeMat;
      if ('opacity' in fadeMat) {
        fadeMat.transparent = true;
        fadeMat.opacity = 1 - fade * 0.92;
        fadeMat.depthWrite = fade < 0.35;
        fadeMat.needsUpdate = true;
      }
      obj.material = fadeMat;
      fadedFoliage.push(obj);
    });
  }
}
