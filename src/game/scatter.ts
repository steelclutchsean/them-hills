import * as THREE from 'three';
import { registerObstacle } from '@/game/obstacles';
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

function makeImpostor(kind: 'tree' | 'rock' | 'brush', scale: number): THREE.Object3D {
  const group = new THREE.Group();
  if (kind === 'tree') {
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
export function updateScatterWind(time: number, camera: THREE.Vector3): void {
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
    if (node.impostor) node.impostor.visible = far;
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
      lodDistance = config.lod === 'tree' ? 52 : config.lod === 'rock' ? 40 : 34;
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
    });
    root.add(wrap);
    if (exclusionRadius) {
      positions.push({ x, z, radius: exclusionRadius(worldScale) });
    }
    placed++;
  }

  scene.add(root);
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
    });
    root.add(wrap);
    positions.push({ x, z, radius: length * 0.35 });
    placed++;
  }
  scene.add(root);
  registerObstacle(root);
  return { placed, skipped, positions };
}
