import { createRng, hashString } from './rng';
import type { EquipmentState, GoldStash } from '@/save/schema';
import {
  combineStageScores,
  createClassifyMinigame,
  createCollectMinigame,
  createDigMinigame,
  createPanMinigame,
  type Minigame,
  type MinigameAudio,
  type MinigameProgress,
  type MinigameViz,
} from './minigames';

// Four-step prospecting loop. Each step is its own minigame module under
// `src/game/minigames/`; this controller is just a thin orchestrator that
// runs the current stage, collects its skill score on completion, then
// advances to the next stage. After all four stages finish, the four
// scores (each in [0.5, 2.0]) are geometric-meaned and used as the
// `skillBonus` term in the yield formula.
//
// M1 status: minigames are stubs that preserve the prior tap/hold
// mechanics and return a flat 1.0 score. Real per-stage skill challenges
// land in M3–M6.

export type StepKind = 'dig' | 'classify' | 'pan' | 'collect';

const STEP_ORDER: readonly StepKind[] = ['dig', 'classify', 'pan', 'collect'] as const;

// Per-prospect base yield at full richness. Real numbers come from economy-model.md;
// this is a Phase 2 placeholder that gives satisfying immediate feedback during testing.
const BASE_YIELD_GRAMS = 0.18;
const PAN_QUALITY_FLAKE = 0.85;
const PAN_QUALITY_PICKER = 0.13;
const PAN_QUALITY_NUGGET = 0.02;

const RICHNESS_DEPLETION_PER_PROSPECT = 0.08;

export interface ProspectingSnapshot {
  active: boolean;
  siteId: string;
  step: StepKind;
  progress: number; // 0..1 within current step
  panTapsRemaining: number;
  message: string;
  /** Stage-specific extras for the renderer (timing meter, beat pulse, etc.). */
  viz?: MinigameViz;
  /** True between a stage finishing and the player pressing INTERACT to
   *  continue. Renderer shows a multiplier banner during this window. */
  awaitingConfirm: boolean;
  /** Score of the most-recently-finished stage in [0.5, 2.5]. 0 before
   *  the first stage completes. */
  lastStageScore: number;
  /** Action whose glyph the HUD should show for the current prompt.
   *  Collect stage uses USE_TOOL (mouse / RT); everything else INTERACT. */
  primaryAction: 'INTERACT' | 'USE_TOOL';
}

export interface ProspectingFrameInput {
  /** INTERACT bound to E / Square. Always available. */
  interactDown: boolean;
  /** USE_TOOL bound to LMB / RT. Only the collect stage reads this today. */
  useToolDown: boolean;
  /** Per-frame look delta from input.getLookDelta. Pan + collect read this. */
  axes: { dx: number; dy: number };
}

export interface ProspectingResult {
  siteId: string;
  reward: GoldStash;
  richnessDepletion: number;
  /** Per-stage skill scores in [0.5, 2.0] (4 entries) — for logging / tuning. */
  stageScores: readonly number[];
  /** Combined skillBonus (geometric mean of stageScores). */
  skillBonus: number;
}

export interface ProspectingControllerOpts {
  /** Audio sink for per-stage event sounds + stage-complete chimes. */
  audio: MinigameAudio & { playStageComplete(stageIdx: number): void };
}

export interface ProspectingController {
  isActive(): boolean;
  getSnapshot(): ProspectingSnapshot | null;
  start(opts: {
    siteId: string;
    siteRichness: number;
    actionCount: number;
    firstEver: boolean;
    /** Geometric mean of active tool tier multipliers (T1=1.00 baseline). */
    yieldMultiplier: number;
    /** Per-tool tiers — each minigame reads the relevant one for evolution. */
    toolTiers: EquipmentState['ownedTiers'];
  }): boolean;
  update(dt: number, input: ProspectingFrameInput): ProspectingResult | null;
  cancel(): void;
}

interface Session {
  siteId: string;
  siteRichness: number;
  actionCount: number;
  firstEver: boolean;
  yieldMultiplier: number;
  /** Tier per stage idx — index by STEP_ORDER position. */
  stageTiers: readonly number[];
  stageIdx: number;
  stages: readonly Minigame[];
  stageScores: number[];
  /** Latest progress snapshot from the active stage. Drives the HUD. */
  current: MinigameProgress;
  /** When non-null: this stage just finished and we're waiting for the
   *  player to press INTERACT to advance to the next one (or finalize). */
  pendingConfirm: { stageIdx: number; score: number } | null;
}

