# Them Hills — Save Schema v1

**Companion to:** `prd-v0.md`, `implementation-plan-v0.md`
**Schema version:** 1 (initial v0 release)
**Storage backend:** IndexedDB via `idb-keyval`
**Last updated:** 2026-05-05

---

## Design Principles

1. **Always versioned.** Even v0's first save is `version: 1`. The migration runner exists from day one even if it has nothing to do — the cost of adding it later is severe.
2. **Forward-compatible reads.** Loaders ignore unknown fields rather than crashing. Removing a field is a migration; adding one is not.
3. **Settings live outside the save.** Per-device preferences (graphics, audio, control bindings) are stored under a separate IndexedDB key so they don't ride along with cloud-syncable game state in v1+.
4. **One save slot in v0.** Multi-slot is a v1.x feature; designing for it now would over-engineer.
5. **Compact but readable.** Fields are short enough to keep payloads small (target < 100 KB uncompressed for a maxed-out v0 save) but named clearly enough that a human can debug a serialized blob.
6. **Deterministic where possible.** RNG seeds are stored, not just current state, so a save can be replayed for QA.

---

## Storage Layout (IndexedDB keys)

| Key | Contents | Sync to cloud (v1+)? |
|---|---|---|
| `themhills:save:slot1` | The full game save blob (this document) | ✅ |
| `themhills:settings` | Per-device settings (graphics, audio, control bindings, accessibility) | ❌ — per-device |
| `themhills:cache:spot` | Last fetched spot price snapshot (small, fast-access) | ❌ — derivable |
| `themhills:debug:lastError` | Last fatal error blob for crash reports | ❌ — telemetry only |

The save blob itself is one JSON object. Compression with `pako` (gzip) is wired in but only applied if the uncompressed size exceeds 50 KB.

---

## Top-Level Schema

```ts
interface SaveV1 {
  version: 1;
  metadata: SaveMetadata;
  player: PlayerState;
  inventory: InventoryState;
  wallet: WalletState;
  equipment: EquipmentState;
  world: WorldState;
  economy: EconomyState;
  quests: QuestState;
  npcs: NPCState;
  progression: ProgressionState;
  rngSeeds: RngSeedState;
}
```

---

## SaveMetadata

```ts
interface SaveMetadata {
  createdAt: number;           // epoch ms — when the save was first created
  lastSavedAt: number;         // epoch ms — most recent autosave/manual save
  playtimeSeconds: number;     // total real-time spent in-game (excluding paused/menu)
  buildVersion: string;        // e.g., "0.4.2" — game build that wrote the save
  saveCount: number;           // increments on every save; useful for debugging
}
```

---

## PlayerState

```ts
interface PlayerState {
  position: Vec3;              // world coords
  rotation: { yaw: number; pitch: number };  // radians
  meters: {
    stamina: number;           // 0.0–1.0
    hunger: number;            // 0.0–1.0 (1.0 = full)
    thirst: number;            // 0.0–1.0
  };
  spawnPoint: 'camp' | 'inn';  // where the player respawns on load
  appearance: {
    presetId: string;          // v0 has a small set of presets; full customization is v1+
  };
}

type Vec3 = { x: number; y: number; z: number };
```

---

## InventoryState

```ts
interface InventoryState {
  // Carry inventory (on-person; lost if dropped — though v0 has no drop mechanic)
  carry: {
    gold: GoldStash;           // current haul
    consumables: Record<ConsumableId, number>;  // count by item type
    keyItems: string[];        // unique-instance items (e.g., "lost_pickaxe")
  };
  // Vault at camp — persists, can be sold gradually, untouched by per-trip mechanics
  vault: {
    gold: GoldStash;
  };
}

interface GoldStash {
  flake_g: number;             // grams (decimal, e.g., 0.347)
  picker_g: number;
  nugget_g: number;
}

type ConsumableId =
  | 'berries'
  | 'mushrooms'
  | 'meal_ration'
  | 'water_canteen'
  | 'firewood';
```

---

## WalletState

```ts
interface WalletState {
  balance: number;             // USD
  recentTransactions: Transaction[];  // last 50, FIFO; older entries discarded
  lifetimeEarnings: number;    // total USD ever earned (for stats)
  lifetimeSpending: number;    // total USD ever spent
}

interface Transaction {
  id: string;                  // ulid
  timestamp: number;           // game-seconds since world start
  type: 'sale' | 'purchase' | 'quest_reward' | 'inn_meal' | 'inn_sleep';
  amount: number;              // USD; positive = income, negative = outflow
  vendorId?: VendorId;
  details?: {
    gramsByQuality?: GoldStash;
    spotPriceAtSale?: number;   // $/ozt
    itemPurchased?: string;
  };
}

type VendorId =
  | 'pawn_shop'
  | 'assayer'
  | 'online_buyer'
  | 'collector'
  | 'general_store'
  | 'innkeeper';
```

