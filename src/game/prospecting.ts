import { createRng, hashString } from './rng';
import type { GoldStash } from '@/save/schema';

// Four-step prospecting loop with each step distinguished by interaction style:
//   dig      — HOLD to fill (passive)
//   classify — TAP rapidly; idle decays progress (active, fast)
//   pan      — PACED taps (4 separate presses, min 0.4s apart) (active, deliberate)
//   collect  — SINGLE TAP to claim
// Cancellable via the controller's cancel() method (bound to PAUSE in main.ts).

export type StepKind = 'dig' | 'classify' | 'pan' | 'collect';

const DIG_DURATION = 2.0;
const CLASSIFY_TAP_GAIN = 0.13;
const CLASSIFY_DECAY_PER_SEC = 0.05;
const PAN_REQUIRED_TAPS = 4;
const PAN_MIN_TAP_GAP = 0.4;

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
  step: StepKind;
  progress: number;
  panTaps: number;
  lastPanTapAt: number;
  sessionTime: number;
}

const STEP_MESSAGES: Record<StepKind, string> = {
  dig: 'HOLD to dig',
  classify: 'TAP rapidly to classify',
  pan: 'TAP with rhythm to pan (every ~0.5s)',
  collect: 'TAP to collect your gold',
};

export function createProspectingController(): ProspectingController {
  let session: Session | null = null;
  let wasInteractDown = false;

  function snapshot(): ProspectingSnapshot | null {
    if (!session) return null;
    return {
      active: true,
      siteId: session.siteId,
      step: session.step,
      progress: session.progress,
      panTapsRemaining: Math.max(0, PAN_REQUIRED_TAPS - session.panTaps),
      message: STEP_MESSAGES[session.step],
    };
  }

  function finalizeReward(): ProspectingResult {
    if (!session) throw new Error('[prospect] finalizeReward without session');
    const seed = hashString(session.siteId) ^ (session.actionCount + 1);
    const rng = createRng(seed);

    const skillBonus = 0.6 + rng.next() * 0.4; // 0.6..1.0
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
      session = {
        siteId,
        siteRichness: Math.max(0, Math.min(1, siteRichness)),
        actionCount,
        firstEver,
        yieldMultiplier,
        step: 'dig',
        progress: 0,
        panTaps: 0,
        lastPanTapAt: -999,
        sessionTime: 0,
      };
      wasInteractDown = false;
      return true;
    },
    update(dt, isInteractDown) {
      if (!session) return null;
      const justPressed = isInteractDown && !wasInteractDown;
      wasInteractDown = isInteractDown;
      session.sessionTime += dt;

      switch (session.step) {
        case 'dig':
          if (isInteractDown) {
            session.progress = Math.min(1, session.progress + dt / DIG_DURATION);
            if (session.progress >= 1) {
              session.step = 'classify';
              session.progress = 0;
            }
          }
          break;
        case 'classify':
          if (justPressed) {
            session.progress = Math.min(1, session.progress + CLASSIFY_TAP_GAIN);
            if (session.progress >= 1) {
              session.step = 'pan';
              session.progress = 0;
              session.panTaps = 0;
              session.lastPanTapAt = -999;
            }
          } else {
            session.progress = Math.max(0, session.progress - CLASSIFY_DECAY_PER_SEC * dt);
          }
          break;
        case 'pan': {
          if (justPressed) {
            const since = session.sessionTime - session.lastPanTapAt;
            if (since >= PAN_MIN_TAP_GAP) {
              session.panTaps += 1;
              session.lastPanTapAt = session.sessionTime;
              session.progress = session.panTaps / PAN_REQUIRED_TAPS;
              if (session.panTaps >= PAN_REQUIRED_TAPS) {
                session.step = 'collect';
                session.progress = 0;
              }
            }
            // Tap was too fast — silently ignored (no fail state)
          }
          break;
        }
        case 'collect':
          if (justPressed) {
            return finalizeReward();
          }
          break;
      }
      return null;
    },
    cancel() {
      session = null;
      wasInteractDown = false;
    },
  };
}
