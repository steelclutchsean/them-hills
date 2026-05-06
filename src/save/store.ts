import { get, set, del } from 'idb-keyval';
import { migrate } from './migrations';
import type { SaveV1 } from './schema';

const SAVE_KEY = 'themhills:save:slot1';
const BACKUP_KEY = 'themhills:save:slot1.bak';

export async function initSaveSystem(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('[save] IndexedDB not available in this browser');
  }
}

export async function loadSave(): Promise<SaveV1 | null> {
  try {
    const raw = await get(SAVE_KEY);
    if (raw === undefined) return null;
    return migrate(raw);
  } catch (e) {
    console.error('[save] primary load failed, attempting backup', e);
    try {
      const bak = await get(BACKUP_KEY);
      if (bak === undefined) return null;
      return migrate(bak);
    } catch (e2) {
      console.error('[save] backup load also failed', e2);
      return null;
    }
  }
}

export async function saveCurrentState(state: SaveV1): Promise<void> {
  try {
    const prev = await get(SAVE_KEY);
    if (prev !== undefined) {
      await set(BACKUP_KEY, prev);
    }
  } catch (e) {
    console.warn('[save] could not promote previous save to backup', e);
  }
  await set(SAVE_KEY, state);
}

export async function deleteSave(): Promise<void> {
  await del(SAVE_KEY);
  await del(BACKUP_KEY);
}
