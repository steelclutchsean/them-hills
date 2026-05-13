import type { Minigame, MinigameUpdate, MinigameViz } from './types';

// Extract minigame — rapid-tap chip-out of the vein chunk you exposed in
// the strike stage. Tap INTERACT to fill a progress meter; idle decays
// the meter slowly so you can't just camp. Stage completes when the
// meter hits 1.0.
//
// Score = function of tap efficiency. A clean run with no decay-loss
// scores ~2.0; a sloppy run with frequent decay catches scores closer
// to 0.5. Specifically: score = max(0.5, 2.0 - tapsTaken / tapsBudget),
// where tapsBudget = tapsTarget × 1.5 (50% slack for novice players).
//
// Tier evolution (Detector category — better detector finds the vein
// faster + cleaner):
//   T1 (basic detector):    14 taps target, slow decay  → tight
//   T2 (mid PI):            10 taps target, slow decay  → comfortable
//   T3 (pro PI + pinpoint):  6 taps target, slower decay → quick

interface TierProfile {
  tapsTarget: number;
  decayPerSec: number;
}

const TIER_PROFILES: Record<1 | 2 | 3, TierProfile> = {
  1: { tapsTarget: 14, decayPerSec: 0.18 },
  2: { tapsTarget: 10, decayPerSec: 0.15 },
  3: { tapsTarget: 6, decayPerSec: 0.1 },
};

const SCORE_FLOOR = 0.5;
const SCORE_CENTER = 2.0;
const TAPS_SLACK = 1.5; // tap budget = target × slack

export function createExtractMinigame(): Minigame {
  let profile: TierProfile = TIER_PROFILES[1];
  let detectorTier: 1 | 2 | 3 = 1;
  let progress = 0;
  let tapsTaken = 0;
  let sessionTime = 0;
  let lastTapAt = -999;

  return {
    start(toolTier: number) {
      const t = Math.max(1, Math.min(3, Math.floor(toolTier))) as 1 | 2 | 3;
      detectorTier = t;
      profile = TIER_PROFILES[t];
      progress = 0;
      tapsTaken = 0;
      sessionTime = 0;
      lastTapAt = -999;
    },
    update({ dt, justPressedInteract, audio, effects }): MinigameUpdate {
      sessionTime += dt;

      // Idle decay — meter slips a little every frame.
      if (!justPressedInteract) {
        progress = Math.max(0, progress - profile.decayPerSec * dt);
      }

      if (justPressedInteract && progress < 1) {
        const gain = 1 / profile.tapsTarget;
        progress = Math.min(1, progress + gain);
        tapsTaken += 1;
        lastTapAt = sessionTime;
        // Reuse classify-beat audio — it's a crisp tap; quality = how
        // close progress is to filling cleanly (high if we're close to
        // target, low if we've over-tapped).
        const q = Math.max(0, 1 - tapsTaken / (profile.tapsTarget * TAPS_SLACK));
        audio.playClassifyBeat(q);
        // Gold-dust burst at the meter's spark position (leading-edge
        // of the fill bar in extract-meter). Bar runs along x from
        // -0.21 to +0.21 — translate progress to local x.
        const sparkX = (progress - 0.5) * 0.42;
        effects.burst({ x: sparkX, y: 0.08, z: -0.55 }, 0xffd96a, 8);
        // Tiny shake on each chip.
        effects.shake(0.008, 0.08);
      }

      const viz: MinigameViz = {
        kind: 'extract',
        progress,
        lastTapFlashSec: sessionTime - lastTapAt,
        detectorTier,
      };

      const message = `CHIP the vein — ${(progress * 100).toFixed(0)}% loose (${tapsTaken} taps)`;
      const reported = {
        progress,
        message,
        panTapsRemaining: 0,
        viz,
      };

      if (progress >= 1) {
        // Score from tap efficiency. budget = target × 1.5 slack.
        const budget = profile.tapsTarget * TAPS_SLACK;
        const overshoot = Math.max(0, tapsTaken - profile.tapsTarget);
        const score = Math.max(
          SCORE_FLOOR,
          SCORE_CENTER - (SCORE_CENTER - SCORE_FLOOR) * (overshoot / budget),
        );
        return { kind: 'complete', score, progress: reported };
      }
      return { kind: 'in_progress', progress: reported };
    },
  };
}