---

## EquipmentState

```ts
interface EquipmentState {
  ownedTiers: {
    pan: 1 | 2 | 3;
    shovel: 1 | 2 | 3;
    classifier: 1 | 2 | 3;
    sluice: 1 | 2 | 3;
    detector: 1 | 2 | 3;
    dredge: 0 | 1 | 2 | 3;     // 0 = locked; unlocks via quest + purchase
    snuffer: 1 | 2 | 3;
    gear: 1 | 2 | 3;
  };
  // For categories with mutually-exclusive equipped variants in v1+;
  // in v0 this is mostly cosmetic since each category has one active item at its tier.
  equipped: {
    pan: ToolId;
    // ...
  };
  sluiceDeployment?: {
    siteId: string;            // where the sluice is currently set up
    deployedAt: number;        // game-seconds; passive yield accrues from this point
    accruedGold: GoldStash;
  };
}

type ToolId = string;          // e.g., 'pan_t1', 'pan_t2', 'pan_t3'
```

---

## WorldState

```ts
interface WorldState {
  gameTime: number;            // game-seconds since world start (1 real min = 1 game hr default)
  season: 'spring' | 'summer' | 'fall' | 'winter';
  dayOfSeason: number;         // 1-based, resets on season change
  weather: {
    state: 'clear' | 'overcast' | 'rain' | 'fog' | 'snow';
    intensity: number;         // 0.0–1.0
    lastChangedAt: number;     // game-seconds
  };
  discovered: {
    siteIds: string[];         // panning sites the player has found
    mineIds: string[];
    hiddenClaimIds: string[];
  };
  // Per-site state (depletion, last-worked timestamp for regen)
  sites: Record<string, SiteState>;
  // Things the player has placed in the world
  placements: {
    sluice?: { siteId: string };
  };
}

interface SiteState {
  richnessRemaining: number;   // 0.0–1.0; depletes as worked, slowly regenerates
  lastWorkedAt: number;        // game-seconds
  totalTimesWorked: number;    // for stats and richness regen tuning
}
```

---

## EconomyState

```ts
interface EconomyState {
  spotPrice: {
    current: number;           // $/ozt right now (capped within session bounds)
    sessionStart: number;      // $/ozt when this session started; cap is ±20% of this
    sessionCap: { min: number; max: number };
    lastFetchedAt: number;     // epoch ms of last successful fetch
    baseline: number;          // fallback if all live fetches fail (default 2500)
    source: 'live' | 'cached' | 'baseline';  // how the current value was obtained
  };
  spotPriceHistory: SpotSample[];  // last ~24 game-hours, for trend arrow + sparkline UI
  pendingOnlineSales: PendingSale[];
}

interface SpotSample {
  gameTime: number;            // game-seconds when sampled
  price: number;               // $/ozt
}

interface PendingSale {
  id: string;
  depositedAt: number;         // game-seconds
  deliversAt: number;          // game-seconds (24 game-hours later)
  gramsByQuality: GoldStash;
  vendorMultiplier: number;    // locked at deposit time
  lockedSpotPrice: number;     // locked at deposit time
}
```

---

## QuestState

```ts
interface QuestState {
  active: Record<string, ActiveQuest>;
  completed: string[];         // quest IDs
  available: string[];         // unlocked but not yet accepted
  failed: string[];            // v0 has no fail states, but reserved for v1+
}

interface ActiveQuest {
  id: string;
  acceptedAt: number;          // game-seconds
  objectives: Record<string, ObjectiveState>;
}

interface ObjectiveState {
  progress: number;            // 0.0–1.0 or count, depending on objective type
  complete: boolean;
}
```

---

## NPCState

```ts
interface NPCState {
  relationships: Record<string, NPCRelationship>;
  collector: {
    inTown: boolean;
    arrivedAt?: number;        // game-seconds
    leavesAt?: number;
    visitsThisYear: number;    // resets on season cycle
  };
}

interface NPCRelationship {
  metAt?: number;              // game-seconds; undefined = not yet met
  conversationsHad: number;
  currentDialogNode?: string;  // for resuming mid-dialog
}
```

---

## ProgressionState

