// Seeded pseudo-random generator (mulberry32). Deterministic given a seed,
// so gold spawns at a site are reproducible from save state.
//
// We key the seed on (siteId hash, action counter) so each prospect at a
// given site produces a different but deterministic outcome.

export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min)),
  };
}

// Deterministic string hash → 32-bit int. Good enough for site ID seeding.
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
