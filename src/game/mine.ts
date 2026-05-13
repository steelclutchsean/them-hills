import * as THREE from 'three';
import { RAPIER } from '@/physics/world';
import type { PanningSite } from './stream';

// Mine — wooden timber archway with a hidden interior cavern. While locked
// (the player has no pickaxe, i.e. shovel < T3) the entrance is boarded up
// and a physics gate blocks the doorway, but the cavern is visible through
// the gaps so the player knows there's something behind. Once shovel T3 is
// purchased, the boards disappear and the gate collider is removed; the
// player walks through into a cave with one rich panning site.
//
// The cave's panning site uses the same PanningSite shape as stream sites,
// so the prospect proximity probe can pick it up alongside stream sites
// without knowing about mines specifically.

const MINE_INTERACT_RADIUS = 2.4;
const CAVE_SITE_INTERACT_RADIUS = 1.5;

/** Default yield multiplier applied to prospects done at a cave site —
 *  overridden per-mine via MineConfig.yieldBonus. Kept exported so older
 *  callers don't break. */
export const CAVE_YIELD_BONUS = 3.0;

export interface MineConfig {
  /** Stable identifier — used in site IDs and the unlock-state map. */
  id: string;
  /** Player-facing label, baked onto the entrance sign. */
  displayName: string;
  /** World X/Z of the archway. Y is sampled from the terrain. */
  x: number;
  z: number;
  /** Multiplier applied to the cave site's prospect yield. */
  yieldBonus: number;
  /** Shovel tier required to break through the boards (1–3). */
  unlockTier: number;
}

export interface MineInfo {
  id: string;
  group: THREE.Group;
  position: THREE.Vector3;
  marker: THREE.Mesh;
  isPlayerNear(playerPos: THREE.Vector3): boolean;
  update(time: number, focused: boolean): void;
  /**
   * True if the player has the gear required to unlock the mine. Phase 10a
   * declared this; Phase 10b actually consumes it via tryUnlock().
   */
  isUnlocked(shovelTier: number): boolean;
  /**
   * Attempt to unlock the mine based on the player's current shovel tier.
   * Returns true on the first successful unlock transition (so the caller
   * can play a one-shot effect / log a discovery), false if already
   * unlocked or still locked.
   */
  tryUnlock(shovelTier: number): boolean;
  /** Currently unlocked? Reflects the most recent tryUnlock outcome. */
  isOpen(): boolean;
  /** Cave panning site — shape-compatible with stream sites for the proximity probe. */
  findNearestSite(playerPos: THREE.Vector3): { site: PanningSite; distance: number } | null;
  /**
   * True if the player is currently inside the cave interior. Gated on unlock
   * — locked mines never report "inside" even if the player somehow clips in.
   * Used to override ambient light and force the headlamp on.
   */
  isPlayerInside(playerPos: THREE.Vector3): boolean;
}

