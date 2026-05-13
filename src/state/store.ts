// Vanilla Zustand store — we don't use React, so we skip the React-specific bindings.
// Phase 2 adds gold/site mutators on top of the Phase 0 hydrate/serialize contract.

import { createStore } from 'zustand/vanilla';
import {
  createDefaultSave,
  defaultSettings,
  type ActiveQuest,
  type GoldStash,
  type SaveV1,
  type SettingsState,
  type SiteState,
  type Transaction,
  type VendorId,
  type WeatherState,
} from '@/save/schema';
import {
  HUNGER_DRAIN_PER_SEC,
  THIRST_DRAIN_PER_SEC,
  THIRST_REGEN_IN_WATER_PER_SEC,
} from '@/game/survival';
import {
  applyDollarsToQuestObjectives,
  applyGoldToQuestObjectives,
  getQuestDef,
} from '@/quests/quests';

const GRAMS_PER_OZT = 31.1035;

// Stream sites get this random range of max-digs at creation. Mines pass
// their own range (typically 8–15).
const DEFAULT_DIGS_RANGE = { min: 3, max: 15 };

export interface GameStateStore {
  save: SaveV1;
  hydrate(loaded: SaveV1): void;
  serialize(): SaveV1;

  /** Accumulate gold in the player's carry inventory. */
  addGoldToCarry(stash: GoldStash): void;

  /** Returns the site's current state, creating one at full digsRemaining
   *  if absent. `digsRange` controls the random max-digs roll — defaults
   *  to [3, 15] (stream sites); mines pass a higher range. */
  getOrCreateSite(siteId: string, digsRange?: { min: number; max: number }): SiteState;

  /** Record one dig at a site: decrement digsRemaining, update timestamps. */
  touchSite(siteId: string, gameTime: number): void;

  /** Merge a partial settings patch into save.settings. The patch is
   *  shallow-merged at the top level; the nested sub-objects (audio,
   *  look, graphics) are replaced as whole. Use updateSettingsSlice for
   *  finer updates. */
  setSettings(patch: Partial<SettingsState>): void;

  /** Merge a partial slice into save.settings[key]. Easier than
   *  rebuilding the whole audio block to change one slider. */
  updateSettingsSlice<K extends keyof SettingsState>(
    key: K,
    patch: Partial<SettingsState[K]>,
  ): void;

  /** Increment the lifetime pan counter; returns the new value (used as RNG component). */
  incrementPanCount(): number;

  /** Update the current gold spot price + source label, append to short history. */
  setSpotPrice(price: number, source: 'live' | 'cached' | 'baseline'): void;

  /**
   * Sell all carry gold to a vendor at the given multiplier set + current spot.
   * Returns the gross dollar amount earned and the grams sold for UI feedback.
   */
  sellAllCarry(
    vendorId: VendorId,
    multipliers: { flake: number; picker: number; nugget: number },
    spotPricePerOzt: number,
    gameTime: number,
  ): { earned: number; gramsByQuality: GoldStash };

  /**
   * Spend wallet cash to upgrade a tool tier. Returns true if purchase
   * succeeded, false if insufficient funds. Caller is responsible for
   * passing valid tier transitions; the mutator just trusts the inputs.
   */
  purchaseUpgrade(
    category: keyof SaveV1['equipment']['ownedTiers'],
    cost: number,
    newTier: number,
    gameTime: number,
  ): boolean;

  /**
   * Drain hunger + thirst over time. If `inStreamWater` is true, thirst regens
   * faster than it drains so the net effect is filling the meter. Stamina is
   * owned by character.ts and updated separately at save time.
   */
  tickMeters(dt: number, inStreamWater: boolean): void;

  /** Camp rest — refill hunger + thirst to full. */
  restAtCamp(): void;

  /**
   * Pay the inn's room fee (deducts wallet) and refill hunger + thirst.
   * Returns true if the transaction went through, false if insufficient funds.
   * Caller (main.ts) advances worldTime to next morning on success.
   */
  payAndRestAtInn(cost: number, gameTime: number): boolean;

  /** Add a quest to active state. No-op if already active or completed. */
  acceptQuest(questId: string, gameTime: number): void;

