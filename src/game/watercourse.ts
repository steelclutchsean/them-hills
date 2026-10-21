// Shared plan of each creek. Terrain, the water ribbon, sites, boulders,
// and the minimap all read these samples so a bend is a bend everywhere.
//
// Gameplay identity stays on StreamConfig (id, site count, names). This
// module only describes the channel in the horizontal plane. Terrain
// stamps `waterY` from the uncarved ground so the surface follows the hills.

export interface CourseSample {
  x: number;
  z: number;
  /** Unit tangent along the flow. */
  tx: number;
  tz: number;
  halfWidth: number;
  /** Carve depth in meters at the centerline. */
  depth: number;
  /** 1 in a pool, 0 in a riffle or run. */
  pool: number;
  /** Gravel bar side: -1, 0, or 1. Gold-bearing sites prefer this side. */
  bar: number;
  along: number;
  /** Meters. Filled by the terrain carve from the uncarved surface. */
  waterY: number;
}

export interface CourseQuery {
  sample: CourseSample;
  /** Signed meters to the right of the flow. */
  lateral: number;
  /** Signed meters ahead of the nearest sample along the tangent. */
  alongDist: number;
  dist: number;
}

export interface Watercourse {
  id: string;
  samples: readonly CourseSample[];
  nearest(x: number, z: number): CourseQuery;
  /** Index along the course, t in 0..1. */
  at(t: number): CourseSample;
  contains(x: number, z: number, padding: number): boolean;
}

interface AxisOpts {
  id: string;
  axis: 'NS' | 'EW';
  origin: number;
  half: number;
  amp: number;
  freq: number;
  harm: number;
  phase: number;
  baseWidth: number;
  baseDepth: number;
  poolFreq: number;
  poolPhase: number;
}

function buildAxis(opts: AxisOpts): Watercourse {
  const step = 2;
  const samples: CourseSample[] = [];
  for (let along = -opts.half; along <= opts.half + 1e-4; along += step) {
    const meander =
      opts.amp * Math.sin(along * opts.freq) +
      opts.amp * opts.harm * Math.sin(along * opts.freq * 2 + opts.phase);
    const x = opts.axis === 'NS' ? opts.origin + meander : along;
    const z = opts.axis === 'NS' ? along : opts.origin + meander;
    const wave = Math.sin(along * opts.poolFreq + opts.poolPhase);
    let halfWidth = opts.baseWidth;
    let depth = opts.baseDepth;
    let pool = 0;
    if (wave > 0.55) {
      halfWidth *= 1.85;
      depth = 1.65;
      pool = 1;
    } else if (wave < -0.45) {
      halfWidth *= 0.68;
      depth = 0.55;
    }
    const barWave = Math.sin(along * 0.07 + 2.1);
    let bar = 0;
    if (barWave > 0.72) bar = Math.sin(along * 0.021) >= 0 ? 1 : -1;
    samples.push({
      x,
      z,
      tx: opts.axis === 'NS' ? 0 : 1,
      tz: opts.axis === 'NS' ? 1 : 0,
      halfWidth,
      depth,
      pool,
      bar,
      along,
      waterY: 0,
    });
  }
  for (let i = 0; i < samples.length; i++) {
    const prev = samples[Math.max(0, i - 1)]!;
    const next = samples[Math.min(samples.length - 1, i + 1)]!;
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    samples[i]!.tx = tx / len;
    samples[i]!.tz = tz / len;
  }

  const course: Watercourse = {
    id: opts.id,
    samples,
    nearest(x, z) {
      let best = samples[0]!;
      let bestD = Infinity;
      for (const s of samples) {
        const dx = x - s.x;
        const dz = z - s.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      const dx = x - best.x;
      const dz = z - best.z;
      return {
        sample: best,
        lateral: dx * -best.tz + dz * best.tx,
        alongDist: dx * best.tx + dz * best.tz,
        dist: Math.sqrt(bestD),
      };
    },
    at(t) {
      const i = Math.max(0, Math.min(samples.length - 1, Math.floor(t * (samples.length - 1))));
      return samples[i]!;
    },
    contains(x, z, padding) {
      const q = course.nearest(x, z);
      if (Math.abs(q.alongDist) > 2.4) return false;
      return Math.abs(q.lateral) < q.sample.halfWidth + padding;
    },
  };
  return course;
}

/** Coyote is the hero creek (wide bends). Buckeye stays narrow so the mines stay dry. */
export function buildWatercourses(): Watercourse[] {
  return [
    buildAxis({
      id: 'coyote_creek',
      axis: 'NS',
      origin: 22,
      half: 90,
      amp: 7.5,
      freq: 0.042,
      harm: 0.38,
      phase: 1.2,
      baseWidth: 2.35,
      baseDepth: 1.15,
      poolFreq: 0.055,
      poolPhase: 0.4,
    }),
    buildAxis({
      id: 'buckeye_run',
      axis: 'EW',
      origin: -55,
      half: 90,
      amp: 2.4,
      freq: 0.038,
      harm: 0.25,
      phase: 0.6,
      baseWidth: 2.05,
      baseDepth: 1.05,
      poolFreq: 0.05,
      poolPhase: 1.1,
    }),
  ];
}

export function courseById(courses: readonly Watercourse[], id: string): Watercourse {
  const found = courses.find((c) => c.id === id);
  if (!found) throw new Error(`[watercourse] missing ${id}`);
  return found;
}

/** Water-surface height of whichever channel is closest. Used by the reflection plane. */
export function waterLevelNear(courses: readonly Watercourse[], x: number, z: number): number {
  return nearestWaterPoint(courses, x, z).y;
}

/** Closest point on a channel, used to park the reflection probe in the creek. */
export function nearestWaterPoint(
  courses: readonly Watercourse[],
  x: number,
  z: number,
): { x: number; y: number; z: number } {
  let bestX = x;
  let bestY = 0;
  let bestZ = z;
  let bestD = Infinity;
  for (const course of courses) {
    const q = course.nearest(x, z);
    if (q.dist < bestD) {
      bestD = q.dist;
      bestX = q.sample.x;
      bestY = q.sample.waterY;
      bestZ = q.sample.z;
    }
  }
  return { x: bestX, y: bestY, z: bestZ };
}
