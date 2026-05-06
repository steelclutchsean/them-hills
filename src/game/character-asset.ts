import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Loads two Quaternius glTFs together and treats them as one character:
//
//   - Male_Ranger.gltf         — Modular Character Outfits pack. 9 skinned meshes:
//                                body + two belts + arms + bracers + boots + pauldron
//                                + hood + legs. We hide the Hood (cowboy hat replaces it)
//                                and keep the rest. Fully clothed, skin-weighted.
//   - Superhero_Male_FullBody  — Universal Base Characters pack. Provides the
//                                head + eyes + eyebrows (the existing rigged face).
//
// Both packs share the same 65-bone skeleton structure (Unreal-style names).
// We load them as two separate scenes inside a single wrapper, then build a
// CharacterRig where each "joint" tracks bones from BOTH skeletons. animation
// code sets matching bone rotations on both, so the outfit and the body+head
// stay perfectly in sync.
//
// The Superhero body mesh is still rendered (because the head is part of it),
// but its material is overridden to a skin tone — so any visible body parts
// underneath the Peasant outfit read as skin, not as the original superhero
// suit. The head shows as skin because that's its actual color.

const OUTFIT_GLTF = '/assets/characters/Male_Ranger.gltf';
const SUPERHERO_GLTF = '/assets/characters/Superhero_Male_FullBody.gltf';

/** Names of meshes within the outfit glTF that should NOT be rendered. */
const HIDDEN_OUTFIT_MESH_KEYWORDS = ['hood', 'pauldron'];

const FEET_OFFSET_Y = -0.9;
const SKIN_COLOR = 0xe7c19e;

export interface BoneJoint {
  /** All bones in different skeletons that should animate identically. */
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

/** Prepare a loaded glTF scene: shift feet to capsule bottom, flip 180° to face -Z. */
function prepareScene(scene: THREE.Group): void {
  scene.position.y = FEET_OFFSET_Y;
  scene.rotation.y = Math.PI;
  scene.traverse((o) => {
    if (o instanceof THREE.SkinnedMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

export async function loadCharacter(): Promise<CharacterRig> {
  const loader = new GLTFLoader();
  const [outfit, base] = await Promise.all([
    loader.loadAsync(OUTFIT_GLTF),
    loader.loadAsync(SUPERHERO_GLTF),
  ]);

  prepareScene(outfit.scene);
  prepareScene(base.scene);

  // Hide outfit pieces we don't want (e.g. hood — replaced by the cowboy hat).
  outfit.scene.traverse((o) => {
    if (!(o instanceof THREE.SkinnedMesh)) return;
    const lower = o.name.toLowerCase();
    if (HIDDEN_OUTFIT_MESH_KEYWORDS.some((k) => lower.includes(k))) {
      o.visible = false;
    }
  });

  // Override the Superhero body mesh material to skin tone. The mesh contains
  // both head and body geometry — flat skin color makes the head look natural
  // and any body parts not covered by Peasant clothes read as bare skin
  // rather than the original "superhero suit" texture.
  base.scene.traverse((o) => {
    if (!(o instanceof THREE.SkinnedMesh)) return;
    const matName = Array.isArray(o.material)
      ? (o.material[0]?.name ?? '')
      : ((o.material as THREE.Material)?.name ?? '');
    if (matName.toLowerCase().includes('superhero') || o.name.toLowerCase().includes('superhero')) {
      o.material = new THREE.MeshStandardMaterial({
        color: SKIN_COLOR,
        roughness: 0.85,
        metalness: 0,
      });
    }
  });

  // Wrapper: character.ts owns position + yaw of this group.
  const wrapper = new THREE.Group();
  wrapper.name = 'character_root';
  wrapper.add(outfit.scene);
  wrapper.add(base.scene);

  // Collect bones from both skeletons and pair them up by name.
  const outfitBones = collectBones(outfit.scene);
  const baseBones = collectBones(base.scene);

  const findAll = (name: string): THREE.Object3D[] => {
    const out: THREE.Object3D[] = [];
    const a = outfitBones.get(name);
    const b = baseBones.get(name);
    if (a) out.push(a);
    if (b) out.push(b);
    if (out.length === 0) {
      throw new Error(`[character-asset] missing bone "${name}" in both skeletons`);
    }
    return out;
  };

  // Hat parented to the Head bone of the BASE skeleton (which is what owns the
  // visible head geometry). Placing it on the base skeleton's bone is fine —
  // since both skeletons animate identically, the hat moves correctly with the
  // visible head.
  const hatHostBone = baseBones.get('Head') ?? outfitBones.get('Head');
  if (hatHostBone) {
    const hat = createProspectorHat();
    hatHostBone.add(hat);
  }

  return {
    group: wrapper,
    spine: makeJoint(findAll('spine_02')),
    head: makeJoint(findAll('Head')),
    shoulderL: makeJoint(findAll('upperarm_l')),
    shoulderR: makeJoint(findAll('upperarm_r')),
    elbowL: makeJoint(findAll('lowerarm_l')),
    elbowR: makeJoint(findAll('lowerarm_r')),
    handL: makeJoint(findAll('hand_l')),
    handR: makeJoint(findAll('hand_r')),
    hipL: makeJoint(findAll('thigh_l')),
    hipR: makeJoint(findAll('thigh_r')),
    kneeL: makeJoint(findAll('calf_l')),
    kneeR: makeJoint(findAll('calf_r')),
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
