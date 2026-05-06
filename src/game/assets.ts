import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// glTF asset cache + a typed registry of available models.
//
// Loading model: each glTF is fetched once, parsed into a THREE.Group, and the parsed
// root is cached. Callers receive a fresh deep-clone (geometries reused, materials
// reused, but the hierarchy is independent) so each instance can be transformed.
//
// Future asset categories (e.g., custom Them Hills props built directly in code or
// commissioned later) should be registered here so call sites stay typed.

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group>>();

export function loadModel(url: string): Promise<THREE.Group> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise<THREE.Group>((resolve, reject) => {
      loader.load(
        url,
        (gltf) => resolve(gltf.scene),
        undefined,
        (err) => reject(err instanceof Error ? err : new Error(String(err))),
      );
    });
    cache.set(url, p);
  }
  return p;
}

export async function loadModels(urls: readonly string[]): Promise<THREE.Group[]> {
  return Promise.all(urls.map((u) => loadModel(u)));
}

/** Deep-cloned scene; safe to transform per instance, materials shared. */
export async function getModelInstance(url: string): Promise<THREE.Object3D> {
  const root = await loadModel(url);
  return root.clone(true);
}

// ---------- Asset registry ----------

const MEGAKIT = '/assets/megakit/';

function urls(base: string, names: readonly string[]): readonly string[] {
  return names.map((n) => base + n + '.gltf');
}

export const ASSETS = {
  trees: {
    common: urls(MEGAKIT, [
      'CommonTree_1',
      'CommonTree_2',
      'CommonTree_3',
      'CommonTree_4',
      'CommonTree_5',
    ]),
    pine: urls(MEGAKIT, ['Pine_1', 'Pine_2', 'Pine_3', 'Pine_4', 'Pine_5']),
    twisted: urls(MEGAKIT, [
      'TwistedTree_1',
      'TwistedTree_2',
      'TwistedTree_3',
      'TwistedTree_4',
      'TwistedTree_5',
    ]),
    dead: urls(MEGAKIT, ['DeadTree_1', 'DeadTree_2', 'DeadTree_3', 'DeadTree_4', 'DeadTree_5']),
  },
  rocks: {
    medium: urls(MEGAKIT, ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3']),
    pebbleRound: urls(MEGAKIT, [
      'Pebble_Round_1',
      'Pebble_Round_2',
      'Pebble_Round_3',
      'Pebble_Round_4',
      'Pebble_Round_5',
    ]),
    pebbleSquare: urls(MEGAKIT, [
      'Pebble_Square_1',
      'Pebble_Square_2',
      'Pebble_Square_3',
      'Pebble_Square_4',
      'Pebble_Square_5',
      'Pebble_Square_6',
    ]),
  },
  vegetation: {
    grass: urls(MEGAKIT, [
      'Grass_Common_Short',
      'Grass_Common_Tall',
      'Grass_Wispy_Short',
      'Grass_Wispy_Tall',
    ]),
    bushes: urls(MEGAKIT, ['Bush_Common', 'Bush_Common_Flowers']),
    ferns: urls(MEGAKIT, ['Fern_1']),
    plants: urls(MEGAKIT, ['Plant_1', 'Plant_1_Big', 'Plant_7', 'Plant_7_Big']),
    flowers: urls(MEGAKIT, [
      'Flower_3_Single',
      'Flower_3_Group',
      'Flower_4_Single',
      'Flower_4_Group',
      'Clover_1',
      'Clover_2',
    ]),
    mushrooms: urls(MEGAKIT, ['Mushroom_Common', 'Mushroom_Laetiporus']),
  },
} as const;

/** Configure per-mesh shadow casting/receiving on a loaded model. */
export function configureShadows(root: THREE.Object3D, cast: boolean, receive: boolean): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = cast;
      obj.receiveShadow = receive;
    }
  });
}
