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

export interface MinigameProgress {
  /** Sub-progress within this stage, 0..1. Drives the HUD bar. */
  progress: number;
  /** Player-facing prompt for the current stage. */
  message: string;
  /** For 'pan' stage: taps remaining. Other stages return 0. */
  panTapsRemaining: number;
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
