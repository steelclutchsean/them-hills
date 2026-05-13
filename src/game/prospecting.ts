import { createRng, hashString } from './rng';
import type { GoldStash } from '@/save/schema';
import {
  combineStageScores,
  createClassifyMinigame,
  createCollectMinigame,
  createDigMinigame,
  createPanMinigame,
  type Minigame,
  type MinigameProgress,
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
  }): boolean;
  update(dt: number, isInteractDown: boolean): ProspectingResult | null;
  cancel(): void;
}

interface Session {
  siteId: string;
  siteRichness: number;
  actionCount: number;
  firstEver: boolean;
  yieldMultiplier: number;
  stageIdx: number;
  stages: readonly Minigame[];
  stageScores: number[];
  /** Latest progress snapshot from the active stage. Drives the HUD. */
  current: MinigameProgress;
}

export function createProspectingController(): ProspectingController {
  let session: Session | null = null;
  let wasInteractDown = false;

  function snapshot(): ProspectingSnapshot | null {
    if (!session) return null;
    return {
      active: true,
      siteId: session.siteId,
      step: STEP_ORDER[session.stageIdx]!,
      progress: session.current.progress,
      panTapsRemaining: session.current.panTapsRemaining,
      message: session.current.message,
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
    start({ siteId, siteRichness, actionCount, firstEver, yieldMultiplier }) {
      if (session !== null) return false;
      const stages = [
        createDigMinigame(),
        createClassifyMinigame(),
        createPanMinigame(),
        createCollectMinigame(),
      ] as const;
      // Stages currently don't read tool tier (stubs); later milestones
      // will pass shovel / classifier / pan / snuffer tiers respectively.
      stages[0].start(1);
      session = {
        siteId,
        siteRichness: Math.max(0, Math.min(1, siteRichness)),
        actionCount,
        firstEver,
        yieldMultiplier,
        stageIdx: 0,
        stages,
        stageScores: [],
        current: { progress: 0, message: '', panTapsRemaining: 0 },
      };
      wasInteractDown = false;
      return true;
    },
    update(dt, isInteractDown) {
      if (!session) return null;
      const justPressedInteract = isInteractDown && !wasInteractDown;
      wasInteractDown = isInteractDown;

      const stage = session.stages[session.stageIdx];
      if (!stage) return null;
      const upd = stage.update({ dt, isInteractDown, justPressedInteract });
      session.current = upd.progress;

      if (upd.kind === 'complete') {
        session.stageScores.push(upd.score);
        session.stageIdx += 1;
        if (session.stageIdx >= STEP_ORDER.length) {
          return finalizeReward();
        }
        const next = session.stages[session.stageIdx];
        if (next) next.start(1);
        // Consume the press that completed this stage so the next stage
        // doesn't see a stale just-pressed event.
        wasInteractDown = isInteractDown;
      }
      return null;
    },
    cancel() {
      session = null;
      wasInteractDown = false;
    },
  };
}
