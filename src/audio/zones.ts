// Landmark distances for footsteps, town music, and the murmur bed.
// Anchors match the phase-1 layout in main.ts (assayer, store, inn, camp,
// the four mines). If those move, update the constants here too.

import type { MusicCue } from './catalog';

export type Surface = 'grass' | 'dirt' | 'gravel' | 'wood' | 'water';

const TOWN_X = -10.2;
const TOWN_Z = 4.2;
const INN = { x: -13, z: 10 };
const MINES = [
  { x: -45, z: -45 },
  { x: 40, z: -78 },
  { x: 65, z: 20 },
  { x: -55, z: 35 },
];

export function townAmount(x: number, z: number): number {
  const distance = Math.hypot(x - TOWN_X, z - TOWN_Z);
  if (distance <= 5) return 1;
  if (distance >= 16) return 0;
  const t = (distance - 5) / 11;
  const smooth = t * t * (3 - 2 * t);
  return 1 - smooth;
}

/** 1 in the middle of the night, 0 in full day, ramping through dawn and dusk. */
export function nightAmount(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 20.5 || h < 4.5) return 1;
  if (h >= 18.5 && h < 20.5) return (h - 18.5) / 2;
  if (h >= 4.5 && h < 6.5) return 1 - (h - 4.5) / 2;
  return 0;
}

export function nearestMineDistance(x: number, z: number): number {
  let best = Infinity;
  for (const mine of MINES) {
    const d = Math.hypot(x - mine.x, z - mine.z);
    if (d < best) best = d;
  }
  return best;
}

export function surfaceAt(opts: {
  x: number;
  z: number;
  inWater: boolean;
  inCave: boolean;
  prospecting: boolean;
}): Surface {
  if (opts.inWater) return 'water';
  if (opts.inCave || nearestMineDistance(opts.x, opts.z) < 7) return 'gravel';
  if (Math.hypot(opts.x - INN.x, opts.z - INN.z) < 3.4) return 'wood';
  if (opts.prospecting || townAmount(opts.x, opts.z) > 0.45) return 'dirt';
  return 'grass';
}

export function desiredCue(opts: {
  x: number;
  z: number;
  hour: number;
  inCave: boolean;
  prospecting: boolean;
  previous: MusicCue;
}): MusicCue {
  if (opts.prospecting) return 'prospecting';
  if (opts.inCave) return 'night';
  const town = townAmount(opts.x, opts.z);
  const night = nightAmount(opts.hour);
  if (opts.previous === 'town' ? town > 0.35 : town > 0.62) return 'town';
  if (opts.previous === 'night' ? night > 0.28 : night > 0.7) return 'night';
  return 'exploration';
}

export const TOWN_POINT = { x: TOWN_X, y: 1.4, z: TOWN_Z };
