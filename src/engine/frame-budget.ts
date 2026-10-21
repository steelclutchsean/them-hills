import { getQualityName, type QualityName } from '@/engine/quality';

// Scene budgets, per quality tier. Frame time is a play target: a discrete
// GPU that stays over it sheds godrays, then ambient occlusion. Draw calls
// and triangles are the smoke check, because a software rasterizer cannot
// hold a 16 ms frame and that failure would say nothing about the scene.

export interface FrameBudget {
  frameMs: number;
  drawCalls: number;
  triangles: number;
}

export const FRAME_BUDGETS: Record<QualityName, FrameBudget> = {
  low: { frameMs: 80, drawCalls: 1400, triangles: 2_200_000 },
  medium: { frameMs: 40, drawCalls: 2000, triangles: 3_400_000 },
  high: { frameMs: 28, drawCalls: 3200, triangles: 5_200_000 },
  ultra: { frameMs: 18, drawCalls: 4200, triangles: 7_000_000 },
};

export function frameBudget(name: QualityName = getQualityName()): FrameBudget {
  return FRAME_BUDGETS[name];
}

const samples: number[] = [];
let overFrames = 0;
let shed = 0;

export type ShedStep = 'none' | 'godrays' | 'ao';

/** Rolling frame time. `locked` is set for shot pages and the smoke pilot. */
export function noteFrameTime(frameMs: number, locked: boolean): ShedStep {
  samples.push(frameMs);
  if (samples.length > 48) samples.shift();
  let sum = 0;
  for (const sample of samples) sum += sample;
  const avg = sum / samples.length;
  const budget = frameBudget().frameMs;
  if (avg > budget * 1.5) overFrames += 1;
  else overFrames = 0;
  if (locked || samples.length < 24 || overFrames < 36) return 'none';
  overFrames = 0;
  shed += 1;
  if (shed === 1) return 'godrays';
  if (shed === 2) return 'ao';
  return 'none';
}

export function resetFrameBudget(): void {
  samples.length = 0;
  overFrames = 0;
  shed = 0;
}
