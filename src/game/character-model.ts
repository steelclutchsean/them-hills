import * as THREE from 'three';

// Procedural articulated character — primitive geometry, painterly flat-shaded.
// Reads as "a stylized prospector" from a 3rd-person camera distance.
//
// Forward convention: the character's FRONT faces local **-Z** (Three.js camera
// default forward). All forward-facing details (boot toes, vest face, belt buckle,
// hat buckle, all face features) are positioned on the -Z side.
//
// Hierarchy (each named entry is an Object3D pivot that animations rotate):
//
//   group (origin = capsule center, matches Rapier body translation)
//   └── spine                    (pelvis pivot; anchor for body bob/lean)
//       ├── torso/vest/belt/suspenders/buckle (no animation pivots)
//       ├── neck cylinder
//       ├── head                 (neck pivot)
//       │   ├── skull, nose, eyes, beard, hat, hat band+buckle, brim
//       │   ├── eyebrowL, eyebrowR  (animatable — focused/raised)
//       │   └── mouth                (animatable — open/closed)
//       ├── shoulderL, shoulderR
//       │   └── upperArm + shoulder pad → elbowL/R
//       │       └── lowerArm (rolled-sleeve skin) → handL/R
//       │           └── palm + thumb
//       └── hipL, hipR
//           └── upperLeg → kneeL/R
//               └── lowerLeg + boot upper + boot sole
//
// Sides: "L" pivots are on +X (character's own left when facing -Z).

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

