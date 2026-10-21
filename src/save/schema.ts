// Save schema v4 — v1 is documented in /save-schema-v1.md.
// Every PR that bumps CURRENT_SAVE_VERSION must add a migrator and a fixture test.
//
// v2 changes:
//   - EquipmentState.ownedTiers gains `headlamp: 1 | 2`. Standalone item,
//     purchasable from the General Store. Existing saves with gear ≥ 2
//     auto-grant headlamp = 2 in the migrator to preserve old behavior.
// v3 changes:
//   - SiteState replaces continuous `richnessRemaining` with discrete
//     `digsRemaining` + `maxDigs`. Each site rolls maxDigs ∈ [3, 15] at
//     creation; each pan decrements digsRemaining by 1; the site
//     visually vanishes at 0. Daily in-game midnight respawns all sites.
// v4 changes:
//   - New `settings` block holds player preferences for audio mix, look
//     sensitivity, and graphics. Defaults match the previously
//     hardcoded values so behavior is unchanged for fresh saves.
// v5 changes:
//   - `fieldwork` holds the work method, claims, color samples, journal,
//     rumors, crew, and the town price bias. Position, carry gold, and
//     wallet are untouched.
//   - Equipment gains pick, rocker, longTom, and hydraulic. Missing keys
//     migrate as unowned (0).
// v6 changes:
//   - Claims can hold a monitor. Coffee leaves a warmth timer. Machine
//     runs are counted so Pete's tool jobs can complete. Position, carry
//     gold, and wallet stay put.

export const CURRENT_SAVE_VERSION = 6;
export const BUILD_VERSION = '0.4.0-gameplay';

// ---------- Top-level shape ----------

export interface SaveV1 {
  version: 6;
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
  settings: SettingsState;
  fieldwork: FieldworkState;
}

// ---------- Settings ----------

export interface SettingsState {
  audio: {
    /** 0..1 — top-level volume scaler. */
    master: number;
    /** 0..1 — pink-noise stream burble. */
    ambient: number;
    /** 0..1 — per-event tones (UI taps, swings, splashes, chimes). */
    sfx: number;
  };
  look: {
    /** Multiplier on the default mouse sensitivity (default constant
     *  stays in input/manager.ts; this scales it). 1.0 = unchanged. */
    mouseSensitivity: number;
  };
  graphics: {
    /** Third-person FOV in degrees. Default 60. */
    fovDegrees: number;
    /** Real-time sun shadows. Disable on low-end hardware. */
    shadowsEnabled: boolean;
  };
}

export interface SaveMetadata {
  createdAt: number;
  lastSavedAt: number;
  playtimeSeconds: number;
  buildVersion: string;
  saveCount: number;
}

// ---------- Shared primitives ----------

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface GoldStash {
  flake_g: number;
  picker_g: number;
  nugget_g: number;
}

// ---------- Player ----------

export interface PlayerState {
  position: Vec3;
  rotation: { yaw: number; pitch: number };
  meters: { stamina: number; hunger: number; thirst: number };
  spawnPoint: 'camp' | 'inn';
  appearance: { presetId: string };
}

// ---------- Inventory ----------

export type ConsumableId =
  | 'berries'
  | 'mushrooms'
  | 'meal_ration'
  | 'water_canteen'
  | 'firewood'
  | 'coffee'
  | 'nails';

export interface InventoryState {
  carry: {
    gold: GoldStash;
    consumables: Partial<Record<ConsumableId, number>>;
    keyItems: string[];
  };
  vault: { gold: GoldStash };
}

// ---------- Wallet ----------

export type VendorId =
  | 'pawn_shop'
  | 'assayer'
  | 'online_buyer'
  | 'collector'
  | 'general_store'
  | 'innkeeper';

export type TransactionType = 'sale' | 'purchase' | 'quest_reward' | 'inn_meal' | 'inn_sleep';

export interface Transaction {
  id: string;
  timestamp: number;
  type: TransactionType;
  amount: number;
  vendorId?: VendorId;
  details?: {
    gramsByQuality?: GoldStash;
    spotPriceAtSale?: number;
    itemPurchased?: string;
  };
}

export interface WalletState {
  balance: number;
  recentTransactions: Transaction[];
  lifetimeEarnings: number;
  lifetimeSpending: number;
}

// ---------- Equipment ----------

export interface EquipmentState {
  ownedTiers: {
    pan: 1 | 2 | 3;
    shovel: 1 | 2 | 3;
    classifier: 1 | 2 | 3;
    sluice: 1 | 2 | 3;
    detector: 1 | 2 | 3;
    dredge: 0 | 1 | 2 | 3;
    snuffer: 1 | 2 | 3;
    gear: 1 | 2 | 3;
    /** Standalone purchasable item — 1 = not owned, 2 = owned. Drives the
     *  in-game point-light headlamp used at night, in storms, and inside
     *  the mine cave. Not part of the yield-multiplier calculation. */
    headlamp: 1 | 2;
    /** 0 = not owned. A pick changes the dig into one heavy strike and opens a mine. */
    pick: 0 | 1 | 2 | 3;
    /** 0 = not owned. A rocker replaces the pan wash with a rocking beat. */
    rocker: 0 | 1 | 2;
    /** 0 = not owned. A long tom is a slow, high-volume wash. */
    longTom: 0 | 1;
    /** 0 = not owned. Hydraulic mining strips a bar and needs a hired hand. */
    hydraulic: 0 | 1;
  };
  sluiceDeployment?: {
    siteId: string;
    deployedAt: number;
    accruedGold: GoldStash;
  };
}

