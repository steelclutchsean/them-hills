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
  type WalletState,
  type WeatherState,
  emptyImprovements,
} from '@/save/schema';
import {
  HUNGER_DRAIN_PER_SEC,
  THIRST_DRAIN_PER_SEC,
  THIRST_REGEN_IN_WATER_PER_SEC,
} from '@/game/survival';
import {
  applyDollarsToQuestObjectives,
  applyFlagToQuestObjectives,
  applyGoldToQuestObjectives,
  getQuestDef,
  type ObjectiveType,
} from '@/quests/quests';
import { ensureArc, priced } from '@/game/campaign';
import type { GroundRead } from '@/game/geology';
import {
  CABIN_COST,
  CACHE_COST,
  CREEK_LESSON,
  HIRE_COST,
  LEANTO_COST,
  LODE_FEE,
  MAX_HANDS,
  RUMORS,
  bestCamp,
  evaluatePlacer,
  nextMethod,
  remember,
  supplyDef,
  type ThreatEvent,
} from '@/game/fieldwork';
import type { ClaimRecord, ColorSample, ConsumableId, WorkMethod } from '@/save/schema';

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
   *  rebuilding the whole audio block to change one slider.
   *  Scalar settings (text size, subtitles) go through setSettings. */
  updateSettingsSlice<K extends SettingsObjectKey>(key: K, patch: Partial<SettingsState[K]>): void;

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
  tickMeters(dt: number, inStreamWater: boolean, hungerPaused?: boolean): void;

  /** Camp rest — refill hunger + thirst to full. Eats packed food if you have it. */
  restAtCamp(gameTime?: number): void;

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

  /** First prospect finished. Hunger and thirst stay full until this. */
  markTutorialComplete(): void;
  /** First gold was sold. Clears the opening objective. */
  markFirstSale(): void;

  stakePlacer(
    x: number,
    z: number,
    read: GroundRead,
    gameTime: number,
  ): { ok: boolean; reason: string; claimId?: string; habitat?: string };
  fileLode(mineId: string, x: number, z: number, gameTime: number): { ok: boolean; reason: string };
  recordSample(
    read: GroundRead,
    x: number,
    z: number,
    gameTime: number,
  ): { colors: number; line: string; unlocked: string | null; habitat: string };
  cycleMethod(dir: 1 | -1): WorkMethod;
  buySupply(id: string, gameTime: number): boolean;
  sellSupply(id: string, gameTime: number): boolean;
  buyImprovement(id: string, gameTime: number): boolean;
  hireHand(gameTime: number): boolean;
  noteMachineRun(kind: 'rocker' | 'sluice' | 'long_tom' | 'hydraulic', gameTime: number): void;
  resolveJumper(
    claimId: string,
    how: 'scare' | 'pay' | 'caught' | 'escaped',
    gameTime: number,
  ): { ok: boolean; reason: string };
  giveLesson(gameTime: number): void;
  hearNextRumor(gameTime: number): { id: string; title: string; body: string } | null;
  onRain(gameTime: number): boolean;
  onNewDay(gameTime: number): void;
  tickThreats(gameTime: number): ThreatEvent[];
  workClaimsNear(x: number, z: number, gameTime: number, mineId?: string | null): void;
}

type SettingsObjectKey = {
  [K in keyof SettingsState]-?: SettingsState[K] extends object ? K : never;
}[keyof SettingsState];

