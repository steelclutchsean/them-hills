import type { AudioSystem } from '@/audio/system';
import type { EffectSystem } from '@/game/minigames/effects';
import type { BurstStyle } from '@/game/minigames/types';

// Presentation events sit between the simulation (a yield, a swing) and the
// frame loop. Later phases add toasts, hit-stop, and tutorial beats here
// instead of growing main.ts.

export function presentToolImpact(
  effects: EffectSystem,
  position: { x: number; y: number; z: number },
  color: number,
  count: number,
  style: BurstStyle,
): void {
  effects.burstWorld({ x: position.x, y: position.y + 0.2, z: position.z }, color, count, style);
}

export function presentProspectFind(opts: {
  audio: AudioSystem;
  effects: EffectSystem;
  position: { x: number; y: number; z: number };
  grams: number;
  nuggetGrams?: number;
  firstFind?: boolean;
}): void {
  const sparks = Math.round(14 + Math.min(22, opts.grams * 50));
  opts.effects.burstWorld(
    { x: opts.position.x, y: opts.position.y + 1.05, z: opts.position.z },
    0xffd56a,
    sparks,
    'spark',
  );
  opts.effects.burstWorld(
    { x: opts.position.x, y: opts.position.y + 0.35, z: opts.position.z },
    0xb08958,
    8,
    'dirt',
  );
  opts.effects.shake(0.018, 0.2);
  opts.audio.playFind(opts.grams, {
    nuggetGrams: opts.nuggetGrams,
    firstFind: opts.firstFind,
  });
}