// ---------- World ----------

export type Season = 'spring' | 'summer' | 'fall' | 'winter';
export type WeatherState = 'clear' | 'overcast' | 'rain' | 'fog' | 'snow';

export interface SiteState {
  /** How many more pans this site can take before it visually vanishes.
   *  Decremented by 1 per pan; site disappears at 0; daily midnight
   *  respawn regenerates fresh sites with a new maxDigs roll. */
  digsRemaining: number;
  /** Initial roll for this site (random 3–15 for streams, 8–15 for
   *  mines). Used to compute the per-dig yield falloff. */
  maxDigs: number;
  lastWorkedAt: number;
  totalTimesWorked: number;
}

export interface WorldState {
  gameTime: number;
  season: Season;
  dayOfSeason: number;
  weather: { state: WeatherState; intensity: number; lastChangedAt: number };
  discovered: { siteIds: string[]; mineIds: string[]; hiddenClaimIds: string[] };
  sites: Record<string, SiteState>;
  placements: { sluice?: { siteId: string } };
}

// ---------- Economy ----------

export interface SpotSample {
  gameTime: number;
  price: number;
}

export interface PendingSale {
  id: string;
  depositedAt: number;
  deliversAt: number;
  gramsByQuality: GoldStash;
  vendorMultiplier: number;
  lockedSpotPrice: number;
}

export interface EconomyState {
  spotPrice: {
    current: number;
    sessionStart: number;
    sessionCap: { min: number; max: number };
    lastFetchedAt: number;
    baseline: number;
    source: 'live' | 'cached' | 'baseline';
  };
  spotPriceHistory: SpotSample[];
  pendingOnlineSales: PendingSale[];
}

// ---------- Quests ----------

export interface ObjectiveState {
  progress: number;
  complete: boolean;
}

export interface ActiveQuest {
  id: string;
  acceptedAt: number;
  objectives: Record<string, ObjectiveState>;
}

export interface QuestState {
  active: Record<string, ActiveQuest>;
  completed: string[];
  available: string[];
  failed: string[];
}

// ---------- NPCs ----------

export interface NPCRelationship {
  metAt?: number;
  conversationsHad: number;
  currentDialogNode?: string;
}

export interface NPCState {
  relationships: Record<string, NPCRelationship>;
  collector: {
    inTown: boolean;
    arrivedAt?: number;
    leavesAt?: number;
    visitsThisYear: number;
  };
}

// ---------- Progression ----------

export interface ProgressionState {
  tutorialCompleted: boolean;
  firstSaleCompleted: boolean;
  firstUpgradeCompleted: boolean;
  regionsVisited: string[];
  stats: {
    totalGramsCollected: GoldStash;
    totalDollarsEarned: number;
    totalDollarsSpent: number;
    totalDistanceWalkedM: number;
    totalDigsPerformed: number;
    totalPansPerformed: number;
    totalDaysSurvived: number;
    longestSessionMinutes: number;
  };
}

// ---------- RNG ----------

export interface RngSeedState {
  worldSeed: number;
  goldSpawnSeed: number;
  weatherSeed: number;
  collectorVisitSeed: number;
}

// ---------- Fieldwork (v5) ----------

export type Habitat = 'inside_bend' | 'gravel_bar' | 'bedrock' | 'boulder_lee' | 'tail' | 'barren';

export type WorkMethod = 'pan' | 'rocker' | 'sluice' | 'long_tom' | 'hydraulic' | 'hardrock';

export interface ClaimImprovements {
  camp: 0 | 1 | 2;
  cache: boolean;
  rocker: boolean;
  sluice: boolean;
  longTom: boolean;
  hydraulic: boolean;
}

export function emptyImprovements(): ClaimImprovements {
  return { camp: 0, cache: false, rocker: false, sluice: false, longTom: false, hydraulic: false };
}

export interface ClaimRecord {
  id: string;
  kind: 'placer' | 'lode';
  /** Creek id, or a mine id for a lode. */
  streamId: string;
  x: number;
  z: number;
  habitat: Habitat;
  /** 1 fresh, falling as the claim is worked. */
  pay: number;
  stakedAt: number;
  name: string;
  improvements: ClaimImprovements;
  /** Game time a jumper showed up, or null. */
  jumperSince: number | null;
}

export interface ColorSample {
  id: string;
  streamId: string | null;
  x: number;
  z: number;
  habitat: Habitat;
  colors: number;
  gameTime: number;
}