```ts
interface ProgressionState {
  tutorialCompleted: boolean;
  firstSaleCompleted: boolean;
  firstUpgradeCompleted: boolean;
  regionsVisited: string[];    // for sparse "achievement"-like flags
  stats: {
    totalGramsCollected: GoldStash;  // running totals by quality
    totalDollarsEarned: number;
    totalDollarsSpent: number;
    totalDistanceWalkedM: number;
    totalDigsPerformed: number;
    totalPansPerformed: number;
    totalDaysSurvived: number;
    longestSessionMinutes: number;
  };
}
```

---

## RngSeedState

```ts
interface RngSeedState {
  worldSeed: number;           // master seed; never changes after world creation
  // Per-system seeds derived from worldSeed for determinism + isolation
  goldSpawnSeed: number;
  weatherSeed: number;
  collectorVisitSeed: number;
}
```

---

## Settings (Stored Separately)

```ts
interface SettingsV1 {
  version: 1;
  graphics: {
    preset: 'low' | 'medium' | 'high' | 'ultra' | 'custom';
    drawDistance: number;
    shadowQuality: 'off' | 'low' | 'medium' | 'high';
    particleDensity: number;     // 0.0–1.0
    targetFps: 30 | 60 | 144 | 'unlimited';
  };
  audio: {
    master: number;              // 0.0–1.0
    music: number;
    sfx: number;
    ambient: number;
    dialogue: number;
  };
  controls: {
    mouse: { sensitivity: number; invertY: boolean };
    gamepad: {
      sensitivity: number;
      deadzone: number;
      invertY: boolean;
      glyphStyle: 'auto' | 'xbox' | 'playstation';
    };
    bindings: {
      keyboard: Record<ActionId, string>;  // action -> key code
      gamepad: Record<ActionId, string>;   // action -> button id
    };
  };
  accessibility: {
    textSize: 'small' | 'medium' | 'large';
    highContrastHud: boolean;
    colorblindMode: 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia';
    reducedMotion: boolean;
  };
}

type ActionId =
  | 'MOVE_FORWARD' | 'MOVE_BACKWARD' | 'MOVE_LEFT' | 'MOVE_RIGHT'
  | 'JUMP' | 'SPRINT' | 'INTERACT'
  | 'USE_TOOL' | 'DIG' | 'PAN'
  | 'INVENTORY' | 'MAP' | 'PAUSE'
  | 'TOOL_NEXT' | 'TOOL_PREV';
```

---

## Migration Runner Contract

```ts
type Migrator = (input: any) => any;

const CURRENT_VERSION = 1;

const migrators: Record<number, Migrator> = {
  // Example for the future:
  // 1: (v1) => ({ ...v1, version: 2, newField: defaultValue }),
};

function migrate(raw: any): SaveV1 {
  if (typeof raw?.version !== 'number') {
    throw new Error('Save corrupt: missing version');
  }
  let current = raw;
  while (current.version < CURRENT_VERSION) {
    const fn = migrators[current.version];
    if (!fn) throw new Error(`No migrator for v${current.version}`);
    current = fn(current);
  }
  if (current.version > CURRENT_VERSION) {
    throw new Error('Save is from a newer game version — please update.');
  }
  return current as SaveV1;
}
```

**Test contract:** every PR that bumps the schema version must include a fixture for the prior schema and a unit test that runs `migrate()` and asserts the resulting blob is valid for the new version.

---

## Save Triggers

The save is written to IndexedDB when any of the following happens:

| Trigger | Reason |
|---|---|
| Every 60 real-time seconds | Background autosave |
| On sale | Wallet/inventory change is irreversible — capture immediately |
| On purchase | Same |
| On quest accepted/completed | Quest state change is significant |
| On sleep (camp/inn) | Major world-time advance |
| On level/area transition | Mine entry/exit |
| On manual "Save & Quit" | User intent |
| On `beforeunload` (browser tab close) | Best-effort flush |

---

## Edge Cases & Recovery

- **Corrupt save**: detected via `JSON.parse` failure or schema validation failure (using a runtime validator like Zod). Game offers "Start New Game" or "Recover from auto-backup" (v0 keeps one backup of the prior save under `themhills:save:slot1.bak`).
- **Quota exceeded**: extremely unlikely for v0's blob size, but trapped — game shows a non-blocking warning and continues running in-memory.
- **Save written by newer game version**: refuse to load (would risk silent data loss); show "Update the game to load this save" message.
- **Network-dependent fields stale on offline reload**: spot price falls back to baseline; pending online sales still deliver based on game-time, not real-time, so they're unaffected.
