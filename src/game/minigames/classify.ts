import type { Minigame, MinigameUpdate } from './types';

// M1 stub — preserves current classify behavior (rapid TAP with idle
// decay) and returns a flat skill score of 1.0. Real rhythm mechanic and
// layer-stack tier evolution land in M4.

const TAP_GAIN = 0.13;
const DECAY_PER_SEC = 0.05;

export function createClassifyMinigame(): Minigame {
  let progress = 0;
  return {
    start() {
      progress = 0;
    },
    update({ dt, justPressedInteract }): MinigameUpdate {
      if (justPressedInteract) {
        progress = Math.min(1, progress + TAP_GAIN);
      } else {
        progress = Math.max(0, progress - DECAY_PER_SEC * dt);
      }
      const reported = {
        progress,
        message: 'TAP rapidly to classify',
        panTapsRemaining: 0,
      };
      if (progress >= 1) return { kind: 'complete', score: 1.0, progress: reported };
      return { kind: 'in_progress', progress: reported };
    },
  };
}
