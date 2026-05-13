import * as THREE from 'three';
import { forceTopDraw } from './_util';
import type { CollectFlakeViz, MinigameViz } from './types';

// Collect-stage viewmodel — wet pan with visible gold flakes, a cursor
// that follows player input, and a snuffer tip mesh that reads as the
// vacuum tool. Mounted as a camera child so it acts as a viewmodel under
// the first-person prospect camera.
//
// The pan itself is the same shallow-bowl shape as the M5 pan but cleaned
// of swirl-specific decorations. Flakes are 8 procedural gold discs
// placed by the minigame at start; they pulse, fade when collected, and
// hide when fully gone.

type CollectViz = Extract<MinigameViz, { kind: 'collect' }>;

const PAN_RADIUS = 0.2;
const FLAKE_FINE_RADIUS = 0.012;
const FLAKE_PICKER_RADIUS = 0.018;
// Matches TOTAL_FLAKES in collect.ts — the view needs at least as many
// slot meshes as the logic spawns, otherwise the extras are invisible.
const TOTAL_FLAKE_SLOTS = 11;

const FLAKE_FINE_COLOR = 0xffe26a;
const FLAKE_PICKER_COLOR = 0xfac545;

export interface CollectViewMeshes {
  group: THREE.Group;
  update(viz: CollectViz): void;
  setVisible(v: boolean): void;
}

function makePanBowl(): THREE.Group {
  const group = new THREE.Group();
  const bowlMat = new THREE.MeshStandardMaterial({
    color: 0x1c1c1c,
    roughness: 0.85,
    metalness: 0.3,
    side: THREE.DoubleSide,
  });
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(PAN_RADIUS, PAN_RADIUS * 0.72, 0.06, 32, 1, true),
    bowlMat,
  );
  bowl.position.y = -0.03;
  group.add(bowl);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(PAN_RADIUS * 0.72, 32), bowlMat);
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = -0.06;
  group.add(bottom);
  // Water — thin transparent disc just above the bottom.
  const waterMat = new THREE.MeshBasicMaterial({
    color: 0x4a90b8,
    transparent: true,
    opacity: 0.4,
  });
  const water = new THREE.Mesh(new THREE.CircleGeometry(PAN_RADIUS * 0.94, 32), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.04;
  group.add(water);
  return group;
}

interface FlakeSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
}

function makeFlakeSlots(): FlakeSlot[] {
  const slots: FlakeSlot[] = [];
  for (let i = 0; i < TOTAL_FLAKE_SLOTS; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: FLAKE_FINE_COLOR,
      transparent: true,
      opacity: 0,
    });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(FLAKE_FINE_RADIUS, 12), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.035;
    mesh.visible = false;
    slots.push({ mesh, mat });
  }
  return slots;
}

function makeSnufferMesh(tier: 1 | 2 | 3): THREE.Group {
  // Tier-specific snuffer body shown in the upper-right of the view as a
  // visual indicator of which snuffer the player is using. Geometry stays
  // simple — a plastic body + a glass bulb, with vials for T2/T3.
  const group = new THREE.Group();
  const plasticMat = new THREE.MeshStandardMaterial({
    color: 0xc14b2e,
    roughness: 0.7,
    metalness: 0,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xddeef4,
    roughness: 0.2,
    metalness: 0.1,
    transparent: true,
    opacity: 0.8,
  });
  const tipMat = new THREE.MeshStandardMaterial({
    color: 0x6a6a6a,
    roughness: 0.6,
    metalness: 0.5,
  });

  // Glass bulb (squeeze body).
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), glassMat);
  group.add(bulb);

  // Plastic cap on the bulb.
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16), plasticMat);
  cap.position.y = 0.05;
  group.add(cap);

  // Tapered tip.
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.025, 0.1, 12), tipMat);
  tip.position.y = -0.07;
  group.add(tip);

  // Vials for T2 / T3 — hang off the side of the bulb.
  if (tier >= 2) {
    const vialCount = tier === 2 ? 3 : 6;
    const vialMat = new THREE.MeshStandardMaterial({
      color: 0xfff4d0,
      transparent: true,
      opacity: 0.85,
    });
    for (let i = 0; i < vialCount; i++) {
      const v = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8), vialMat);
      const angle = (i / vialCount) * Math.PI * 1.2 - Math.PI * 0.6;
      v.position.set(Math.sin(angle) * 0.07, 0.0, Math.cos(angle) * 0.07);
      group.add(v);
    }
  }

  group.position.set(0.28, 0.05, -0.5);
  group.rotation.set(0.25, -0.5, 0.4);
  group.scale.setScalar(0.85);

  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = false;
      m.receiveShadow = false;
    }
  });
  return group;
}

