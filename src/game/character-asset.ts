import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { upgradeLoadedMaterials } from '@/render/materials';
import { addGoldFlake } from '@/render/painterly';

// Loads the Quaternius Ranger outfit and builds a face in the ranger skin
// tone onto the Head bone. The pauldron and hood stay hidden.

const OUTFIT_GLTF = '/assets/characters/Male_Ranger.gltf';

/** Outfit mesh names (substring match) that should NOT be rendered. */
const HIDDEN_OUTFIT_MESH_KEYWORDS = ['hood', 'pauldron'];

const FEET_OFFSET_Y = -0.9;
/** Matches the superhero head atlas (about 169, 109, 75) so the new hands agree with the face. */
const SKIN_COLOR = 0xa96d4b;

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
  /** Palm socket. Local +Y is the tool axis; the wrist aim writes the hand bone. */
  grip: THREE.Object3D;
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
    const modeled = await attachModeledHead(headBone);
    if (!modeled) headBone.add(createProspectorHead());
    const hat = createProspectorHat();
    hat.position.y = 0.11;
    // Front of the hat is local -Z. A negative X tilt lifts the brim off the eyes.
    hat.rotation.x = -0.4;
    headBone.add(hat);
  }
  const handR = bones.get('hand_r');
  const handL = bones.get('hand_l');
  if (handR) addRangerHand(handR, 1);
  if (handL) addRangerHand(handL, -1);
  const tools = attachHandTools(handR);

  return {
    group: wrapper,
    showTool: tools.show,
    grip: tools.grip,
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
  grip: THREE.Object3D;
} {
  const grip = new THREE.Object3D();
  grip.name = 'grip-socket';
  // Palm sits a little off the wrist bone. Tool axis is local +Y.
  grip.position.set(0, 0.04, 0.03);

  const shovel = new THREE.Group();
  shovel.name = 'held-shovel';
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.014, 0.85, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4630, roughness: 0.9 }),
  );
  handle.position.y = 0.42;
  shovel.add(handle);
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.18, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xb7a48c, metalness: 0.35, roughness: 0.45 }),
  );
  blade.position.y = 0.9;
  shovel.add(blade);
  shovel.visible = false;

  const pan = new THREE.Group();
  pan.name = 'held-pan';
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.15, 0.045, 14),
    new THREE.MeshStandardMaterial({ color: 0x8d7764, metalness: 0.45, roughness: 0.38 }),
  );
  // Opening faces the grip's +Y, which the wrist aims at the camera's look point.
  bowl.position.y = 0.14;
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.19, 0.012, 6, 16),
    new THREE.MeshStandardMaterial({ color: 0xc2ad8e, metalness: 0.72, roughness: 0.32 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.162;
  pan.add(bowl, rim);
  // A pile in the middle of the bowl, big enough to read as the find.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    const hero = i < 4;
    const radius = hero ? 0.105 : 0.062;
    const ring = hero ? 0.015 + (i % 2) * 0.028 : 0.055;
    addGoldFlake(pan, radius, Math.cos(a) * ring, 0.205, Math.sin(a) * ring * 0.66);
  }
  pan.visible = false;

  grip.add(shovel);
  grip.add(pan);
  if (hand) hand.add(grip);
  return {
    grip,
    show(tool) {
      shovel.visible = tool === 'shovel';
      pan.visible = tool === 'pan';
    },
  };
}

/** Ranger-matched face. Local -Z is the face, the same way the hat brim points. */
async function attachModeledHead(headBone: THREE.Object3D): Promise<boolean> {
  headBone.add(createMatchedFace());
  return true;
}

