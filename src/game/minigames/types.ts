// Shared types for the four prospecting minigames (dig / classify / pan /
// collect). Each stage is a self-contained Minigame that consumes per-frame
// input via MinigameContext and emits an update each frame. When the player
// clears the stage, the minigame returns `complete` with a skill score in
// [0.5, 2.0]; those four scores get geometric-meaned into the final
// skillBonus term of the existing yield formula in prospecting.ts.

/** Audio surface the minigames are allowed to call. Decouples them from
 *  the full AudioSystem and makes the dependency explicit. */
export interface MinigameAudio {
  playDigSwing(quality: number): void;
  playClassifyBeat(quality: number): void;
  playPanSwirl(): void;
  playFlakeCollect(): void;
}

export interface MinigameContext {
  dt: number;
  isInteractDown: boolean;
  justPressedInteract: boolean;
  /** USE_TOOL = LMB on kb/m, RT on controller. Collect stage uses this
   *  to fire the snuffer suction; other stages keep using INTERACT. */
  isUseToolDown: boolean;
  justPressedUseTool: boolean;
  /** Analog look delta this frame (radians-ish, from input.getLookDelta).
   *  Pan stage uses this to drive its swirl cursor; collect stage drives
   *  the snuffer cursor. Other stages ignore it. */
  axes: { dx: number; dy: number };
  /** Procedural sound hooks. Stages call these on player-meaningful
   *  events (a swing, a tap, a completed swirl, a flake collected). */
  audio: MinigameAudio;
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
    }
  | {
      kind: 'classify';
      /** 0..1 cyclic phase within the beat period. Beat moment lands at 0.5. */
      beatPhase: number;
      beatPeriod: number;
      tapsRemaining: number;
      /** Number of visible sieves in the classifier (1, 3, or 5 per tier). */
      layerCount: 1 | 3 | 5;
      /** Which layer the current taps are scoring against (0 = upper, 1 = lower). */
      currentLayer: number;
      /** Tight scoring window in seconds (perfect tap distance). */
      tightWindowSec: number;
      /** Seconds since the most recent tap — drives flash animation. */
      lastTapFlashSec: number;
      /** Score of the most recent tap in [0.5, 2.0]. 0 if no tap yet. */
      lastTapScore: number;
    }
  | {
      kind: 'pan';
      /** Cursor position relative to pan center, ([-1,1], [-1,1]). */
      cursorX: number;
      cursorY: number;
      /** Cursor distance from center, 0..1. */
      radius: number;
      /** Complete 2π swirls accumulated so far. */
      swirlCount: number;
      /** Target swirls for max score. */
      swirlTarget: number;
      /** Average circularity across completed swirls (0..1). */
      circularity: number;
      /** Seconds remaining in the stage. */
      timeRemaining: number;
      /** Pan tier — drives mesh swap (1/2/3 = green / steel / riffled). */
      tier: 1 | 2 | 3;
      /** Riffle hits on T3 (cosmetic — locked flake snaps). */
      riffleHits: number;
    }
  | {
      kind: 'collect';
      cursorX: number;
      cursorY: number;
      /** All flakes the player is trying to pluck (live + fading + done). */
      flakes: readonly CollectFlakeViz[];
      /** Snuffer tier 1/2/3 — drives mesh + suction radius. */
      snufferTier: 1 | 2 | 3;
      /** Current suction radius for this tier (in pan-local 0..1 units). */
      suctionRadius: number;
      /** True if the player is holding INTERACT (visual halo). */
      suctionActive: boolean;
      /** Manually-collected flake count (excludes auto-fines on T3). */
      flakesCollected: number;
      /** Total flake count spawned this stage. */
      flakesTotal: number;
      /** Seconds remaining in the stage. */
      timeRemaining: number;
    };

export interface CollectFlakeViz {
  id: number;
  /** Pan-local position, in [-1, 1] × [-1, 1]. */
  x: number;
  y: number;
  /** True for small "fines", false for larger "pickers". */
  isFine: boolean;
  /** 0..1 cyclic pulse phase for visual flicker. */
  pulse: number;
  /** Render state — present = visible, collecting = animated out, gone = hidden. */
  state: 'present' | 'collecting' | 'gone';
  /** Suction progress 0..1 while the cursor is hovering with INTERACT held. */
  suckProgress: number;
}

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
