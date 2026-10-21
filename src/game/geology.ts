import type { Habitat } from '@/save/schema';
import type { StreamConfig } from '@/game/stream';

// Where the gold sits. The creeks are straight channels on the map; the
// pay streak is a meander laid along that channel, so a player who learns
// the pattern can walk to color without a marker. Rain advances `payShift`
// and the meander walks downstream.

export interface BoulderPoint {
  x: number;
  z: number;
  r: number;
}

export interface GroundRead {
  streamId: string | null;
  /** 0 at the upstream end, 1 at the downstream end. */
  along: number;
  /** Signed distance from the centerline, in half-widths. */
  cross: number;
  /** Meters outside the water. 0 while standing in the creek. */
  dist: number;
  habitat: Habitat;
  /** 0..1 concentration before the yield curve. */
  pay: number;
  /** Flakes a prospector would count in one pan. Stable until the creek shifts. */
  colors: number;
  /** Multiplier for a prospect taken here. */
  yieldScale: number;
  label: string;
  advice: string;
}

const HABITAT_COPY: Record<Habitat, { label: string; advice: string; pay: number }> = {
  inside_bend: {
    label: 'inside bend',
    advice: 'Water slows on the inside. Gold drops here.',
    pay: 0.84,
  },
  gravel_bar: {
    label: 'gravel bar',
    advice: 'A bar builds where the current dumps its load.',
    pay: 0.66,
  },
  bedrock: {
    label: 'bedrock',
    advice: 'The creek has cut to bedrock. Color sits in the cracks.',
    pay: 0.93,
  },
  boulder_lee: {
    label: 'boulder lee',
    advice: 'The downstream pocket behind a boulder is a quiet trap.',
    pay: 0.74,
  },
  tail: {
    label: 'outside bend',
    advice: 'The fast water on the outside scours gold away.',
    pay: 0.28,
  },
  barren: {
    label: 'dry ground',
    advice: 'No color up here. Get in the creek.',
    pay: 0.05,
  },
};

function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function frame(
  cfg: StreamConfig,
  x: number,
  z: number,
): { along: number; cross: number; dist: number } {
  const axis = cfg.orientation === 'NS' ? z - cfg.centerZ : x - cfg.centerX;
  const lateral = cfg.orientation === 'NS' ? x - cfg.centerX : z - cfg.centerZ;
  const along = axis / (cfg.halfLength * 2) + 0.5;
  const cross = lateral / Math.max(0.01, cfg.halfWidth);
  const dAlong = Math.max(0, Math.abs(axis) - cfg.halfLength);
  const dCross = Math.max(0, Math.abs(lateral) - cfg.halfWidth);
  return { along, cross, dist: Math.hypot(dAlong, dCross) };
}

function inLee(cfg: StreamConfig, x: number, z: number, b: BoulderPoint): boolean {
  const flowX = cfg.orientation === 'NS' ? 0 : 1;
  const flowZ = cfg.orientation === 'NS' ? 1 : 0;
  const dx = x - b.x;
  const dz = z - b.z;
  const down = dx * flowX + dz * flowZ;
  const side = Math.abs(dx * flowZ - dz * flowX);
  return down > 0.35 && down < 3.4 && side < b.r + 1.5;
}

function pointOn(cfg: StreamConfig, along: number, lateral: number): { x: number; z: number } {
  const axis = (along - 0.5) * cfg.halfLength * 2;
  const x = cfg.orientation === 'NS' ? cfg.centerX + lateral : cfg.centerX + axis;
  const z = cfg.orientation === 'NS' ? cfg.centerZ + axis : cfg.centerZ + lateral;
  return { x, z };
}

export function readGround(
  streams: readonly StreamConfig[],
  x: number,
  z: number,
  payShift: Record<string, number>,
  boulders: readonly BoulderPoint[],
): GroundRead {
  let best: { cfg: StreamConfig; along: number; cross: number; dist: number } | null = null;
  for (const cfg of streams) {
    const f = frame(cfg, x, z);
    if (!best || f.dist < best.dist) best = { cfg, ...f };
  }
  if (!best || best.dist > 12) {
    const copy = HABITAT_COPY.barren;
    return {
      streamId: null,
      along: 0,
      cross: 0,
      dist: best?.dist ?? 999,
      habitat: 'barren',
      pay: copy.pay,
      colors: 0,
      yieldScale: 0.5 + copy.pay,
      label: copy.label,
      advice: copy.advice,
    };
  }

  const shift = payShift[best.cfg.id] ?? 0;
  const bend = Math.sin((best.along * 3 + shift) * Math.PI);
  const insideSign = bend >= 0 ? -1 : 1;
  const lee = boulders.some((b) => inLee(best.cfg, x, z, b));
  const bedrock =
    Math.abs(best.cross) < 0.5 && Math.abs(Math.sin(best.along * 9 + shift * 2)) > 0.9;
  const onInside =
    Math.sign(best.cross || insideSign) === insideSign &&
    Math.abs(bend) > 0.35 &&
    Math.abs(best.cross) > 0.12 &&
    Math.abs(best.cross) < 1.35;
  const onBar = Math.abs(best.cross) > 0.4 && Math.abs(best.cross) < 1.2 && Math.abs(bend) < 0.45;
  const outside = Math.sign(best.cross || 1) !== insideSign && Math.abs(bend) > 0.4;

  let habitat: Habitat = 'gravel_bar';
  if (best.dist > 3.2) habitat = 'barren';
  else if (lee && best.dist < 2.4) habitat = 'boulder_lee';
  else if (bedrock && best.dist < 1.6) habitat = 'bedrock';
  else if (onInside) habitat = 'inside_bend';
  else if (onBar) habitat = 'gravel_bar';
  else if (outside) habitat = 'tail';

  const copy = HABITAT_COPY[habitat];
  const jitter = hash01(x * 0.37 + z * 0.91 + shift * 19 + best.cfg.centerX);
  const pay = Math.max(0, Math.min(1, copy.pay * (0.9 + jitter * 0.18)));
  const colors =
    habitat === 'barren'
      ? 0
      : Math.max(0, Math.min(18, Math.round(pay * 12 + jitter * 4 - 1.2)));
  return {
    streamId: best.cfg.id,
    along: best.along,
    cross: best.cross,
    dist: best.dist,
    habitat,
    pay,
    colors,
    yieldScale: 0.5 + pay * 1.15,
    label: copy.label,
    advice: copy.advice,
  };
}

