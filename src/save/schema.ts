// Save schema v1 — see /save-schema-v1.md for the full design contract.
// Every PR that bumps CURRENT_SAVE_VERSION must add a migrator and a fixture test.

export const CURRENT_SAVE_VERSION = 1;
export const BUILD_VERSION = '0.1.12-phase10b';

// ---------- Top-level shape ----------

export interface SaveV1 {
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

export type ConsumableId = 'berries' | 'mushrooms' | 'meal_ration' | 'water_canteen' | 'firewood';

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
  richnessRemaining: number;
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

// ---------- Defaults ----------

export function createDefaultSave(): SaveV1 {
  const now = Date.now();
  const seed = Math.floor(Math.random() * 2 ** 31);
  return {
    version: 1,
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
  };
}
