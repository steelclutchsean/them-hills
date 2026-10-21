import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { upgradeLoadedMaterials } from '@/render/materials';

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
  showTool(tool: 'none' | 'shovel' | 'pan'): void;
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

  upgradeLoadedMaterials(outfit.scene);
  wrapper.add(outfit.scene);

  // Locate skeleton bones.
  const bones = collectBones(outfit.scene);
  const find = (name: string): THREE.Object3D[] => {
    const b = bones.get(name);
    if (!b) throw new Error(`[character-asset] missing bone "${name}"`);
    return [b];
  };

  const headBone = bones.get('Head');
  if (headBone) {
    headBone.add(createProspectorHead());
    headBone.add(createProspectorHat());
  }
  const tools = attachHandTools(bones.get('hand_r'));

  return {
    group: wrapper,
    showTool: tools.show,
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

// Built head: skull, jaw, ears, nose, eyes, brows, mouth, and a short beard.
// Parent the Head bone. The hat still covers the crown.
function createProspectorHead(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'prospector_head';
  const skin = new THREE.MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.72 });
  const beardMat = new THREE.MeshStandardMaterial({ color: 0x6a4330, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c140f, roughness: 0.45 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.35 });
  const brow = new THREE.MeshStandardMaterial({ color: 0x4a3024, roughness: 0.8 });

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 14), skin);
  skull.scale.set(1.02, 1.12, 0.96);
  skull.position.y = 0.06;
  skull.castShadow = true;
  group.add(skull);

  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 10), skin);
  jaw.scale.set(0.95, 0.72, 0.9);
  jaw.position.set(0, -0.02, -0.02);
  group.add(jaw);

  const earGeom = new THREE.SphereGeometry(0.028, 8, 6);
  const earL = new THREE.Mesh(earGeom, skin);
  earL.scale.set(0.55, 1, 0.7);
  earL.position.set(0.095, 0.04, 0);
  group.add(earL);
  const earR = earL.clone();
  earR.position.x = -0.095;
  group.add(earR);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), skin);
  nose.scale.set(0.8, 1.1, 1.3);
  nose.position.set(0, 0.02, -0.09);
  group.add(nose);

  const eyeWhite = new THREE.SphereGeometry(0.016, 8, 6);
  const eyeL = new THREE.Mesh(eyeWhite, white);
  eyeL.position.set(0.032, 0.045, -0.082);
  group.add(eyeL);
  const eyeR = eyeL.clone();
  eyeR.position.x = -0.032;
  group.add(eyeR);
  const pupil = new THREE.SphereGeometry(0.008, 6, 6);
  const pL = new THREE.Mesh(pupil, dark);
  pL.position.set(0.032, 0.044, -0.094);
  group.add(pL);
  const pR = pL.clone();
  pR.position.x = -0.032;
  group.add(pR);

  const browGeom = new THREE.BoxGeometry(0.028, 0.006, 0.008);
  const bL = new THREE.Mesh(browGeom, brow);
  bL.position.set(0.032, 0.068, -0.086);
  bL.rotation.z = -0.25;
  group.add(bL);
  const bR = bL.clone();
  bR.position.x = -0.032;
  bR.rotation.z = 0.25;
  group.add(bR);

  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.006, 0.008), dark);
  mouth.position.set(0, -0.028, -0.078);
  group.add(mouth);

  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), beardMat);
  beard.scale.set(0.85, 0.7, 0.55);
  beard.position.set(0, -0.05, -0.03);
  group.add(beard);

  return group;
}

function attachHandTools(hand: THREE.Object3D | undefined): {
  show(tool: 'none' | 'shovel' | 'pan'): void;
} {
  const shovel = new THREE.Group();
  shovel.name = 'held-shovel';
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.014, 0.85, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4630, roughness: 0.9 }),
  );
  handle.position.y = 0.28;
  shovel.add(handle);
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.18, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xb7a48c, metalness: 0.35, roughness: 0.45 }),
  );
  blade.position.y = 0.72;
  shovel.add(blade);
  shovel.visible = false;

  const pan = new THREE.Group();
  pan.name = 'held-pan';
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.11, 0.05, 12),
    new THREE.MeshStandardMaterial({ color: 0x8d7764, metalness: 0.4, roughness: 0.4 }),
  );
  bowl.rotation.x = 0.6;
  pan.add(bowl);
  pan.visible = false;

  // Hand bone local axes are not world axes. A small offset puts the
  // grip in the palm for the dig and pan poses.
  shovel.position.set(0, 0.08, 0.02);
  shovel.rotation.x = 0.4;
  pan.position.set(0.02, 0.06, 0.04);
  if (hand) {
    hand.add(shovel);
    hand.add(pan);
  }
  return {
    show(tool) {
      shovel.visible = tool === 'shovel';
      pan.visible = tool === 'pan';
    },
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