export const gameStore = createStore<GameStateStore>((set, get) => ({
  save: createDefaultSave(),

  hydrate: (loaded) => set({ save: ensureArc(loaded) }),

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

  markTutorialComplete() {
    set((state) => {
      if (state.save.progression.tutorialCompleted) return state;
      return {
        save: {
          ...state.save,
          progression: { ...state.save.progression, tutorialCompleted: true },
        },
      };
    });
  },

  markFirstSale() {
    set((state) => {
      if (state.save.progression.firstSaleCompleted) return state;
      return {
        save: {
          ...state.save,
          progression: { ...state.save.progression, firstSaleCompleted: true },
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
    const due = priced(get().save, cost);
    const balance = get().save.wallet.balance;
    if (balance < due) return false;
    set((state) => {
      const tx: Transaction = {
        id: `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: gameTime,
        type: 'purchase',
        amount: -due,
        vendorId: 'general_store',
        details: { itemPurchased: `${category}_t${newTier}` },
      };
      return {
        save: {
          ...state.save,
          wallet: {
            ...state.save.wallet,
            balance: state.save.wallet.balance - due,
            lifetimeSpending: state.save.wallet.lifetimeSpending + due,
            recentTransactions: [...state.save.wallet.recentTransactions.slice(-49), tx],
          },
          equipment: {
            ...state.save.equipment,
            ownedTiers: {
              ...state.save.equipment.ownedTiers,
              [category]: newTier,
            },
          },
          fieldwork: {
            ...state.save.fieldwork,
            method: methodAfterPurchase(state.save.fieldwork.method, category, newTier),
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

  tickMeters(dt, inStreamWater, hungerPaused = false) {
    set((state) => {
      const cur = state.save.player.meters;
      let hunger = cur.hunger - (hungerPaused ? 0 : HUNGER_DRAIN_PER_SEC) * dt;
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

  restAtCamp(gameTime = 0) {
    set((state) => {
      const consumables = { ...state.save.inventory.carry.consumables };
      let fedUntil = state.save.fieldwork.fedUntil;
      const eat = (id: ConsumableId) => {
        const n = consumables[id] ?? 0;
        if (n <= 0) return false;
        if (n === 1) delete consumables[id];
        else consumables[id] = n - 1;
        return true;
      };
      let coffeeUntil = state.save.fieldwork.coffeeUntil;
      if (eat('meal_ration')) fedUntil = Math.max(fedUntil, gameTime + 220);
      else if (eat('coffee')) {
        fedUntil = Math.max(fedUntil, gameTime + 90);
        coffeeUntil = Math.max(coffeeUntil, gameTime + 200);
      }
      const camp = bestCamp(state.save.fieldwork.claims);
      if (camp >= 1) fedUntil = Math.max(fedUntil, gameTime + (camp >= 2 ? 420 : 260));
      let carry = state.save.inventory.carry.gold;
      let vault = state.save.inventory.vault.gold;
      if (state.save.fieldwork.claims.some((c) => c.improvements.cache)) {
        vault = {
          flake_g: vault.flake_g + carry.flake_g,
          picker_g: vault.picker_g + carry.picker_g,
          nugget_g: vault.nugget_g + carry.nugget_g,
        };
        carry = { flake_g: 0, picker_g: 0, nugget_g: 0 };
      }
      return {
        save: {
          ...state.save,
          player: {
            ...state.save.player,
            meters: { ...state.save.player.meters, hunger: 1, thirst: 1 },
          },
          inventory: {
            ...state.save.inventory,
            carry: { ...state.save.inventory.carry, gold: carry, consumables },
            vault: { gold: vault },
          },
          fieldwork: { ...state.save.fieldwork, fedUntil, coffeeUntil },
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

  stakePlacer(x, z, read, gameTime) {
    const verdict = evaluatePlacer(get().save, x, z, read);
    if (!verdict.ok) return verdict;
    const id = `claim_${gameTime.toFixed(0)}_${Math.floor(Math.random() * 9999).toString(36)}`;
    const claim: ClaimRecord = {
      id,
      kind: 'placer',
      streamId: read.streamId ?? 'coyote_creek',
      x,
      z,
      habitat: read.habitat,
      pay: 1,
      stakedAt: gameTime,
      name: verdict.name,
      improvements: emptyImprovements(),
      jumperSince: null,
    };
    set((state) => {
      const field = state.save.fieldwork;
      return {
        save: {
          ...state.save,
          wallet: spend(state.save.wallet, verdict.cost, gameTime, 'claim filing'),
          quests: flagQuests(state.save, 'stakeClaim', 1),
          fieldwork: {
            ...field,
            claims: [...field.claims, claim],
            journal: remember(field.journal, {
              id: `staked-${id}`,
              title: 'Claim filed',
              body: `${verdict.name}. ${read.advice}`,
              gameTime,
            }),
          },
        },
      };
    });
    return { ok: true, reason: verdict.name, claimId: id, habitat: read.habitat };
  },

  fileLode(mineId, x, z, gameTime) {
    const save = get().save;
    if (save.equipment.ownedTiers.pick < 1 && save.equipment.ownedTiers.shovel < 3) {
      return { ok: false, reason: 'A lode needs a pick.' };
    }
    if (save.fieldwork.claims.some((c) => c.kind === 'lode')) {
      return { ok: false, reason: 'You already hold a lode.' };
    }
    if (save.fieldwork.claims.length >= 3) return { ok: false, reason: 'The county book is full.' };
    const cost = LODE_FEE;
    if (save.wallet.balance < cost)
      return { ok: false, reason: `Filing a lode costs $${LODE_FEE}.` };
    const id = `lode_${mineId}`;
    const claim: ClaimRecord = {
      id,
      kind: 'lode',
      streamId: mineId,
      x,
      z,
      habitat: 'bedrock',
      pay: 1,
      stakedAt: gameTime,
      name: `${mineId} ridge lode`,
      improvements: emptyImprovements(),
      jumperSince: null,
    };
    set((state) => ({
      save: {
        ...state.save,
        wallet: spend(state.save.wallet, cost, gameTime, 'lode filing'),
        quests: flagQuests(state.save, 'stakeClaim', 1),
        fieldwork: {
          ...state.save.fieldwork,
          claims: [...state.save.fieldwork.claims, claim],
          campaign:
            mineId === 'north'
              ? {
                  ...state.save.fieldwork.campaign,
                  act:
                    state.save.fieldwork.campaign.act < 2 ? 2 : state.save.fieldwork.campaign.act,
                  heard: state.save.fieldwork.campaign.heard.includes('lode-open')
                    ? state.save.fieldwork.campaign.heard
                    : [...state.save.fieldwork.campaign.heard, 'lode-open'],
                }
              : state.save.fieldwork.campaign,
          lode:
            mineId === 'north'
              ? {
                  ...state.save.fieldwork.lode,
                  charges: Math.max(2, state.save.fieldwork.lode.charges),
                }
              : state.save.fieldwork.lode,
          journal: remember(state.save.fieldwork.journal, {
            id: `lode-${mineId}`,
            title: 'Lode filed',
            body: `Hard-rock claim on the ${mineId} mine. The pick pays better inside your ground.`,
            gameTime,
          }),
        },
      },
    }));
    return { ok: true, reason: claim.name };
  },

  recordSample(read, x, z, gameTime) {
    const sample: ColorSample = {
      id: `smp_${gameTime.toFixed(0)}_${Math.floor(Math.random() * 999).toString(36)}`,
      streamId: read.streamId,
      x,
      z,
      habitat: read.habitat,
      colors: read.colors,
      gameTime,
    };
    let unlocked: string | null = null;
    set((state) => {
      const field = state.save.fieldwork;
      const samples = [...field.samples, sample].slice(-30);
      let journal = field.journal;
      let unlockedStreams = field.unlockedStreams;
      let rumorsHeard = field.rumorsHeard;
      if (read.colors >= 6) {
        journal = remember(journal, {
          id: `color-${read.streamId ?? 'dry'}-${read.habitat}`,
          title: `${read.colors} colors`,
          body: `${read.advice} That is a pay streak.`,
          gameTime,
        });
      }
      if (
        read.streamId === 'coyote_creek' &&
        read.colors >= 5 &&
        !unlockedStreams.includes('buckeye_run')
      ) {
        unlockedStreams = [...unlockedStreams, 'buckeye_run'];
        unlocked = 'buckeye_run';
        rumorsHeard = rumorsHeard.includes('buckeye') ? rumorsHeard : [...rumorsHeard, 'buckeye'];
        journal = remember(journal, {
          id: 'unlock-buckeye',
          title: 'Buckeye Run',
          body: 'You can read color now. The green creek south of town will pay the same way Coyote does.',
          gameTime,
        });
      }
      return {
        save: {
          ...state.save,
          quests: flagQuests(state.save, 'sampleColors', read.colors),
          fieldwork: { ...field, samples, journal, unlockedStreams, rumorsHeard },
        },
      };
    });
    const where = read.streamId ? read.label : 'dry ground';
    const line =
      read.colors <= 0
        ? read.advice
        : `${read.colors} color${read.colors === 1 ? '' : 's'} — ${where}. ${read.advice}`;
    return { colors: read.colors, line, unlocked, habitat: read.habitat };
  },

  cycleMethod(dir) {
    const save = get().save;
    const method = nextMethod(save.fieldwork.method, save.equipment.ownedTiers, dir);
    if (method === 'hydraulic' && save.fieldwork.hands < 1) {
      return save.fieldwork.method;
    }
    set((state) => ({
      save: { ...state.save, fieldwork: { ...state.save.fieldwork, method } },
    }));
    return method;
  },

  buySupply(id, gameTime) {
    const def = supplyDef(id);
    if (!def) return false;
    const due = priced(get().save, def.cost);
    if (get().save.wallet.balance < due) return false;
    set((state) => {
      const consumables = { ...state.save.inventory.carry.consumables };
      const have = (consumables[def.id] ?? 0) + 1;
      consumables[def.id] = have;
      const meters = { ...state.save.player.meters };
      const drinkNow = def.id === 'coffee' || (def.id === 'water_canteen' && meters.thirst < 0.82);
      let coffeeUntil = state.save.fieldwork.coffeeUntil;
      if (drinkNow) {
        consumables[def.id] = have - 1;
        if ((consumables[def.id] ?? 0) <= 0) delete consumables[def.id];
        meters.hunger = Math.min(1, meters.hunger + def.hunger);
        meters.thirst = Math.min(1, meters.thirst + def.thirst);
        if (def.id === 'coffee') coffeeUntil = Math.max(coffeeUntil, gameTime + 200);
      }
      return {
        save: {
          ...state.save,
          wallet: spend(state.save.wallet, due, gameTime, def.name),
          player: { ...state.save.player, meters },
          inventory: {
            ...state.save.inventory,
            carry: { ...state.save.inventory.carry, consumables },
          },
          fieldwork: { ...state.save.fieldwork, coffeeUntil },
        },
      };
    });
    return true;
  },

  sellSupply(id, gameTime) {
    const def = supplyDef(id);
    if (!def) return false;
    const have = get().save.inventory.carry.consumables[def.id] ?? 0;
    if (have <= 0) return false;
    const payout = Math.round(def.cost * 50) / 100;
    set((state) => {
      const consumables = { ...state.save.inventory.carry.consumables };
      const left = (consumables[def.id] ?? 0) - 1;
      if (left <= 0) delete consumables[def.id];
      else consumables[def.id] = left;
      return {
        save: {
          ...state.save,
          wallet: {
            ...state.save.wallet,
            balance: state.save.wallet.balance + payout,
            lifetimeEarnings: state.save.wallet.lifetimeEarnings + payout,
            recentTransactions: [
              ...state.save.wallet.recentTransactions.slice(-49),
              tx(gameTime, 'sale', payout, def.name),
            ],
          },
          inventory: {
            ...state.save.inventory,
            carry: { ...state.save.inventory.carry, consumables },
          },
        },
      };
    });
    return true;
  },

  buyImprovement(id, gameTime) {
    const save = get().save;
    if (save.fieldwork.claims.length === 0) return false;
    const nails = save.inventory.carry.consumables.nails ?? 0;
    const camp = bestCamp(save.fieldwork.claims);
    let cost = 0;
    let nailsNeeded = 0;
    if (id === 'leanto') {
      if (camp >= 1) return false;
      cost = LEANTO_COST;
      nailsNeeded = 4;
    } else if (id === 'cabin') {
      if (camp !== 1) return false;
      cost = CABIN_COST;
      nailsNeeded = 8;
    } else if (id === 'cache') {
      if (save.fieldwork.claims.some((c) => c.improvements.cache)) return false;
      cost = CACHE_COST;
    } else {
      return false;
    }
    if (nails < nailsNeeded || save.wallet.balance < cost) return false;
    set((state) => {
      const claims = state.save.fieldwork.claims.map((c, i, arr) => {
        if (i !== arr.length - 1) return c;
        const improvements = { ...c.improvements };
        if (id === 'leanto') improvements.camp = 1;
        if (id === 'cabin') improvements.camp = 2;
        if (id === 'cache') improvements.cache = true;
        return { ...c, improvements };
      });
      const consumables = { ...state.save.inventory.carry.consumables };
      if (nailsNeeded > 0) {
        const left = (consumables.nails ?? 0) - nailsNeeded;
        if (left <= 0) delete consumables.nails;
        else consumables.nails = left;
      }
      return {
        save: {
          ...state.save,
          wallet: spend(state.save.wallet, cost, gameTime, id),
          inventory: {
            ...state.save.inventory,
            carry: { ...state.save.inventory.carry, consumables },
          },
          fieldwork: {
            ...state.save.fieldwork,
            claims,
            journal: remember(state.save.fieldwork.journal, {
              id: `improve-${id}`,
              title: id === 'cache' ? 'Cache built' : id === 'cabin' ? 'Cabin frame' : 'Lean-to',
              body:
                id === 'cache'
                  ? 'Resting at camp now banks the gold in your pack.'
                  : 'A roof on the claim. Resting there keeps hunger off you for a while.',
              gameTime,
            }),
          },
        },
      };
    });
    return true;
  },

  hireHand(gameTime) {
    const save = get().save;
    const due = priced(save, HIRE_COST);
    if (save.fieldwork.hands >= MAX_HANDS || save.wallet.balance < due) return false;
    set((state) => {
      const hands = state.save.fieldwork.hands + 1;
      const claims = state.save.fieldwork.claims.map((c) => ({ ...c, jumperSince: null }));
      return {
        save: {
          ...state.save,
          wallet: spend(state.save.wallet, due, gameTime, 'hired hand'),
          fieldwork: {
            ...state.save.fieldwork,
            hands,
            claims,
            journal: remember(state.save.fieldwork.journal, {
              id: `hire-${hands}`,
              title: 'A hand hired',
              body: 'They watch the claim, shovel a little each night, and one of them can hold a monitor hose.',
              gameTime,
            }),
          },
        },
      };
    });
    return true;
  },

  noteMachineRun(kind, gameTime) {
    set((state) => {
      const runs = {
        ...state.save.fieldwork.machineRuns,
        [kind]: state.save.fieldwork.machineRuns[kind] + 1,
      };
      const names = {
        rocker: 'Rocker run',
        sluice: 'Sluice run',
        long_tom: 'Long tom run',
        hydraulic: 'Monitor run',
      } as const;
      return {
        save: {
          ...state.save,
          quests: flagQuests(state.save, 'runMachine', runs[kind], kind),
          fieldwork: {
            ...state.save.fieldwork,
            machineRuns: runs,
            journal: remember(state.save.fieldwork.journal, {
              id: `run-${kind}-${runs[kind]}`,
              title: names[kind],
              body:
                kind === 'rocker'
                  ? 'The box rocked clean. The ends of the swing are where the water throws.'
                  : kind === 'sluice'
                    ? 'Hopper, gate, then the gold in the riffles.'
                    : kind === 'long_tom'
                      ? 'The grizzly took the cobbles. The lower box held the color.'
                      : 'The nozzle cut the dark streak. Barren dirt is wasted water.',
              gameTime,
            }),
          },
        },
      };
    });
  },

  resolveJumper(claimId, how, gameTime) {
    const save = get().save;
    const claim = save.fieldwork.claims.find((c) => c.id === claimId);
    if (!claim || (claim.jumperSince === null && how !== 'caught' && how !== 'escaped')) {
      return { ok: false, reason: 'Nobody is on that claim.' };
    }
    if (how === 'pay' && save.wallet.balance < 40)
      return { ok: false, reason: 'Paying them off costs $40.' };
    set((state) => {
      const claims = state.save.fieldwork.claims.map((c) => {
        if (c.id !== claimId) return c;
        const pay =
          how === 'escaped'
            ? c.pay * 0.88
            : how === 'scare' || how === 'caught'
              ? Math.min(1, c.pay + 0.06)
              : c.pay;
        return { ...c, pay, jumperSince: null };
      });
      const wallet =
        how === 'pay' ? spend(state.save.wallet, 40, gameTime, 'jumper payoff') : state.save.wallet;
      const body =
        how === 'pay'
          ? 'Forty dollars and they walked. The claim is quiet.'
          : how === 'scare'
            ? 'You ran them off. They dropped the shovel.'
            : how === 'caught'
              ? 'You caught them on the flat. The sack stayed.'
              : 'They slipped off with a little color.';
      return {
        save: {
          ...state.save,
          wallet,
          fieldwork: {
            ...state.save.fieldwork,
            claims,
            journal: remember(state.save.fieldwork.journal, {
              id: `jumper-${claimId}-${gameTime.toFixed(0)}`,
              title: 'Claim jumper',
              body,
              gameTime,
            }),
          },
        },
      };
    });
    return { ok: true, reason: how };
  },

  giveLesson(gameTime) {
    set((state) => {
      const field = state.save.fieldwork;
      if (field.rumorsHeard.includes('lesson')) return state;
      return {
        save: {
          ...state.save,
          fieldwork: {
            ...field,
            rumorsHeard: [...field.rumorsHeard, 'lesson'],
            journal: remember(field.journal, {
              id: 'lesson-creek',
              title: 'How to read a creek',
              body: CREEK_LESSON,
              gameTime,
            }),
          },
        },
      };
    });
  },

  hearNextRumor(gameTime) {
    const heard = get().save.fieldwork.rumorsHeard;
    const rumor = RUMORS.find((r) => !heard.includes(r.id));
    if (!rumor) return null;
    let unlocked = false;
    set((state) => {
      const field = state.save.fieldwork;
      let unlockedStreams = field.unlockedStreams;
      if (rumor.unlocks && !unlockedStreams.includes(rumor.unlocks)) {
        unlockedStreams = [...unlockedStreams, rumor.unlocks];
        unlocked = true;
      }
      return {
        save: {
          ...state.save,
          fieldwork: {
            ...field,
            rumorsHeard: [...field.rumorsHeard, rumor.id],
            unlockedStreams,
            journal: remember(field.journal, {
              id: `rumor-${rumor.id}`,
              title: rumor.title,
              body: rumor.body,
              gameTime,
            }),
          },
        },
      };
    });
    return unlocked ? { ...rumor, body: `${rumor.body}` } : rumor;
  },

  onRain(gameTime) {
    set((state) => {
      const shift: Record<string, number> = { ...state.save.fieldwork.payShift };
      for (const key of Object.keys(shift)) shift[key] = (shift[key] ?? 0) + 0.07;
      if (!shift.coyote_creek) shift.coyote_creek = 0.07;
      if (!shift.buckeye_run) shift.buckeye_run = 0.07;
      return {
        save: {
          ...state.save,
          fieldwork: {
            ...state.save.fieldwork,
            payShift: shift,
            journal: remember(state.save.fieldwork.journal, {
              id: `rain-${Math.floor(gameTime / 30)}`,
              title: 'The creek came up',
              body: 'Rain is walking the pay streak downstream. Count the colors again before you dig.',
              gameTime,
            }),
          },
        },
      };
    });
    return true;
  },

  onNewDay(gameTime) {
    set((state) => {
      const field = state.save.fieldwork;
      const townBias = Math.max(
        0.84,
        Math.min(1.16, field.townBias + (Math.random() - 0.5) * 0.08),
      );
      const claims = field.claims.map((c) => ({
        ...c,
        pay: Math.min(1, c.pay + (field.hands > 0 ? 0.04 * field.hands : 0)),
        jumperSince: field.hands > 0 ? null : c.jumperSince,
      }));
      const journal =
        Math.abs(townBias - field.townBias) > 0.03
          ? remember(field.journal, {
              id: `price-${Math.floor(gameTime / 1200)}`,
              title: 'New board at the assayer',
              body:
                townBias > field.townBias
                  ? 'Gold is up. Sell while the board is kind.'
                  : 'The board dropped. Hold a little if you can eat.',
              gameTime,
            })
          : field.journal;
      return {
        save: { ...state.save, fieldwork: { ...field, townBias, claims, journal } },
      };
    });
  },

  tickThreats(gameTime) {
    const events: ThreatEvent[] = [];
    set((state) => {
      const field = state.save.fieldwork;
      if (field.claims.length === 0) return state;
      const claims = field.claims.map((c) => ({ ...c }));
      let lastJumperRoll = field.lastJumperRoll;
      let journal = field.journal;
      for (const claim of claims) {
        if (claim.jumperSince === null) continue;
        if (gameTime - claim.jumperSince < 150) continue;
        claim.pay = Math.max(0.1, claim.pay * 0.82);
        claim.jumperSince = null;
        const detail = `Jumpers worked ${claim.name} and took a cut of the pay.`;
        events.push({ kind: 'theft', claimId: claim.id, detail });
        journal = remember(journal, {
          id: `theft-${claim.id}-${Math.floor(gameTime)}`,
          title: 'Jumpers',
          body: detail,
          gameTime,
        });
      }
      if (field.hands < 1 && gameTime - lastJumperRoll > 200) {
        lastJumperRoll = gameTime;
        const open = claims.find(
          (c) => c.kind === 'placer' && c.pay > 0.25 && c.jumperSince === null,
        );
        if (open && Math.random() < 0.34) {
          open.jumperSince = gameTime;
          const detail = `Someone is working ${open.name} without you.`;
          events.push({ kind: 'jumper', claimId: open.id, detail });
          journal = remember(journal, {
            id: `jumper-${open.id}-${Math.floor(gameTime)}`,
            title: 'Claim jumper',
            body: `${detail} Work the claim or hire a hand.`,
            gameTime,
          });
        }
      }
      return {
        save: {
          ...state.save,
          fieldwork: { ...field, claims, lastJumperRoll, journal },
        },
      };
    });
    return events;
  },

  workClaimsNear(x, z, gameTime, mineId) {
    set((state) => {
      let journal = state.save.fieldwork.journal;
      const claims = state.save.fieldwork.claims.map((c) => {
        const near = Math.hypot(c.x - x, c.z - z) < 14;
        const mine = mineId != null && c.kind === 'lode' && c.streamId === mineId;
        if (!near && !mine) return c;
        const pay = Math.max(0.08, c.pay * 0.93);
        if (c.pay >= 0.15 && pay < 0.15) {
          journal = remember(journal, {
            id: `tired-${c.id}`,
            title: `${c.name} is tired`,
            body: 'This ground is worked down. Rain, a new bend, or another creek is the next pay.',
            gameTime,
          });
        }
        return { ...c, pay, jumperSince: null };
      });
      return {
        save: { ...state.save, fieldwork: { ...state.save.fieldwork, claims, journal } },
      };
    });
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

function methodAfterPurchase(current: WorkMethod, category: string, tier: number): WorkMethod {
  if (category === 'rocker' && tier >= 1) return 'rocker';
  if (category === 'sluice' && tier >= 2) return 'sluice';
  if (category === 'longTom' && tier >= 1) return 'long_tom';
  if (category === 'hydraulic' && tier >= 1) return 'hydraulic';
  if (category === 'pick' && tier >= 1) return 'hardrock';
  return current;
}

function tx(
  gameTime: number,
  type: Transaction['type'],
  amount: number,
  item: string,
): Transaction {
  return {
    id: `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: gameTime,
    type,
    amount,
    vendorId: 'general_store',
    details: { itemPurchased: item },
  };
}

function spend(wallet: WalletState, cost: number, gameTime: number, item: string): WalletState {
  if (cost <= 0) return wallet;
  return {
    ...wallet,
    balance: wallet.balance - cost,
    lifetimeSpending: wallet.lifetimeSpending + cost,
    recentTransactions: [
      ...wallet.recentTransactions.slice(-49),
      tx(gameTime, 'purchase', -cost, item),
    ],
  };
}

function flagQuests(
  save: SaveV1,
  type: ObjectiveType,
  value: number,
  param?: string,
): SaveV1['quests'] {
  const active = { ...save.quests.active };
  let changed = false;
  for (const id of Object.keys(active)) {
    const def = getQuestDef(id);
    if (!def) continue;
    const result = applyFlagToQuestObjectives(active[id]!, def, type, value, param);
    if (result.anyChanged) {
      active[id] = result.updated;
      changed = true;
    }
  }
  return changed ? { ...save.quests, active } : save.quests;
}
