import type { SaveV1 } from '@/save/schema';
import { isQuestActive, isQuestObjectivesMet, isQuestOfferable } from '@/quests/quests';

// Dialogue infrastructure. Each NPC defines a tree of nodes; nodes have a
// speaker, body line, and one or more options. Selecting an option triggers
// an action — navigate to another node, leave, or run a side-effect like
// "rest at inn" or accept/turn-in a quest. The dialogue runtime in main.ts
// owns the session state (current node + selection idx + tip counter) and
// lives mutually exclusive with vendor/store/prospecting sessions.

export type DialogueAction =
  | { kind: 'goto'; nodeId: string }
  | { kind: 'leave' }
  | { kind: 'restAtInn'; cost: number }
  | { kind: 'acceptQuest'; questId: string }
  | { kind: 'turnInQuest'; questId: string };

export interface DialogueOption {
  text: string;
  action: DialogueAction;
  /** If absent, option is always enabled. */
  enabled?: (save: SaveV1) => boolean;
  /** If absent, option is always visible. Hidden options are filtered out at resolve time. */
  visible?: (save: SaveV1) => boolean;
  /** Shown after the option text when disabled — e.g. "(not enough cash)". */
  disabledHint?: string;
}

export interface DialogueNode {
  speaker: string;
  body: string;
  options: DialogueOption[];
}

export type DialogueTree = Record<string, DialogueNode>;

export interface DialogueSession {
  treeId: string;
  tree: DialogueTree;
  currentNodeId: string;
  selectionIdx: number;
  /** Counter incremented every time the player enters a "tips" node, so each
   * visit shows a different rotating line. */
  tipIndex: number;
}

const INNKEEPER_TIPS = [
  'Folks say the steel pan up at the General Store catches flakes the wooden one misses.',
  "Don't pan past sundown — meters drain whether you're working or not, and pickings get thin.",
  "Pawn shop's a quick sale, but you'll lose a chunk. Assayer pays better if you've got patience.",
  "Step into the stream and you'll catch your breath. Cold water perks a body up.",
  "Camp by the firepit's free, sure. But spare a fiver and I'll wake you at dawn proper.",
  'Old Pete used to talk about a claim past the second bend. Never came back to settle his tab.',
];

/**
 * Marker body for nodes whose text is computed from session state at display
 * time (see resolveBody). Anything else is shown verbatim.
 */
const TIP_MARKER = '__INNKEEPER_TIP__';

export const INNKEEPER_DIALOGUE: DialogueTree = {
  root: {
    speaker: 'Innkeeper Mae',
    body: 'Welcome to the Hills Inn, partner. Rough work out there?',
    options: [
      {
        text: 'You mentioned a tip earlier...',
        action: { kind: 'goto', nodeId: 'questOffer' },
        visible: (save) => isQuestOfferable(save, 'mae_tip'),
      },
      {
        text: "I've got the 2g you asked about.",
        action: { kind: 'turnInQuest', questId: 'mae_tip' },
        visible: (save) => isQuestActive(save, 'mae_tip') && isQuestObjectivesMet(save, 'mae_tip'),
      },
      {
        text: 'Still working on that haul.',
        action: { kind: 'goto', nodeId: 'questCheckIn' },
        visible: (save) => isQuestActive(save, 'mae_tip') && !isQuestObjectivesMet(save, 'mae_tip'),
      },
      {
        text: 'Take a room ($5)',
        action: { kind: 'restAtInn', cost: 5 },
        enabled: (save) => save.wallet.balance >= 5,
        disabledHint: '(not enough cash)',
      },
      { text: "What's the talk in town?", action: { kind: 'goto', nodeId: 'tips' } },
      { text: 'Goodbye.', action: { kind: 'leave' } },
    ],
  },
  tips: {
    speaker: 'Innkeeper Mae',
    body: TIP_MARKER,
    options: [
      { text: 'Tell me another.', action: { kind: 'goto', nodeId: 'tips' } },
      { text: 'Goodbye.', action: { kind: 'leave' } },
    ],
  },
  rested: {
    speaker: 'Innkeeper Mae',
    body: "Sleep well. The hills don't go anywhere.",
    options: [{ text: 'Goodbye.', action: { kind: 'leave' } }],
  },
  questOffer: {
    speaker: 'Innkeeper Mae',
    body: "Word is there's good color in the upper bend. Bring me back two grams of any kind and I'll see you square — call it a finder's fee. Thirty bucks for your trouble.",
    options: [
      {
        text: "I'll bring back 2g.",
        action: { kind: 'acceptQuest', questId: 'mae_tip' },
      },
      { text: 'Maybe later.', action: { kind: 'goto', nodeId: 'root' } },
    ],
  },
  questCheckIn: {
    speaker: 'Innkeeper Mae',
    body: "Still need that 2 grams, partner. Take your time — those streams aren't going anywhere.",
    options: [{ text: 'Right.', action: { kind: 'goto', nodeId: 'root' } }],
  },
  questAccepted: {
    speaker: 'Innkeeper Mae',
    body: "Now you're talking. Come find me when you've got the haul.",
    options: [{ text: 'Will do.', action: { kind: 'leave' } }],
  },
  questComplete: {
    speaker: 'Innkeeper Mae',
    body: "Heh — that's some color, alright. Here's your $30, with my thanks. Tell me if you hear of more.",
    options: [{ text: 'Pleasure doing business.', action: { kind: 'leave' } }],
  },
};

export function startDialogue(treeId: string, tree: DialogueTree): DialogueSession {
  return {
    treeId,
    tree,
    currentNodeId: 'root',
    selectionIdx: 0,
    tipIndex: 0,
  };
}

export function resolveBody(session: DialogueSession): string {
  const node = session.tree[session.currentNodeId];
  if (!node) return '';
  if (node.body === TIP_MARKER) {
    return INNKEEPER_TIPS[session.tipIndex % INNKEEPER_TIPS.length] ?? '';
  }
  return node.body;
}

export interface ResolvedDialogueOption {
  text: string;
  enabled: boolean;
  hint?: string;
  /** Reference back to the original tree option, so handlers can run its action. */
  source: DialogueOption;
}

/**
 * Resolve the selectable options for the current node, filtering out any
 * whose `visible` predicate returns false. The returned array is what the
 * UI renders and what selection indices map into.
 */
export function resolveOptions(session: DialogueSession, save: SaveV1): ResolvedDialogueOption[] {
  const node = session.tree[session.currentNodeId];
  if (!node) return [];
  return node.options
    .filter((opt) => (opt.visible ? opt.visible(save) : true))
    .map((opt) => {
      const enabled = opt.enabled ? opt.enabled(save) : true;
      return {
        text: opt.text,
        enabled,
        hint: enabled ? undefined : opt.disabledHint,
        source: opt,
      };
    });
}

export function getCurrentNode(session: DialogueSession): DialogueNode | null {
  return session.tree[session.currentNodeId] ?? null;
}
