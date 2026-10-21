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
}

const SHOTS: Record<string, Required<ReviewOverride>> = {
  spawn: { x: 0, z: 2, yaw: 0.55, pitch: 0.38, hour: 8.5, arm: 5, pose: 'idle' },
  creek: { x: 15.5, z: 6, yaw: -1.15, pitch: 0.32, hour: 11, arm: 5, pose: 'idle' },
  camp: { x: -3.5, z: 9, yaw: 0.95, pitch: 0.42, hour: 17.2, arm: 6, pose: 'idle' },
  dusk: { x: 8, z: -14, yaw: 0.35, pitch: 0.24, hour: 18.7, arm: 5, pose: 'idle' },
  night: { x: 1, z: 4, yaw: -0.4, pitch: 0.48, hour: 21.4, arm: 5, pose: 'idle' },
  dawn: { x: -4, z: -8, yaw: 2.2, pitch: 0.3, hour: 6.35, arm: 5, pose: 'idle' },
  inn: { x: -13, z: 16, yaw: 0.05, pitch: 0.28, hour: 10, arm: 7.5, pose: 'idle' },
  creekbank: { x: 17.2, z: 3, yaw: -1.45, pitch: 0.18, hour: 11.2, arm: 3.6, pose: 'idle' },
  prospector: { x: 1.2, z: 3.4, yaw: 0.35, pitch: 0.12, hour: 9, arm: 2.3, pose: 'dig' },
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

export function reviewShot(name: string): Required<ReviewOverride> | null {
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
  };
}

export function reviewWorldTime(hour: number): number {
  return worldTimeForSkyHour(hour);
}
