import type { Minigame, MinigameUpdate } from './types';

// M1 stub — preserves current collect behavior (single TAP) and returns
// a flat skill score of 1.0. Real snuffer cursor + flake-pluck mechanic
// lands in M6.

export function createCollectMinigame(): Minigame {
  let done = false;
  return {
    start() {
      done = false;
    },
    update({ justPressedInteract }): MinigameUpdate {
      if (justPressedInteract) done = true;
      const reported = {
        progress: done ? 1 : 0,
        message: 'TAP to collect your gold',
        panTapsRemaining: 0,
      };
      if (done) return { kind: 'complete', score: 1.0, progress: reported };
      return { kind: 'in_progress', progress: reported };
    },
  };
}