export interface JournalEntry {
  id: string;
  title: string;
  body: string;
  gameTime: number;
}

export interface FieldworkState {
  method: WorkMethod;
  claims: ClaimRecord[];
  hands: number;
  samples: ColorSample[];
  journal: JournalEntry[];
  rumorsHeard: string[];
  unlockedStreams: string[];
  /** Downstream shift of each creek's pay streak. Rain increases it. */
  payShift: Record<string, number>;
  lastJumperRoll: number;
  /** Town price multiplier walked once per in-game day. */
  townBias: number;
  /** Hunger does not drain until this game time. A meal sets it. */
  fedUntil: number;
  /** Coffee warmth and easier stamina until this game time. */
  coffeeUntil: number;
  /** Completed runs of each machine. Pete's tool jobs read these. */
  machineRuns: { rocker: number; sluice: number; long_tom: number; hydraulic: number };
}

export function defaultFieldwork(): FieldworkState {
  return {
    method: 'pan',
    claims: [],
    hands: 0,
    samples: [],
    journal: [],
    rumorsHeard: [],
    unlockedStreams: ['coyote_creek'],
    payShift: { coyote_creek: 0, buckeye_run: 0 },
    lastJumperRoll: 0,
    townBias: 1,
    fedUntil: 0,
    coffeeUntil: 0,
    machineRuns: { rocker: 0, sluice: 0, long_tom: 0, hydraulic: 0 },
  };
}

// ---------- Defaults ----------

export function createDefaultSave(): SaveV1 {
  const now = Date.now();
  const seed = Math.floor(Math.random() * 2 ** 31);
  return {
    version: 6,
    metadata: {
      createdAt: now,
      lastSavedAt: now,
      playtimeSeconds: 0,
      buildVersion: BUILD_VERSION,
      saveCount: 0,
    },
    player: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { yaw: 0, pitch: 0 },
      meters: { stamina: 1, hunger: 1, thirst: 1 },
      spawnPoint: 'camp',
      appearance: { presetId: 'default' },
    },
    inventory: {
      carry: {
        gold: { flake_g: 0, picker_g: 0, nugget_g: 0 },
        consumables: {},
        keyItems: [],
      },
      vault: { gold: { flake_g: 0, picker_g: 0, nugget_g: 0 } },
    },
    wallet: {
      balance: 0,
      recentTransactions: [],
      lifetimeEarnings: 0,
      lifetimeSpending: 0,
    },
    equipment: {
      ownedTiers: {
        pan: 1,
        shovel: 1,
        classifier: 1,
        sluice: 1,
        detector: 1,
        dredge: 0,
        snuffer: 1,
        gear: 1,
        headlamp: 1,
        pick: 0,
        rocker: 0,
        longTom: 0,
        hydraulic: 0,
      },
    },
    world: {
      gameTime: 0,
      season: 'spring',
      dayOfSeason: 1,
      weather: { state: 'clear', intensity: 0, lastChangedAt: 0 },
      discovered: { siteIds: [], mineIds: [], hiddenClaimIds: [] },
      sites: {},
      placements: {},
    },
    economy: {
      spotPrice: {
        current: 2500,
        sessionStart: 2500,
        sessionCap: { min: 2000, max: 3000 },
        lastFetchedAt: 0,
        baseline: 2500,
        source: 'baseline',
      },
      spotPriceHistory: [],
      pendingOnlineSales: [],
    },
    quests: { active: {}, completed: [], available: [], failed: [] },
    npcs: {
      relationships: {},
      collector: { inTown: false, visitsThisYear: 0 },
    },
    progression: {
      tutorialCompleted: false,
      firstSaleCompleted: false,
      firstUpgradeCompleted: false,
      regionsVisited: [],
      stats: {
        totalGramsCollected: { flake_g: 0, picker_g: 0, nugget_g: 0 },
        totalDollarsEarned: 0,
        totalDollarsSpent: 0,
        totalDistanceWalkedM: 0,
        totalDigsPerformed: 0,
        totalPansPerformed: 0,
        totalDaysSurvived: 0,
        longestSessionMinutes: 0,
      },
    },
    rngSeeds: {
      worldSeed: seed,
      goldSpawnSeed: seed ^ 0x1234,
      weatherSeed: seed ^ 0x5678,
      collectorVisitSeed: seed ^ 0x9abc,
    },
    settings: defaultSettings(),
    fieldwork: {
      ...defaultFieldwork(),
      journal: [
        {
          id: 'welcome',
          title: 'A new creek',
          body: 'Coyote Creek is east. The first pan is one swing, then a short wash. Press J anytime for this journal.',
          gameTime: 0,
        },
      ],
    },
  };
}

export function defaultSettings(): SettingsState {
  return {
    audio: { master: 1.0, ambient: 1.0, sfx: 1.0 },
    look: { mouseSensitivity: 1.0 },
    graphics: { fovDegrees: 60, shadowsEnabled: true },
  };
}
