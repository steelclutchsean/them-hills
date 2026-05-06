import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Loads the rigged Quaternius "Universal Base Characters" male body and exposes its
// skeleton bones via the same CharacterRig shape that drove the procedural rig — so
// the existing animation library can drive the real character with minimal changes.
//
// Bone naming in this pack is Unreal-style:
//   root → pelvis → spine_01 → spine_02 → spine_03 → neck_01 → Head
//   spine_03 → clavicle_l/r → upperarm_l/r → lowerarm_l/r → hand_l/r → fingers
//   pelvis → thigh_l/r → calf_l/r → foot_l/r → ball_l/r
//
// The pack ships NO bundled animations — we drive the bones with the same
// sin-based locomotion + step animations from character-animations.ts.

const CHARACTER_GLTF = '/assets/characters/Superhero_Male_FullBody.gltf';

export interface CharacterRig {
  /** Wrapper group; character.ts sets position (body translation) and rotation.y (yaw). */
  group: THREE.Group;
  /** Mid-spine bone — animations use this for body lean. */
  spine: THREE.Object3D;
  head: THREE.Object3D;
  shoulderL: THREE.Object3D;
  shoulderR: THREE.Object3D;
  elbowL: THREE.Object3D;
  elbowR: THREE.Object3D;
  handL: THREE.Object3D;
  handR: THREE.Object3D;
  hipL: THREE.Object3D;
  hipR: THREE.Object3D;
  kneeL: THREE.Object3D;
  kneeR: THREE.Object3D;
}

export async function loadCharacter(): Promise<CharacterRig> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(CHARACTER_GLTF);

  // Wrapper group: character.ts owns its position / rotation. The loaded scene
  // is a child so we don't disturb its internal transforms.
  const group = new THREE.Group();
  group.name = 'character_root';
  group.add(gltf.scene);

  // Find skeleton bones by name.
  const bones = new Map<string, THREE.Object3D>();
  gltf.scene.traverse((o) => {
    const isBone = (o as THREE.Object3D & { isBone?: boolean }).isBone === true;
    if (isBone) bones.set(o.name, o);
  });

  const find = (name: string): THREE.Object3D => {
    const b = bones.get(name);
    if (!b) throw new Error(`[character-asset] missing bone "${name}"`);
    return b;
  };

  // Add procedural prospector hat parented to the Head bone so it follows head movement.
  const headBone = find('Head');
  const hat = createProspectorHat();
  headBone.add(hat);

  // Make sure all skinned meshes cast shadows (no-op until shadowMap.enabled).
  gltf.scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return {
    group,
    spine: find('spine_02'),
    head: headBone,
    shoulderL: find('upperarm_l'),
    shoulderR: find('upperarm_r'),
    elbowL: find('lowerarm_l'),
    elbowR: find('lowerarm_r'),
    handL: find('hand_l'),
    handR: find('hand_r'),
    hipL: find('thigh_l'),
    hipR: find('thigh_r'),
    kneeL: find('calf_l'),
    kneeR: find('calf_r'),
  };
}

// Procedural prospector hat. Sits on top of the Head bone — local Y is upward
// from the head bone's origin (which is roughly at the base of the skull).
function createProspectorHat(): THREE.Group {
  const matHat = new THREE.MeshStandardMaterial({
    color: 0x3e2a17,
    flatShading: true,
    roughness: 0.85,
  });
  const matBand = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    flatShading: true,
    roughness: 0.85,
  });
  const matBuckle = new THREE.MeshStandardMaterial({
    color: 0xd4a647,
    flatShading: false,
    roughness: 0.4,
    metalness: 0.5,
  });

  const hat = new THREE.Group();
  hat.name = 'prospector_hat';

  // Crown — slightly tapered cylinder
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.11, 18), matHat);
  crown.position.y = 0.21;
  hat.add(crown);

  // Hat band wrapping the crown
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.142, 0.022, 18), matBand);
  band.position.y = 0.158;
  hat.add(band);

  // Buckle on the front (-Z side)
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.022, 0.018), matBuckle);
  buckle.position.set(0, 0.158, -0.14);
  hat.add(buckle);

  // Wide brim, slightly conical
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.245, 0.022, 24), matHat);
  brim.position.y = 0.147;
  hat.add(brim);

  hat.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return hat;
}
