import type { Minigame, MinigameUpdate } from './types';

// M1 stub — preserves current dig behavior (hold INTERACT for 2 s) and
// returns a flat skill score of 1.0. Real timing-meter mechanic and tier
// evolution land in M3.

const DIG_DURATION = 2.0;

export function createDigMinigame(): Minigame {
  let progress = 0;
  return {
    start() {
      progress = 0;
    },
    update({ dt, isInteractDown }): MinigameUpdate {
      if (isInteractDown) {
        progress = Math.min(1, progress + dt / DIG_DURATION);
      }
      const reported = { progress, message: 'HOLD to dig', panTapsRemaining: 0 };
      if (progress >= 1) return { kind: 'complete', score: 1.0, progress: reported };
      return { kind: 'in_progress', progress: reported };
    },
  };
}
