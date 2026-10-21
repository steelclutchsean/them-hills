import type { ProspectingSnapshot } from '@/game/prospecting';
import type { MinigameViz } from '@/game/minigames/types';

// Playtest driver. Active only for `?smoke=1`. It is bundled in production
// (vite preview / CI) and inert otherwise. It drives the real prospect
// controller and the real sell path — it does not stub rewards.
//
// Pan is a hard 6s and collect is a hard 9s, so a full loop is ~25s of
// simulation time. The pilot teleports to the site and the assayer; the
// keyboard walk check in the Playwright suite covers locomotion separately,
// and the first half-second here also holds move-forward.

export interface SmokeDrive {
  move: { x: number; y: number } | null;
  interact: boolean;
  useTool: boolean;
  look: { dx: number; dy: number } | null;
}

export interface SmokeWorld {
  carryGrams: number;
  wallet: number;
  prospect: ProspectingSnapshot | null;
  vendorOpen: boolean;
  placeAt(x: number, y: number, z: number): void;
  groundY(x: number, z: number): number;
  site: { x: number; z: number } | null;
  vendor: { x: number; z: number };
}

export interface SmokeView {
  phase: string;
  loopComplete: boolean;
  error: string | null;
  peakCarryGrams: number;
}

const ZERO: SmokeDrive = { move: null, interact: false, useTool: false, look: null };
const LOOP_BUDGET_SEC = 50;

export interface ThemHillsProbe {
  ready: boolean;
  phase: string;
  position: { x: number; y: number; z: number };
  carryGrams: number;
  wallet: number;
  saveCount: number;
  loopComplete: boolean;
  error: string | null;
  frameLuma: number;
  drawCalls: number;
  triangles: number;
  frameMs: number;
  frameBudget: { frameMs: number; drawCalls: number; triangles: number };
  peakCarryGrams: number;
  graphics: string;
  mirrorMode?: number;
  mirrorHorizon?: number;
  saveVersion: number;
  panTier: number;
  claimCount: number;
  geologyMarks: number;
  sampleHoles: number;
  machineCount: number;
  activeViz: string | null;
  save: () => Promise<void>;
  /** A v4-shaped copy of the live save, for the migration smoke. */
  exportLegacyV4: () => unknown;
  /** Live price of the next tier, read from equipment config. */
  upgradeCost: (category: string) => number | null;
  buyUpgrade: (category: string) => boolean;
  stakeClaim: () => { ok: boolean; reason: string };
  prepareShowcase: () => { x: number; z: number };
  startMachine: (kind: string) => boolean;
  cancelProspect: () => void;
  lookAt: (x: number, z: number) => void;
  spawnJumper: () => boolean;
  /** Teleport to a named review camera. Returns false for an unknown name. */
  applyShot?: (name: string) => boolean;
  /** Art-review camera nudge. Yaw, pitch, arm. */
  framePose?: (yaw: number, pitch: number, arm: number) => void;
  /** Open a story card or a world-event preview for capture. */
  previewScene?: (who: string) => boolean;
  /** Walk the player into the north drift and use the interior eye camera. */
  enterDrift?: () => boolean;
  standInDrift?: (localZ: number) => boolean;
  driftLocalZ?: () => number;
  driftPhase?: () => string;
  driftClock?: () => number;
  /**
   * Last presented frame's near-black ratio, plus which of `need` are in the frustum.
   * A capture fails when `black` is above 0.9 or `missing` is not empty.
   */
  sceneView?: (need: string[]) => { black: number; present: string[]; missing: string[] };
  waterRise?: number;
  blackRatio?: number;
  /** True once the bucket line has swapped off the proxy heads. */
  crewReady?: () => boolean;
  scatterCount?: () => number;
  /** Live clip. `bind` is true only when an arm is back in the T-pose. */
  playerPose: { clip: string; bind: boolean };
}

declare global {
  interface Window {
    __themHills?: ThemHillsProbe;
  }
}