  /**
   * Apply a freshly-collected gold stash to all active quests' collectGold
   * objectives. Called every time addGoldToCarry is.
   */
  applyGoldToQuests(stash: GoldStash): void;

  /**
   * Move quest from active → completed and pay the reward to the wallet.
   * Returns earned dollars, or 0 if the quest isn't currently active.
   */
  turnInQuest(questId: string, gameTime: number): number;

  /**
   * Persist the weather snapshot. Called every autosave so the visual state
   * survives reloads; not called every frame (the controller's intensity
   * tweens live in memory between saves).
   */
  setWeather(state: WeatherState, intensity: number, gameTime: number): void;
}

export const gameStore = createStore<GameStateStore>((set, get) => ({
  save: createDefaultSave(),

  hydrate: (loaded) => set({ save: loaded }),

  serialize: () => {
    const s = get().save;
    return {
      ...s,
      metadata: {
        ...s.metadata,
        lastSavedAt: Date.now(),
        saveCount: s.metadata.saveCount + 1,
      },
    };
  },

  addGoldToCarry(stash) {
    set((state) => {
      const cur = state.save.inventory.carry.gold;
      return {
        save: {
          ...state.save,
          inventory: {
            ...state.save.inventory,
            carry: {
              ...state.save.inventory.carry,
              gold: {
                flake_g: cur.flake_g + stash.flake_g,
                picker_g: cur.picker_g + stash.picker_g,
                nugget_g: cur.nugget_g + stash.nugget_g,
              },
            },
          },
          progression: {
            ...state.save.progression,
            stats: {
              ...state.save.progression.stats,
              totalGramsCollected: {
                flake_g: state.save.progression.stats.totalGramsCollected.flake_g + stash.flake_g,
                picker_g:
                  state.save.progression.stats.totalGramsCollected.picker_g + stash.picker_g,
                nugget_g:
                  state.save.progression.stats.totalGramsCollected.nugget_g + stash.nugget_g,
              },
            },
          },
        },
      };
    });
  },

  getOrCreateSite(siteId, digsRange = DEFAULT_DIGS_RANGE) {
    const existing = get().save.world.sites[siteId];
    if (existing) return existing;
    // Roll maxDigs in [min, max] inclusive. Math.random is fine here —
    // this is per-site state, not part of any deterministic replay path.
    const span = Math.max(1, digsRange.max - digsRange.min + 1);
    const maxDigs = digsRange.min + Math.floor(Math.random() * span);
    const fresh: SiteState = {
      digsRemaining: maxDigs,
      maxDigs,
      lastWorkedAt: 0,
      totalTimesWorked: 0,
    };
    set((state) => ({
      save: {
        ...state.save,
        world: {
          ...state.save.world,
          sites: { ...state.save.world.sites, [siteId]: fresh },
        },
      },
    }));
    return fresh;
  },

  touchSite(siteId, gameTime) {
    set((state) => {
      const cur =
        state.save.world.sites[siteId] ??
        ({
          digsRemaining: DEFAULT_DIGS_RANGE.max,
          maxDigs: DEFAULT_DIGS_RANGE.max,
          lastWorkedAt: 0,
          totalTimesWorked: 0,
        } as SiteState);
      const next: SiteState = {
        digsRemaining: Math.max(0, cur.digsRemaining - 1),
        maxDigs: cur.maxDigs,
        lastWorkedAt: gameTime,
        totalTimesWorked: cur.totalTimesWorked + 1,
      };
      return {
        save: {
          ...state.save,
          world: {
            ...state.save.world,
            sites: { ...state.save.world.sites, [siteId]: next },
          },
        },
      };
    });
  },

  setSettings(patch) {
    set((state) => ({
      save: {
        ...state.save,
        settings: { ...(state.save.settings ?? defaultSettings()), ...patch },
      },
    }));
  },

  updateSettingsSlice(key, patch) {
    set((state) => {
      const base = state.save.settings ?? defaultSettings();
      return {
        save: {
          ...state.save,
          settings: { ...base, [key]: { ...base[key], ...patch } },
        },
      };
    });
  },

  incrementPanCount() {
    let next = 0;
    set((state) => {
      next = state.save.progression.stats.totalPansPerformed + 1;
      return {
        save: {
          ...state.save,
          progression: {
            ...state.save.progression,
            stats: {
              ...state.save.progression.stats,
              totalPansPerformed: next,
            },
          },
        },
      };
    });
    return next;
  },

  sellAllCarry(vendorId, multipliers, spotPricePerOzt, gameTime) {
    let earned = 0;
    let gramsByQuality: GoldStash = { flake_g: 0, picker_g: 0, nugget_g: 0 };
    set((state) => {
      const carry = state.save.inventory.carry.gold;
      const oztFlake = carry.flake_g / GRAMS_PER_OZT;
      const oztPicker = carry.picker_g / GRAMS_PER_OZT;
      const oztNugget = carry.nugget_g / GRAMS_PER_OZT;
      earned =
        oztFlake * spotPricePerOzt * multipliers.flake +
        oztPicker * spotPricePerOzt * multipliers.picker +
        oztNugget * spotPricePerOzt * multipliers.nugget;
      gramsByQuality = { ...carry };
      const tx: Transaction = {
        id: `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: gameTime,
        type: 'sale',
        amount: earned,
        vendorId,
        details: {
          gramsByQuality,
          spotPriceAtSale: spotPricePerOzt,
        },
      };

      // Apply dollar amount to any active sellDollars objectives. Same
      // transaction as the wallet update so progress can never desync.
      const updatedActive: Record<string, ActiveQuest> = { ...state.save.quests.active };
      for (const id of Object.keys(updatedActive)) {
        const def = getQuestDef(id);
        if (!def) continue;
        const r = applyDollarsToQuestObjectives(updatedActive[id]!, def, earned, vendorId);
        if (r.anyChanged) updatedActive[id] = r.updated;
      }

      return {
        save: {
          ...state.save,
          inventory: {
            ...state.save.inventory,
            carry: {
              ...state.save.inventory.carry,
              gold: { flake_g: 0, picker_g: 0, nugget_g: 0 },
            },
          },
          wallet: {
            ...state.save.wallet,
            balance: state.save.wallet.balance + earned,
            lifetimeEarnings: state.save.wallet.lifetimeEarnings + earned,
            recentTransactions: [...state.save.wallet.recentTransactions.slice(-49), tx],
          },
          quests: { ...state.save.quests, active: updatedActive },
        },
      };
    });
    return { earned, gramsByQuality };
  },

  purchaseUpgrade(category, cost, newTier, gameTime) {
    const balance = get().save.wallet.balance;
    if (balance < cost) return false;
    set((state) => {
      const tx: Transaction = {
        id: `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: gameTime,
        type: 'purchase',
        amount: -cost,
        vendorId: 'general_store',
        details: { itemPurchased: `${category}_t${newTier}` },
      };
      return {
        save: {
          ...state.save,
          wallet: {
            ...state.save.wallet,
            balance: state.save.wallet.balance - cost,
            lifetimeSpending: state.save.wallet.lifetimeSpending + cost,
            recentTransactions: [...state.save.wallet.recentTransactions.slice(-49), tx],
          },
          equipment: {
            ...state.save.equipment,
            ownedTiers: {
              ...state.save.equipment.ownedTiers,
              [category]: newTier,
            },
          },
          progression: {
            ...state.save.progression,
            firstUpgradeCompleted: true,
          },
        },
      };
    });
    return true;
  },

  tickMeters(dt, inStreamWater) {
    set((state) => {
      const cur = state.save.player.meters;
      let hunger = cur.hunger - HUNGER_DRAIN_PER_SEC * dt;
      let thirst = cur.thirst - THIRST_DRAIN_PER_SEC * dt;
      if (inStreamWater) {
        thirst += THIRST_REGEN_IN_WATER_PER_SEC * dt;
      }
      hunger = Math.max(0, Math.min(1, hunger));
      thirst = Math.max(0, Math.min(1, thirst));
      if (hunger === cur.hunger && thirst === cur.thirst) return state;
      return {
        save: {
          ...state.save,
          player: {
            ...state.save.player,
            meters: { ...cur, hunger, thirst },
          },
        },
      };
    });
  },

  restAtCamp() {
    set((state) => {
      const cur = state.save.player.meters;
      if (cur.hunger >= 1 && cur.thirst >= 1) return state;
      return {
        save: {
          ...state.save,
          player: {
            ...state.save.player,
            meters: { ...cur, hunger: 1, thirst: 1 },
          },
        },
      };
    });
  },

  payAndRestAtInn(cost, gameTime) {
    const balance = get().save.wallet.balance;
    if (balance < cost) return false;
    set((state) => {
      const tx: Transaction = {
        id: `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: gameTime,
        type: 'inn_sleep',
        amount: -cost,
        vendorId: 'innkeeper',
      };
      return {
        save: {
          ...state.save,
          wallet: {
            ...state.save.wallet,
            balance: state.save.wallet.balance - cost,
            lifetimeSpending: state.save.wallet.lifetimeSpending + cost,
            recentTransactions: [...state.save.wallet.recentTransactions.slice(-49), tx],
          },
          player: {
            ...state.save.player,
            meters: { ...state.save.player.meters, hunger: 1, thirst: 1 },
          },
        },
      };
    });
    return true;
  },

  acceptQuest(questId, gameTime) {
    const state = get();
    if (questId in state.save.quests.active) return;
    if (state.save.quests.completed.includes(questId)) return;
    const fresh: ActiveQuest = {
      id: questId,
      acceptedAt: gameTime,
      objectives: {},
    };
    set((s) => ({
      save: {
        ...s.save,
        quests: {
          ...s.save.quests,
          active: { ...s.save.quests.active, [questId]: fresh },
        },
      },
    }));
  },

  applyGoldToQuests(stash) {
    set((state) => {
      const active = state.save.quests.active;
      const ids = Object.keys(active);
      if (ids.length === 0) return state;
      let anyChanged = false;
      const updated: Record<string, ActiveQuest> = { ...active };
      for (const id of ids) {
        const def = getQuestDef(id);
        if (!def) continue;
        const cur = active[id]!;
        const result = applyGoldToQuestObjectives(cur, def, stash);
        if (result.anyChanged) {
          updated[id] = result.updated;
          anyChanged = true;
        }
      }
      if (!anyChanged) return state;
      return {
        save: {
          ...state.save,
          quests: { ...state.save.quests, active: updated },
        },
      };
    });
  },

  turnInQuest(questId, gameTime) {
    const state = get();
    const active = state.save.quests.active[questId];
    if (!active) return 0;
    const def = getQuestDef(questId);
    if (!def) return 0;
    const reward = def.reward.dollars;
    set((s) => {
      const newActive = { ...s.save.quests.active };
      delete newActive[questId];
      const tx: Transaction = {
        id: `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: gameTime,
        type: 'quest_reward',
        amount: reward,
      };
      return {
        save: {
          ...s.save,
          quests: {
            ...s.save.quests,
            active: newActive,
            completed: [...s.save.quests.completed, questId],
          },
          wallet: {
            ...s.save.wallet,
            balance: s.save.wallet.balance + reward,
            lifetimeEarnings: s.save.wallet.lifetimeEarnings + reward,
            recentTransactions: [...s.save.wallet.recentTransactions.slice(-49), tx],
          },
        },
      };
    });
    return reward;
  },

  setWeather(state, intensity, gameTime) {
    set((s) => ({
      save: {
        ...s.save,
        world: {
          ...s.save.world,
          weather: { state, intensity, lastChangedAt: gameTime },
        },
      },
    }));
  },

  setSpotPrice(price, source) {
    set((state) => {
      const prev = state.save.economy;
      const sample = { gameTime: state.save.world.gameTime, price };
      // Keep at most ~24 in-game hours of samples — at 15-min refresh that's
      // 96 entries. Trim aggressively so the save blob doesn't grow unbounded.
      const history = [...prev.spotPriceHistory, sample].slice(-96);
      return {
        save: {
          ...state.save,
          economy: {
            ...prev,
            spotPrice: {
              ...prev.spotPrice,
              current: price,
              lastFetchedAt: Date.now(),
              source,
            },
            spotPriceHistory: history,
          },
        },
      };
    });
  },
}));
