import { CURRENT_SAVE_VERSION, type SaveV1 } from './schema';

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
  return current as unknown as SaveV1;
}
