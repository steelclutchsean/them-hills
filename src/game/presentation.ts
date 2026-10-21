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
}): void {
  const nugget = (opts.nuggetGrams ?? 0) >= 0.05;
  const big = opts.grams >= 0.25 || nugget;
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
  opts.effects.shake(big ? 0.055 : 0.018, big ? 0.38 : 0.2);
  if (big) {
    opts.effects.kickFov(nugget ? 6 : 4, 0.45);
    opts.effects.rumble(nugget ? 180 : 120, nugget ? 0.8 : 0.4, nugget ? 0.55 : 0.25);
  }
  if (nugget) opts.effects.hitStop(0.16);
  opts.audio.playFind(opts.grams);
}
