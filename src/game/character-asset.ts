import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { upgradeLoadedMaterials } from '@/render/materials';

// Loads the Quaternius Ranger outfit and bakes the Superhero head (eyes and
// brows included) onto the Ranger Head bone. The pauldron and hood stay
// hidden. The procedural sphere head is only the fallback if that extract fails.

const OUTFIT_GLTF = '/assets/characters/Male_Ranger.gltf';
const HEAD_GLTF = '/assets/characters/Superhero_Male_FullBody.gltf';

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
    hat.position.y = 0.08;
    // Front of the hat is local -Z. A negative X tilt lifts the brim off the eyes.
    hat.rotation.x = -0.22;
    headBone.add(hat);
  }
  const tools = attachHandTools(bones.get('hand_r'));

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
  pan.add(bowl);
  for (let i = 0; i < 7; i++) {
    const flake = new THREE.Mesh(
      new THREE.SphereGeometry(0.018 + (i % 3) * 0.008, 8, 6),
      new THREE.MeshStandardMaterial({
        color: 0xffd56a,
        emissive: 0xffb020,
        emissiveIntensity: 1.35,
        metalness: 0.7,
        roughness: 0.22,
      }),
    );
    const a = (i / 7) * Math.PI * 2;
    flake.position.set(Math.cos(a) * 0.07, 0.17, Math.sin(a) * 0.05);
    pan.add(flake);
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

/** Quaternius superhero head, eyes, and brows, skinned verts baked onto the ranger Head bone. */
async function attachModeledHead(headBone: THREE.Object3D): Promise<boolean> {
  try {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(HEAD_GLTF);
    gltf.scene.updateMatrixWorld(true);
    const group = new THREE.Group();
    group.name = 'modeled-head';
    // The outfit's visible face is head-local -Z. The source mesh faces +Z.
    group.rotation.y = Math.PI;
    gltf.scene.traverse((obj) => {
      if (!(obj instanceof THREE.SkinnedMesh)) return;
      const geom = extractHeadGeometry(obj);
      if (!geom) return;
      const source = obj.material;
      const mat =
        (Array.isArray(source) ? source[0] : source)?.clone() ?? new THREE.MeshStandardMaterial();
      if (mat instanceof THREE.MeshStandardMaterial && !/eye/i.test(obj.name)) {
        mat.roughness = Math.max(mat.roughness, 0.62);
        mat.metalness = Math.min(mat.metalness, 0.06);
      }
      const mesh = new THREE.Mesh(geom, mat);
      mesh.name = `head-${obj.name}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });
    if (group.children.length === 0) return false;
    headBone.add(group);
    return true;
  } catch (err) {
    console.warn('[character-asset] modeled head failed, using the built face', err);
    return false;
  }
}

function extractHeadGeometry(mesh: THREE.SkinnedMesh): THREE.BufferGeometry | null {
  const skeleton = mesh.skeleton;
  const headIndex = skeleton.bones.findIndex((b) => b.name === 'Head');
  if (headIndex < 0) return null;
  const pos = mesh.geometry.attributes.position;
  const uv = mesh.geometry.attributes.uv;
  const skinIndex = mesh.geometry.attributes.skinIndex;
  const skinWeight = mesh.geometry.attributes.skinWeight;
  if (!pos || !skinIndex || !skinWeight) return null;
  mesh.updateWorldMatrix(true, false);
  skeleton.update();
  const head = skeleton.bones[headIndex];
  if (!head) return null;
  head.updateWorldMatrix(true, false);
  const invHead = new THREE.Matrix4().copy(head.matrixWorld).invert();

  const keep = new Uint8Array(pos.count);
  const si = new THREE.Vector4();
  const w = new THREE.Vector4();
  for (let i = 0; i < pos.count; i++) {
    si.set(skinIndex.getX(i), skinIndex.getY(i), skinIndex.getZ(i), skinIndex.getW(i));
    w.set(skinWeight.getX(i), skinWeight.getY(i), skinWeight.getZ(i), skinWeight.getW(i));
    let headW = 0;
    for (let k = 0; k < 4; k++) {
      if (Math.round(si.getComponent(k)) === headIndex) headW += w.getComponent(k);
    }
    if (headW >= 0.5) keep[i] = 1;
  }

  const index = mesh.geometry.index;
  const used = new Uint8Array(pos.count);
  const consider = (ia: number, ib: number, ic: number): void => {
    if (keep[ia] && keep[ib] && keep[ic]) {
      used[ia] = 1;
      used[ib] = 1;
      used[ic] = 1;
    }
  };
  if (index) {
    for (let i = 0; i < index.count; i += 3) consider(index.getX(i), index.getY(i), index.getZ(i));
  } else {
    for (let i = 0; i < pos.count; i += 3) consider(i, i + 1, i + 2);
  }

  const remap = new Int32Array(pos.count);
  remap.fill(-1);
  const positions: number[] = [];
  const uvs: number[] = [];
  const tmp = new THREE.Vector3();
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    if (!used[i]) continue;
    tmp.fromBufferAttribute(pos, i);
    mesh.applyBoneTransform(i, tmp);
    tmp.applyMatrix4(invHead);
    positions.push(tmp.x, tmp.y, tmp.z);
    if (uv) uvs.push(uv.getX(i), uv.getY(i));
    remap[i] = n;
    n++;
  }
  if (n < 12) return null;
  const indices: number[] = [];
  const pushTri = (ia: number, ib: number, ic: number): void => {
    const ra = remap[ia] ?? -1;
    const rb = remap[ib] ?? -1;
    const rc = remap[ic] ?? -1;
    if (ra < 0 || rb < 0 || rc < 0) return;
    indices.push(ra, rb, rc);
  };
  if (index) {
    for (let i = 0; i < index.count; i += 3) pushTri(index.getX(i), index.getY(i), index.getZ(i));
  } else {
    for (let i = 0; i < pos.count; i += 3) pushTri(i, i + 1, i + 2);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (uvs.length > 0) geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
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
