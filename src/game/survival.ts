// Survival system constants and helpers.
//
// Two meters drain over time: hunger and thirst. Stamina is a separate system
// owned by character.ts (it gates sprint, not prospecting).
//
// Restoration:
//   - thirst regens passively while standing in stream water (slow trickle)
//   - hunger restores only at camp (instant + advances time)
//   - camp also restores thirst to full
//
// Empty meters reduce active prospecting yield to 50% (linearly from full=1.0
// to empty=0.5). Multiplied with the equipment yield multiplier in main.ts.

import { SKY_SECONDS_PER_DAY } from './sky';

export const HUNGER_DRAIN_PER_SEC = 1.0 / 1500; // ~25 min full → empty
export const THIRST_DRAIN_PER_SEC = 1.0 / 1100; // ~18 min full → empty
export const THIRST_REGEN_IN_WATER_PER_SEC = 0.04; // a drink from the creek, not a cure

/**
 * Real-seconds added to worldTime by a single rest at camp. Set so the sky
 * advances exactly four game-hours per rest (~ ~"sleep until morning" if you
 * rest at evening).
 */
export const CAMP_REST_TIME_ADVANCE = (SKY_SECONDS_PER_DAY / 24) * 4;

/**
 * Yield factor from current survival meters. Linearly interpolates between
 * 0.5 (both empty) and 1.0 (both full).
 */
export function computeSurvivalYieldFactor(meters: { hunger: number; thirst: number }): number {
  const hunger = Math.max(0, Math.min(1, meters.hunger));
  const thirst = Math.max(0, Math.min(1, meters.thirst));
  const worst = Math.min(hunger, thirst);
  // Full yield until a meter is actually low. Empty bottoms out at 0.78,
  // so a missed meal costs you without ending the day.
  if (worst >= 0.35) return 1;
  return 0.78 + (0.22 * worst) / 0.35;
}

export interface Comfort {
  /** Short HUD line. Empty when nothing is helping. */
  label: string;
  /** Added to stamina regen per second. */
  staminaRegen: number;
  /** Multiplier on sprint drain. Below 1 is easier. */
  staminaDrainScale: number;
  /** Multiplier on stamina spent per dig swing. */
  digCost: number;
  yield: number;
  warm: boolean;
}

/** Food, coffee, and a roof are buffs. Hunger still trims yield when it is actually low. */
export function comfortFor(opts: {
  hunger: number;
  thirst: number;
  fed: boolean;
  coffee: boolean;
  nearCamp: boolean;
  campTier: 0 | 1 | 2;
  night: boolean;
}): Comfort {
  const parts: string[] = [];
  let staminaRegen = 0;
  let staminaDrainScale = 1;
  let digCost = 1;
  let yieldFactor = computeSurvivalYieldFactor(opts);
  let warm = false;
  if (opts.fed) {
    parts.push('Fed');
    digCost *= 0.72;
    staminaRegen += 0.06;
    yieldFactor *= 1.08;
  }
  if (opts.coffee) {
    parts.push('Coffee');
    staminaRegen += 0.12;
    staminaDrainScale *= 0.7;
    digCost *= 0.85;
    yieldFactor *= 1.04;
    if (opts.night) warm = true;
  }
  if (opts.nearCamp && opts.campTier >= 1 && opts.night) {
    parts.push(opts.campTier >= 2 ? 'Cabin warmth' : 'Lean-to warmth');
    staminaRegen += 0.08;
    digCost *= 0.85;
    yieldFactor *= 1.05;
    warm = true;
  }
  return {
    label: parts.join(' · '),
    staminaRegen,
    staminaDrainScale,
    digCost,
    yield: yieldFactor,
    warm,
  };
}
