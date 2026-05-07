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

export const HUNGER_DRAIN_PER_SEC = 1.0 / 720; // ~12 min full → empty
export const THIRST_DRAIN_PER_SEC = 1.0 / 480; // ~8 min full → empty
export const THIRST_REGEN_IN_WATER_PER_SEC = 0.05; // 20 s empty → full

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
  const h = 0.5 + 0.5 * Math.max(0, Math.min(1, meters.hunger));
  const t = 0.5 + 0.5 * Math.max(0, Math.min(1, meters.thirst));
  return (h + t) / 2;
}