export function createMineEntrance(
  scene: THREE.Scene,
  world: RAPIER.World,
  getGroundY: (x: number, z: number) => number,
  config: MineConfig,
): MineInfo {
  const position = new THREE.Vector3(config.x, getGroundY(config.x, config.z), config.z);

  const group = new THREE.Group();
  group.name = `mine_${config.id}`;
  group.position.copy(position);

  const beamMat = new THREE.MeshStandardMaterial({
    color: 0x3a2618,
    flatShading: true,
    roughness: 0.95,
  });
  const aged = new THREE.MeshStandardMaterial({
    color: 0x2a1808,
    flatShading: true,
    roughness: 0.97,
  });

  // ---- Archway (always visible) ----
  const postGeom = new THREE.CylinderGeometry(0.18, 0.22, 2.6, 8);
  const postL = new THREE.Mesh(postGeom, beamMat);
  postL.position.set(-0.95, 1.3, 0);
  postL.castShadow = true;
  group.add(postL);
  const postR = postL.clone();
  postR.position.x = 0.95;
  group.add(postR);

  const topBeam = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 0.3), beamMat);
  topBeam.position.set(0, 2.5, 0);
  topBeam.castShadow = true;
  group.add(topBeam);

  const plank = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 0.18), aged);
  plank.position.set(0, 2.85, 0);
  plank.rotation.z = -0.06;
  plank.castShadow = true;
  group.add(plank);

  const signTex = makeMineSign(config.displayName.toUpperCase());
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex,
    color: 0xffffff,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.36), signMat);
  sign.position.set(0, 2.5, 0.22);
  group.add(sign);

  // ---- Boards across the doorway (hidden once unlocked) ----
  const boardGroup = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 0.06), aged);
    board.position.set(0, 0.4 + i * 0.55, 0.25);
    board.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.04;
    board.castShadow = true;
    boardGroup.add(board);
  }
  group.add(boardGroup);

  // ---- Cave interior (always visible through the gaps in the boards) ----
  // Coordinates relative to the group; positive Z is "into the hill".
  const CAVE_DEPTH = 7; // along Z, into the hill
  const CAVE_HALF_WIDTH = 3.5; // along X
  const CAVE_FLOOR_Y = -0.4;
  const CAVE_CEIL_Y = 2.4;
  const CAVE_BACK_Z = -CAVE_DEPTH; // far wall
  const CAVE_FRONT_Z = -0.05; // just behind the boarded entrance

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x35332f,
    flatShading: true,
    roughness: 0.97,
  });
  const stoneDarkMat = new THREE.MeshStandardMaterial({
    color: 0x222220,
    flatShading: true,
    roughness: 0.98,
  });

  // Floor
  const caveFloor = new THREE.Mesh(
    new THREE.BoxGeometry(CAVE_HALF_WIDTH * 2, 0.3, CAVE_DEPTH),
    stoneMat,
  );
  caveFloor.position.set(0, CAVE_FLOOR_Y - 0.15, CAVE_FRONT_Z - CAVE_DEPTH / 2);
  caveFloor.receiveShadow = true;
  group.add(caveFloor);

  // Ceiling
  const caveCeil = new THREE.Mesh(
    new THREE.BoxGeometry(CAVE_HALF_WIDTH * 2 + 0.4, 0.3, CAVE_DEPTH),
    stoneDarkMat,
  );
  caveCeil.position.set(0, CAVE_CEIL_Y + 0.15, CAVE_FRONT_Z - CAVE_DEPTH / 2);
  group.add(caveCeil);

  // Back wall
  const caveBack = new THREE.Mesh(
    new THREE.BoxGeometry(CAVE_HALF_WIDTH * 2 + 0.4, CAVE_CEIL_Y - CAVE_FLOOR_Y, 0.3),
    stoneDarkMat,
  );
  caveBack.position.set(0, (CAVE_CEIL_Y + CAVE_FLOOR_Y) / 2, CAVE_BACK_Z - 0.15);
  group.add(caveBack);

  // Side walls
  const sideGeom = new THREE.BoxGeometry(0.3, CAVE_CEIL_Y - CAVE_FLOOR_Y, CAVE_DEPTH);
  const caveLeft = new THREE.Mesh(sideGeom, stoneDarkMat);
  caveLeft.position.set(
    -CAVE_HALF_WIDTH - 0.15,
    (CAVE_CEIL_Y + CAVE_FLOOR_Y) / 2,
    CAVE_FRONT_Z - CAVE_DEPTH / 2,
  );
  group.add(caveLeft);
  const caveRight = new THREE.Mesh(sideGeom, stoneDarkMat);
  caveRight.position.set(
    CAVE_HALF_WIDTH + 0.15,
    (CAVE_CEIL_Y + CAVE_FLOOR_Y) / 2,
    CAVE_FRONT_Z - CAVE_DEPTH / 2,
  );
  group.add(caveRight);

  // Subtle warm "ore vein" glow at the back to give the player something to walk toward.
  const veinMat = new THREE.MeshStandardMaterial({
    color: 0xc89b3b,
    emissive: 0xa07020,
    emissiveIntensity: 0.6,
    roughness: 0.4,
    flatShading: true,
  });
  const vein = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), veinMat);
  vein.position.set(0, 1.0, CAVE_BACK_Z + 0.4);
  group.add(vein);

  // ---- Cave panning site (at cave center) ----
  const ringGeom = new THREE.TorusGeometry(0.45, 0.05, 6, 24);
  ringGeom.rotateX(-Math.PI / 2);
  const caveSiteMat = new THREE.MeshStandardMaterial({
    color: 0xe8c060,
    emissive: 0x553311,
    emissiveIntensity: 0.5,
    roughness: 0.5,
    flatShading: true,
  });
  const caveSiteMarker = new THREE.Mesh(ringGeom, caveSiteMat);
  caveSiteMarker.position.set(0, CAVE_FLOOR_Y + 0.04, CAVE_FRONT_Z - CAVE_DEPTH * 0.6);
  group.add(caveSiteMarker);

  // World-space position for the proximity probe
  const caveSiteWorldPos = new THREE.Vector3(
    position.x + caveSiteMarker.position.x,
    position.y + caveSiteMarker.position.y,
    position.z + caveSiteMarker.position.z,
  );
  const caveSite: PanningSite & { bonusYield: number } = {
    id: `mine_${config.id}_cave`,
    position: caveSiteWorldPos,
    marker: caveSiteMarker,
    streamId: `mine_${config.id}`,
    streamYaw: 0,
    bonusYield: config.yieldBonus,
  };

  // ---- Halo on the ground in front of the entrance ----
  const haloGeom = new THREE.TorusGeometry(0.6, 0.04, 6, 24);
  haloGeom.rotateX(-Math.PI / 2);
  const haloMat = new THREE.MeshStandardMaterial({
    color: 0x886644,
    emissive: 0x442211,
    emissiveIntensity: 0.4,
    roughness: 0.5,
    flatShading: true,
  });
  const marker = new THREE.Mesh(haloGeom, haloMat);
  marker.position.set(0, 0.04, 1.2);
  group.add(marker);

  scene.add(group);

  // ---- Physics colliders ----
  // Front gate: blocks the doorway while locked. Removed on unlock.
  // Back, left, right walls: always present so the player can't walk through
  //   the cave geometry once inside.
  // Floor of the cave: not added — the terrain heightfield provides a
  //   serviceable floor at the cave entrance, and inside the cave the
  //   player rests on the visual floor mesh (no collider, but practical).
  //   For v0, this is acceptable; if the player walks past the back wall
  //   the heightfield still catches them.
  function addStaticBox(
    centerX: number,
    centerY: number,
    centerZ: number,
    halfX: number,
    halfY: number,
    halfZ: number,
  ): RAPIER.Collider {
    const desc = RAPIER.ColliderDesc.cuboid(halfX, halfY, halfZ).setTranslation(
      centerX,
      centerY,
      centerZ,
    );
    return world.createCollider(desc);
  }

  const gateCenter = position.clone().add(new THREE.Vector3(0, 1.3, 0.25));
  const gateCollider = addStaticBox(gateCenter.x, gateCenter.y, gateCenter.z, 0.95, 1.3, 0.1);

  // Back wall
  addStaticBox(
    position.x,
    position.y + (CAVE_CEIL_Y + CAVE_FLOOR_Y) / 2,
    position.z + CAVE_BACK_Z - 0.15,
    CAVE_HALF_WIDTH + 0.2,
    (CAVE_CEIL_Y - CAVE_FLOOR_Y) / 2,
    0.15,
  );
  // Left wall
  addStaticBox(
    position.x - CAVE_HALF_WIDTH - 0.15,
    position.y + (CAVE_CEIL_Y + CAVE_FLOOR_Y) / 2,
    position.z + CAVE_FRONT_Z - CAVE_DEPTH / 2,
    0.15,
    (CAVE_CEIL_Y - CAVE_FLOOR_Y) / 2,
    CAVE_DEPTH / 2,
  );
  // Right wall
  addStaticBox(
    position.x + CAVE_HALF_WIDTH + 0.15,
    position.y + (CAVE_CEIL_Y + CAVE_FLOOR_Y) / 2,
    position.z + CAVE_FRONT_Z - CAVE_DEPTH / 2,
    0.15,
    (CAVE_CEIL_Y - CAVE_FLOOR_Y) / 2,
    CAVE_DEPTH / 2,
  );

  let unlocked = false;

  return {
    id: `mine_${config.id}`,
    group,
    position: position.clone(),
    marker,
    isPlayerNear(playerPos) {
      const dx = playerPos.x - position.x;
      const dz = playerPos.z - position.z;
      return Math.hypot(dx, dz) < MINE_INTERACT_RADIUS;
    },
    update(_time, focused) {
      const ringMatRef = marker.material as THREE.MeshStandardMaterial;
      const targetEmissive = focused ? 1.2 : 0.4;
      ringMatRef.emissiveIntensity += (targetEmissive - ringMatRef.emissiveIntensity) * 0.15;

      // Pulse the cave site marker if player is nearby
      const caveMatRef = caveSiteMarker.material as THREE.MeshStandardMaterial;
      caveMatRef.emissiveIntensity = 0.5 + 0.25 * Math.sin(_time * 2.5);
    },
    isUnlocked(shovelTier) {
      return shovelTier >= config.unlockTier;
    },
    tryUnlock(shovelTier) {
      if (unlocked) return false;
      if (shovelTier < config.unlockTier) return false;
      unlocked = true;
      // Hide boards
      boardGroup.visible = false;
      // Remove front-gate collider so the player can pass through
      world.removeCollider(gateCollider, false);
      return true;
    },
    isOpen() {
      return unlocked;
    },
    findNearestSite(playerPos) {
      if (!unlocked) return null;
      const dx = caveSite.position.x - playerPos.x;
      const dz = caveSite.position.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d < CAVE_SITE_INTERACT_RADIUS) {
        return { site: caveSite, distance: d };
      }
      return null;
    },
    isPlayerInside(playerPos) {
      if (!unlocked) return false;
      // AABB test in world space. Cave geometry is positioned relative to the
      // mine origin; convert player coords into local cave space.
      const localX = playerPos.x - position.x;
      const localY = playerPos.y - position.y;
      const localZ = playerPos.z - position.z;
      return (
        Math.abs(localX) < CAVE_HALF_WIDTH &&
        localY > CAVE_FLOOR_Y &&
        localY < CAVE_CEIL_Y &&
        localZ < CAVE_FRONT_Z &&
        localZ > CAVE_BACK_Z
      );
    },
  };
}

function makeMineSign(label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 144;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[mine] canvas context unavailable');

  ctx.fillStyle = '#3a2412';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#2a1808';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (i * canvas.height) / 8 + 6);
    ctx.lineTo(canvas.width, (i * canvas.height) / 8 + 12);
    ctx.stroke();
  }

  ctx.fillStyle = '#d8b878';
  ctx.font = 'bold 64px "Times New Roman", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
