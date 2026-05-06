// Vanilla Zustand store — we don't use React, so we skip the React-specific bindings.
// Phase 2 adds gold/site mutators on top of the Phase 0 hydrate/serialize contract.

import { createStore } from 'zustand/vanilla';
import { createDefaultSave, type GoldStash, type SaveV1, type SiteState } from '@/save/schema';

const SITE_REGEN_PER_GAME_SEC = 0.0002; // ~5 game-min for full recovery
const SITE_REGEN_DELAY_SEC = 60;

export interface GameStateStore {
  save: SaveV1;
  hydrate(loaded: SaveV1): void;
  serialize(): SaveV1;

  /** Accumulate gold in the player's carry inventory. */
  addGoldToCarry(stash: GoldStash): void;

  /** Returns the site's current state, creating a default at full richness if absent. */
  getOrCreateSite(siteId: string): SiteState;

  /** Record richness depletion + worked-at timestamp + attempt count for one site. */
  touchSite(siteId: string, depletion: number, gameTime: number): void;

  /** Tick all known sites' richness regeneration. Called once per frame. */
  regenSites(dt: number, gameTime: number): void;

  /** Increment the lifetime pan counter; returns the new value (used as RNG component). */
  incrementPanCount(): number;
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

  getOrCreateSite(siteId) {
    const existing = get().save.world.sites[siteId];
    if (existing) return existing;
    const fresh: SiteState = {
      richnessRemaining: 1,
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

  touchSite(siteId, depletion, gameTime) {
    set((state) => {
      const cur = state.save.world.sites[siteId] ?? {
        richnessRemaining: 1,
        lastWorkedAt: 0,
        totalTimesWorked: 0,
      };
      const next: SiteState = {
        richnessRemaining: Math.max(0, cur.richnessRemaining - depletion),
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

  regenSites(dt, gameTime) {
    const state = get();
    const sites = state.save.world.sites;
    let didChange = false;
    const updated: Record<string, SiteState> = {};
    for (const [id, site] of Object.entries(sites)) {
      const idle = gameTime - site.lastWorkedAt;
      if (idle > SITE_REGEN_DELAY_SEC && site.richnessRemaining < 1) {
        const next = Math.min(1, site.richnessRemaining + SITE_REGEN_PER_GAME_SEC * dt);
        if (next !== site.richnessRemaining) {
          updated[id] = { ...site, richnessRemaining: next };
          didChange = true;
        }
      }
    }
    if (didChange) {
      set({
        save: {
          ...state.save,
          world: {
            ...state.save.world,
            sites: { ...sites, ...updated },
          },
        },
      });
    }
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
}));
