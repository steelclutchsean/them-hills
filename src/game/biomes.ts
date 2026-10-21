import type { Rng } from '@/game/rng';
import type { Watercourse } from '@/game/watercourse';

// Where the town was cleared, and where the forest is allowed to stand.
// Street props and the false-front row live inside the clearing. Trees do not.

export const TOWN_CLEAR = { minX: -40, maxX: 8, minZ: -28, maxZ: 100 };

export function inTownClearing(x: number, z: number): boolean {
  return x > TOWN_CLEAR.minX && x < TOWN_CLEAR.maxX && z > TOWN_CLEAR.minZ && z < TOWN_CLEAR.maxZ;
}

/** Dirt street between the false fronts and the original shops. */
export function inStreet(x: number, z: number): boolean {
  return x > -32 && x < -14 && z > -24 && z < 100;
}

/** A point on the bank, `outward` meters past the water's edge, on the town side. */
export function bankPoint(
  course: Watercourse,
  alongZ: number,
  outward: number,
): { x: number; z: number; waterY: number } {
  let sample = course.samples[0]!;
  let best = Infinity;
  for (const s of course.samples) {
    const d = Math.abs(s.z - alongZ);
    if (d < best) {
      best = d;
      sample = s;
    }
  }
  const side = sample.halfWidth + outward;
  return {
    x: sample.x - sample.tz * side,
    z: sample.z + sample.tx * side,
    waterY: sample.waterY,
  };
}

export function sampleRidge(
  rng: Rng,
  heightAt: (x: number, z: number) => number,
  blocked: (x: number, z: number) => boolean,
): { x: number; z: number } {
  for (let i = 0; i < 12; i++) {
    const x = rng.range(-88, 88);
    const z = rng.range(-88, 88);
    if (blocked(x, z) || inTownClearing(x, z)) continue;
    const h = heightAt(x, z);
    const slope = Math.hypot(
      heightAt(x + 1.6, z) - heightAt(x - 1.6, z),
      heightAt(x, z + 1.6) - heightAt(x, z - 1.6),
    );
    if (h > 3.4 || slope > 0.9 || Math.hypot(x, z) > 64) return { x, z };
  }
  return { x: rng.range(50, 88) * (rng.next() < 0.5 ? -1 : 1), z: rng.range(-88, 88) };
}

export function sampleCreekFringe(
  rng: Rng,
  course: Watercourse,
  blocked: (x: number, z: number) => boolean,
): { x: number; z: number } {
  for (let i = 0; i < 8; i++) {
    const sample = course.at(rng.next());
    const side = rng.next() < 0.5 ? -1 : 1;
    const cross = side * (sample.halfWidth + rng.range(2.4, 7.5));
    const x = sample.x - sample.tz * cross;
    const z = sample.z + sample.tx * cross;
    if (blocked(x, z) || inTownClearing(x, z)) continue;
    return { x, z };
  }
  const sample = course.at(0.5);
  return { x: sample.x + sample.halfWidth + 4, z: sample.z };
}

export function sampleTownEdge(
  rng: Rng,
  blocked: (x: number, z: number) => boolean,
): { x: number; z: number } {
  for (let i = 0; i < 10; i++) {
    const x = rng.range(TOWN_CLEAR.minX - 14, TOWN_CLEAR.maxX + 10);
    const z = rng.range(TOWN_CLEAR.minZ - 10, TOWN_CLEAR.maxZ + 8);
    if (inTownClearing(x, z) || inStreet(x, z) || blocked(x, z)) continue;
    const near =
      x > TOWN_CLEAR.minX - 16 &&
      x < TOWN_CLEAR.maxX + 12 &&
      z > TOWN_CLEAR.minZ - 12 &&
      z < TOWN_CLEAR.maxZ + 10;
    if (near) return { x, z };
  }
  return { x: rng.range(-48, -38), z: rng.range(-10, 18) };
}
