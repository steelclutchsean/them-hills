import * as THREE from 'three';

// Procedural articulated character — built from rounded geometry (capsules / spheres /
// tapered cylinders) instead of axis-aligned boxes. This is intentionally NOT a final
// asset; it's the highest quality we can get from Three.js primitives without textures
// or hand-modeled meshes. The next quality jump is a rigged glTF character.
//
// Forward convention: character forward = local **-Z**. All forward-facing details
// (boot toes, vest pocket, belt buckle, hat buckle, all face features) are on -Z.
//
// Hierarchy:
//
//   group (origin = capsule center, matches Rapier body translation)
//   └── spine                    (pelvis pivot)
//       ├── torso (tapered cylinder), vest, belt (torus), buckle, suspenders, vest pocket
//       ├── neck (capsule)
//       ├── head                 (neck pivot)
//       │   ├── skull (oval sphere), hair tuft, ears
//       │   ├── eyes (sphere whites + sphere pupils)
//       │   ├── eyebrowL/R (cylinder pivots, animatable)
//       │   ├── nose (cone), mouth (cylinder pivot, scalable), beard (stretched sphere)
//       │   └── hat: crown (tapered cyl), band (cyl), buckle (box), brim (cyl)
//       ├── shoulderL/R (capsule arms with rounded shoulder + elbow)
//       │   └── elbow → lower arm capsule (skin, rolled sleeve) → hand (flattened sphere)
//       └── hipL/R (capsule legs with rounded knee)
//           └── knee → lower leg capsule + boot ankle/foot/sole (sphere ellipsoids)

export interface CharacterRig {
  group: THREE.Group;
  spine: THREE.Object3D;
  head: THREE.Object3D;
  // Face animation pivots
  eyebrowL: THREE.Object3D;
  eyebrowR: THREE.Object3D;
  mouth: THREE.Object3D;
  // Body joints
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

const COLORS = {
  skin: 0xe7c19e,
  skinShade: 0xd4ad8a,
  hair: 0x6a3520,
  beard: 0x8a4a2a,
  eyebrow: 0x4a2a18,
  eyeWhite: 0xfafaee,
  eyePupil: 0x1c1612,
  mouth: 0x3a1a10,
  shirt: 0x9b3a2b,
  vest: 0x4a3826,
  vestPocket: 0x352818,
  pants: 0x33486a,
  pantsKnee: 0x253550,
  bootUpper: 0x2a1d12,
  bootSole: 0x52382a,
  belt: 0x231812,
  buckle: 0xd4a647,
  hat: 0x3e2a17,
  hatBand: 0x1a1a1a,
  suspender: 0x4a3826,
} as const;

const flatMat = (color: number, roughness = 0.85): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness });

// Smooth-shaded material for organic shapes (face, beard, hair). Skips flatShading
// so spheres look round instead of faceted.
const smoothMat = (color: number, roughness = 0.85): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, flatShading: false, roughness });

