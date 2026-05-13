import * as THREE from 'three';

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

/** Hand-held shovel: wooden cylinder handle + tapered metal blade. Mounted
 *  in the lower-right of the view, tilted to read as held. */
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

  // Mount transform: lower-right of screen, tilted forward-right, point
  // the blade toward the ground in front of the camera.
  group.position.set(0.24, -0.34, -0.55);
  group.rotation.set(0.55, -0.35, 0.18);

  // The tool is close to the near plane (z=0.1m); make sure it doesn't get
  // shadow-z-fighting itself.
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = false;
      m.receiveShadow = false;
    }
  });

  return group;
}
