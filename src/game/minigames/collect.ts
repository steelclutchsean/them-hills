import { createRng } from '../rng';
import type { CollectFlakeViz, Minigame, MinigameUpdate, MinigameViz } from './types';

// Collect minigame — pluck visible gold flakes out of the freshly-washed
// pan with a snuffer. The player moves a cursor with look input and
// clicks USE_TOOL on a flake to suck it instantly into the snuffer.
// No hold required — one click per flake.
//
// Score = collected / total mapped to [floor, 2.0]:
//   collected / total = 0   → score 0.5  (or 0.7 floor on T3)
//   collected / total = 1   → score 2.0
//
// Time-boxed at 9 s; any flakes not collected when the timer runs out
// "wash away" (visualized as fading off). Soft-fail.
//
// Tier evolution (Snuffer category) — the click is instant either way;
// tier only widens the click hit-radius and lifts the score floor:
//   T1 (basic):  suction radius 0.08 — precise click required.
//   T2 (glass + 3 vials):  radius 0.16 — forgiving click target.
//   T3 (pro + scale): radius 0.16, AND all "fine" flakes auto-collect
//                on stage start (snap immediately to collecting state).
//                Only "pickers" need manual pluck. Score floor 0.7.

interface TierProfile {
  snufferTier: 1 | 2 | 3;
  suctionRadius: number;
  autoCollectFines: boolean;
  floorScore: number;
}

const TIER_PROFILES: Record<1 | 2 | 3, TierProfile> = {
  1: { snufferTier: 1, suctionRadius: 0.08, autoCollectFines: false, floorScore: 0.5 },
  2: { snufferTier: 2, suctionRadius: 0.16, autoCollectFines: false, floorScore: 0.5 },
  3: { snufferTier: 3, suctionRadius: 0.16, autoCollectFines: true, floorScore: 0.7 },
};

const STAGE_DURATION_SEC = 9.0;
const TOTAL_FLAKES = 11;
const FINE_RATIO = 0.6;
// `axes.dx/dy` are per-frame deltas from input.getLookDelta — do NOT
// multiply by dt below. See the same note in pan.ts.
const CURSOR_SENSITIVITY = 2.0;
const FADE_DURATION_SEC = 0.3;
const PULSE_HZ = 1.5;
const WASH_AWAY_LEAD_TIME = 0.5;

const SCORE_FLOOR = 0.5;
const SCORE_RANGE = 1.5;
const SCORE_MAX = 2.0;

interface InternalFlake {
  id: number;
  x: number;
  y: number;
  isFine: boolean;
  pulse: number;
  state: 'present' | 'collecting' | 'gone';
  /** Held at 1.0 once collected (for the renderer's pop-up visual) or
   *  at 0.0 when washed away. With the click-to-pluck mechanic the
   *  progress is now binary — no in-between hold ramp. */
  suckProgress: number;
  fadeT: number;
}

