import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Loads the rigged Quaternius "Universal Base Characters" male body and exposes its
// skeleton bones via a CharacterRig that captures each bone's REST rotation at load.
// Animations apply rotation DELTAS on top of rest, so the rig's natural T-pose
// posture is preserved and animation curves stack correctly.
//
// Bone naming (Unreal-style):
//   root → pelvis → spine_01 → spine_02 → spine_03 → neck_01 → Head
//   spine_03 → clavicle_l/r → upperarm_l/r → lowerarm_l/r → hand_l/r → fingers
//   pelvis → thigh_l/r → calf_l/r → foot_l/r → ball_l/r
//
// Pack ships NO bundled animations — see character-animations.ts for the procedural
// motion library.

const CHARACTER_GLTF = '/assets/characters/Superhero_Male_FullBody.gltf';

// The rigged mesh's origin sits at the character's feet; the Rapier capsule we attach
// it to has its center 0.9m above the capsule bottom. Shift the scene down so the
// feet land at the capsule bottom rather than at the capsule center.
const FEET_OFFSET_Y = -0.9;

// Solid color override for the body. The pack's "Superhero" texture is muscular
// bare chest + briefs; we override it with a clearly-not-skin color so the
// character reads as "wearing dark workwear" rather than "shirtless." Deep navy
// denim is far enough from skin tone that any remaining muscle definition reads
// as fabric folds, not flesh.
const CLOTHES_COLOR = 0x1f2a3a;
const SKIN_COLOR = 0xe7c19e;

export interface BoneJoint {
  bone: THREE.Object3D;
  restX: number;
  restY: number;
  restZ: number;
}

export interface CharacterRig {
  group: THREE.Group;
  spine: BoneJoint;
  head: BoneJoint;
  shoulderL: BoneJoint;
  shoulderR: BoneJoint;
  elbowL: BoneJoint;
  elbowR: BoneJoint;
  handL: BoneJoint;
  handR: BoneJoint;
  hipL: BoneJoint;
  hipR: BoneJoint;
  kneeL: BoneJoint;
  kneeR: BoneJoint;
}

function makeJoint(bone: THREE.Object3D): BoneJoint {
  return {
    bone,
    restX: bone.rotation.x,
    restY: bone.rotation.y,
    restZ: bone.rotation.z,
  };
}

export async function loadCharacter(): Promise<CharacterRig> {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(CHARACTER_GLTF);

  // Wrapper group: character.ts owns position + yaw. The loaded scene is shifted
  // down so the character's feet land at the wrapper's local y = -0.9 (capsule bottom).
  const wrapper = new THREE.Group();
  wrapper.name = 'character_root';
  gltf.scene.position.y = FEET_OFFSET_Y;
  wrapper.add(gltf.scene);

  // Override body material with a solid clothing color. Eyes + hair textures stay.
  // We match against material name "MI_Superhero_Male" rather than mesh name —
  // the mesh node is named "SuperHero_Male" but the material that gets rendered
  // has the MI_ prefix; matching by material name is more reliable.
  gltf.scene.traverse((o) => {
    if (!(o instanceof THREE.SkinnedMesh)) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const matName = Array.isArray(o.material)
      ? (o.material[0]?.name ?? '')
      : ((o.material as THREE.Material)?.name ?? '');
    const isBody =
      matName.toLowerCase().includes('superhero') ||
      o.name.toLowerCase().includes('superhero') ||
      o.name.toLowerCase().includes('male');
    if (isBody) {
      o.material = new THREE.MeshStandardMaterial({
        color: CLOTHES_COLOR,
        roughness: 0.88,
        metalness: 0,
      });
      console.log(`[character-asset] overrode body material on mesh "${o.name}"`);
    }
  });

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

  // Hat parented to Head bone — moves with the head naturally.
  const headBone = find('Head');
  const hat = createProspectorHat();
  headBone.add(hat);

  return {
    group: wrapper,
    spine: makeJoint(find('spine_02')),
    head: makeJoint(headBone),
    shoulderL: makeJoint(find('upperarm_l')),
    shoulderR: makeJoint(find('upperarm_r')),
    elbowL: makeJoint(find('lowerarm_l')),
    elbowR: makeJoint(find('lowerarm_r')),
    handL: makeJoint(find('hand_l')),
    handR: makeJoint(find('hand_r')),
    hipL: makeJoint(find('thigh_l')),
    hipR: makeJoint(find('thigh_r')),
    kneeL: makeJoint(find('calf_l')),
    kneeR: makeJoint(find('calf_r')),
  };
}

// Suppress "unused import" if we ever expose the skin tone.
void SKIN_COLOR;

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

  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.11, 18), matHat);
  crown.position.y = 0.21;
  hat.add(crown);

  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.142, 0.022, 18), matBand);
  band.position.y = 0.158;
  hat.add(band);

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.022, 0.018), matBuckle);
  buckle.position.set(0, 0.158, -0.14);
  hat.add(buckle);

  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.245, 0.022, 24), matHat);
  brim.position.y = 0.147;
  hat.add(brim);

  hat.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return hat;
}
