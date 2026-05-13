import * as THREE from 'three';
import type { MinigameViz } from './types';

// Pan-stage viewmodel — combined mesh + cursor + riffle indicators.
// Mounted as a camera child so it acts as a viewmodel while the
// first-person prospect camera is active. Three tier variants are built
// up front and shown/hidden via setTier().
//
//   T1 (steel 12"):  green-plastic bowl, plain interior.
//   T2 (steel 14"):  charcoal steel bowl, wider rim.
//   T3 (17" riffled): wider charcoal bowl with 6 raised riffle ridges
//                     around the inside + a "riffle hit" ring of small
//                     gold dots that light up as the player completes
//                     bonus swirls.

type PanViz = Extract<MinigameViz, { kind: 'pan' }>;

// Mounted pan units. Cursor X/Y maps -1..1 → -RADIUS..RADIUS in local space.
const PAN_RADIUS_T1 = 0.16;
const PAN_RADIUS_T2 = 0.18;
const PAN_RADIUS_T3 = 0.21;

interface TierVariant {
  group: THREE.Group;
  cursor: THREE.Mesh;
  riffleDots?: THREE.Mesh[];
  panRadius: number;
}

export interface PanViewMeshes {
  group: THREE.Group;
  update(viz: PanViz): void;
  setVisible(v: boolean): void;
}

function makePanVariant(tier: 1 | 2 | 3): TierVariant {
  const panRadius =
    tier === 1 ? PAN_RADIUS_T1 : tier === 2 ? PAN_RADIUS_T2 : PAN_RADIUS_T3;

  const variant = new THREE.Group();
  variant.name = `pan_t${tier}`;

  // Bowl color per tier: green plastic → charcoal steel → charcoal steel.
  const bowlColor = tier === 1 ? 0x2f7e3c : 0x1c1c1c;
  const bowlMat = new THREE.MeshStandardMaterial({
    color: bowlColor,
    roughness: 0.85,
    metalness: tier === 1 ? 0.05 : 0.35,
    side: THREE.DoubleSide,
  });

  // Bowl: shallow cone (open top, narrow bottom).
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(panRadius, panRadius * 0.72, 0.06, 32, 1, true),
    bowlMat,
  );
  bowl.position.y = -0.03;
  variant.add(bowl);

  // Bottom disc.
  const bottom = new THREE.Mesh(
    new THREE.CircleGeometry(panRadius * 0.72, 32),
    bowlMat,
  );
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = -0.06;
  variant.add(bottom);

  // Water inside — semi-transparent blue disc just above the bottom.
  const waterMat = new THREE.MeshBasicMaterial({
    color: 0x4a90b8,
    transparent: true,
    opacity: 0.55,
  });
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(panRadius * 0.94, 32),
    waterMat,
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.045;
  variant.add(water);

  // Riffle ridges (T3 only) — six small wedge-shaped bumps around the
  // inside, near the rim.
  let riffleDots: THREE.Mesh[] | undefined;
  if (tier === 3) {
    const riffleMat = new THREE.MeshStandardMaterial({
      color: 0x121212,
      roughness: 0.8,
      metalness: 0.4,
    });
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xd9a64a,
      transparent: true,
      opacity: 0,
    });
    riffleDots = [];
    const dotGeom = new THREE.SphereGeometry(0.008, 8, 8);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = panRadius * 0.78;
      const ridge = new THREE.Mesh(
        new THREE.BoxGeometry(panRadius * 0.18, 0.012, 0.018),
        riffleMat,
      );
      ridge.position.set(Math.cos(a) * r, -0.04, Math.sin(a) * r);
      ridge.rotation.y = -a;
      variant.add(ridge);
      // Gold dot — flashes on as riffleHits increments.
      const dot = new THREE.Mesh(dotGeom, dotMat.clone());
      dot.position.set(Math.cos(a) * r, -0.034, Math.sin(a) * r);
      variant.add(dot);
      riffleDots.push(dot);
    }
  }

  // Cursor — small bright disc that moves with the player's input.
  const cursorMat = new THREE.MeshBasicMaterial({
    color: 0xfff4a0,
    transparent: true,
    opacity: 0.9,
  });
  const cursor = new THREE.Mesh(new THREE.CircleGeometry(0.011, 16), cursorMat);
  cursor.rotation.x = -Math.PI / 2;
  cursor.position.y = -0.038;
  variant.add(cursor);

  // Mount: lower-center, tilted up slightly so the camera looks INTO it.
  variant.position.set(0, -0.34, -0.5);
  variant.rotation.set(0.45, 0, 0);

  variant.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = false;
      m.receiveShadow = false;
    }
  });

  variant.visible = false;
  return { group: variant, cursor, riffleDots, panRadius };
}

export function createPanView(): PanViewMeshes {
  const root = new THREE.Group();
  root.name = 'pan_view_root';
  const variants: Record<1 | 2 | 3, TierVariant> = {
    1: makePanVariant(1),
    2: makePanVariant(2),
    3: makePanVariant(3),
  };
  for (const v of Object.values(variants)) root.add(v.group);

  function update(viz: PanViz): void {
    // Show only the active tier's variant.
    for (const [k, v] of Object.entries(variants)) {
      v.group.visible = Number(k) === viz.tier;
    }
    const active = variants[viz.tier];
    // Cursor position — cursor.x / .z (since variant is rotated, the
    // pan's local "up" tilts; we move in its local XZ plane).
    active.cursor.position.x = viz.cursorX * active.panRadius * 0.92;
    active.cursor.position.z = viz.cursorY * active.panRadius * 0.92;

    // Riffle dots (T3) — fade in on riffle hits.
    if (active.riffleDots) {
      for (let i = 0; i < active.riffleDots.length; i++) {
        const dot = active.riffleDots[i]!;
        const mat = dot.material as THREE.MeshBasicMaterial;
        mat.opacity = i < viz.riffleHits ? 1.0 : 0.0;
      }
    }
  }

  function setVisible(v: boolean): void {
    root.visible = v;
    if (!v) {
      for (const variant of Object.values(variants)) variant.group.visible = false;
    }
  }

  setVisible(false);
  return { group: root, update, setVisible };
}
