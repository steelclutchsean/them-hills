import type { EquipmentState } from '@/save/schema';

// Equipment progression data + helpers. Numbers come from economy-model.md
// and prd-v0.md § 5 — the canonical balance sheet.
//
// Two systems live here:
//
//   1. Tier upgrade *catalog* — what each upgrade costs and what tier it unlocks.
//      Indexed by category. The General Store reads this to render its UI.
//
//   2. Yield multiplier *calculation* — given a save's owned tiers, returns the
//      effective gold-yield multiplier applied to prospecting rewards. Per the
//      design model, this is the geometric mean of 5 active tools (pan, shovel,
//      classifier, detector, gear). Sluice and dredge contribute additive bonuses
//      that are NOT modeled here yet (sluice is a deployable, dredge is endgame
//      and quest-gated) — separate from the active prospecting cycle.

export type EquipmentCategory = keyof EquipmentState['ownedTiers'];

export const ALL_CATEGORIES: readonly EquipmentCategory[] = [
  'pan',
  'shovel',
  'classifier',
  'sluice',
  'detector',
  'snuffer',
  'gear',
  'dredge',
];

/** Per-tier multipliers (T1=1.00, T2=1.45, T3=1.95). Index by `tier - 1`. */
const TIER_MULTIPLIERS: readonly number[] = [1.0, 1.45, 1.95];

/** Tools whose tier multipliers contribute to active prospecting yield. */
const ACTIVE_YIELD_TOOLS: readonly EquipmentCategory[] = [
  'pan',
  'shovel',
  'classifier',
  'detector',
  'gear',
];

export interface TierUpgrade {
  /** Owned tier this upgrade applies to (e.g. 1 means "you have T1, this buys T2"). */
  fromTier: number;
  toTier: number;
  cost: number;
  /** Player-visible label like "Tier 2 — Steel 14"". */
  label: string;
  /** Marker for upgrades that need a quest before purchase becomes available. */
  questGated?: true;
}

export interface CategoryInfo {
  category: EquipmentCategory;
  displayName: string;
  /** Each entry is one purchasable transition. fromTier values must be sequential. */
  upgrades: TierUpgrade[];
}

export const EQUIPMENT: Record<EquipmentCategory, CategoryInfo> = {
  pan: {
    category: 'pan',
    displayName: 'Pan',
    upgrades: [
      { fromTier: 1, toTier: 2, cost: 200, label: 'Tier 2 — Steel 14"' },
      { fromTier: 2, toTier: 3, cost: 800, label: 'Tier 3 — Pro steel 17" w/ riffles' },
    ],
  },
  shovel: {
    category: 'shovel',
    displayName: 'Shovel',
    upgrades: [
      { fromTier: 1, toTier: 2, cost: 150, label: 'Tier 2 — Full shovel' },
      { fromTier: 2, toTier: 3, cost: 700, label: 'Tier 3 — Pickaxe (hard-pack ground)' },
    ],
  },
  classifier: {
    category: 'classifier',
    displayName: 'Classifier',
    upgrades: [
      { fromTier: 1, toTier: 2, cost: 250, label: 'Tier 2 — 3-stack classifier' },
      { fromTier: 2, toTier: 3, cost: 900, label: 'Tier 3 — 5-stack with stand' },
    ],
  },
  sluice: {
    category: 'sluice',
    displayName: 'Sluice Box',
    upgrades: [
      { fromTier: 1, toTier: 2, cost: 500, label: 'Tier 2 — Full-size sluice' },
      { fromTier: 2, toTier: 3, cost: 2500, label: 'Tier 3 — Power sluice (pump-fed)' },
    ],
  },
  detector: {
    category: 'detector',
    displayName: 'Detector',
    upgrades: [
      { fromTier: 1, toTier: 2, cost: 600, label: 'Tier 2 — Mid-range PI' },
      { fromTier: 2, toTier: 3, cost: 4500, label: 'Tier 3 — Pro PI w/ pinpointer' },
    ],
  },
  snuffer: {
    category: 'snuffer',
    displayName: 'Snuffer/Vials',
    upgrades: [
      { fromTier: 1, toTier: 2, cost: 80, label: 'Tier 2 — Glass + 3 vials' },
      { fromTier: 2, toTier: 3, cost: 400, label: 'Tier 3 — Pro + 6 vials w/ scale' },
    ],
  },
  gear: {
    category: 'gear',
    displayName: 'Personal Gear',
    upgrades: [
      { fromTier: 1, toTier: 2, cost: 400, label: 'Tier 2 — Waders + headlamp' },
      { fromTier: 2, toTier: 3, cost: 1500, label: 'Tier 3 — Insulated + GPS' },
    ],
  },
  dredge: {
    category: 'dredge',
    displayName: 'Dredge',
    upgrades: [
      // Dredge T0 → T1 is quest-gated. Listed here so the UI can render it
      // greyed-out, but General Store buyflow rejects questGated upgrades.
      {
        fromTier: 0,
        toTier: 1,
        cost: 3500,
        label: 'Tier 1 — Hand dredge (quest-gated)',
        questGated: true,
      },
      { fromTier: 1, toTier: 2, cost: 0, label: 'Tier 2 — (filled at unlock)' },
      { fromTier: 2, toTier: 3, cost: 10000, label: 'Tier 3 — 2" suction dredge' },
    ],
  },
};

/** Returns the next purchasable upgrade for a category, or null if maxed/locked. */
export function getNextUpgrade(
  category: EquipmentCategory,
  currentTier: number,
): TierUpgrade | null {
  const info = EQUIPMENT[category];
  return info.upgrades.find((u) => u.fromTier === currentTier) ?? null;
}

/**
 * Geometric mean of the 5 active tool tier multipliers. With all tools at T1
 * this returns 1.0 (baseline yield); with all at T3 it returns 1.95.
 */
export function computeYieldMultiplier(ownedTiers: EquipmentState['ownedTiers']): number {
  let product = 1;
  for (const cat of ACTIVE_YIELD_TOOLS) {
    const tier = ownedTiers[cat];
    const mult = TIER_MULTIPLIERS[tier - 1] ?? 1;
    product *= mult;
  }
  return Math.pow(product, 1 / ACTIVE_YIELD_TOOLS.length);
}
