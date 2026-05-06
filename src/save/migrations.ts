import { CURRENT_SAVE_VERSION, type SaveV1 } from './schema';

// When v2 ships, register: 1: (v1) => ({ ...v1, version: 2, /* new fields */ })
// Each migrator must include a unit-test fixture proving idempotency.
type MigratorFn = (input: Record<string, unknown>) => Record<string, unknown>;

const migrators: Record<number, MigratorFn> = {};

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
