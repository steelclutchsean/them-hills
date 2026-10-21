import { emitGameplay } from '@/game/events';
import type { Minigame, MinigameUpdate, MinigameViz, StageOptions } from '@/game/minigames/types';

// Single-jack, powder, and muck. These run only on the north lode once
// the story has opened the vein. The tutorial never plans them.

function progress(message: string, value: number, viz: MinigameViz): MinigameUpdate {
  return { kind: 'in_progress', progress: { progress: value, message, panTapsRemaining: 0, viz } };
}

function done(score: number, message: string, viz: MinigameViz): MinigameUpdate {
  return {
    kind: 'complete',
    score: Math.max(0.5, Math.min(2, score)),
    progress: { progress: 1, message, panTapsRemaining: 0, viz },
  };
}

/** Hammer on the beat. The sweet spot is the strike, high on the bar. */
export function createDrillMinigame(): Minigame {
  let phase = 0;
  let strikes = 0;
  let score = 0;
  let flash = 9;
  const need = 5;
  const period = 0.78;
  return {
    start() {
      phase = 0;
      strikes = 0;
      score = 0;
      flash = 9;
    },
    update({ dt, justPressedInteract, audio, effects }): MinigameUpdate {
      phase += dt;
      flash += dt;
      const indicator = 0.5 + 0.5 * Math.sin((phase / period) * Math.PI * 2);
      if (justPressedInteract && strikes < need) {
        const dist = Math.abs(indicator - 0.84);
        const hit = dist < 0.08 ? 2 : dist < 0.18 ? 1.25 : 0.62;
        score += hit;
        strikes += 1;
        flash = 0;
        audio.playDigSwing(hit / 2);
        effects.burst({ x: 0.1, y: 0.4, z: -0.6 }, 0xd8d2c4, 6, 'spark');
        emitGameplay('machine-beat', { kind: 'drill', quality: hit / 2 });
      }
      const viz: MinigameViz = {
        kind: 'drill',
        indicator,
        sweet: 0.84,
        strikes,
        need,
        flash,
      };
      if (strikes >= need) {
        return done(score / need, 'The hole is down.', viz);
      }
      const message = indicator > 0.78 ? 'Strike — now' : 'Lift the jack, then strike';
      return progress(message, strikes / need, viz);
    },
  };
}

/** Place two charges, catch the fuse, then the round goes. */
export function createBlastMinigame(): Minigame {
  let phase: 'place' | 'fuse' | 'retreat' = 'place';
  let placed = 0;
  let fuse = 0;
  let retreat = 0;
  let score = 1;
  let charges = 1;
  let blasted = false;
  return {
    start(_tier: number, options?: StageOptions) {
      phase = 'place';
      placed = 0;
      fuse = 0;
      retreat = 0;
      score = 1;
      charges = options?.charges ?? 0;
      blasted = false;
    },
    update({ dt, justPressedInteract, effects }): MinigameUpdate {
      if (phase === 'place') {
        if (justPressedInteract) {
          placed += 1;
          effects.burst({ x: 0.2, y: 0.3, z: -0.8 }, 0xc4a06a, 4, 'dirt');
          if (placed >= 2) phase = 'fuse';
        }
      } else if (phase === 'fuse') {
        fuse += dt * 0.42;
        if (justPressedInteract || fuse >= 1) {
          const miss = Math.abs(fuse - 0.7);
          if (charges <= 0) score = 0.55;
          else score = miss < 0.08 ? 1.8 : miss < 0.18 ? 1.25 : 0.7;
          phase = 'retreat';
        }
      } else {
        retreat += dt;
        if (!blasted && retreat >= 2.4) {
          blasted = true;
          const dust = charges > 0 ? 22 : 8;
          effects.burst({ x: 0, y: 0.6, z: -1.2 }, 0x8a8178, dust, 'dirt');
          effects.shake(charges > 0 ? 0.14 : 0.04, charges > 0 ? 0.75 : 0.3);
          emitGameplay('blast', { charges });
        }
      }
      const viz: MinigameViz = {
        kind: 'blast',
        phase,
        placed,
        fuse: Math.min(1, fuse),
        retreat: Math.min(1, retreat / 2.6),
        charges,
      };
      if (phase === 'retreat' && retreat >= 2.7) {
        const message =
          charges > 0 ? 'The round took the face.' : 'A mud cap. Buy powder from Silas.';
        return done(score, message, viz);
      }
      const message =
        phase === 'place'
          ? `Place the charges (${placed}/2)`
          : phase === 'fuse'
            ? charges > 0
              ? 'Spit the fuse as it crosses the mark'
              : 'No powder — the hole will only cough'
            : 'Retreat up the drift';
      const value = phase === 'place' ? placed / 2 : phase === 'fuse' ? 0.45 : 0.7 + retreat / 8;
      return progress(message, Math.min(0.99, value), viz);
    },
  };
}

/** Shovel the broken rock into the cart. Tap as the cart reaches either end. */
export function createMuckMinigame(): Minigame {
  let t = 0;
  let scoops = 0;
  let score = 0;
  let flash = 9;
  const need = 4;
  return {
    start() {
      t = 0;
      scoops = 0;
      score = 0;
      flash = 9;
    },
    update({ dt, justPressedInteract, audio, effects }): MinigameUpdate {
      t += dt;
      flash += dt;
      const rock = 0.5 + 0.5 * Math.sin(t * 2.1);
      const atEnd = rock < 0.12 || rock > 0.88;
      if (justPressedInteract && scoops < need) {
        const hit = atEnd ? 1.7 : 0.7;
        score += hit;
        scoops += 1;
        flash = 0;
        audio.playDigSwing(hit / 2);
        effects.burst({ x: 0.4, y: 0.2, z: -0.5 }, 0x9a8b6a, 5, 'dirt');
      }
      const viz: MinigameViz = { kind: 'muck', rock, scoops, need, flash };
      if (scoops >= need) return done(score / need, 'The cart is loaded.', viz);
      const message = atEnd ? 'Muck — the cart is at the end' : 'Wait for the cart';
      return progress(message, scoops / need, viz);
    },
  };
}
