// Prop clearance. Buildings own a box. Anything tagged as a prop that
// intersects that box is a mistake. The creek channel owns its bed:
// a prop may stand in the water only when it is tagged allowed, and
// even then its crown stays at the surface instead of riding above it.

export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export function aabbOverlap(a: Aabb, b: Aabb, gap = 0.08): boolean {
  return (
    a.minX < b.maxX - gap &&
    a.maxX > b.minX + gap &&
    a.minY < b.maxY - gap &&
    a.maxY > b.minY + gap &&
    a.minZ < b.maxZ - gap &&
    a.maxZ > b.minZ + gap
  );
}

export function sphereAabb(x: number, y: number, z: number, radius: number): Aabb {
  return {
    minX: x - radius,
    maxX: x + radius,
    minY: y - radius * 0.25,
    maxY: y + radius,
    minZ: z - radius,
    maxZ: z + radius,
  };
}

/**
 * True when a prop is illegally inside the channel.
 * Allowed props (riffle stones) fail when their crown clears the surface.
 */
export function channelViolation(opts: {
  inChannel: boolean;
  allowed: boolean;
  y: number;
  radius: number;
  surfaceY: number;
}): boolean {
  if (!opts.inChannel) return false;
  if (!opts.allowed) return true;
  return opts.y + opts.radius > opts.surfaceY + 0.32;
}
