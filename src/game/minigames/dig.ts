import type { Minigame, MinigameUpdate, MinigameViz, StageOptions } from './types';

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
const TUTORIAL_CYCLE = 1.8;
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
  let tutorial = false;
  let drift = 0;
  let cycle = CYCLE_TIME;

  function indicatorPosition(t: number): number {
    // Ping-pong 0 → 1 → 0 → 1 → ...
    const phase = (t / cycle) % 2;
    return phase < 1 ? phase : 2 - phase;
  }

  function sweetCenter(): number {
    if (drift <= 0) return 0.5;
    return 0.5 + Math.sin(sessionTime * 1.15) * drift;
  }

  function scoreSwing(distanceFromCenter: number): number {
    const base = Math.max(
      SCORE_FLOOR,
      SCORE_CENTER - SCORE_DROP_PER_HALFWIDTH * (distanceFromCenter / profile.sweetHalfWidth),
    );
    if (profile.isPickaxe && distanceFromCenter < profile.sweetHalfWidth * PICKAXE_CRIT_FRACTION) {
      return Math.min(PICKAXE_SCORE_CAP, base * PICKAXE_CRIT_MULTIPLIER);
    }
    return base;
  }

  return {
    start(toolTier: number, options?: StageOptions) {
      const t = Math.max(1, Math.min(3, Math.floor(toolTier))) as 1 | 2 | 3;
      tutorial = options?.tutorial === true;
      if (tutorial) {
        profile = { swings: 1, sweetHalfWidth: 0.18, isPickaxe: false };
        drift = 0;
        cycle = TUTORIAL_CYCLE;
      } else if (options?.asPick) {
        profile = { swings: 1, sweetHalfWidth: 0.1, isPickaxe: true };
        drift = 0.05;
        cycle = 1.35;
      } else {
        profile = TIER_PROFILES[t];
        drift = t === 1 ? 0.1 : 0.06;
        cycle = CYCLE_TIME;
      }
      swingsDone = 0;
      swingScores = [];
      sessionTime = 0;
      lastSwingAt = -999;
      lastSwingScore = 0;
    },
    update({ dt, justPressedInteract, audio, effects }): MinigameUpdate {
      sessionTime += dt;
      const indicator = indicatorPosition(sessionTime);
      const sweet = sweetCenter();

      if (justPressedInteract && swingsDone < profile.swings) {
        const d = Math.abs(indicator - sweet);
        const score = scoreSwing(d);
        swingScores.push(score);
        swingsDone += 1;
        lastSwingAt = sessionTime;
        lastSwingScore = score;
        // Quality from [SCORE_FLOOR, SCORE_CENTER] mapped to [0, 1] —
        // bad swings thud, perfect swings get the sharp upper harmonic.
        const quality = (score - SCORE_FLOOR) / (SCORE_CENTER - SCORE_FLOOR);
        audio.playDigSwing(quality);
        // Spark burst at the meter's indicator position (camera-local
        // ~upper-center where dig-meter mounts). Color is amber, more
        // particles + longer life on better hits.
        const meterX = (indicator - 0.5) * 0.36;
        effects.burst(
          { x: meterX, y: 0.08, z: -0.55 },
          0xc4a06a,
          Math.round(8 + quality * 12),
          'dirt',
        );
        // Subtle screen shake — proportional to how good the swing was.
        if (quality > 0.3) {
          effects.shake(0.012 + quality * 0.018, 0.16);
        }
      }

      const swingsRemaining = Math.max(0, profile.swings - swingsDone);
      const viz: MinigameViz = {
        kind: 'dig',
        indicator,
        sweetCenter: sweet,
        sweetHalfWidth: profile.sweetHalfWidth,
        swingsRemaining,
        lastSwingFlashSec: sessionTime - lastSwingAt,
        lastSwingScore,
        isPickaxe: profile.isPickaxe,
      };

      const message = tutorial
        ? 'TAP the center — one swing to break the gravel'
        : profile.isPickaxe
          ? 'TAP the moving pocket — a centered strike opens a seam'
          : `The gravel pocket is moving — TAP it — ${swingsRemaining} swing${swingsRemaining === 1 ? '' : 's'}`;
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
