// Shared types for the four prospecting minigames (dig / classify / pan /
// collect). Each stage is a self-contained Minigame that consumes per-frame
// input via MinigameContext and emits an update each frame. When the player
// clears the stage, the minigame returns `complete` with a skill score in
// [0.5, 2.0]; those four scores get geometric-meaned into the final
// skillBonus term of the existing yield formula in prospecting.ts.

export interface MinigameContext {
  dt: number;
  isInteractDown: boolean;
  justPressedInteract: boolean;
}

/**
 * Per-stage visualization data. Each minigame emits its own variant so the
 * renderer can draw stage-specific HUD elements (timing meter, beat pulse,
 * swirl path, flake cursor). Other variants are added alongside their
 * stage's M3–M6 rewrites.
 */
export type MinigameViz =
  | {
      kind: 'dig';
      /** 0..1 position of the oscillating indicator along the bar. */
      indicator: number;
      /** 0..1 center of the sweet zone (always 0.5 today). */
      sweetCenter: number;
      /** Half-width of the sweet zone as a fraction of the bar (0..0.5). */
      sweetHalfWidth: number;
      /** How many more swings the player has to land. */
      swingsRemaining: number;
      /** Seconds since the most recent swing — drives the flash animation. */
      lastSwingFlashSec: number;
      /** Score of the most recent swing in [0.5, 2.5]. 0 if no swing yet. */
      lastSwingScore: number;
      /** True when the equipped shovel is at T3 (visualized as a pickaxe). */
      isPickaxe: boolean;
    };

export interface MinigameProgress {
  /** Sub-progress within this stage, 0..1. Drives the HUD bar. */
  progress: number;
  /** Player-facing prompt for the current stage. */
  message: string;
  /** For 'pan' stage: taps remaining. Other stages return 0. */
  panTapsRemaining: number;
  /** Stage-specific extra data for the renderer. Optional — stubs omit it. */
  viz?: MinigameViz;
}

export type MinigameUpdate =
  | { kind: 'in_progress'; progress: MinigameProgress }
  | { kind: 'complete'; score: number; progress: MinigameProgress };

export interface Minigame {
  /** Reset state for a new stage entry. `toolTier` is the relevant tool
   *  tier (e.g. shovel for dig). Stubs ignore it; later milestones use it
   *  to widen sweet zones / change mechanics. */
  start(toolTier: number): void;
  update(ctx: MinigameContext): MinigameUpdate;
}

/** Combine four per-stage scores in [0.5, 2.0] into a single skillBonus in
 *  [0.5, 2.0]. Geometric mean — mirrors the existing geometric-mean pattern
 *  used by computeYieldMultiplier in equipment.ts so a flawless pan and a
 *  botched one differ by 4×, not 16×. */
export function combineStageScores(scores: readonly number[]): number {
  if (scores.length === 0) return 1.0;
  let product = 1;
  for (const s of scores) product *= s;
  return Math.pow(product, 1 / scores.length);
}
