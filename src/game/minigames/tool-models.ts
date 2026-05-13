import * as THREE from 'three';
import { forceTopDraw } from './_util';

// Procedural tool meshes for the prospect minigames. Each tool is a
// THREE.Group built from primitives so we don't have to ship .glb assets
// up front — silhouettes can be replaced later with authored models, and
// the placement transforms stay the same.
//
// Meshes are designed to be mounted as a child of the camera
// (camera.add(group)) — local coordinates are camera-relative:
//   +X = right of screen
//   +Y = up in screen
//   -Z = forward (into the scene)
// Tool transforms are tuned to read as "held in the player's right hand"
// in the lower-right of the view.

const WOOD_MAT = new THREE.MeshStandardMaterial({
  color: 0x6b4a2b,
  roughness: 0.85,
  metalness: 0,
});

const METAL_MAT = new THREE.MeshStandardMaterial({
  color: 0x9aa0a4,
  roughness: 0.55,
  metalness: 0.7,
});

const HANDLE_HEIGHT = 0.7;

/** Mount transform shared by the dig-stage tools so swapping shovel ↔
 *  pickaxe doesn't shift the viewmodel pose. Camera-relative. */
function applyDigToolMount(group: THREE.Group): void {
  group.position.set(0.24, -0.34, -0.55);
  group.rotation.set(0.55, -0.35, 0.18);
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = false;
      m.receiveShadow = false;
    }
  });
  forceTopDraw(group);
}

/** Hand-held shovel: wooden cylinder handle + tapered metal blade. Mounted
 *  in the lower-right of the view, tilted to read as held. Used for
 *  Shovel T1 and T2. */
export function createShovelMesh(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'tool_shovel';

  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.028, HANDLE_HEIGHT, 12),
    WOOD_MAT,
  );
  group.add(handle);

  // Blade — slight forward angle so it reads as the digging end.
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.02), METAL_MAT);
  blade.position.set(0, -(HANDLE_HEIGHT / 2 + 0.1), 0);
  blade.rotation.x = -0.25;
  group.add(blade);

  applyDigToolMount(group);
  return group;
}

const MESH_MAT = new THREE.MeshStandardMaterial({
  color: 0xb4b4b4,
  roughness: 0.6,
  metalness: 0.45,
  transparent: true,
  opacity: 0.75,
  side: THREE.DoubleSide,
});

const RIM_MAT = new THREE.MeshStandardMaterial({
  color: 0x444444,
  roughness: 0.5,
  metalness: 0.6,
});

/** Single classifier sieve — short rim ring + a perforated mesh disk on
 *  top. Used as a building block for the stacked tier-2/3 classifiers. */
function createSieveLayer(radius: number): THREE.Group {
  const layer = new THREE.Group();

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.06, 24, 1, true),
    RIM_MAT,
  );
  layer.add(rim);

  const meshDisk = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.96, 24),
    MESH_MAT,
  );
  meshDisk.rotation.x = -Math.PI / 2;
  meshDisk.position.y = 0.025;
  layer.add(meshDisk);

  return layer;
}

/** Classifier sieve viewmodel. Stacked sieves scale with tier: 1 / 3 / 5
 *  layers. Mounted lower-center of view so the player looks down into it. */
export function createClassifierMesh(tier: 1 | 2 | 3): THREE.Group {
  const group = new THREE.Group();
  group.name = `tool_classifier_t${tier}`;

  const layers = tier === 1 ? 1 : tier === 2 ? 3 : 5;
  const radius = 0.18;
  const layerGap = 0.07;

  for (let i = 0; i < layers; i++) {
    const layer = createSieveLayer(radius);
    layer.position.y = i * layerGap;
    group.add(layer);
  }

  // T3 stand — three peg legs splayed out from the bottom rim.
  if (tier === 3) {
    const legGeom = new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8);
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(legGeom, RIM_MAT);
      const angle = (i / 3) * Math.PI * 2;
      leg.position.set(
        Math.cos(angle) * radius * 0.85,
        -0.07,
        Math.sin(angle) * radius * 0.85,
      );
      leg.rotation.z = Math.cos(angle) * 0.25;
      leg.rotation.x = Math.sin(angle) * 0.25;
      group.add(leg);
    }
  }

  // Mount: lower-center of view, tilted forward so the player "looks down
  // into" the top sieve. Pulled close so the layers fill a meaningful
  // amount of the screen.
  group.position.set(0, -0.42, -0.55);
  group.rotation.set(-0.15, 0, 0);

  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = false;
      m.receiveShadow = false;
    }
  });
  forceTopDraw(group);
  return group;
}

/** Pickaxe: thicker handle + crossed-iron head. Used for Shovel T3 so the
 *  player sees the upgrade in their hand during the dig minigame. */
export function createPickaxeMesh(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'tool_pickaxe';

  // Slightly thicker handle than the shovel.
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.034, 0.032, HANDLE_HEIGHT, 12),
    WOOD_MAT,
  );
  group.add(handle);

  // Pick head — single tapered horizontal bar through the top of the
  // handle. Two cones at the ends give the pointed-pickaxe silhouette.
  const headBar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.34, 8),
    METAL_MAT,
  );
  headBar.position.set(0, HANDLE_HEIGHT / 2 - 0.02, 0);
  headBar.rotation.z = Math.PI / 2;
  group.add(headBar);

  const pointGeom = new THREE.ConeGeometry(0.022, 0.06, 8);
  const pointL = new THREE.Mesh(pointGeom, METAL_MAT);
  pointL.position.set(-0.17 - 0.03, HANDLE_HEIGHT / 2 - 0.02, 0);
  pointL.rotation.z = Math.PI / 2;
  group.add(pointL);
  const pointR = new THREE.Mesh(pointGeom, METAL_MAT);
  pointR.position.set(0.17 + 0.03, HANDLE_HEIGHT / 2 - 0.02, 0);
  pointR.rotation.z = -Math.PI / 2;
  group.add(pointR);

  applyDigToolMount(group);
  return group;
}
