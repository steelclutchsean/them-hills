import type { ActiveQuest, GoldStash, ObjectiveState, SaveV1 } from '@/save/schema';

// Quest data model + helpers. Quests are the gameplay-meaning layer on top
// of the prospect → sell → upgrade loop: they give the player explicit goals
// and tie NPCs to player progression.
//
// Each quest has one or more objectives. Today only the `collectGold` type is
// modeled — sell-dollar and visit-location types come in later phases. When
// the player collects gold, applyGoldToQuestObjectives advances the matching
// objective; once all objectives are met the player can turn the quest in
// at the giver NPC.

export type ObjectiveType = 'collectGold' | 'sellDollars';

export interface QuestObjective {
  id: string;
  description: string;
  /** Target value at completion (e.g. 2.0 grams, 100 dollars). */
  target: number;
  type: ObjectiveType;
  /**
   * Type-specific filter. For collectGold: 'flake' | 'picker' | 'nugget' |
   * 'any'. For sellDollars: vendor id or 'any'.
   */
  param?: string;
}

export interface QuestDef {
  id: string;
  title: string;
  giverNpc: string;
  description: string;
  objectives: QuestObjective[];
  reward: { dollars: number };
}

export const QUESTS: Record<string, QuestDef> = {
  mae_tip: {
    id: 'mae_tip',
    title: 'Hot Tip from Mae',
    giverNpc: 'innkeeper',
    description:
      "Mae mentioned a 2g gold haul would buy a few rooms. Bring back 2 grams of any gold for a $30 finder's fee.",
    objectives: [
      {
        id: 'collect_2g',
        description: 'Collect 2g of gold',
        target: 2.0,
        type: 'collectGold',
        param: 'any',
      },
    ],
    reward: { dollars: 30 },
  },
  pete_picker: {
    id: 'pete_picker',
    title: "Pete's Last Picker",
    giverNpc: 'old_pete',
    description:
      'Old Pete wants 5 grams of picker-quality gold — bigger than flake, smaller than nugget. $80 reward.',
    objectives: [
      {
        id: 'collect_5g_picker',
        description: 'Collect 5g of picker gold',
        target: 5.0,
        type: 'collectGold',
        param: 'picker',
      },
    ],
    reward: { dollars: 80 },
  },
  pete_assayer_loyalty: {
    id: 'pete_assayer_loyalty',
    title: 'Square with the Assayer',
    giverNpc: 'old_pete',
    description:
      "Old Pete wants you to do honest business — sell $200 worth at the Assayer (not the Pawn Shop). Builds your reputation. $50 finder's fee.",
    objectives: [
      {
        id: 'sell_200_assayer',
        description: 'Sell $200 at the Assayer',
        target: 200,
        type: 'sellDollars',
        param: 'assayer',
      },
    ],
    reward: { dollars: 50 },
  },
};

export function getQuestDef(questId: string): QuestDef | null {
  return QUESTS[questId] ?? null;
}

export function isQuestActive(save: SaveV1, questId: string): boolean {
  return questId in save.quests.active;
}

export function isQuestCompleted(save: SaveV1, questId: string): boolean {
  return save.quests.completed.includes(questId);
}

/** A quest is offerable when not yet active and not yet completed. */
export function isQuestOfferable(save: SaveV1, questId: string): boolean {
  return !isQuestActive(save, questId) && !isQuestCompleted(save, questId);
}

export function getActiveQuest(save: SaveV1, questId: string): ActiveQuest | null {
  return save.quests.active[questId] ?? null;
}

export function isQuestObjectivesMet(save: SaveV1, questId: string): boolean {
  const active = getActiveQuest(save, questId);
  if (!active) return false;
  const def = getQuestDef(questId);
  if (!def) return false;
  return def.objectives.every((o) => active.objectives[o.id]?.complete === true);
}

export interface QuestProgressView {
  questId: string;
  title: string;
  objectives: {
    id: string;
    description: string;
    progress: number;
    target: number;
    complete: boolean;
  }[];
  allComplete: boolean;
}

/**
 * Build UI-friendly summaries of all active quests, in stable acceptance
 * order (object-key insertion order).
 */
export function buildTrackerView(save: SaveV1): QuestProgressView[] {
  const ids = Object.keys(save.quests.active);
  if (ids.length === 0) return [];
  const out: QuestProgressView[] = [];
  for (const id of ids) {
    const active = save.quests.active[id]!;
    const def = getQuestDef(id);
    if (!def) continue;
    const objectives = def.objectives.map((o) => {
      const state = active.objectives[o.id] ?? { progress: 0, complete: false };
      return {
        id: o.id,
        description: o.description,
        progress: state.progress,
        target: o.target,
        complete: state.complete,
      };
    });
    out.push({
      questId: id,
      title: def.title,
      objectives,
      allComplete: objectives.every((o) => o.complete),
    });
  }
  return out;
}

/**
 * Update an active quest's sellDollars objectives based on a vendor sale.
 * Returns the new ActiveQuest record and whether anything changed.
 *
 * `vendorId` is the literal vendor that processed the sale (e.g. 'assayer').
 * An objective with param='any' matches any vendor; otherwise the param
 * must equal the vendorId for progress to advance.
 */
export function applyDollarsToQuestObjectives(
  active: ActiveQuest,
  questDef: QuestDef,
  amount: number,
  vendorId: string,
): { updated: ActiveQuest; anyChanged: boolean } {
  let anyChanged = false;
  const newObjectives: Record<string, ObjectiveState> = { ...active.objectives };
  for (const obj of questDef.objectives) {
    if (obj.type !== 'sellDollars') continue;
    const cur = newObjectives[obj.id] ?? { progress: 0, complete: false };
    if (cur.complete) continue;
    if (obj.param && obj.param !== 'any' && obj.param !== vendorId) continue;
    if (amount <= 0) continue;
    const next = Math.min(obj.target, cur.progress + amount);
    newObjectives[obj.id] = { progress: next, complete: next >= obj.target };
    anyChanged = true;
  }
  return { updated: { ...active, objectives: newObjectives }, anyChanged };
}

/**
 * Update an active quest's objectives based on a freshly-collected gold stash.
 * Returns the new ActiveQuest record and whether anything changed (used to
 * skip set() calls when nothing advanced).
 */
export function applyGoldToQuestObjectives(
  active: ActiveQuest,
  questDef: QuestDef,
  stash: GoldStash,
): { updated: ActiveQuest; anyChanged: boolean } {
  let anyChanged = false;
  const newObjectives: Record<string, ObjectiveState> = { ...active.objectives };
  for (const obj of questDef.objectives) {
    if (obj.type !== 'collectGold') continue;
    const cur = newObjectives[obj.id] ?? { progress: 0, complete: false };
    if (cur.complete) continue;
    let delta = 0;
    if (!obj.param || obj.param === 'any') {
      delta = stash.flake_g + stash.picker_g + stash.nugget_g;
    } else if (obj.param === 'flake') delta = stash.flake_g;
    else if (obj.param === 'picker') delta = stash.picker_g;
    else if (obj.param === 'nugget') delta = stash.nugget_g;
    if (delta > 0) {
      const next = Math.min(obj.target, cur.progress + delta);
      newObjectives[obj.id] = {
        progress: next,
        complete: next >= obj.target,
      };
      anyChanged = true;
    }
  }
  return { updated: { ...active, objectives: newObjectives }, anyChanged };
}