export function createCharacterRig(): CharacterRig {
  const group = new THREE.Group();

  const matSkin = smoothMat(COLORS.skin, 0.85);
  const matHair = smoothMat(COLORS.hair, 0.95);
  const matBeard = smoothMat(COLORS.beard, 0.95);
  const matEyebrow = smoothMat(COLORS.eyebrow, 0.9);
  const matEyeWhite = smoothMat(COLORS.eyeWhite, 0.4);
  const matEyePupil = smoothMat(COLORS.eyePupil, 0.5);
  const matMouth = flatMat(COLORS.mouth, 0.9);
  const matShirt = flatMat(COLORS.shirt, 0.9);
  const matVest = flatMat(COLORS.vest, 0.92);
  const matVestPocket = flatMat(COLORS.vestPocket, 0.95);
  const matPants = flatMat(COLORS.pants, 0.88);
  const matPantsKnee = flatMat(COLORS.pantsKnee, 0.92);
  const matBootUpper = smoothMat(COLORS.bootUpper, 0.7);
  const matBootSole = flatMat(COLORS.bootSole, 0.9);
  const matBelt = flatMat(COLORS.belt, 0.85);
  const matBuckle = smoothMat(COLORS.buckle, 0.4);
  const matHat = flatMat(COLORS.hat, 0.8);
  const matHatBand = flatMat(COLORS.hatBand, 0.85);
  const matSuspender = flatMat(COLORS.suspender, 0.85);

  // ---- Spine ----
  const spine = new THREE.Object3D();
  group.add(spine);

  // ---- Torso (tapered cylinder, narrower at shoulders) ----
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.55, 18), matShirt);
  torso.position.y = 0.27;
  spine.add(torso);

  // Vest layered slightly larger
  const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.5, 18), matVest);
  vest.position.y = 0.27;
  spine.add(vest);

  // Vest pocket on the front-right
  const vestPocket = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.015), matVestPocket);
  vestPocket.position.set(0.1, 0.32, -0.205);
  spine.add(vestPocket);

  // Suspender straps running over shoulders (front)
  const makeSuspender = (xSign: 1 | -1): void => {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), matSuspender);
    s.position.set(xSign * 0.1, 0.3, -0.205);
    s.rotation.x = -0.05;
    spine.add(s);
  };
  makeSuspender(1);
  makeSuspender(-1);

  // Belt = torus around waist
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.022, 8, 24), matBelt);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, 1.05, 1); // slightly oval (front-back compressed)
  belt.position.y = 0.035;
  spine.add(belt);

  // Belt buckle
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.045, 0.018), matBuckle);
  buckle.position.set(0, 0.035, -0.215);
  spine.add(buckle);

  // ---- Neck ----
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.04, 4, 12), matSkin);
  neck.position.y = 0.55;
  spine.add(neck);

  // ---- Head ----
  const head = new THREE.Object3D();
  head.position.y = 0.66;
  spine.add(head);

  // Skull — slightly oval (taller than wide; narrower front-to-back)
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 16), matSkin);
  skull.scale.set(1.0, 1.08, 0.95);
  head.add(skull);

  // Ears
  const makeEar = (xSign: 1 | -1): void => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), matSkin);
    ear.position.set(xSign * 0.135, 0, 0.005);
    ear.scale.set(0.55, 1.5, 0.85);
    head.add(ear);
  };
  makeEar(1);
  makeEar(-1);

  // Hair tuft sticking out at the back below the hat brim
  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), matHair);
  hairBack.position.set(0, 0.02, 0.13);
  hairBack.scale.set(1.6, 0.6, 0.7);
  head.add(hairBack);

  // Sideburn-like hair tufts at temples
  const makeSideburn = (xSign: 1 | -1): void => {
    const sb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), matHair);
    sb.position.set(xSign * 0.13, -0.02, 0.06);
    sb.scale.set(0.5, 1.6, 0.6);
    head.add(sb);
  };
  makeSideburn(1);
  makeSideburn(-1);

  // Face features sit just outside the front of the skull (skull radius * scale ≈ 0.133).
  const FACE_Z = -0.135;

  // Eyes — white sphere + slightly forward dark pupil
  const makeEye = (xSign: 1 | -1): void => {
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), matEyeWhite);
    eyeWhite.position.set(xSign * 0.052, 0.025, FACE_Z + 0.01);
    head.add(eyeWhite);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), matEyePupil);
    pupil.position.set(xSign * 0.052, 0.025, FACE_Z - 0.005);
    head.add(pupil);
  };
  makeEye(1);
  makeEye(-1);

  // Eyebrows — thin curved cylinders, animatable
  const makeEyebrow = (xSign: 1 | -1): THREE.Object3D => {
    const pivot = new THREE.Object3D();
    pivot.position.set(xSign * 0.052, 0.06, FACE_Z + 0.005);
    head.add(pivot);
    const brow = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 8), matEyebrow);
    brow.rotation.z = Math.PI / 2;
    pivot.add(brow);
    return pivot;
  };
  const eyebrowL = makeEyebrow(1);
  const eyebrowR = makeEyebrow(-1);

  // Nose — small cone protruding -Z
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 10), matSkin);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, -0.005, FACE_Z - 0.022);
  head.add(nose);

  // Mouth — thin curved cylinder, animatable via scale
  const mouth = new THREE.Object3D();
  mouth.position.set(0, -0.05, FACE_Z + 0.005);
  head.add(mouth);
  const mouthMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 8), matMouth);
  mouthMesh.rotation.z = Math.PI / 2;
  mouth.add(mouthMesh);

  // Beard — stretched sphere covering chin/jaw
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), matBeard);
  beard.scale.set(1.25, 0.85, 0.95);
  beard.position.set(0, -0.085, -0.05);
  head.add(beard);

  // Mustache — small stretched sphere just below nose
  const mustache = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 6), matBeard);
  mustache.scale.set(1.5, 0.4, 0.6);
  mustache.position.set(0, -0.03, FACE_Z - 0.005);
  head.add(mustache);

  // Hat — slightly tapered crown
  const hatCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.11, 18), matHat);
  hatCrown.position.y = 0.16;
  head.add(hatCrown);

  // Hat band wrapping the crown
  const hatBand = new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.142, 0.022, 18), matHatBand);
  hatBand.position.y = 0.108;
  head.add(hatBand);

  // Hat band buckle (front)
  const hatBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.022, 0.018), matBuckle);
  hatBuckle.position.set(0, 0.108, -0.14);
  head.add(hatBuckle);

  // Hat brim (slightly upturned at edges via shallower cone)
  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.245, 0.022, 24), matHat);
  hatBrim.position.y = 0.097;
  head.add(hatBrim);

  // ---- Arms (capsules with rounded ends) ----
  const arm = (
    xSign: 1 | -1,
  ): { shoulder: THREE.Object3D; elbow: THREE.Object3D; hand: THREE.Object3D } => {
    const shoulder = new THREE.Object3D();
    shoulder.position.set(xSign * 0.27, 0.5, 0);
    spine.add(shoulder);

    // Upper arm — capsule with rounded shoulder end
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.18, 6, 14), matShirt);
    upper.position.y = -0.13;
    shoulder.add(upper);

    const elbow = new THREE.Object3D();
    elbow.position.y = -0.27;
    shoulder.add(elbow);

    // Lower arm = rolled sleeve = skin
    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.18, 6, 14), matSkin);
    lower.position.y = -0.13;
    elbow.add(lower);

    const hand = new THREE.Object3D();
    hand.position.y = -0.27;
    elbow.add(hand);

    // Hand — flattened, slightly elongated sphere (no individual fingers)
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 12), matSkin);
    palm.scale.set(1.0, 1.2, 0.85);
    hand.add(palm);

    // Inner-side thumb bump
    const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), matSkin);
    thumb.position.set(-xSign * 0.05, 0.015, 0);
    thumb.scale.set(0.7, 1.4, 0.7);
    hand.add(thumb);

    // Slight outward rest pose
    shoulder.rotation.z = xSign * -0.06;

    return { shoulder, elbow, hand };
  };
  const armL = arm(1);
  const armR = arm(-1);

  // ---- Legs ----
  const leg = (xSign: 1 | -1): { hip: THREE.Object3D; knee: THREE.Object3D } => {
    const hip = new THREE.Object3D();
    hip.position.set(xSign * 0.1, 0, 0);
    spine.add(hip);

    // Upper leg — capsule
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.27, 6, 14), matPants);
    upper.position.y = -0.2;
    hip.add(upper);

    // Knee patch (slightly darker oval on the front)
    const kneePatch = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), matPantsKnee);
    kneePatch.scale.set(1.1, 0.6, 0.4);
    kneePatch.position.set(0, -0.39, -0.07);
    hip.add(kneePatch);

    const knee = new THREE.Object3D();
    knee.position.y = -0.4;
    hip.add(knee);

    // Lower leg — capsule
    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.18, 6, 14), matPants);
    lower.position.y = -0.13;
    knee.add(lower);

    // Boot ankle (cylinder) where pant tucks into boot
    const ankle = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.085, 0.08, 14), matBootUpper);
    ankle.position.y = -0.25;
    knee.add(ankle);

    // Foot — stretched ellipsoid, toes pointing -Z (forward)
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), matBootUpper);
    foot.scale.set(1.3, 0.7, 1.6);
    foot.position.set(0, -0.32, -0.04);
    knee.add(foot);

    // Sole — flat ellipsoid below the foot
    const sole = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 6), matBootSole);
    sole.scale.set(1.4, 0.18, 1.7);
    sole.position.set(0, -0.385, -0.04);
    knee.add(sole);

    return { hip, knee };
  };
  const legL = leg(1);
  const legR = leg(-1);

  // Cast shadows (no-op until renderer.shadowMap.enabled — harmless)
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = false;
    }
  });

  return {
    group,
    spine,
    head,
    eyebrowL,
    eyebrowR,
    mouth,
    shoulderL: armL.shoulder,
    shoulderR: armR.shoulder,
    elbowL: armL.elbow,
    elbowR: armR.elbow,
    handL: armL.hand,
    handR: armR.hand,
    hipL: legL.hip,
    hipR: legR.hip,
    kneeL: legL.knee,
    kneeR: legR.knee,
  };
}
