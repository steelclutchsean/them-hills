import * as THREE from 'three';
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
}

export interface ScatterResult {
  placed: number;
  skipped: number;
}

const TERRAIN_EXTENT_HALF = 95; // a bit inside the 100×100 half-extent to keep models off the edge

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
  if (config.models.length === 0) return { placed: 0, skipped: 0 };

  const rng = createRng(seed);
  const models = await loadModels(config.models);
  const sample = config.sampleXZ ?? defaultSample;
  const reject = config.reject;
  const yawRandom = config.randomYaw !== false;
  const yOffset = config.yOffset ?? 0;
  const shadowCast = config.shadows?.cast ?? false;
  const shadowReceive = config.shadows?.receive ?? true;

  const root = new THREE.Group();
  root.name = `scatter:${seed.toString(16)}`;

  let placed = 0;
  let skipped = 0;
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

    const inst = modelRoot.clone(true);
    inst.position.set(x, y, z);
    if (yawRandom) inst.rotation.y = rng.range(0, Math.PI * 2);
    inst.scale.setScalar(rng.range(config.scale.min, config.scale.max));
    configureShadows(inst, shadowCast, shadowReceive);
    root.add(inst);
    placed++;
  }

  scene.add(root);
  return { placed, skipped };
}
