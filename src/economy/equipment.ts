import type { EquipmentState } from '@/save/schema';

// Equipment progression data + helpers. Numbers come from economy-model.md
// and prd-v0.md § 5 — the canonical balance sheet.
//
// Two systems live here:
//
//   1. Tier upgrade *catalog* — what each upgrade costs and what tier it
//      unlocks. Indexed by category. The General Store reads this to
//      render its UI.
//
//   2. Yield-multiplier helpers — given a save's owned tiers, return
//      multipliers used by the prospecting reward formula.
//
//      M6 refactor: tier multipliers split per-stage instead of being
//      pooled into one overall geometric mean. Each prospecting stage
//      pulls the tier of the tool that "owns" it (dig/strike → shovel,
//      classify → classifier, pan → pan, collect → snuffer, extract →
//      detector). Gear stays as a global multiplier (warmer / safer →
//      can prospect longer / cleaner). Sluice + dredge are still
//      separate from the active prospecting cycle (deployables).

export type EquipmentCategory = keyof EquipmentState['ownedTiers'];

export const ALL_CATEGORIES: readonly EquipmentCategory[] = [
  'pan',
  'shovel',
  'classifier',
  'sluice',
  'detector',
  'snuffer',
  'gear',
  'headlamp',
  'dredge',
];

/** Per-tier multipliers (T1=1.00, T2=1.45, T3=1.95). Index by `tier - 1`. */
const TIER_MULTIPLIERS: readonly number[] = [1.0, 1.45, 1.95];

function tierMult(tier: number): number {
  return TIER_MULTIPLIERS[Math.max(0, Math.min(2, tier - 1))] ?? 1;
}

/** Map a prospecting stage to the tool whose tier scales its yield.
 *  Panning + mining share collect (snuffer) and the dig/strike stages
 *  share shovel — Pickaxe is just Shovel T3. */
export function getStageTierMultiplier(
  stage: 'dig' | 'classify' | 'pan' | 'collect' | 'strike' | 'extract',
  owned: EquipmentState['ownedTiers'],
): number {
  switch (stage) {
    case 'dig':
    case 'strike':
      return tierMult(owned.shovel);
    case 'classify':
      return tierMult(owned.classifier);
    case 'pan':
      return tierMult(owned.pan);
    case 'extract':
      return tierMult(owned.detector);
    case 'collect':
      return tierMult(owned.snuffer);
  }
}

/** Single global yield multiplier — applies once to the final reward.
 *  Currently driven by Gear tier (warmer / safer → can prospect deeper
 *  + cleaner). The per-stage tools used to share this pot via geometric
 *  mean before the M6 refactor. */
export function getGlobalYieldMultiplier(owned: EquipmentState['ownedTiers']): number {
  return tierMult(owned.gear);
}

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
      { fromTier: 1, toTier: 2, cost: 400, label: 'Tier 2 — Waders' },
      { fromTier: 2, toTier: 3, cost: 1500, label: 'Tier 3 — Insulated + GPS' },
    ],
  },
  headlamp: {
    category: 'headlamp',
    displayName: 'Headlamp',
    upgrades: [
      { fromTier: 1, toTier: 2, cost: 150, label: 'See in the dark' },
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
 * @deprecated Replaced by per-stage `getStageTierMultiplier()` + the
 * single-tool `getGlobalYieldMultiplier()` in M6. Kept temporarily as
 * a thin alias to the global mult so any stragglers compile.
 */
export function computeYieldMultiplier(ownedTiers: EquipmentState['ownedTiers']): number {
  return getGlobalYieldMultiplier(ownedTiers);
}
