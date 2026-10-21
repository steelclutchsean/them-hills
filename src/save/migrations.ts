import { ensureArc } from '@/game/campaign';
import {
  CURRENT_SAVE_VERSION,
  defaultFieldwork,
  defaultSettings,
  emptyImprovements,
  type SaveV1,
} from './schema';

// Migrators run in sequence from saved-version up to CURRENT_SAVE_VERSION.
// Each one returns the same blob with `version` bumped and any new fields
// filled in.
type MigratorFn = (input: Record<string, unknown>) => Record<string, unknown>;

const migrators: Record<number, MigratorFn> = {
  // v1 → v2: add `headlamp` slot to equipment.ownedTiers. Auto-grant the
  // item to saves that already had gear ≥ 2 (old "gear T2 = waders +
  // headlamp" bundle) so we don't strip functionality from existing players.
  1: (v1) => {
    const equipment = (v1.equipment as Record<string, unknown>) ?? {};
    const owned = (equipment.ownedTiers as Record<string, unknown>) ?? {};
    const gearTier = typeof owned.gear === 'number' ? (owned.gear as number) : 1;
    const headlamp = gearTier >= 2 ? 2 : 1;
    return {
      ...v1,
      version: 2,
      equipment: {
        ...equipment,
        ownedTiers: { ...owned, headlamp },
      },
    };
  },
  // v2 → v3: SiteState swaps continuous `richnessRemaining` for discrete
  // `digsRemaining` + `maxDigs`. Convert each existing site: maxDigs
  // defaults to 10; digsRemaining = ceil(richnessRemaining × 10) so a
  // partially-depleted site stays partially-depleted.
  2: (v2) => {
    const world = (v2.world as Record<string, unknown>) ?? {};
    const sites = (world.sites as Record<string, Record<string, unknown>>) ?? {};
    const migrated: Record<string, unknown> = {};
    for (const [id, site] of Object.entries(sites)) {
      const richness =
        typeof site.richnessRemaining === 'number' ? (site.richnessRemaining as number) : 1;
      const maxDigs = 10;
      const digsRemaining = Math.max(0, Math.min(maxDigs, Math.ceil(richness * maxDigs)));
      migrated[id] = {
        digsRemaining,
        maxDigs,
        lastWorkedAt: site.lastWorkedAt ?? 0,
        totalTimesWorked: site.totalTimesWorked ?? 0,
      };
    }
    return {
      ...v2,
      version: 3,
      world: { ...world, sites: migrated },
    };
  },
  // v3 → v4: add the `settings` block with defaults. No existing data
  // to convert — settings were hardcoded constants before this version.
  3: (v3) => ({
    ...v3,
    version: 4,
    settings: defaultSettings(),
  }),
  // v4 → v5: claims, journal, work method, and the tools that change
  // how a prospect plays. Position, carry gold, and wallet stay as they
  // were. New tool keys start unowned.
  4: (v4) => {
    const equipment = (v4.equipment as Record<string, unknown>) ?? {};
    const owned = (equipment.ownedTiers as Record<string, unknown>) ?? {};
    const fieldwork = (v4.fieldwork as Record<string, unknown> | undefined) ?? defaultFieldwork();
    return {
      ...v4,
      version: 5,
      equipment: {
        ...equipment,
        ownedTiers: {
          pick: 0,
          rocker: 0,
          longTom: 0,
          hydraulic: 0,
          ...owned,
        },
      },
      fieldwork,
    };
  },
  // v5 → v6: monitor slot, coffee warmth, and machine-run counts.
  // Claims, position, carry gold, and wallet are copied through.
  5: (v5) => {
    const fieldwork = (v5.fieldwork as Record<string, unknown> | undefined) ?? {};
    const base = defaultFieldwork();
    const rawClaims = Array.isArray(fieldwork.claims) ? fieldwork.claims : [];
    const claims = rawClaims.map((entry) => {
      const claim = entry as Record<string, unknown>;
      const improvements = (claim.improvements as Record<string, unknown> | undefined) ?? {};
      return {
        ...claim,
        improvements: {
          ...emptyImprovements(),
          ...improvements,
          hydraulic: improvements.hydraulic === true,
        },
      };
    });
    const runs = (fieldwork.machineRuns as Record<string, unknown> | undefined) ?? {};
    return {
      ...v5,
      version: 6,
      fieldwork: {
        ...base,
        ...fieldwork,
        claims,
        coffeeUntil: typeof fieldwork.coffeeUntil === 'number' ? fieldwork.coffeeUntil : 0,
        machineRuns: {
          rocker: typeof runs.rocker === 'number' ? runs.rocker : 0,
          sluice: typeof runs.sluice === 'number' ? runs.sluice : 0,
          long_tom: typeof runs.long_tom === 'number' ? runs.long_tom : 0,
          hydraulic: typeof runs.hydraulic === 'number' ? runs.hydraulic : 0,
        },
      },
    };
  },
};

export function migrate(raw: unknown): SaveV1 {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('[save] cannot migrate: value is not an object');
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.version !== 'number') {
    throw new Error('[save] cannot migrate: missing version field');
  }
  let current = obj;
  while ((current.version as number) < CURRENT_SAVE_VERSION) {
    const v = current.version as number;
    const fn = migrators[v];
    if (!fn) {
      throw new Error(`[save] no migrator registered for v${v}`);
    }
    current = fn(current);
  }
  if ((current.version as number) > CURRENT_SAVE_VERSION) {
    throw new Error(
      `[save] save was written by a newer game version (v${current.version}); update the game to load.`,
    );
  }
  return ensureArc(current as unknown as SaveV1);
}
