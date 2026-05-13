import { createRng } from '../rng';
import type { CollectFlakeViz, Minigame, MinigameUpdate, MinigameViz } from './types';

// Collect minigame — pluck visible gold flakes out of the freshly-washed
// pan with a snuffer. The player moves a cursor with look input and
// holds INTERACT to suck nearby flakes into the snuffer's vials.
//
// Score = collected / total mapped to [floor, 2.0]:
//   collected / total = 0   → score 0.5  (or 0.7 floor on T3)
//   collected / total = 1   → score 2.0
//
// Time-boxed at 5 s; any flakes not collected when the timer runs out
// "wash away" (visualized as fading off). Soft-fail.
//
// Tier evolution (Snuffer category):
//   T1 (basic):  suction radius 0.06, suck time 0.3 s — must precisely
//                position cursor on each flake and hold INTERACT briefly.
//   T2 (glass + 3 vials):  radius 0.15, suck time 0.15 s — forgiving
//                cone-of-effect pulls nearby flakes; faster intake.
//   T3 (pro + scale): radius 0.15, suck time 0.12 s, AND all "fine"
//                flakes auto-collect on stage start (snap immediately
//                to collecting state). Only "pickers" need manual
//                pluck. Score floor 0.7 catches edge cases.

interface TierProfile {
  snufferTier: 1 | 2 | 3;
  suctionRadius: number;
  suckTimeSec: number;
  autoCollectFines: boolean;
  floorScore: number;
}

const TIER_PROFILES: Record<1 | 2 | 3, TierProfile> = {
  1: { snufferTier: 1, suctionRadius: 0.06, suckTimeSec: 0.3, autoCollectFines: false, floorScore: 0.5 },
  2: { snufferTier: 2, suctionRadius: 0.15, suckTimeSec: 0.15, autoCollectFines: false, floorScore: 0.5 },
  3: { snufferTier: 3, suctionRadius: 0.15, suckTimeSec: 0.12, autoCollectFines: true, floorScore: 0.7 },
};

const STAGE_DURATION_SEC = 5.0;
const TOTAL_FLAKES = 8;
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
      // collecting fade animation without requiring player input.
      if (profile.autoCollectFines) {
        for (const f of flakes) {
          if (f.isFine) {
            f.state = 'collecting';
            f.fadeT = 0;
          }
        }
      }
      sessionTime = 0;
      washInitiated = false;
    },
    update({ dt, axes, isUseToolDown, audio }): MinigameUpdate {
      // Collect uses USE_TOOL (LMB / RT) for the suction press instead of
      // INTERACT — see the action bindings in src/input/actions.ts.
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

      // Per-flake update.
      for (const f of flakes) {
        f.pulse = (f.pulse + dt * PULSE_HZ) % 1;
        if (f.state === 'collecting') {
          f.fadeT += dt / FADE_DURATION_SEC;
          if (f.fadeT >= 1) f.state = 'gone';
          continue;
        }
        if (f.state !== 'present') continue;

        // Suction: cursor within suction radius AND USE_TOOL held.
        if (isUseToolDown) {
          const d = Math.hypot(f.x - cx, f.y - cy);
          if (d < profile.suctionRadius) {
            const before = f.suckProgress;
            f.suckProgress = Math.min(1, f.suckProgress + dt / profile.suckTimeSec);
            if (before < 1 && f.suckProgress >= 1) {
              f.state = 'collecting';
              f.fadeT = 0;
              audio.playFlakeCollect();
            }
          } else {
            // Drift back toward 0 if cursor leaves — but don't reset
            // hard so it's still rewarding to re-acquire quickly.
            f.suckProgress = Math.max(0, f.suckProgress - dt * 1.5);
          }
        } else {
          f.suckProgress = Math.max(0, f.suckProgress - dt * 1.5);
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
        ? `HOLD to pluck pickers — ${collected}/${flakes.length} — ${timeRemaining.toFixed(1)}s`
        : `HOLD to pluck flakes — ${collected}/${flakes.length} — ${timeRemaining.toFixed(1)}s`;
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
