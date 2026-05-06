// Vanilla Zustand store — we don't use React, so we skip the React-specific bindings.
// Future phases add slice mutators (player, world, inventory, etc.); Phase 0 only needs
// hydrate/serialize so the save round-trip works.

import { createStore } from 'zustand/vanilla';
import { createDefaultSave, type SaveV1 } from '@/save/schema';

export interface GameStateStore {
  save: SaveV1;
  hydrate(loaded: SaveV1): void;
  serialize(): SaveV1;
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
}));
