import { worldTimeForSkyHour } from '@/game/sky';

// Camera bookmarks for art review and the playtest screenshot pass.
// `?shot=creek` frames a named view; `?hour=18.5` overrides the sky clock
// without moving the player. Honored in production builds so `vite preview`
// and CI can capture the same frames. Nothing is written until the normal
// 60s autosave.

export type ReviewPose = 'idle' | 'dig' | 'pan';

export interface ReviewOverride {
  x?: number;
  z?: number;
  yaw?: number;
  pitch?: number;
  hour?: number;
  /** Camera distance. Default is the rig's normal arm. */
  arm?: number;
  pose?: ReviewPose;
  /** Skip the bank raycast so a long arm can sit outside the channel. */
  free?: boolean;
}

type ReviewShot = Required<Omit<ReviewOverride, 'free'>> & { free?: boolean };

const SHOTS: Record<string, ReviewShot> = {
  spawn: { x: 0, z: 2, yaw: 0.55, pitch: 0.38, hour: 8.5, arm: 5, pose: 'idle' },
  creek: { x: 26.9, z: 8, yaw: 0.05, pitch: 0.72, hour: 11, arm: 14, pose: 'idle', free: true },
  camp: { x: -3.5, z: 9, yaw: 0.95, pitch: 0.42, hour: 17.2, arm: 6, pose: 'idle' },
  dusk: { x: 8, z: -14, yaw: 0.35, pitch: 0.24, hour: 18.7, arm: 5, pose: 'idle' },
  night: { x: -4, z: 7.2, yaw: 0.85, pitch: 0.4, hour: 21.4, arm: 6.5, pose: 'idle' },
  dawn: { x: 2, z: -8, yaw: -1.7, pitch: 0.04, hour: 6.55, arm: 12, pose: 'idle', free: true },
  inn: { x: -10.4, z: 19.2, yaw: 0.28, pitch: 0.14, hour: 10, arm: 11, pose: 'idle', free: true },
  town: { x: -2.5, z: 26, yaw: 0.42, pitch: 0.1, hour: 10.5, arm: 16, pose: 'idle', free: true },
  vista: { x: 52, z: 58, yaw: 2.55, pitch: 0.08, hour: 11, arm: 14, pose: 'idle', free: true },
  creekbank: {
    x: 32.6,
    z: 9.2,
    yaw: -1.5,
    pitch: 0.28,
    hour: 11.2,
    arm: 12,
    pose: 'idle',
    free: true,
  },
  prospector: { x: 2.2, z: 4.2, yaw: 0.6, pitch: 0.18, hour: 9, arm: 2.8, pose: 'pan' },
};

let reviewPose: ReviewPose = 'idle';

export function setReviewPose(pose: ReviewPose): void {
  reviewPose = pose;
}

export function getReviewPose(): ReviewPose {
  return reviewPose;
}

export function reviewShotNames(): readonly string[] {
  return Object.keys(SHOTS);
}

export function reviewShot(name: string): ReviewShot | null {
  return SHOTS[name] ?? null;
}

export function readReviewOverride(): ReviewOverride | null {
  const params = new URLSearchParams(window.location.search);
  const shotName = params.get('shot');
  const hourRaw = params.get('hour');
  const named = shotName ? SHOTS[shotName] : undefined;
  if (!named && (hourRaw == null || hourRaw === '')) return null;
  const parsedHour = hourRaw != null && hourRaw !== '' ? Number(hourRaw) : named?.hour;
  return {
    x: named?.x,
    z: named?.z,
    yaw: named?.yaw,
    pitch: named?.pitch,
    hour: parsedHour != null && Number.isFinite(parsedHour) ? parsedHour : undefined,
    arm: named?.arm,
    pose: named?.pose,
    free: named?.free,
  };
}

export function reviewWorldTime(hour: number): number {
  return worldTimeForSkyHour(hour);
}