export function createProspectingController(
  opts: ProspectingControllerOpts,
): ProspectingController {
  let session: Session | null = null;
  let wasInteractDown = false;
  let wasUseToolDown = false;

  function snapshot(): ProspectingSnapshot | null {
    if (!session) return null;
    const pending = session.pendingConfirm;
    // While awaiting confirm: show the FINISHED stage (so its viewmodel
    // stays on screen behind the banner) and report the score for the
    // HUD to render. Otherwise show the current in-progress stage.
    const reportedIdx = pending ? pending.stageIdx : session.stageIdx;
    const reportedStep = STEP_ORDER[reportedIdx]!;
    // Confirmation prompts always use INTERACT; the collect minigame is
    // the only stage that swaps the in-game prompt to USE_TOOL.
    const primaryAction: 'INTERACT' | 'USE_TOOL' =
      pending === null && reportedStep === 'collect' ? 'USE_TOOL' : 'INTERACT';
    return {
      active: true,
      siteId: session.siteId,
      step: reportedStep,
      progress: session.current.progress,
      panTapsRemaining: session.current.panTapsRemaining,
      message: session.current.message,
      viz: session.current.viz,
      awaitingConfirm: pending !== null,
      lastStageScore: pending?.score ?? 0,
      primaryAction,
    };
  }

  function finalizeReward(): ProspectingResult {
    if (!session) throw new Error('[prospect] finalizeReward without session');
    const seed = hashString(session.siteId) ^ (session.actionCount + 1);
    const rng = createRng(seed);

    const skillBonus = combineStageScores(session.stageScores);
    const richnessFactor = 0.2 + 0.8 * session.siteRichness;
    let totalGrams = BASE_YIELD_GRAMS * richnessFactor * skillBonus * session.yieldMultiplier;

    // Rig the very first prospect ever: at least one visible flake.
    if (session.firstEver && totalGrams < 0.05) {
      totalGrams = 0.05 + rng.next() * 0.05;
    }

    // Distribute by quality with small RNG jitter.
    const reward: GoldStash = {
      flake_g: totalGrams * PAN_QUALITY_FLAKE * (0.85 + 0.3 * rng.next()),
      picker_g: totalGrams * PAN_QUALITY_PICKER * (0.7 + 0.6 * rng.next()),
      nugget_g: totalGrams * PAN_QUALITY_NUGGET * (0.4 + 1.2 * rng.next()),
    };

    const result: ProspectingResult = {
      siteId: session.siteId,
      reward,
      richnessDepletion: RICHNESS_DEPLETION_PER_PROSPECT,
      stageScores: [...session.stageScores],
      skillBonus,
    };
    session = null;
    wasInteractDown = false;
    return result;
  }

  return {
    isActive: () => session !== null,
    getSnapshot: snapshot,
    start({ siteId, siteRichness, actionCount, firstEver, yieldMultiplier, toolTiers }) {
      if (session !== null) return false;
      const stages = [
        createDigMinigame(),
        createClassifyMinigame(),
        createPanMinigame(),
        createCollectMinigame(),
      ] as const;
      // Per-stage tool tier — index aligns with STEP_ORDER:
      //   dig → shovel, classify → classifier, pan → pan, collect → snuffer.
      const stageTiers: readonly number[] = [
        toolTiers.shovel,
        toolTiers.classifier,
        toolTiers.pan,
        toolTiers.snuffer,
      ];
      stages[0].start(stageTiers[0]!);
      session = {
        siteId,
        siteRichness: Math.max(0, Math.min(1, siteRichness)),
        actionCount,
        firstEver,
        yieldMultiplier,
        stageTiers,
        stageIdx: 0,
        stages,
        stageScores: [],
        current: { progress: 0, message: '', panTapsRemaining: 0 },
        pendingConfirm: null,
      };
      wasInteractDown = false;
      return true;
    },
    update(dt, frameInput) {
      if (!session) return null;
      const { interactDown, useToolDown, axes } = frameInput;
      const justPressedInteract = interactDown && !wasInteractDown;
      const justPressedUseTool = useToolDown && !wasUseToolDown;
      wasInteractDown = interactDown;
      wasUseToolDown = useToolDown;

      // If a previous stage finished and we're waiting for player confirm:
      // freeze the active stage (no further updates), only advance on a
      // fresh INTERACT press. Snapshot keeps reporting the finished stage
      // so the banner overlay can display its score.
      if (session.pendingConfirm !== null) {
        if (justPressedInteract) {
          const finishedIdx = session.pendingConfirm.stageIdx;
          session.pendingConfirm = null;
          session.stageIdx = finishedIdx + 1;
          if (session.stageIdx >= STEP_ORDER.length) {
            return finalizeReward();
          }
          const next = session.stages[session.stageIdx];
          if (next) next.start(session.stageTiers[session.stageIdx] ?? 1);
          const nextStep = STEP_ORDER[session.stageIdx]!;
          console.log(`[prospect] → entering ${nextStep}`);
          // Consume the confirm press so the new stage doesn't see it.
          wasInteractDown = interactDown;
        }
        return null;
      }

      const stage = session.stages[session.stageIdx];
      if (!stage) return null;
      const completedStageIdx = session.stageIdx;
      const upd = stage.update({
        dt,
        isInteractDown: interactDown,
        justPressedInteract,
        isUseToolDown: useToolDown,
        justPressedUseTool,
        axes,
        audio: opts.audio,
      });
      session.current = upd.progress;

      if (upd.kind === 'complete') {
        session.stageScores.push(upd.score);
        opts.audio.playStageComplete(completedStageIdx);
        const finishedStep = STEP_ORDER[completedStageIdx]!;
        console.log(
          `[prospect] ${finishedStep} → score ${upd.score.toFixed(2)}`,
        );
        // Don't advance immediately — gate behind a player confirmation
        // press so they see the multiplier they earned for this stage.
        session.pendingConfirm = { stageIdx: completedStageIdx, score: upd.score };
        // Consume the press that completed this stage so the confirm
        // doesn't fire on the SAME frame as the stage finishing.
        wasInteractDown = interactDown;
        wasUseToolDown = useToolDown;
      }
      return null;
    },
    cancel() {
      session = null;
      wasInteractDown = false;
    },
  };
}
