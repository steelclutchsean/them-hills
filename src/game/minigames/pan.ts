import type { Minigame, MinigameUpdate, MinigameViz } from './types';

// Pan minigame — physical swirl with the mouse / right-stick. The player
// looks down into a gold pan held in their hands; a cursor inside the
// pan responds 1:1 to look input. To "wash" the pan they sweep the
// cursor in circles around the center. Per-revolution we score:
//
//   - swirlCount = number of complete 2π revolutions accumulated
//   - circularity = how consistent the cursor's radius was across each
//     swirl (1.0 = perfect circle, 0.0 = wild scribbling)
//
// effectiveSwirls = swirlCount × averageCircularity
// stage score = 0.5 + min(1, effectiveSwirls / target) × 1.5 ∈ [0.5, 2.0]
//
// Time-boxed at 6 s; stage ends and score is finalized regardless of
// progress (soft-fail).
//
// Tier evolution (Pan category):
//   T1 (steel 12"): 5 swirls target, radius tolerance 0.20 (strict
//                   circularity), plain bowl visual.
//   T2 (steel 14"): 4 swirls target, radius tolerance 0.30 (wider bowl
//                   tolerates off-center loops), darker bowl visual.
//   T3 (17" riffled): 4 swirls target, tolerance 0.35, plus a "riffle
//                   bonus" — each completed swirl past target adds
//                   +0.10 to the final score (cap +0.5). Visualized as
//                   gold dots snapping into the riffle ring.

interface TierProfile {
  swirlTarget: number;
  radiusTolerance: number;
  bonusOnRiffles: boolean;
}

const TIER_PROFILES: Record<1 | 2 | 3, TierProfile> = {
  1: { swirlTarget: 5, radiusTolerance: 0.2, bonusOnRiffles: false },
  2: { swirlTarget: 4, radiusTolerance: 0.3, bonusOnRiffles: false },
  3: { swirlTarget: 4, radiusTolerance: 0.35, bonusOnRiffles: true },
};

const STAGE_DURATION_SEC = 6.0;
// Look-delta → cursor-units. `axes.dx/dy` are already per-frame radian
// deltas (NOT per-second rates) from input.getLookDelta(), so DO NOT
// multiply by dt below — that would silently divide cursor speed by ~60.
// A relaxed mouse circle of ~2 rad of total arc completes one swirl in
// ~0.5 s at radius 0.6 with sensitivity 2.0.
const CURSOR_SENSITIVITY = 2.0;
const RIFFLE_BONUS_PER_SWIRL = 0.1;
const RIFFLE_BONUS_CAP = 0.5;
const SCORE_FLOOR = 0.5;
const SCORE_RANGE = 1.5;
const SCORE_MAX_WITH_BONUS = 2.5;