export function createCollectView(): CollectViewMeshes {
  const root = new THREE.Group();
  root.name = 'collect_view_root';

  const pan = makePanBowl();
  // Mount: same lower-center position + tilt as the pan-stage view.
  pan.position.set(0, -0.34, -0.5);
  pan.rotation.set(0.45, 0, 0);
  pan.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = false;
      m.receiveShadow = false;
    }
  });
  root.add(pan);

  // Flake slots — parented to the pan so they inherit its tilt.
  const flakeSlots = makeFlakeSlots();
  for (const s of flakeSlots) pan.add(s.mesh);

  // Cursor — small cyan ring inside the pan (snuffer tip target).
  const cursorMat = new THREE.MeshBasicMaterial({
    color: 0xe9faff,
    transparent: true,
    opacity: 0.85,
  });
  const cursor = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.018, 16), cursorMat);
  cursor.rotation.x = -Math.PI / 2;
  cursor.position.y = -0.033;
  pan.add(cursor);

  // Suction halo — larger transparent ring around the cursor; visible only
  // when INTERACT held. Radius set per-frame to match tier suction.
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xe9faff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  });
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.04, 0.046, 24), haloMat);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = -0.034;
  pan.add(halo);

  // Snuffer body — one per tier, only the matching tier shown each frame.
  const snufferMeshes: Record<1 | 2 | 3, THREE.Group> = {
    1: makeSnufferMesh(1),
    2: makeSnufferMesh(2),
    3: makeSnufferMesh(3),
  };
  // Capture each snuffer's rest position so the per-click lurch can
  // layer offset on top without drifting over time.
  const snufferRest: Record<1 | 2 | 3, { x: number; y: number; z: number }> = {
    1: { x: snufferMeshes[1].position.x, y: snufferMeshes[1].position.y, z: snufferMeshes[1].position.z },
    2: { x: snufferMeshes[2].position.x, y: snufferMeshes[2].position.y, z: snufferMeshes[2].position.z },
    3: { x: snufferMeshes[3].position.x, y: snufferMeshes[3].position.y, z: snufferMeshes[3].position.z },
  };
  for (const m of Object.values(snufferMeshes)) {
    m.visible = false;
    root.add(m);
  }

  // Per-stage state: detect a fresh collect tick (collected count went
  // up) and lurch the snuffer toward the cursor briefly.
  let prevCollected = 0;
  let lurchT = 1; // 1 = idle, 0 = freshly-lurched
  const LURCH_DURATION_SEC = 0.18;
  const LURCH_REACH_M = 0.025;

  function update(viz: CollectViz): void {
    // Show only the active snuffer tier mesh.
    for (const [k, m] of Object.entries(snufferMeshes)) {
      m.visible = Number(k) === viz.snufferTier;
    }

    // Cursor position (cursorX/Y in [-1, 1] → pan-local coords).
    cursor.position.x = viz.cursorX * PAN_RADIUS * 0.9;
    cursor.position.z = viz.cursorY * PAN_RADIUS * 0.9;
    halo.position.x = cursor.position.x;
    halo.position.z = cursor.position.z;

    // Halo size scales with suction radius; visibility tracks INTERACT.
    const haloR = viz.suctionRadius * PAN_RADIUS;
    halo.scale.setScalar(haloR / 0.04);
    haloMat.opacity = viz.suctionActive ? 0.28 : 0.0;

    // Snuffer lurch — detect a fresh collected-count tick and animate
    // the active snuffer body briefly toward the cursor. Decays on a
    // ~0.18s window so it reads as a snap-and-settle, not a drift.
    // Counter going down = new session; reset.
    if (viz.flakesCollected < prevCollected) prevCollected = 0;
    if (viz.flakesCollected > prevCollected) {
      lurchT = 0;
    }
    prevCollected = viz.flakesCollected;
    const lurchDt = 1 / 60; // approximate; snap is short, exact dt doesn't matter
    lurchT = Math.min(1, lurchT + lurchDt / LURCH_DURATION_SEC);
    const lurchPhase = lurchT < 0.4 ? lurchT / 0.4 : 1 - (lurchT - 0.4) / 0.6;
    const lurchAmt = lurchPhase * LURCH_REACH_M;
    const rest = snufferRest[viz.snufferTier];
    const active = snufferMeshes[viz.snufferTier];
    // Push the snuffer slightly toward the cursor on collect.
    active.position.x = rest.x + viz.cursorX * lurchAmt;
    active.position.y = rest.y - lurchAmt * 0.5; // slight dip
    active.position.z = rest.z + viz.cursorY * lurchAmt;

    // Flake slots — one mesh per spawn slot, mapped by id.
    for (let i = 0; i < flakeSlots.length; i++) {
      const slot = flakeSlots[i]!;
      const f: CollectFlakeViz | undefined = viz.flakes[i];
      if (!f || f.state === 'gone') {
        slot.mesh.visible = false;
        continue;
      }
      slot.mesh.visible = true;
      slot.mesh.position.x = f.x * PAN_RADIUS * 0.9;
      slot.mesh.position.z = f.y * PAN_RADIUS * 0.9;

      // Visual size + color by flake type.
      const baseRadius = f.isFine ? FLAKE_FINE_RADIUS : FLAKE_PICKER_RADIUS;
      slot.mesh.scale.setScalar(baseRadius / FLAKE_FINE_RADIUS);
      slot.mat.color.setHex(f.isFine ? FLAKE_FINE_COLOR : FLAKE_PICKER_COLOR);

      // Opacity: gentle pulse for present, fade out for collecting.
      if (f.state === 'collecting') {
        // We approximate fadeT from suckProgress + an internal frame; the
        // minigame already advances fadeT internally — opacity follows it.
        // Suck progress only matters while still present, so during the
        // fade we just multiply scale up and opacity down by elapsed frames.
        slot.mat.opacity = Math.max(0, 0.9 * (1 - Math.max(f.suckProgress, 0)));
        // When the minigame marked it collecting, suckProgress is either 1
        // (collected) or 0 (washed). We rely on the underlying mesh to
        // hide once state becomes 'gone'.
        if (f.suckProgress >= 1) {
          // Collected — pop up + brighten briefly before going gone.
          slot.mesh.position.y = -0.025;
        } else {
          // Washed — drift outward.
          slot.mesh.position.y = -0.04;
        }
        slot.mat.opacity = 0.55;
      } else {
        // Present — gentle pulse opacity 0.7 → 1.0 based on flake.pulse.
        slot.mat.opacity = 0.75 + 0.25 * Math.sin(f.pulse * Math.PI * 2);
        // Slight bob if suction is currently progressing.
        slot.mesh.position.y = -0.035 + f.suckProgress * 0.005;
      }
    }
  }

  function setVisible(v: boolean): void {
    root.visible = v;
    if (!v) {
      for (const m of Object.values(snufferMeshes)) m.visible = false;
      for (const s of flakeSlots) s.mesh.visible = false;
    }
  }

  setVisible(false);
  forceTopDraw(root);
  return { group: root, update, setVisible };
}