/** A spot on the named creek where the meander is currently paying. */
export function richestPlacer(
  streams: readonly StreamConfig[],
  payShift: Record<string, number>,
  boulders: readonly BoulderPoint[],
  streamId = 'coyote_creek',
): { x: number; z: number; read: GroundRead } {
  const cfg = streams.find((s) => s.id === streamId) ?? streams[0];
  if (!cfg) {
    const read = readGround(streams, 0, 0, payShift, boulders);
    return { x: 0, z: 0, read };
  }
  const shift = payShift[cfg.id] ?? 0;
  let best: { x: number; z: number; read: GroundRead } | null = null;
  const consider = (x: number, z: number) => {
    const read = readGround([cfg], x, z, payShift, boulders);
    if (!best || read.pay > best.read.pay) best = { x, z, read };
  };
  for (let i = 0; i <= 36; i++) {
    const along = 0.06 + (i / 36) * 0.88;
    const bend = Math.sin((along * 3 + shift) * Math.PI);
    const inside = (bend >= 0 ? -1 : 1) * cfg.halfWidth * 0.7;
    const p = pointOn(cfg, along, inside);
    consider(p.x, p.z);
  }
  for (const b of boulders) {
    const f = frame(cfg, b.x, b.z);
    if (f.dist > 6) continue;
    const flowX = cfg.orientation === 'NS' ? 0 : 1;
    const flowZ = cfg.orientation === 'NS' ? 1 : 0;
    consider(b.x + flowX * (b.r + 1.1), b.z + flowZ * (b.r + 1.1));
  }
  return best ?? { x: cfg.centerX, z: cfg.centerZ, read: readGround([cfg], cfg.centerX, cfg.centerZ, payShift, boulders) };
}

export interface PayMark {
  x: number;
  z: number;
  habitat: Habitat;
  pay: number;
  /** Yaw that follows the creek, so a streak lies downstream. */
  flowYaw: number;
}

/** Shore and in-creek points a player can learn to read. Rain moves them. */
export function payMarks(
  streams: readonly StreamConfig[],
  payShift: Record<string, number>,
  boulders: readonly BoulderPoint[],
): PayMark[] {
  const out: PayMark[] = [];
  for (const cfg of streams) {
    const flowYaw = cfg.orientation === 'NS' ? 0 : Math.PI / 2;
    const shift = payShift[cfg.id] ?? 0;
    for (let i = 0; i <= 22; i++) {
      const along = 0.06 + (i / 22) * 0.88;
      const bend = Math.sin((along * 3 + shift) * Math.PI);
      const sign = bend >= 0 ? -1 : 1;
      const laterals = [
        sign * (cfg.halfWidth + 0.45),
        sign * cfg.halfWidth * 0.35,
        -sign * (cfg.halfWidth + 0.2),
      ];
      for (const lateral of laterals) {
        const p = pointOn(cfg, along, lateral);
        const read = readGround([cfg], p.x, p.z, payShift, boulders);
        if (read.habitat === 'barren') continue;
        out.push({ x: p.x, z: p.z, habitat: read.habitat, pay: read.pay, flowYaw });
      }
    }
    for (const b of boulders) {
      const f = frame(cfg, b.x, b.z);
      if (f.dist > 6) continue;
      const flowX = cfg.orientation === 'NS' ? 0 : 1;
      const flowZ = cfg.orientation === 'NS' ? 1 : 0;
      const x = b.x + flowX * (b.r + 1.2);
      const z = b.z + flowZ * (b.r + 1.2);
      const read = readGround([cfg], x, z, payShift, boulders);
      out.push({ x, z, habitat: read.habitat === 'barren' ? 'boulder_lee' : read.habitat, pay: Math.max(read.pay, 0.7), flowYaw });
    }
  }
  return out;
}

export function stakeable(habitat: Habitat): boolean {
  return habitat === 'inside_bend' || habitat === 'gravel_bar' || habitat === 'bedrock' || habitat === 'boulder_lee';
}