function createMatchedFace(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'matched-face';
  const skin = new THREE.MeshStandardMaterial({
    color: SKIN_COLOR,
    roughness: 0.58,
    metalness: 0.02,
  });
  const hair = new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 0.9 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x140c09 });
  const white = new THREE.MeshBasicMaterial({ color: 0xf4efe4 });
  const iris = new THREE.MeshBasicMaterial({ color: 0x2a1a10 });
  const catchlight = new THREE.MeshBasicMaterial({ color: 0xfff6e4 });

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.062, 0.1, 10), skin);
  neck.position.y = -0.06;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.092, 18, 14), skin);
  skull.scale.set(1.02, 1.18, 0.88);
  skull.position.set(0, 0.058, 0.01);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), skin);
  jaw.scale.set(0.92, 0.62, 0.86);
  jaw.position.set(0, -0.012, -0.012);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.03), skin);
  brow.position.set(0, 0.078, -0.078);
  brow.rotation.x = -0.35;
  const cheekL = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), skin);
  cheekL.position.set(0.045, 0.02, -0.07);
  const cheekR = cheekL.clone();
  cheekR.position.x = -0.045;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), skin);
  nose.scale.set(0.75, 1.15, 1.35);
  nose.position.set(0, 0.028, -0.092);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.04, 0.018), skin);
  bridge.position.set(0, 0.05, -0.082);
  group.add(neck, skull, jaw, brow, cheekL, cheekR, nose, bridge);

  const socket = new THREE.SphereGeometry(0.024, 8, 6);
  const socketL = new THREE.Mesh(socket, dark);
  socketL.position.set(0.034, 0.05, -0.086);
  const socketR = socketL.clone();
  socketR.position.x = -0.034;
  const eyeWhite = new THREE.SphereGeometry(0.018, 10, 8);
  const eyeL = new THREE.Mesh(eyeWhite, white);
  eyeL.scale.set(1.15, 0.82, 0.7);
  eyeL.position.set(0.034, 0.048, -0.1);
  const eyeR = eyeL.clone();
  eyeR.position.x = -0.034;
  const irisGeom = new THREE.SphereGeometry(0.009, 8, 6);
  const irisL = new THREE.Mesh(irisGeom, iris);
  irisL.position.set(0.034, 0.046, -0.112);
  const irisR = irisL.clone();
  irisR.position.x = -0.034;
  const glintGeom = new THREE.SphereGeometry(0.0035, 6, 4);
  const glintL = new THREE.Mesh(glintGeom, catchlight);
  glintL.position.set(0.039, 0.052, -0.118);
  const glintR = glintL.clone();
  glintR.position.x = -0.029;
  const browGeom = new THREE.BoxGeometry(0.028, 0.008, 0.01);
  const browMat = new THREE.MeshBasicMaterial({ color: 0x1c120c });
  const browL = new THREE.Mesh(browGeom, browMat);
  browL.position.set(0.032, 0.068, -0.09);
  browL.rotation.z = -0.28;
  const browR = browL.clone();
  browR.position.x = -0.032;
  browR.rotation.z = 0.28;
  group.add(socketL, socketR, eyeL, eyeR, irisL, irisR, glintL, glintR, browL, browR);

  const earGeom = new THREE.SphereGeometry(0.022, 8, 6);
  const earL = new THREE.Mesh(earGeom, skin);
  earL.scale.set(0.45, 1.05, 0.65);
  earL.position.set(0.092, 0.04, 0.01);
  const earR = earL.clone();
  earR.position.x = -0.092;
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.008, 0.01), dark);
  mouth.position.set(0, -0.02, -0.078);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.008), skin);
  lip.position.set(0, -0.014, -0.084);
  group.add(earL, earR, mouth, lip);

  const beardJaw = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 8), hair);
  beardJaw.scale.set(0.9, 0.7, 0.55);
  beardJaw.position.set(0, -0.045, -0.02);
  const mustache = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.016), hair);
  mustache.position.set(0, 0.004, -0.096);
  const sideGeom = new THREE.BoxGeometry(0.016, 0.055, 0.02);
  const sideL = new THREE.Mesh(sideGeom, hair);
  sideL.position.set(0.05, -0.005, -0.05);
  const sideR = sideL.clone();
  sideR.position.x = -0.05;
  group.add(beardJaw, mustache, sideL, sideR);

  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) obj.castShadow = true;
  });
  return group;
}

/** Palm, four fingers, and a thumb past the ranger bracer. Local +Y is the grip axis. */
function addRangerHand(hand: THREE.Object3D, side: 1 | -1): void {
  const skin = new THREE.MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.68 });
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.04, 0.078), skin);
  palm.position.set(0, 0.05, 0.02);
  palm.castShadow = true;
  hand.add(palm);
  const fingerGeom = new THREE.CylinderGeometry(0.008, 0.006, 0.04, 5);
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Mesh(fingerGeom, skin);
    finger.position.set(-0.022 + i * 0.015, 0.086, 0.02);
    finger.rotation.x = 0.78 + (i % 2) * 0.16;
    finger.castShadow = true;
    hand.add(finger);
  }
  const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.007, 0.036, 5), skin);
  thumb.position.set(side * 0.038, 0.048, 0.028);
  thumb.rotation.z = side * -0.85;
  thumb.rotation.x = 0.45;
  thumb.castShadow = true;
  hand.add(thumb);
}

