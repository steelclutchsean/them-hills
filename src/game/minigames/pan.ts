import type { Minigame, MinigameUpdate } from './types';

// M1 stub — preserves current pan behavior (4 paced taps, min 0.4 s
// apart) and returns a flat skill score of 1.0. Real swirl-tracking
// circularity mechanic and pan-tier evolution land in M5.

const REQUIRED_TAPS = 4;
const MIN_TAP_GAP = 0.4;

export function createPanMinigame(): Minigame {
  let taps = 0;
  let lastTapAt = -999;
  let sessionTime = 0;
  return {
    start() {
      taps = 0;
      lastTapAt = -999;
      sessionTime = 0;
    },
    update({ dt, justPressedInteract }): MinigameUpdate {
      sessionTime += dt;
      if (justPressedInteract) {
        const since = sessionTime - lastTapAt;
        if (since >= MIN_TAP_GAP) {
          taps += 1;
          lastTapAt = sessionTime;
        }
      }
      const progress = taps / REQUIRED_TAPS;
      const reported = {
        progress,
        message: 'TAP with rhythm to pan (every ~0.5s)',
        panTapsRemaining: Math.max(0, REQUIRED_TAPS - taps),
      };
      if (taps >= REQUIRED_TAPS) return { kind: 'complete', score: 1.0, progress: reported };
      return { kind: 'in_progress', progress: reported };
    },
  };
}