export function createCollectMinigame(): Minigame {
  let profile: TierProfile = TIER_PROFILES[1];
  let cx = 0;
  let cy = 0;
  let flakes: InternalFlake[] = [];
  let sessionTime = 0;
  let washInitiated = false;

  function spawnFlakes(seed: number): void {
    const rng = createRng(seed);
    flakes = [];
    for (let i = 0; i < TOTAL_FLAKES; i++) {
      const angle = rng.next() * Math.PI * 2;
      // Square-root keeps the distribution uniform across the disc area
      // (otherwise flakes cluster near the center).
      const r = Math.sqrt(rng.next()) * 0.88;
      flakes.push({
        id: i,
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        isFine: rng.next() < FINE_RATIO,
        pulse: rng.next(),
        state: 'present',
        suckProgress: 0,
        fadeT: 0,
      });
    }
  }

  function vizForFlakes(): CollectFlakeViz[] {
    return flakes.map((f) => ({
      id: f.id,
      x: f.x,
      y: f.y,
      isFine: f.isFine,
      pulse: f.pulse,
      state: f.state,
      suckProgress: f.suckProgress,
    }));
  }

  return {
    start(toolTier: number) {
      const t = Math.max(1, Math.min(3, Math.floor(toolTier))) as 1 | 2 | 3;
      profile = TIER_PROFILES[t];
      cx = 0;
      cy = 0;
      spawnFlakes(Date.now() & 0xffffffff);
      // T3: auto-collect fines on entry — kick them straight into the
      // collecting state (suckProgress=1 so they count toward the
      // final score) without requiring player input.
      if (profile.autoCollectFines) {
        for (const f of flakes) {
          if (f.isFine) {
            f.state = 'collecting';
            f.suckProgress = 1;
            f.fadeT = 0;
          }
        }
      }
      sessionTime = 0;
      washInitiated = false;
    },
    update({ dt, axes, isUseToolDown, justPressedUseTool, audio, effects }): MinigameUpdate {
      // Collect uses USE_TOOL (LMB / RT) for the click — see the action
      // bindings in src/input/actions.ts. As of B2, it's a single
      // just-pressed click per flake (no hold).
      sessionTime += dt;

      // Cursor moves with look input — same scheme as the pan stage.
      // axes.dx/dy are per-frame deltas; DO NOT multiply by dt.
      cx += axes.dx * CURSOR_SENSITIVITY;
      cy += axes.dy * CURSOR_SENSITIVITY;
      const r0 = Math.sqrt(cx * cx + cy * cy);
      if (r0 > 1) {
        cx /= r0;
        cy /= r0;
      }

      // Per-flake animation update (pulse + fade-out for already-
      // collecting flakes). State transitions handled in the click
      // branch below.
      for (const f of flakes) {
        f.pulse = (f.pulse + dt * PULSE_HZ) % 1;
        if (f.state === 'collecting') {
          f.fadeT += dt / FADE_DURATION_SEC;
          if (f.fadeT >= 1) f.state = 'gone';
        }
      }

      // Click-to-pluck: on a fresh USE_TOOL just-press, find the
      // closest present flake inside suctionRadius and collect it
      // instantly. One click → one flake.
      if (justPressedUseTool) {
        let best: { f: InternalFlake; d: number } | null = null;
        for (const f of flakes) {
          if (f.state !== 'present') continue;
          const d = Math.hypot(f.x - cx, f.y - cy);
          if (d < profile.suctionRadius && (best === null || d < best.d)) {
            best = { f, d };
          }
        }
        if (best) {
          best.f.state = 'collecting';
          best.f.suckProgress = 1;
          best.f.fadeT = 0;
          audio.playFlakeCollect();
          // Gold sparkle burst at the flake's position. The pan is
          // mounted at (0, -0.34, -0.5) and tilted; approximate the
          // flake's screen-space position via cursor-space mapping.
          const PAN_RADIUS_VIZ = 0.2;
          effects.burst(
            {
              x: best.f.x * PAN_RADIUS_VIZ * 0.9,
              y: -0.32,
              z: -0.5 + best.f.y * PAN_RADIUS_VIZ * 0.3,
            },
            0xffe26a,
            10,
          );
          effects.shake(0.006, 0.08);
        }
      }

      // When the timer winds down, wash away any remaining "present" flakes.
      if (!washInitiated && sessionTime >= STAGE_DURATION_SEC - WASH_AWAY_LEAD_TIME) {
        for (const f of flakes) {
          if (f.state === 'present') {
            f.state = 'collecting'; // reuse the fade-out animation visually
            f.fadeT = 0;
            // mark suckProgress as 0 so renderer can color "washed" differently
          }
        }
        washInitiated = true;
      }

      const collected = flakes.filter(
        (f) => f.state !== 'present' && f.suckProgress >= 1,
      ).length;
      // For the "washed away" flakes (state=collecting but suckProgress<1)
      // we exclude them from the collected count — they don't score.
      const timeRemaining = Math.max(0, STAGE_DURATION_SEC - sessionTime);

      const viz: MinigameViz = {
        kind: 'collect',
        cursorX: cx,
        cursorY: cy,
        flakes: vizForFlakes(),
        snufferTier: profile.snufferTier,
        suctionRadius: profile.suctionRadius,
        suctionActive: isUseToolDown,
        flakesCollected: collected,
        flakesTotal: flakes.length,
        timeRemaining,
      };

      const message = profile.autoCollectFines
        ? `CLICK pickers — ${collected}/${flakes.length} — ${timeRemaining.toFixed(1)}s`
        : `CLICK flakes — ${collected}/${flakes.length} — ${timeRemaining.toFixed(1)}s`;
      const reported = {
        progress: Math.min(1, sessionTime / STAGE_DURATION_SEC),
        message,
        panTapsRemaining: 0,
        viz,
      };

      if (sessionTime >= STAGE_DURATION_SEC) {
        const ratio = collected / Math.max(1, flakes.length);
        const score = Math.max(
          profile.floorScore,
          Math.min(SCORE_MAX, SCORE_FLOOR + SCORE_RANGE * ratio),
        );
        return { kind: 'complete', score, progress: reported };
      }
      return { kind: 'in_progress', progress: reported };
    },
  };
}
