import * as THREE from 'three';

// Procedural articulated character — primitive geometry, painterly flat-shaded.
// Replaces the Phase 1 capsule+cone placeholder. Final character will be a rigged
// model (M3 asset sourcing); this is the in-between that reads as "a person doing
// things" without external dependencies.
//
// Hierarchy (each named entry is an Object3D pivot that animations rotate):
//
//   group (origin = capsule center, matches Rapier body translation)
//   └── spine                    (pelvis pivot; anchor for body bob/lean)
//       ├── torso + vest meshes
//       ├── head                 (neck pivot)
//       │   └── headMesh + hat + hatBrim
//       ├── shoulderL, shoulderR
//       │   └── upperArm mesh + elbowL/R
//       │       └── lowerArm mesh + handL/R
//       └── hipL, hipR
//           └── upperLeg mesh + kneeL/R
//               └── lowerLeg mesh + boot mesh
//
// Conventions:
//   - All "L" pivots are on +X (character's own left when facing -Z forward).
//   - Joints are positioned at the *upper* end; meshes hang down from them so a
//     simple rotation.x rotates the whole limb around the joint, like a hinge.
//   - Total visual height is ~1.70m, slightly inside the 1.80m Rapier capsule.

export interface CharacterRig {
  group: THREE.Group;
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

export function createCharacterRig(): CharacterRig {
  const group = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xe7c19e,
    flatShading: true,
    roughness: 0.85,
  });
  const shirtMat = new THREE.MeshStandardMaterial({
    color: 0x9b3a2b,
    flatShading: true,
    roughness: 0.85,
  });
  const vestMat = new THREE.MeshStandardMaterial({
    color: 0x4a3826,
    flatShading: true,
    roughness: 0.9,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: 0x33486a,
    flatShading: true,
    roughness: 0.85,
  });
  const bootMat = new THREE.MeshStandardMaterial({
    color: 0x2a1d12,
    flatShading: true,
    roughness: 0.7,
  });
  const hatMat = new THREE.MeshStandardMaterial({
    color: 0x3e2a17,
    flatShading: true,
    roughness: 0.8,
  });

  // Spine sits at group origin; legs go down to ~ -0.86, head/hat to ~ +0.84.
  const spine = new THREE.Object3D();
  group.add(spine);

  // Torso (shirt) + vest layered slightly larger so it reads as separate.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 0.28), shirtMat);
  torso.position.y = 0.27;
  spine.add(torso);

  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.3), vestMat);
  vest.position.set(0, 0.27, 0.005);
  spine.add(vest);

  // Head + hat
  const head = new THREE.Object3D();
  head.position.y = 0.62;
  spine.add(head);

  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.26), skinMat);
  head.add(headMesh);

  const hatCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 10), hatMat);
  hatCrown.position.y = 0.16;
  head.add(hatCrown);

  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 16), hatMat);
  hatBrim.position.y = 0.1;
  head.add(hatBrim);

  // Arms
  const arm = (
    xSign: 1 | -1,
  ): { shoulder: THREE.Object3D; elbow: THREE.Object3D; hand: THREE.Object3D } => {
    const shoulder = new THREE.Object3D();
    shoulder.position.set(xSign * 0.28, 0.5, 0);
    spine.add(shoulder);

    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.32, 8), shirtMat);
    upper.position.y = -0.16;
    shoulder.add(upper);

    const elbow = new THREE.Object3D();
    elbow.position.y = -0.32;
    shoulder.add(elbow);

    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.3, 8), skinMat);
    lower.position.y = -0.15;
    elbow.add(lower);

    const hand = new THREE.Object3D();
    hand.position.y = -0.3;
    elbow.add(hand);

    const handMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.08), skinMat);
    hand.add(handMesh);

    // Slight outward rest pose so arms don't clip torso.
    shoulder.rotation.z = xSign * -0.06;

    return { shoulder, elbow, hand };
  };

  const armL = arm(1);
  const armR = arm(-1);

  // Legs
  const leg = (xSign: 1 | -1): { hip: THREE.Object3D; knee: THREE.Object3D } => {
    const hip = new THREE.Object3D();
    hip.position.set(xSign * 0.1, 0, 0);
    spine.add(hip);

    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.4, 8), pantsMat);
    upper.position.y = -0.2;
    hip.add(upper);

    const knee = new THREE.Object3D();
    knee.position.y = -0.4;
    hip.add(knee);

    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.36, 8), pantsMat);
    lower.position.y = -0.18;
    knee.add(lower);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.2), bootMat);
    boot.position.set(0, -0.4, 0.05);
    knee.add(boot);

    return { hip, knee };
  };

  const legL = leg(1);
  const legR = leg(-1);

  // Cast shadows on character so it grounds against terrain.
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