export function createPanMinigame(): Minigame {
  let profile: TierProfile = TIER_PROFILES[1];
  let tier: 1 | 2 | 3 = 1;
  let cx = 0;
  let cy = 0;
  let lastAngle = 0;
  let angularDistance = 0;
  let radiusSamples: number[] = [];
  let circularitySamples: number[] = [];
  let swirlCount = 0;
  let sessionTime = 0;

  return {
    start(toolTier: number) {
      const t = Math.max(1, Math.min(3, Math.floor(toolTier))) as 1 | 2 | 3;
      tier = t;
      profile = TIER_PROFILES[t];
      // Start cursor at a fixed offset from center so the first swirl
      // direction is unambiguous and the angle math has a stable seed.
      cx = 0.55;
      cy = 0;
      lastAngle = Math.atan2(cy, cx);
      angularDistance = 0;
      radiusSamples = [];
      circularitySamples = [];
      swirlCount = 0;
      sessionTime = 0;
    },
    update({ dt, axes, audio, effects }): MinigameUpdate {
      sessionTime += dt;

      // Integrate look-delta into cursor XY. Clamp inside the unit pan.
      // axes.dx/dy are per-frame deltas — see note on CURSOR_SENSITIVITY.
      cx += axes.dx * CURSOR_SENSITIVITY;
      cy += axes.dy * CURSOR_SENSITIVITY;
      const r0 = Math.sqrt(cx * cx + cy * cy);
      if (r0 > 1) {
        cx /= r0;
        cy /= r0;
      }
      const radius = Math.min(1, r0);

      // Accumulate signed angular distance — count completed revolutions.
      if (radius > 0.15) {
        const angle = Math.atan2(cy, cx);
        let dA = angle - lastAngle;
        if (dA > Math.PI) dA -= 2 * Math.PI;
        else if (dA < -Math.PI) dA += 2 * Math.PI;
        lastAngle = angle;
        angularDistance += dA;
        radiusSamples.push(radius);
      }

      // Detect one completed swirl (absolute angular distance ≥ 2π).
      while (Math.abs(angularDistance) >= 2 * Math.PI && radiusSamples.length >= 4) {
        const mean =
          radiusSamples.reduce((a, b) => a + b, 0) / radiusSamples.length;
        const variance =
          radiusSamples.reduce((a, b) => a + (b - mean) ** 2, 0) /
          radiusSamples.length;
        const stdDev = Math.sqrt(variance);
        const circ = Math.max(0, Math.min(1, 1 - stdDev / profile.radiusTolerance));
        circularitySamples.push(circ);
        swirlCount += 1;
        audio.playPanSwirl();
        // Gold sparkle burst from the pan center on each completed
        // revolution. Pan mounts at (0, -0.34, -0.5); fire the burst
        // a little above the bowl so particles read as "rising."
        const burstCount = 6 + Math.round(circ * 8);
        effects.burst({ x: 0, y: -0.3, z: -0.5 }, 0xffd96a, burstCount);
        effects.shake(0.01, 0.12);
        // Wrap remaining angular travel into the next swirl.
        angularDistance =
          angularDistance > 0
            ? angularDistance - 2 * Math.PI
            : angularDistance + 2 * Math.PI;
        radiusSamples = [];
      }

      const liveCirc =
        circularitySamples.length > 0
          ? circularitySamples.reduce((a, b) => a + b, 0) / circularitySamples.length
          : 0;
      const timeRemaining = Math.max(0, STAGE_DURATION_SEC - sessionTime);
      const bonusSwirls = Math.max(0, swirlCount - profile.swirlTarget);
      const riffleHits = profile.bonusOnRiffles
        ? Math.min(bonusSwirls, Math.floor(RIFFLE_BONUS_CAP / RIFFLE_BONUS_PER_SWIRL))
        : 0;

      const viz: MinigameViz = {
        kind: 'pan',
        cursorX: cx,
        cursorY: cy,
        radius,
        swirlCount,
        swirlTarget: profile.swirlTarget,
        circularity: liveCirc,
        timeRemaining,
        tier,
        riffleHits,
      };

      const message = profile.bonusOnRiffles
        ? `SWIRL — ${swirlCount}/${profile.swirlTarget} (riffles +${riffleHits}) — ${timeRemaining.toFixed(1)}s`
        : `SWIRL — ${swirlCount}/${profile.swirlTarget} — ${timeRemaining.toFixed(1)}s`;
      const reported = {
        progress: Math.min(1, sessionTime / STAGE_DURATION_SEC),
        message,
        panTapsRemaining: 0,
        viz,
      };

      if (sessionTime >= STAGE_DURATION_SEC) {
        // Final score: effective-swirls fraction of target.
        const effective = swirlCount * (liveCirc > 0 ? liveCirc : 0.5);
        let score = SCORE_FLOOR + SCORE_RANGE * Math.min(1, effective / profile.swirlTarget);
        if (profile.bonusOnRiffles) {
          const bonus = Math.min(RIFFLE_BONUS_CAP, bonusSwirls * RIFFLE_BONUS_PER_SWIRL);
          score = Math.min(SCORE_MAX_WITH_BONUS, score + bonus);
        }
        return { kind: 'complete', score, progress: reported };
      }
      return { kind: 'in_progress', progress: reported };
    },
  };
}