// Procedural prospector hat. Sits on top of the Head bone — local Y is upward
// from the head bone's origin (which is roughly at the base of the skull).
function createProspectorHat(color = 0x3e2a17): THREE.Group {
  const matHat = new THREE.MeshStandardMaterial({
    color,
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

let crewOutfit: Promise<THREE.Group> | null = null;
let crewHead: Promise<THREE.Object3D | null> | null = null;

function loadCrewOutfit(): Promise<THREE.Group> {
  crewOutfit ??= new GLTFLoader().loadAsync(OUTFIT_GLTF).then((gltf) => gltf.scene);
  return crewOutfit;
}

function loadCrewHead(): Promise<THREE.Object3D | null> {
  crewHead ??= (async () => {
    const anchor = new THREE.Group();
    const ok = await attachModeledHead(anchor);
    return ok ? (anchor.children[0] ?? null) : null;
  })();
  return crewHead;
}

/**
 * A hired hand or a claim jumper: the ranger body, the modeled head, and a
 * hat. `shirt` tints the atlas so a hand and a jumper do not match.
 */
export async function createCrewVariant(shirt: number, hat: number): Promise<THREE.Group> {
  const [source, head] = await Promise.all([loadCrewOutfit(), loadCrewHead()]);
  const outfit = cloneSkinned(source);
  // The ranger's feet are the glTF origin, and the mesh faces +Z. Crew yaw
  // treats +Z as forward, so this clone stays unrotated and unshifted.
  const tint = new THREE.Color(shirt);
  outfit.traverse((obj) => {
    const label = obj.name.toLowerCase();
    if (HIDDEN_OUTFIT_MESH_KEYWORDS.some((key) => label.includes(key))) obj.visible = false;
    if (!(obj instanceof THREE.Mesh)) return;
    const shirtMesh = label.includes('body') && !label.includes('belt');
    const sleeve = label.includes('arms') && !label.includes('bracer');
    const sourceMat = obj.material;
    const list = (Array.isArray(sourceMat) ? sourceMat : [sourceMat]).map((mat) => {
      const next = mat.clone();
      if (
        (shirtMesh || sleeve) &&
        next instanceof THREE.MeshStandardMaterial &&
        !/eye/i.test(obj.name)
      ) {
        next.color.lerp(tint, shirtMesh ? 0.72 : 0.45);
      }
      return next;
    });
    obj.material = Array.isArray(sourceMat) ? list : (list[0] ?? sourceMat);
    obj.castShadow = true;
    obj.receiveShadow = true;
  });
  const headBone = outfit.getObjectByName('Head');
  if (headBone) {
    headBone.add(head ? head.clone(true) : createProspectorHead());
    const cap = createProspectorHat(hat);
    cap.position.y = 0.08;
    cap.rotation.x = -0.22;
    headBone.add(cap);
  }
  for (const name of ['upperarm_l', 'upperarm_r', 'thigh_l', 'thigh_r']) {
    const bone = outfit.getObjectByName(name);
    if (!bone) continue;
    bone.userData.restX = bone.rotation.x;
    bone.userData.restZ = bone.rotation.z;
  }
  const handR = outfit.getObjectByName('hand_r');
  if (handR) {
    addRangerHand(handR, 1);
    handR.add(createCrewShovel());
  }
  const handL = outfit.getObjectByName('hand_l');
  if (handL) {
    addRangerHand(handL, -1);
    handL.add(createCrewHose());
  }
  if (!(outfit instanceof THREE.Group)) {
    const wrap = new THREE.Group();
    wrap.add(outfit);
    return wrap;
  }
  return outfit;
}

function createCrewShovel(): THREE.Group {
  const shovel = new THREE.Group();
  shovel.name = 'shovel';
  shovel.visible = false;
  shovel.position.set(0, 0.04, 0.03);
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.014, 0.72, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4630, roughness: 0.9 }),
  );
  handle.position.y = 0.36;
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.16, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xb7a48c, metalness: 0.55, roughness: 0.38 }),
  );
  blade.position.y = 0.74;
  shovel.add(handle, blade);
  return shovel;
}

function createCrewHose(): THREE.Mesh {
  const hose = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.022, 6, 10, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x24180f, roughness: 0.86 }),
  );
  hose.name = 'hand-hose';
  hose.position.set(0, -0.08, 0.06);
  hose.visible = false;
  return hose;
}
