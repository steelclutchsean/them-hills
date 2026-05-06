import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Loads a single Quaternius glTF (Modular Outfits — Ranger) and treats it as the
// character. Procedural head + hat are parented to the Head bone.
//
// The Ranger outfit ships 9 skinned meshes: body + two belts + arms + bracers +
// boots + pauldron + hood + legs. The pauldron and hood are hidden at runtime
// — we use the procedural cowboy hat instead.
//
// The pack does NOT ship a head mesh. Earlier we loaded a second glTF
// (Universal Base Characters Superhero) for its rigged head + eyes + eyebrows,
// but that left visible bare-arm skin where the Ranger outfit only has bracers.
// Now we drop the second skeleton entirely and use a procedural skin-toned head
// sphere; clean, single-skeleton, no skin gaps. Face details revisitable later.

const OUTFIT_GLTF = '/assets/characters/Male_Ranger.gltf';

/** Outfit mesh names (substring match) that should NOT be rendered. */
const HIDDEN_OUTFIT_MESH_KEYWORDS = ['hood', 'pauldron'];

const FEET_OFFSET_Y = -0.9;
const SKIN_COLOR = 0xe7c19e;

export interface BoneJoint {
  /** Bones from one or more skeletons that should animate identically. */
  bones: THREE.Object3D[];
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

function makeJoint(bones: THREE.Object3D[]): BoneJoint {
  const ref = bones[0];
  if (!ref) throw new Error('[character-asset] makeJoint requires at least one bone');
  return {
    bones,
    restX: ref.rotation.x,
    restY: ref.rotation.y,
    restZ: ref.rotation.z,
  };
}

function collectBones(scene: THREE.Object3D): Map<string, THREE.Object3D> {
  const map = new Map<string, THREE.Object3D>();
  scene.traverse((o) => {
    const isBone = (o as THREE.Object3D & { isBone?: boolean }).isBone === true;
    if (isBone) map.set(o.name, o);
  });
  return map;
}

export async function loadCharacter(): Promise<CharacterRig> {
  const loader = new GLTFLoader();
  const outfit = await loader.loadAsync(OUTFIT_GLTF);

  // Wrapper group (character.ts owns position + yaw of this).
  const wrapper = new THREE.Group();
  wrapper.name = 'character_root';

  // Shift feet to capsule bottom and flip 180° around Y so the model's face
  // points along local -Z (Three.js camera-default forward).
  outfit.scene.position.y = FEET_OFFSET_Y;
  outfit.scene.rotation.y = Math.PI;

  // Hide outfit pieces we don't want (hood, pauldron).
  outfit.scene.traverse((o) => {
    if (!(o instanceof THREE.SkinnedMesh)) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const lower = o.name.toLowerCase();
    if (HIDDEN_OUTFIT_MESH_KEYWORDS.some((k) => lower.includes(k))) {
      o.visible = false;
    }
  });

  wrapper.add(outfit.scene);

  // Locate skeleton bones.
  const bones = collectBones(outfit.scene);
  const find = (name: string): THREE.Object3D[] => {
    const b = bones.get(name);
    if (!b) throw new Error(`[character-asset] missing bone "${name}"`);
    return [b];
  };

  // Procedural head + hat on the Head bone.
  const headBone = bones.get('Head');
  if (headBone) {
    headBone.add(createProceduralHead());
    headBone.add(createProspectorHat());
  }

  return {
    group: wrapper,
    spine: makeJoint(find('spine_02')),
    head: makeJoint(find('Head')),
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

// Procedural skin-toned head — slightly oval sphere with no painted features.
// Sits on top of the Head bone; the cowboy hat covers most of the upper portion
// from typical 3rd-person camera distance. We can revisit detail (eyes, mouth,
// beard) later or swap in a proper rigged head asset.
function createProceduralHead(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'procedural_head';

  const matSkin = new THREE.MeshStandardMaterial({
    color: SKIN_COLOR,
    flatShading: false,
    roughness: 0.85,
  });

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 14), matSkin);
  skull.scale.set(1.0, 1.08, 0.95);
  skull.position.y = 0.05;
  skull.castShadow = true;
  group.add(skull);

  return group;
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
