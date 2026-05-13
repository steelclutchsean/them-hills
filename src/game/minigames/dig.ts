import type { Minigame, MinigameUpdate, MinigameViz } from './types';

// Dig minigame — timing-meter swing. An indicator oscillates left/right
// across a horizontal bar. When the player taps INTERACT, score the
// indicator's distance from the center of the "sweet zone":
//
//   distance = 0                      → score 2.0  (perfect hit)
//   distance = sweetHalfWidth         → score 1.5  (just inside zone)
//   distance = 2 × sweetHalfWidth     → score 1.0  (outside but close)
//   distance ≥ 3 × sweetHalfWidth     → score 0.5  (floor — soft fail)
//
// The stage completes after the tier-appropriate number of swings; final
// stage score is the arithmetic mean of swing scores.
//
// Tier evolution (Shovel category):
//   T1 (folding spade): 3 swings, sweet zone half-width 0.09  (~18% of bar)
//   T2 (full shovel):   2 swings, sweet zone half-width 0.14  (~28% of bar)
//   T3 (pickaxe):       1 swing,  sweet zone half-width 0.07  (~14% of bar),
//                       but a near-center crit (within 30% of half-width)
//                       reveals a "bonus seam" and ×1.25's the swing score
//                       (cap 2.5). Visual: tool model swaps to pickaxe.

interface TierProfile {
  swings: number;
  sweetHalfWidth: number;
  isPickaxe: boolean;
}

const TIER_PROFILES: Record<1 | 2 | 3, TierProfile> = {
  1: { swings: 3, sweetHalfWidth: 0.09, isPickaxe: false },
  2: { swings: 2, sweetHalfWidth: 0.14, isPickaxe: false },
  3: { swings: 1, sweetHalfWidth: 0.07, isPickaxe: true },
};

// Full back-and-forth cycle in seconds. Shorter = faster + harder.
const CYCLE_TIME = 1.5;
const SCORE_FLOOR = 0.5;
const SCORE_CENTER = 2.0;
const SCORE_DROP_PER_HALFWIDTH = 0.5;
const PICKAXE_CRIT_FRACTION = 0.3;
const PICKAXE_CRIT_MULTIPLIER = 1.25;
const PICKAXE_SCORE_CAP = 2.5;

export function createDigMinigame(): Minigame {
  let profile: TierProfile = TIER_PROFILES[1];
  let swingsDone = 0;
  let swingScores: number[] = [];
  let sessionTime = 0;
  let lastSwingAt = -999;
  let lastSwingScore = 0;

  function indicatorPosition(t: number): number {
    // Ping-pong 0 → 1 → 0 → 1 → ...
    const phase = (t / CYCLE_TIME) % 2;
    return phase < 1 ? phase : 2 - phase;
  }

  function scoreSwing(distanceFromCenter: number): number {
    const base = Math.max(
      SCORE_FLOOR,
      SCORE_CENTER - SCORE_DROP_PER_HALFWIDTH * (distanceFromCenter / profile.sweetHalfWidth),
    );
    if (
      profile.isPickaxe &&
      distanceFromCenter < profile.sweetHalfWidth * PICKAXE_CRIT_FRACTION
    ) {
      return Math.min(PICKAXE_SCORE_CAP, base * PICKAXE_CRIT_MULTIPLIER);
    }
    return base;
  }

  return {
    start(toolTier: number) {
      const t = Math.max(1, Math.min(3, Math.floor(toolTier))) as 1 | 2 | 3;
      profile = TIER_PROFILES[t];
      swingsDone = 0;
      swingScores = [];
      sessionTime = 0;
      lastSwingAt = -999;
      lastSwingScore = 0;
    },
    update({ dt, justPressedInteract, audio }): MinigameUpdate {
      sessionTime += dt;
      const indicator = indicatorPosition(sessionTime);

      if (justPressedInteract && swingsDone < profile.swings) {
        const d = Math.abs(indicator - 0.5);
        const score = scoreSwing(d);
        swingScores.push(score);
        swingsDone += 1;
        lastSwingAt = sessionTime;
        lastSwingScore = score;
        // Quality from [SCORE_FLOOR, SCORE_CENTER] mapped to [0, 1] —
        // bad swings thud, perfect swings get the sharp upper harmonic.
        audio.playDigSwing((score - SCORE_FLOOR) / (SCORE_CENTER - SCORE_FLOOR));
      }

      const swingsRemaining = Math.max(0, profile.swings - swingsDone);
      const viz: MinigameViz = {
        kind: 'dig',
        indicator,
        sweetCenter: 0.5,
        sweetHalfWidth: profile.sweetHalfWidth,
        swingsRemaining,
        lastSwingFlashSec: sessionTime - lastSwingAt,
        lastSwingScore,
        isPickaxe: profile.isPickaxe,
      };

      const message = profile.isPickaxe
        ? 'TAP at the center — pickaxe crit for bonus seam'
        : `TAP at the center — ${swingsRemaining} swing${swingsRemaining === 1 ? '' : 's'} left`;
      const reported = {
        progress: swingsDone / profile.swings,
        message,
        panTapsRemaining: 0,
        viz,
      };

      if (swingsDone >= profile.swings) {
        const avg = swingScores.reduce((a, b) => a + b, 0) / swingScores.length;
        return { kind: 'complete', score: avg, progress: reported };
      }
      return { kind: 'in_progress', progress: reported };
    },
  };
}
