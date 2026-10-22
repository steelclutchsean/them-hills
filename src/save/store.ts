import { get, set, del } from 'idb-keyval';
import { migrate } from './migrations';
import type { SaveV1 } from './schema';

// Continue uses the original slot so a v4 book still migrates in place.
// Manual books are separate. Each write keeps the previous page as .bak
// and a checksum so a torn write can fall back instead of wiping the claim.

const CONTINUE_KEY = 'themhills:save:slot1';
const CONTINUE_BAK = 'themhills:save:slot1.bak';

export type SaveSlotId = 'continue' | 'manual-1' | 'manual-2' | 'manual-3';

const MANUAL: readonly SaveSlotId[] = ['manual-1', 'manual-2', 'manual-3'];

export interface LoadedSave {
  save: SaveV1 | null;
  recovered: boolean;
  corrupt: boolean;
}

export interface SlotSummary {
  id: SaveSlotId;
  label: string;
  empty: boolean;
  corrupt: boolean;
}

function slotKey(slot: SaveSlotId): string {
  if (slot === 'continue') return CONTINUE_KEY;
  return `themhills:save:${slot}`;
}

function backupKey(slot: SaveSlotId): string {
  if (slot === 'continue') return CONTINUE_BAK;
  return `themhills:save:${slot}.bak`;
}

function checksum(json: string): string {
  let h = 2166136261;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function unwrap(raw: unknown): { ok: boolean; payload: unknown } {
  if (raw === undefined || raw === null) return { ok: false, payload: null };
  if (typeof raw === 'object' && raw !== null && 'checksum' in raw && 'payload' in raw) {
    const envelope = raw as { checksum: unknown; payload: unknown };
    if (typeof envelope.checksum !== 'string') return { ok: false, payload: null };
    let json = '';
    try {
      json = JSON.stringify(envelope.payload);
    } catch {
      return { ok: false, payload: null };
    }
    if (checksum(json) !== envelope.checksum) return { ok: false, payload: null };
    return { ok: true, payload: envelope.payload };
  }
  // Books written before checksums are still valid.
  return { ok: true, payload: raw };
}

async function readKey(key: string): Promise<{ ok: boolean; save: SaveV1 | null }> {
  const raw = await get(key);
  if (raw === undefined) return { ok: true, save: null };
  const opened = unwrap(raw);
  if (!opened.ok) return { ok: false, save: null };
  try {
    return { ok: true, save: migrate(opened.payload) };
  } catch (e) {
    console.error(`[save] migrate failed for ${key}`, e);
    return { ok: false, save: null };
  }
}

export async function initSaveSystem(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('[save] IndexedDB not available in this browser');
  }
}

export async function loadSlot(slot: SaveSlotId): Promise<LoadedSave> {
  const primary = await readKey(slotKey(slot));
  if (primary.ok && primary.save) return { save: primary.save, recovered: false, corrupt: false };
  if (primary.ok && !primary.save) return { save: null, recovered: false, corrupt: false };
  console.error(`[save] ${slot} is damaged, trying the previous page`);
  const backup = await readKey(backupKey(slot));
  if (backup.ok && backup.save) return { save: backup.save, recovered: true, corrupt: false };
  return { save: null, recovered: false, corrupt: true };
}

export async function loadSave(): Promise<SaveV1 | null> {
  const loaded = await loadSlot('continue');
  return loaded.save;
}

export async function saveToSlot(slot: SaveSlotId, state: SaveV1): Promise<void> {
  const key = slotKey(slot);
  const bak = backupKey(slot);
  try {
    const prev = await get(key);
    if (prev !== undefined) await set(bak, prev);
  } catch (e) {
    console.warn('[save] could not promote previous save to backup', e);
  }
  const json = JSON.stringify(state);
  await set(key, { checksum: checksum(json), payload: JSON.parse(json) as unknown });
}

export async function saveCurrentState(state: SaveV1): Promise<void> {
  await saveToSlot('continue', state);
}

export async function deleteSave(): Promise<void> {
  await del(CONTINUE_KEY);
  await del(CONTINUE_BAK);
}

export async function describeManualSlots(): Promise<SlotSummary[]> {
  const rows: SlotSummary[] = [];
  for (const id of MANUAL) {
    const loaded = await loadSlot(id);
    if (loaded.corrupt) {
      rows.push({ id, label: `${bookName(id)} — damaged`, empty: true, corrupt: true });
      continue;
    }
    if (!loaded.save) {
      rows.push({ id, label: `${bookName(id)} — empty`, empty: true, corrupt: false });
      continue;
    }
    const minutes = Math.max(0, Math.round(loaded.save.metadata.playtimeSeconds / 60));
    const cash = Math.round(loaded.save.wallet.balance);
    rows.push({
      id,
      label: `${bookName(id)} — ${minutes} min · $${cash}`,
      empty: false,
      corrupt: false,
    });
  }
  return rows;
}

function bookName(id: SaveSlotId): string {
  if (id === 'manual-1') return 'Book 1';
  if (id === 'manual-2') return 'Book 2';
  return 'Book 3';
}