export function createSmokePilot(search = window.location.search): {
  active: boolean;
  drive(dt: number, world: SmokeWorld): SmokeDrive;
  view(): SmokeView;
} {
  const active = new URLSearchParams(search).get('smoke') === '1';
  let phase = active ? 'move' : 'idle';
  let phaseTime = 0;
  let total = 0;
  let error: string | null = null;
  let loopComplete = false;
  let peakCarryGrams = 0;
  let carryAtStart = -1;
  let walletAtStart = -1;
  let settle = 0;
  let lastNudge = 0;
  let confirmCooldown = 0;
  let digArmed = true;
  let beatArmed = true;
  let sawProspect = false;

  function fail(message: string): SmokeDrive {
    phase = 'error';
    error = message;
    console.error(`[smoke] ${message}`);
    return ZERO;
  }

  function stand(world: SmokeWorld, spot: { x: number; z: number }): void {
    world.placeAt(spot.x, world.groundY(spot.x, spot.z) + 1.5, spot.z);
  }

  function drive(dt: number, world: SmokeWorld): SmokeDrive {
    if (!active || error || loopComplete) return ZERO;
    total += dt;
    phaseTime += dt;
    if (world.carryGrams > peakCarryGrams) peakCarryGrams = world.carryGrams;
    if (walletAtStart < 0) walletAtStart = world.wallet;
    if (total > LOOP_BUDGET_SEC) return fail(`timed out in ${phase}`);

    if (phase === 'move') {
      if (phaseTime < 0.5) return { ...ZERO, move: { x: 0, y: -1 } };
      if (!world.site) return fail('no panning site');
      stand(world, world.site);
      phase = 'settle-site';
      phaseTime = 0;
      settle = 0;
      return ZERO;
    }

    if (phase === 'settle-site') {
      if (!world.site) return fail('no panning site');
      // Re-plant every step. The kinematic controller can slide the capsule
      // off the ring between the teleport and the interact probe.
      stand(world, world.site);
      settle += 1;
      if (settle >= 6) {
        phase = 'prospect';
        phaseTime = 0;
        lastNudge = 0;
        carryAtStart = world.carryGrams;
        return { ...ZERO, interact: true };
      }
      return ZERO;
    }

    if (phase === 'prospect') {
      const snap = world.prospect;
      if (!snap) {
        if (sawProspect && world.carryGrams > carryAtStart + 1e-4) {
          stand(world, world.vendor);
          phase = 'settle-vendor';
          phaseTime = 0;
          settle = 0;
          return ZERO;
        }
        if (!world.site) return fail('no panning site');
        stand(world, world.site);
        if (phaseTime > 3) return fail('prospect never started — not standing on a gold ring');
        if (phaseTime - lastNudge > 0.35) {
          lastNudge = phaseTime;
          return { ...ZERO, interact: true };
        }
        return ZERO;
      }
      sawProspect = true;
      return driveProspect(snap);
    }

    if (phase === 'settle-vendor') {
      stand(world, world.vendor);
      settle += 1;
      if (settle >= 6) {
        phase = 'sell';
        phaseTime = 0;
        lastNudge = 0;
        return { ...ZERO, interact: true };
      }
      return ZERO;
    }

    if (phase === 'sell') {
      stand(world, world.vendor);
      if (world.vendorOpen) {
        // The press that opened the counter is still logically down.
        // Release for a step so the sale is a fresh edge.
        phase = 'confirm-sale';
        phaseTime = 0;
        return ZERO;
      }
      if (phaseTime > 4) return fail('assayer did not open');
      if (phaseTime - lastNudge > 0.4) {
        lastNudge = phaseTime;
        return { ...ZERO, interact: true };
      }
      return ZERO;
    }

    if (phase === 'confirm-sale') {
      if (phaseTime > 0.05) {
        phase = 'sold';
        phaseTime = 0;
        return { ...ZERO, interact: true };
      }
      return ZERO;
    }

    if (phase === 'sold') {
      const earned = walletAtStart >= 0 && world.wallet > walletAtStart + 0.05;
      if (earned && world.carryGrams < 1e-4) {
        phase = 'done';
        loopComplete = true;
        console.log(
          `[smoke] loop complete — carry peaked ${peakCarryGrams.toFixed(3)}g, wallet $${world.wallet.toFixed(2)}`,
        );
        return ZERO;
      }
      if (phaseTime > 2) return fail('sale did not clear carry into the wallet');
      return ZERO;
    }

    return ZERO;
  }

  function driveProspect(snap: ProspectingSnapshot): SmokeDrive {
    if (confirmCooldown > 0) {
      confirmCooldown -= 1;
      return ZERO;
    }
    if (snap.awaitingConfirm) {
      confirmCooldown = 5;
      digArmed = true;
      beatArmed = true;
      return { ...ZERO, interact: true };
    }
    const viz = snap.viz;
    if (!viz) return ZERO;
    if (viz.kind === 'dig' || viz.kind === 'strike') return driveMeter(viz);
    if (viz.kind === 'classify') return driveBeat(viz);
    if (viz.kind === 'pan') return drivePan(viz);
    if (viz.kind === 'collect') return driveCollect(viz);
    if (viz.kind === 'extract') {
      if (phaseTime > 0.2) {
        phaseTime = 0;
        return { ...ZERO, interact: true };
      }
    }
    return ZERO;
  }

  function driveMeter(viz: Extract<MinigameViz, { kind: 'dig' | 'strike' }>): SmokeDrive {
    const distance = Math.abs(viz.indicator - viz.sweetCenter);
    if (distance > 0.28) digArmed = true;
    if (digArmed && distance < 0.04) {
      digArmed = false;
      return { ...ZERO, interact: true };
    }
    return ZERO;
  }

  function driveBeat(viz: Extract<MinigameViz, { kind: 'classify' }>): SmokeDrive {
    const p = viz.beatPhase;
    if (p < 0.28) beatArmed = true;
    // Snapshot is one sim step behind the tap, so aim just before the beat.
    if (beatArmed && p >= 0.42 && p <= 0.55) {
      beatArmed = false;
      return { ...ZERO, interact: true };
    }
    return ZERO;
  }

  function drivePan(viz: Extract<MinigameViz, { kind: 'pan' }>): SmokeDrive {
    const theta = Math.atan2(viz.cursorY, viz.cursorX) + 0.42;
    const tx = Math.cos(theta) * 0.58;
    const ty = Math.sin(theta) * 0.58;
    return {
      ...ZERO,
      look: { dx: (tx - viz.cursorX) / 2, dy: (ty - viz.cursorY) / 2 },
    };
  }

  function driveCollect(viz: Extract<MinigameViz, { kind: 'collect' }>): SmokeDrive {
    let best: { x: number; y: number; d: number } | null = null;
    for (const flake of viz.flakes) {
      if (flake.state !== 'present') continue;
      const d = Math.hypot(flake.x - viz.cursorX, flake.y - viz.cursorY);
      if (!best || d < best.d) best = { x: flake.x, y: flake.y, d };
    }
    if (!best) return ZERO;
    if (best.d < viz.suctionRadius * 0.75) {
      return { ...ZERO, useTool: true };
    }
    const step = Math.min(best.d, 0.2);
    const nx = viz.cursorX + ((best.x - viz.cursorX) / best.d) * step;
    const ny = viz.cursorY + ((best.y - viz.cursorY) / best.d) * step;
    const landed = Math.hypot(best.x - nx, best.y - ny) < viz.suctionRadius * 0.75;
    return {
      ...ZERO,
      useTool: landed,
      look: { dx: (nx - viz.cursorX) / 2, dy: (ny - viz.cursorY) / 2 },
    };
  }

  return {
    active,
    drive,
    view: () => ({ phase, loopComplete, error, peakCarryGrams }),
  };
}
