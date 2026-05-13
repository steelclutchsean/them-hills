import type { Minigame, MinigameUpdate, MinigameViz } from './types';

// Classify minigame — rhythmic shake of the classifier sieve. A beat
// pulses on a fixed cadence (~2 Hz); the player taps INTERACT on the
// beat to shake the gravel through the screen. Each tap is scored by
// how close it lands to the beat moment:
//
//   distance to beat (sec)            score
//     0.00                              2.00 (perfect)
//     1 × tightWindowSec                1.50
//     2 × tightWindowSec                1.00
//     ≥ 3 × tightWindowSec              0.50 (floor)
//
// Stage score = arithmetic mean of all tap scores, clamped to the tier's
// floor (T3 introduces a fines layer that auto-passes flakes regardless
// of rhythm — modeled as a floor of 0.8 on the final score).
//
// Tier evolution (Classifier category):
//   T1 (single screen):   8 taps, tight window 0.08 s, 1 visible sieve.
//   T2 (3-stack):         8 taps, tight 0.10 s, 3 visible sieves; taps
//                         split 4/4 across upper/lower as the gravel
//                         works down the stack.
//   T3 (5-stack w/ stand): 8 taps, tight 0.12 s, 5 sieves; bottom fines
//                         layer always catches → floor score 0.8.

interface TierProfile {
  tapsTotal: number;
  tightWindowSec: number;
  layerCount: 1 | 3 | 5;
  floorScore: number;
}

const TIER_PROFILES: Record<1 | 2 | 3, TierProfile> = {
  1: { tapsTotal: 8, tightWindowSec: 0.08, layerCount: 1, floorScore: 0.5 },
  2: { tapsTotal: 8, tightWindowSec: 0.1, layerCount: 3, floorScore: 0.5 },
  3: { tapsTotal: 8, tightWindowSec: 0.12, layerCount: 5, floorScore: 0.8 },
};

const BEAT_PERIOD_SEC = 0.5;
const SCORE_FLOOR = 0.5;
const SCORE_CENTER = 2.0;
const SCORE_DROP_PER_WINDOW = 0.5;

export function createClassifyMinigame(): Minigame {
  let profile: TierProfile = TIER_PROFILES[1];
  let tapScores: number[] = [];
  let sessionTime = 0;
  let lastTapAt = -999;
  let lastTapScore = 0;

  function beatPhase(t: number): number {
    return (t / BEAT_PERIOD_SEC) % 1;
  }
  function distanceToBeat(t: number): number {
    // Beat moment lands at phase = 0.5 each cycle. Distance to beat is
    // |phase - 0.5| × period (seconds).
    return Math.abs(beatPhase(t) - 0.5) * BEAT_PERIOD_SEC;
  }
  function scoreTap(distanceSec: number): number {
    return Math.max(
      SCORE_FLOOR,
      SCORE_CENTER - SCORE_DROP_PER_WINDOW * (distanceSec / profile.tightWindowSec),
    );
  }

  return {
    start(toolTier: number) {
      const t = Math.max(1, Math.min(3, Math.floor(toolTier))) as 1 | 2 | 3;
      profile = TIER_PROFILES[t];
      tapScores = [];
      sessionTime = 0;
      lastTapAt = -999;
      lastTapScore = 0;
    },
    update({ dt, justPressedInteract, audio }): MinigameUpdate {
      sessionTime += dt;

      if (justPressedInteract && tapScores.length < profile.tapsTotal) {
        const d = distanceToBeat(sessionTime);
        const score = scoreTap(d);
        tapScores.push(score);
        lastTapAt = sessionTime;
        lastTapScore = score;
        audio.playClassifyBeat((score - SCORE_FLOOR) / (SCORE_CENTER - SCORE_FLOOR));
      }

      const tapsDone = tapScores.length;
      const tapsRemaining = profile.tapsTotal - tapsDone;
      const halfway = Math.floor(profile.tapsTotal / 2);
      // currentLayer: 0 for the first half (upper sieve catches), 1 for
      // the second half (gravel has settled to the lower sieve). For T1
      // there's only one layer so it stays at 0.
      const currentLayer = profile.layerCount > 1 && tapsDone >= halfway ? 1 : 0;

      const viz: MinigameViz = {
        kind: 'classify',
        beatPhase: beatPhase(sessionTime),
        beatPeriod: BEAT_PERIOD_SEC,
        tapsRemaining,
        layerCount: profile.layerCount,
        currentLayer,
        tightWindowSec: profile.tightWindowSec,
        lastTapFlashSec: sessionTime - lastTapAt,
        lastTapScore,
      };

      const layerLabel =
        profile.layerCount === 1
          ? ''
          : currentLayer === 0
            ? ' (upper sieve)'
            : ' (lower sieve)';
      const message = `TAP on the beat${layerLabel} — ${tapsRemaining} left`;
      const reported = {
        progress: tapsDone / profile.tapsTotal,
        message,
        panTapsRemaining: 0,
        viz,
      };

      if (tapsDone >= profile.tapsTotal) {
        const avg = tapScores.reduce((a, b) => a + b, 0) / tapScores.length;
        const finalScore = Math.max(profile.floorScore, avg);
        return { kind: 'complete', score: finalScore, progress: reported };
      }
      return { kind: 'in_progress', progress: reported };
    },
  };
}