// Color palette — single source of truth.
const COLORS = {
  skin: 0xe7c19e,
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

export function createCharacterRig(): CharacterRig {
  const group = new THREE.Group();

  // Materials (one instance each, shared across meshes that use the same color)
  const matSkin = flatMat(COLORS.skin, 0.85);
  const matBeard = flatMat(COLORS.beard, 0.95);
  const matEyebrow = flatMat(COLORS.eyebrow, 0.9);
  const matEyeWhite = flatMat(COLORS.eyeWhite, 0.4);
  const matEyePupil = flatMat(COLORS.eyePupil, 0.5);
  const matMouth = flatMat(COLORS.mouth, 0.9);
  const matShirt = flatMat(COLORS.shirt, 0.85);
  const matVest = flatMat(COLORS.vest, 0.9);
  const matVestPocket = flatMat(COLORS.vestPocket, 0.95);
  const matPants = flatMat(COLORS.pants, 0.85);
  const matPantsKnee = flatMat(COLORS.pantsKnee, 0.9);
  const matBootUpper = flatMat(COLORS.bootUpper, 0.7);
  const matBootSole = flatMat(COLORS.bootSole, 0.9);
  const matBelt = flatMat(COLORS.belt, 0.85);
  const matBuckle = flatMat(COLORS.buckle, 0.4);
  const matHat = flatMat(COLORS.hat, 0.8);
  const matHatBand = flatMat(COLORS.hatBand, 0.85);
  const matSuspender = flatMat(COLORS.suspender, 0.85);

  // ---- Spine (group origin; legs go down to ~ -0.86, head/hat to ~ +0.84) ----
  const spine = new THREE.Object3D();
  group.add(spine);

  // ---- Torso (chest shirt, then vest layered slightly larger) ----
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.28), matShirt);
  torso.position.y = 0.27;
  spine.add(torso);

  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.3), matVest);
  vest.position.set(0, 0.27, 0); // vest wraps the chest evenly
  spine.add(vest);

  // Vest pocket on the front (-Z) side
  const vestPocket = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.02), matVestPocket);
  vestPocket.position.set(0.13, 0.32, -0.16);
  spine.add(vestPocket);

  // Suspenders running over shoulders (front strips)
  const makeSuspender = (xSign: 1 | -1): void => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, 0.02), matSuspender);
    s.position.set(xSign * 0.13, 0.27, -0.155);
    spine.add(s);
  };
  makeSuspender(1);
  makeSuspender(-1);

  // Belt around waist
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.32), matBelt);
  belt.position.y = 0.03;
  spine.add(belt);

  // Belt buckle (front -Z)
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.02), matBuckle);
  buckle.position.set(0, 0.03, -0.165);
  spine.add(buckle);

  // ---- Neck ----
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.08, 8), matSkin);
  neck.position.y = 0.56;
  spine.add(neck);

  // ---- Head ----
  const head = new THREE.Object3D();
  head.position.y = 0.65;
  spine.add(head);

  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.26), matSkin);
  head.add(skull);

  // Face features anchored to -Z side (front of skull). Skull halfDepth = 0.13,
  // so feature surfaces sit just outside the skull (z ≈ -0.13).
  const FACE_Z = -0.135;

  // Eyes: white spheres slightly recessed, dark pupils slightly forward of those.
  const makeEye = (xSign: 1 | -1): void => {
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), matEyeWhite);
    eyeWhite.position.set(xSign * 0.062, 0.045, FACE_Z + 0.005);
    head.add(eyeWhite);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 6), matEyePupil);
    pupil.position.set(xSign * 0.062, 0.045, FACE_Z - 0.012);
    head.add(pupil);
  };
  makeEye(1);
  makeEye(-1);

  // Eyebrows — pivot Object3Ds so animations can tilt them (focus / surprise).
  const makeEyebrow = (xSign: 1 | -1): THREE.Object3D => {
    const pivot = new THREE.Object3D();
    pivot.position.set(xSign * 0.062, 0.085, FACE_Z);
    head.add(pivot);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.014, 0.02), matEyebrow);
    pivot.add(m);
    return pivot;
  };
  const eyebrowL = makeEyebrow(1);
  const eyebrowR = makeEyebrow(-1);

  // Nose (small bump)
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.04), matSkin);
  nose.position.set(0, -0.005, FACE_Z - 0.012);
  head.add(nose);

  // Mouth pivot — animated by scaling y (open/close).
  const mouth = new THREE.Object3D();
  mouth.position.set(0, -0.07, FACE_Z - 0.005);
  head.add(mouth);
  const mouthMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 0.012), matMouth);
  mouth.add(mouthMesh);

  // Beard (covers chin, shapes lower face)
  const beard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.12), matBeard);
  beard.position.set(0, -0.105, -0.085);
  head.add(beard);

  // ---- Hat ----
  const hatCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 12), matHat);
  hatCrown.position.y = 0.16;
  head.add(hatCrown);

  const hatBand = new THREE.Mesh(new THREE.CylinderGeometry(0.183, 0.183, 0.025, 12), matHatBand);
  hatBand.position.y = 0.108;
  head.add(hatBand);

  const hatBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.02), matBuckle);
  hatBuckle.position.set(0, 0.108, -0.18);
  head.add(hatBuckle);

  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 16), matHat);
  hatBrim.position.y = 0.1;
  head.add(hatBrim);

  // ---- Arms ----
  // Hand thumb is on the body-side: L hand (at +X) has thumb on -X side; R hand mirrored.
  const arm = (
    xSign: 1 | -1,
  ): { shoulder: THREE.Object3D; elbow: THREE.Object3D; hand: THREE.Object3D } => {
    const shoulder = new THREE.Object3D();
    shoulder.position.set(xSign * 0.28, 0.5, 0);
    spine.add(shoulder);

    // Shoulder pad makes the cylinder upper arm read more like a sleeve cap.
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), matShirt);
    pad.position.y = -0.02;
    shoulder.add(pad);

    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.32, 10), matShirt);
    upper.position.y = -0.16;
    shoulder.add(upper);

    const elbow = new THREE.Object3D();
    elbow.position.y = -0.32;
    shoulder.add(elbow);

    // Lower arm = rolled-up sleeve = skin
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.3, 10), matSkin);
    lower.position.y = -0.15;
    elbow.add(lower);

    const hand = new THREE.Object3D();
    hand.position.y = -0.3;
    elbow.add(hand);

    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.09), matSkin);
    hand.add(palm);

    // Thumb on inner side
    const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.06, 0.04), matSkin);
    thumb.position.set(-xSign * 0.06, 0.02, 0);
    hand.add(thumb);

    // Slight outward rest pose so arms don't clip torso
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

    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.4, 10), matPants);
    upper.position.y = -0.2;
    hip.add(upper);

    // Knee patch on the front (-Z)
    const kneePatch = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.04), matPantsKnee);
    kneePatch.position.set(0, -0.39, -0.06);
    hip.add(kneePatch);

    const knee = new THREE.Object3D();
    knee.position.y = -0.4;
    hip.add(knee);

    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.36, 10), matPants);
    lower.position.y = -0.18;
    knee.add(lower);

    // Boot — toes pointing -Z (forward).
    const bootUpper = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.22), matBootUpper);
    bootUpper.position.set(0, -0.4, -0.05);
    knee.add(bootUpper);

    const bootSole = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.24), matBootSole);
    bootSole.position.set(0, -0.45, -0.05);
    knee.add(bootSole);

    return { hip, knee };
  };

  const legL = leg(1);
  const legR = leg(-1);

  // Cast shadows on character (no-op until renderer.shadowMap.enabled — harmless)
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
