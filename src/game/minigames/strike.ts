import type { Minigame, MinigameUpdate, MinigameViz } from './types';

// Strike minigame — pickaxe swings at a rock face. Shares the
// timing-meter shape with dig.ts but tunes to a mining feel: bigger
// targets (you're swinging at rock, not gravel), more swings required
// at low tiers (rock is harder than gravel), and the pickaxe (Shovel
// T3) is the upgrade that flips the whole experience easy.
//
// Same scoring curve as dig: distance-from-center maps linearly through
// [2.0, 0.5] across 3 × sweetHalfWidth.

interface TierProfile {
  swings: number;
  sweetHalfWidth: number;
  isPickaxe: boolean;
}

const TIER_PROFILES: Record<1 | 2 | 3, TierProfile> = {
  1: { swings: 4, sweetHalfWidth: 0.1, isPickaxe: false }, // bare shovel — slow chip
  2: { swings: 3, sweetHalfWidth: 0.14, isPickaxe: false }, // full shovel — better
  3: { swings: 2, sweetHalfWidth: 0.16, isPickaxe: true }, // pickaxe — easy
};

const CYCLE_TIME = 1.4;
const SCORE_FLOOR = 0.5;
const SCORE_CENTER = 2.0;
const SCORE_DROP_PER_HALFWIDTH = 0.5;

export function createStrikeMinigame(): Minigame {
  let profile: TierProfile = TIER_PROFILES[1];
  let swingsDone = 0;
  let swingScores: number[] = [];
  let sessionTime = 0;
  let lastSwingAt = -999;
  let lastSwingScore = 0;

  function indicatorPosition(t: number): number {
    const phase = (t / CYCLE_TIME) % 2;
    return phase < 1 ? phase : 2 - phase;
  }

  function scoreSwing(distanceFromCenter: number): number {
    return Math.max(
      SCORE_FLOOR,
      SCORE_CENTER - SCORE_DROP_PER_HALFWIDTH * (distanceFromCenter / profile.sweetHalfWidth),
    );
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
    update({ dt, justPressedInteract, audio, effects }): MinigameUpdate {
      sessionTime += dt;
      const indicator = indicatorPosition(sessionTime);

      if (justPressedInteract && swingsDone < profile.swings) {
        const d = Math.abs(indicator - 0.5);
        const score = scoreSwing(d);
        swingScores.push(score);
        swingsDone += 1;
        lastSwingAt = sessionTime;
        lastSwingScore = score;
        const quality = (score - SCORE_FLOOR) / (SCORE_CENTER - SCORE_FLOOR);
        audio.playDigSwing(quality);
        // Rock-chip spark burst at the meter indicator. Mix of steel
        // grey + amber to read as cold metal struck hot. Heavier than
        // dig's gravel burst — rocks resist.
        const meterX = (indicator - 0.5) * 0.42;
        effects.burst({ x: meterX, y: 0.08, z: -0.55 }, 0xb0a890, 12);
        effects.burst({ x: meterX, y: 0.08, z: -0.55 }, 0xffb04a, 6);
        // Stronger shake than dig — rocks have weight.
        effects.shake(0.025 + quality * 0.025, 0.2);
      }

      const swingsRemaining = Math.max(0, profile.swings - swingsDone);
      const viz: MinigameViz = {
        kind: 'strike',
        indicator,
        sweetCenter: 0.5,
        sweetHalfWidth: profile.sweetHalfWidth,
        swingsRemaining,
        lastSwingFlashSec: sessionTime - lastSwingAt,
        lastSwingScore,
        isPickaxe: profile.isPickaxe,
      };

      const message = profile.isPickaxe
        ? `STRIKE the rock — ${swingsRemaining} swing${swingsRemaining === 1 ? '' : 's'} left`
        : `STRIKE the rock — slow with this tool, ${swingsRemaining} left`;
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
