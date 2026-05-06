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
  // Also rotated 180° around Y because this rig was authored with the model's face
  // on local +Z, but Three.js movement convention has forward = -Z (camera default).
  // Without the flip, pressing W walked the character backward.
  const wrapper = new THREE.Group();
  wrapper.name = 'character_root';
  gltf.scene.position.y = FEET_OFFSET_Y;
  gltf.scene.rotation.y = Math.PI;
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

  // Procedural clothing layered on top of the rigged body. The pieces are rigid
  // (not skinned) but they're parented to the corresponding bones, so they move
  // with the character during animation. Won't deform smoothly across joints
  // (some clipping at hip/knee/shoulder during extreme poses), but reads clearly
  // as clothing rather than painted skin.
  const headBone = find('Head');
  const spine02 = find('spine_02');
  const thighL = find('thigh_l');
  const thighR = find('thigh_r');
  const calfL = find('calf_l');
  const calfR = find('calf_r');
  const upperarmL = find('upperarm_l');
  const upperarmR = find('upperarm_r');
  const footL = find('foot_l');
  const footR = find('foot_r');

  const hat = createProspectorHat();
  headBone.add(hat);
  addClothing({ spine02, thighL, thighR, calfL, calfR, upperarmL, upperarmR, footL, footR });

  return {
    group: wrapper,
    spine: makeJoint(spine02),
    head: makeJoint(headBone),
    shoulderL: makeJoint(upperarmL),
    shoulderR: makeJoint(upperarmR),
    elbowL: makeJoint(find('lowerarm_l')),
    elbowR: makeJoint(find('lowerarm_r')),
    handL: makeJoint(find('hand_l')),
    handR: makeJoint(find('hand_r')),
    hipL: makeJoint(thighL),
    hipR: makeJoint(thighR),
    kneeL: makeJoint(calfL),
    kneeR: makeJoint(calfR),
  };
}

interface ClothingBones {
  spine02: THREE.Object3D;
  thighL: THREE.Object3D;
  thighR: THREE.Object3D;
  calfL: THREE.Object3D;
  calfR: THREE.Object3D;
  upperarmL: THREE.Object3D;
  upperarmR: THREE.Object3D;
  footL: THREE.Object3D;
  footR: THREE.Object3D;
}

// Adds a layered prospector outfit (shirt + vest + belt + pants + boots + sleeves)
// as rigid meshes parented to specific skeleton bones. Each cylinder's local Y axis
// aligns with its bone's local Y, so cylinders are oriented along the limb naturally.
//
// Bone-local +Z corresponds to the front of the model in MODEL space (where the
// face was sculpted). After the wrapper's 180° flip, that's world -Z = where the
// camera sees the character's chest.
function addClothing(bones: ClothingBones): void {
  const matShirt = new THREE.MeshStandardMaterial({ color: 0xa8442d, roughness: 0.88 });
  const matVest = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.92 });
  const matPants = new THREE.MeshStandardMaterial({ color: 0x1f2a4e, roughness: 0.88 });
  const matBoot = new THREE.MeshStandardMaterial({ color: 0x2a1a14, roughness: 0.7 });
  const matBelt = new THREE.MeshStandardMaterial({ color: 0x141014, roughness: 0.85 });
  const matBuckle = new THREE.MeshStandardMaterial({
    color: 0xd4a647,
    roughness: 0.4,
    metalness: 0.5,
  });

  // Shirt — covers torso. spine_02 bone Y points up toward neck.
  const shirt = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.55, 16), matShirt);
  shirt.position.y = 0.05;
  bones.spine02.add(shirt);

  // Vest layered on top, slightly larger and shorter
  const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.46, 16), matVest);
  vest.position.y = 0.06;
  bones.spine02.add(vest);

  // Belt at waist — short fat torus-like cylinder sealing the gap to pants
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.07, 18), matBelt);
  belt.position.y = -0.2;
  bones.spine02.add(belt);

  // Belt buckle on the front (+Z bone-local = world -Z after the scene flip)
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.02), matBuckle);
  buckle.position.set(0, -0.2, 0.255);
  bones.spine02.add(buckle);

  // Sleeves on upperarms. The bone's rest rotation orients its axes such that the
  // arm extends along the bone, so a cylinder mesh placed at +0.16 along bone-Y
  // sits centered on the upper arm.
  const makeSleeve = (bone: THREE.Object3D): void => {
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.32, 14), matShirt);
    sleeve.position.y = 0.16;
    bone.add(sleeve);
  };
  makeSleeve(bones.upperarmL);
  makeSleeve(bones.upperarmR);

  // Pants on thighs — bone-Y points toward knee (downward in world after rest rot).
  const makeThighPants = (bone: THREE.Object3D): void => {
    const pants = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.095, 0.43, 14), matPants);
    pants.position.y = 0.215;
    bone.add(pants);
  };
  makeThighPants(bones.thighL);
  makeThighPants(bones.thighR);

  // Pants on calves
  const makeCalfPants = (bone: THREE.Object3D): void => {
    const pants = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.08, 0.4, 14), matPants);
    pants.position.y = 0.2;
    bone.add(pants);
  };
  makeCalfPants(bones.calfL);
  makeCalfPants(bones.calfR);

  // Boots on feet. foot bone-Y points downward, and ball bone (child of foot) is
  // at +Z bone-local (toward toes). Stretched ellipsoid covers the whole foot.
  const makeBoot = (bone: THREE.Object3D): void => {
    const boot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), matBoot);
    boot.scale.set(1.2, 0.55, 1.7);
    boot.position.set(0, 0.04, 0.06);
    bone.add(boot);
  };
  makeBoot(bones.footL);
  makeBoot(bones.footR);

  // Cast shadows on all clothing pieces (no-op until shadowMap.enabled)
  for (const bone of [
    bones.spine02,
    bones.thighL,
    bones.thighR,
    bones.calfL,
    bones.calfR,
    bones.upperarmL,
    bones.upperarmR,
    bones.footL,
    bones.footR,
  ]) {
    bone.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
  }
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
