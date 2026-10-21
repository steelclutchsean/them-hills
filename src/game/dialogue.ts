import { HIRE_COST, LODE_FEE } from '@/game/fieldwork';
import type { SaveV1 } from '@/save/schema';
import {
  isQuestActive,
  isQuestCompleted,
  isQuestObjectivesMet,
  isQuestOfferable,
} from '@/quests/quests';

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
  | { kind: 'acceptQuest'; questId: string; acceptedNode?: string }
  | { kind: 'turnInQuest'; questId: string; completeNode?: string }
  | { kind: 'giveLesson' }
  | { kind: 'hearRumor' }
  | { kind: 'hireHand' }
  | { kind: 'fileLode'; mineId: string; x: number; z: number }
  | { kind: 'scareJumper' }
  | { kind: 'chaseJumper' }
  | { kind: 'payJumper' };

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
  /** Body filled in when a rumor or lesson resolves at runtime. */
  pendingBody?: string;
  /** Claim a jumper confrontation is about. */
  targetId?: string;
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
const DYNAMIC = '__DYNAMIC__';

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
      { text: 'Any rumor off the creek?', action: { kind: 'hearRumor' } },
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
  rumor: {
    speaker: 'Innkeeper Mae',
    body: DYNAMIC,
    options: [
      { text: 'Another.', action: { kind: 'hearRumor' } },
      { text: 'Goodbye.', action: { kind: 'leave' } },
    ],
  },
};

export const OLD_PETE_DIALOGUE: DialogueTree = {
  root: {
    speaker: 'Old Pete',
    body: "Aye, fresh blood. Hills don't give up their gold easy, but they don't lie about what they've got, either.",
    options: [
      {
        text: 'You sound like you know the streams...',
        action: { kind: 'goto', nodeId: 'questOffer' },
        visible: (save) => isQuestOfferable(save, 'pete_picker'),
      },
      {
        text: "I've got the 5g of picker you wanted.",
        action: { kind: 'turnInQuest', questId: 'pete_picker' },
        visible: (save) =>
          isQuestActive(save, 'pete_picker') && isQuestObjectivesMet(save, 'pete_picker'),
      },
      {
        text: 'Still chasing that picker.',
        action: { kind: 'goto', nodeId: 'questCheckIn' },
        visible: (save) =>
          isQuestActive(save, 'pete_picker') && !isQuestObjectivesMet(save, 'pete_picker'),
      },
      // Vendor-loyalty quest. Visible only after the picker quest is fully
      // completed, so it acts as a follow-up arc rather than a parallel
      // grind.
      {
        text: "There's something else I could do for you?",
        action: { kind: 'goto', nodeId: 'loyaltyOffer' },
        visible: (save) =>
          isQuestCompleted(save, 'pete_picker') && isQuestOfferable(save, 'pete_assayer_loyalty'),
      },
      {
        text: "I've squared $200 with the Assayer.",
        action: {
          kind: 'turnInQuest',
          questId: 'pete_assayer_loyalty',
          completeNode: 'loyaltyComplete',
        },
        visible: (save) =>
          isQuestActive(save, 'pete_assayer_loyalty') &&
          isQuestObjectivesMet(save, 'pete_assayer_loyalty'),
      },
      {
        text: 'Still working on the Assayer thing.',
        action: { kind: 'goto', nodeId: 'loyaltyCheckIn' },
        visible: (save) =>
          isQuestActive(save, 'pete_assayer_loyalty') &&
          !isQuestObjectivesMet(save, 'pete_assayer_loyalty'),
      },
      {
        text: 'Teach me to read a creek.',
        action: { kind: 'giveLesson' },
        visible: (save) => !save.fieldwork.rumorsHeard.includes('lesson'),
      },
      {
        text: 'Witness a claim for me.',
        action: { kind: 'goto', nodeId: 'stakeOffer' },
        visible: (save) =>
          save.fieldwork.rumorsHeard.includes('lesson') && isQuestOfferable(save, 'pete_stake'),
      },
      {
        text: 'The claim is filed.',
        action: { kind: 'turnInQuest', questId: 'pete_stake', completeNode: 'stakeDone' },
        visible: (save) =>
          isQuestActive(save, 'pete_stake') && isQuestObjectivesMet(save, 'pete_stake'),
      },
      {
        text: 'I counted the colors.',
        action: { kind: 'goto', nodeId: 'colorOffer' },
        visible: (save) => isQuestOfferable(save, 'pete_color'),
      },
      {
        text: 'Six colors, in one pan.',
        action: { kind: 'turnInQuest', questId: 'pete_color', completeNode: 'colorDone' },
        visible: (save) =>
          isQuestActive(save, 'pete_color') && isQuestObjectivesMet(save, 'pete_color'),
      },
      {
        text: 'Set me up with a rocker.',
        action: { kind: 'goto', nodeId: 'rockerOffer' },
        visible: (save) =>
          save.fieldwork.claims.length > 0 && isQuestOfferable(save, 'pete_rocker'),
      },
      {
        text: 'The rocker ran clean.',
        action: { kind: 'turnInQuest', questId: 'pete_rocker', completeNode: 'rockerDone' },
        visible: (save) =>
          isQuestActive(save, 'pete_rocker') && isQuestObjectivesMet(save, 'pete_rocker'),
      },
      {
        text: 'Tell me about a sluice.',
        action: { kind: 'goto', nodeId: 'sluiceOffer' },
        visible: (save) =>
          save.fieldwork.machineRuns.rocker >= 1 && isQuestOfferable(save, 'pete_sluice'),
      },
      {
        text: 'The sluice is cleaned out.',
        action: { kind: 'turnInQuest', questId: 'pete_sluice', completeNode: 'sluiceDone' },
        visible: (save) =>
          isQuestActive(save, 'pete_sluice') && isQuestObjectivesMet(save, 'pete_sluice'),
      },
      {
        text: 'I want a long tom.',
        action: { kind: 'goto', nodeId: 'tomOffer' },
        visible: (save) =>
          save.fieldwork.machineRuns.sluice >= 1 && isQuestOfferable(save, 'pete_tom'),
      },
      {
        text: 'The tom is washed.',
        action: { kind: 'turnInQuest', questId: 'pete_tom', completeNode: 'tomDone' },
        visible: (save) => isQuestActive(save, 'pete_tom') && isQuestObjectivesMet(save, 'pete_tom'),
      },
      {
        text: 'I want the monitor.',
        action: { kind: 'goto', nodeId: 'monitorOffer' },
        visible: (save) =>
          isQuestCompleted(save, 'pete_stake') && isQuestOfferable(save, 'pete_monitor'),
      },
      {
        text: 'Eight grams, as you asked.',
        action: { kind: 'turnInQuest', questId: 'pete_monitor', completeNode: 'monitorDone' },
        visible: (save) =>
          isQuestActive(save, 'pete_monitor') && isQuestObjectivesMet(save, 'pete_monitor'),
      },
      {
        text: 'The hose is on the bank.',
        action: { kind: 'goto', nodeId: 'hoseOffer' },
        visible: (save) =>
          isQuestCompleted(save, 'pete_monitor') &&
          save.equipment.ownedTiers.hydraulic >= 1 &&
          isQuestOfferable(save, 'pete_hose'),
      },
      {
        text: 'I cut the streak.',
        action: { kind: 'turnInQuest', questId: 'pete_hose', completeNode: 'hoseDone' },
        visible: (save) => isQuestActive(save, 'pete_hose') && isQuestObjectivesMet(save, 'pete_hose'),
      },
      { text: 'What are folks saying?', action: { kind: 'hearRumor' } },
      {
        text: `Hire a hand ($${HIRE_COST}).`,
        action: { kind: 'hireHand' },
        enabled: (save) => save.wallet.balance >= HIRE_COST && save.fieldwork.hands < 3,
        disabledHint: `(need $${HIRE_COST}, and room in the crew)`,
      },
      {
        text: `File a lode on the north mine ($${LODE_FEE}).`,
        action: { kind: 'fileLode', mineId: 'north', x: -45, z: -45 },
        visible: (save) =>
          (save.equipment.ownedTiers.pick >= 1 || save.equipment.ownedTiers.shovel >= 3) &&
          !save.fieldwork.claims.some((c) => c.kind === 'lode'),
        enabled: (save) => save.wallet.balance >= LODE_FEE,
        disabledHint: `(need $${LODE_FEE})`,
      },
      { text: 'How long you been out here?', action: { kind: 'goto', nodeId: 'bio' } },
      { text: 'Goodbye.', action: { kind: 'leave' } },
    ],
  },
  questOffer: {
    speaker: 'Old Pete',
    body: "Picker gold's the real sign — bigger than flake, smaller than nugget. Scrape together 5 grams of picker-quality and I'll see you square. Eighty bucks. Honest work for an honest pan.",
    options: [
      {
        text: "I'll bring you 5g of picker.",
        action: { kind: 'acceptQuest', questId: 'pete_picker' },
      },
      { text: 'Maybe later.', action: { kind: 'goto', nodeId: 'root' } },
    ],
  },
  questCheckIn: {
    speaker: 'Old Pete',
    body: "Picker's the trick. You'll know it by the heft — washes different in the pan than flake does. Keep at it.",
    options: [{ text: 'Right.', action: { kind: 'goto', nodeId: 'root' } }],
  },
  questAccepted: {
    speaker: 'Old Pete',
    body: "Good. Don't bring me flake. I want picker.",
    options: [{ text: 'Understood.', action: { kind: 'leave' } }],
  },
  questComplete: {
    speaker: 'Old Pete',
    body: "Aye, that's picker alright. Heft to it. Here's your eighty — and a tip: try the upper bend at first light. You'll see what I mean.",
    options: [{ text: 'Much obliged.', action: { kind: 'leave' } }],
  },
  loyaltyOffer: {
    speaker: 'Old Pete',
    body: "Now that I trust you to know picker from flake — listen. Sell $200 worth at the Assayer. Not the pawn shop. Pawn shop's a fast hand-off, sure, but the Assayer's where the real prospectors square up. Build that reputation. Bring it back to me and I'll throw you fifty for the trouble.",
    options: [
      {
        text: "I'll square $200 with the Assayer.",
        action: {
          kind: 'acceptQuest',
          questId: 'pete_assayer_loyalty',
          acceptedNode: 'loyaltyAccepted',
        },
      },
      { text: 'Maybe later.', action: { kind: 'goto', nodeId: 'root' } },
    ],
  },
  loyaltyCheckIn: {
    speaker: 'Old Pete',
    body: "Two hundred at the Assayer. Pawn shop don't count. Keep at it.",
    options: [{ text: 'Right.', action: { kind: 'goto', nodeId: 'root' } }],
  },
  loyaltyAccepted: {
    speaker: 'Old Pete',
    body: "Good. Tell Mick I sent you — he won't say much, but he'll square you fair.",
    options: [{ text: 'Will do.', action: { kind: 'leave' } }],
  },
  loyaltyComplete: {
    speaker: 'Old Pete',
    body: "Mick already mentioned. Word travels in a town this size. Here's your fifty — and partner, you keep at this rate, you'll be all right out here.",
    options: [{ text: 'Much obliged.', action: { kind: 'leave' } }],
  },
  stakeOffer: {
    speaker: 'Old Pete',
    body: "I'll witness it. Stand where the colors count high — inside bend, gravel bar, bedrock, or the pocket behind a boulder — and file it. First one the county will record for nothing. Come back when it's yours.",
    options: [
      { text: "I'll file it.", action: { kind: 'acceptQuest', questId: 'pete_stake', acceptedNode: 'stakeAccepted' } },
      { text: 'Not yet.', action: { kind: 'goto', nodeId: 'root' } },
    ],
  },
  stakeAccepted: {
    speaker: 'Old Pete',
    body: 'Press F until a pan shows its count. Then press E on that ground. Bring me the news.',
    options: [{ text: 'I will.', action: { kind: 'leave' } }],
  },
  stakeDone: {
    speaker: 'Old Pete',
    body: "It's yours on the book. Work it, and watch it. Empty claims draw jumpers.",
    options: [{ text: 'Much obliged.', action: { kind: 'leave' } }],
  },
  colorOffer: {
    speaker: 'Old Pete',
    body: 'Count the colors in one pan. Six is a streak worth following. Press F in the water — the number is the flakes, not a feeling.',
    options: [
      {
        text: "I'll find six.",
        action: { kind: 'acceptQuest', questId: 'pete_color', acceptedNode: 'colorAccepted' },
      },
      { text: 'Later.', action: { kind: 'goto', nodeId: 'root' } },
    ],
  },
  colorAccepted: {
    speaker: 'Old Pete',
    body: 'Inside of the bend. Downstream of a rock. Bedrock if you can find where it cut down. Go count.',
    options: [{ text: 'Right.', action: { kind: 'leave' } }],
  },
  colorDone: {
    speaker: 'Old Pete',
    body: "Six. You can see it now. Here's thirty-five, and a word: when the rain comes, count again. The streak walks.",
    options: [{ text: "I'll remember.", action: { kind: 'leave' } }],
  },
  monitorOffer: {
    speaker: 'Old Pete',
    body: "A monitor will strip a bar in one pass. It needs a hired hand on the hose, and it eats the ground. Bring me eight grams and I'll sign the store's paper.",
    options: [
      {
        text: "I'll bring eight grams.",
        action: { kind: 'acceptQuest', questId: 'pete_monitor', acceptedNode: 'monitorAccepted' },
      },
      { text: 'Too much iron for me.', action: { kind: 'goto', nodeId: 'root' } },
    ],
  },
  monitorAccepted: {
    speaker: 'Old Pete',
    body: 'Eight grams. Any kind. Then the store will sell you the hose.',
    options: [{ text: 'Understood.', action: { kind: 'leave' } }],
  },
  monitorDone: {
    speaker: 'Old Pete',
    body: "Signed. Buy the monitor when you can afford the ground it will ruin. Don't run it without a hand.",
    options: [{ text: 'Thanks, Pete.', action: { kind: 'leave' } }],
  },
  rumor: {
    speaker: 'Old Pete',
    body: DYNAMIC,
    options: [
      { text: 'What else?', action: { kind: 'hearRumor' } },
      { text: 'Back.', action: { kind: 'goto', nodeId: 'root' } },
    ],
  },
  hired: {
    speaker: 'Old Pete',
    body: "They'll watch the claim and shovel a little overnight. One of them can hold a monitor hose. Pay them fair and they'll stay.",
    options: [{ text: 'Good.', action: { kind: 'leave' } }],
  },
  lodeFiled: {
    speaker: 'Old Pete',
    body: 'North ridge is on the book as yours. Take a pick inside. The rock pays better on your own ground.',
    options: [{ text: 'Then I will.', action: { kind: 'leave' } }],
  },
  rockerOffer: {
    speaker: 'Old Pete',
    body: 'Buy the rocker at the store and it will sit on your claim. Rock it. Tap at each end of the swing, when the water is thrown. A tap in the middle just slops.',
    options: [
      { text: "I'll rock it.", action: { kind: 'acceptQuest', questId: 'pete_rocker', acceptedNode: 'rockerAccepted' } },
      { text: 'Not yet.', action: { kind: 'goto', nodeId: 'root' } },
    ],
  },
  rockerAccepted: {
    speaker: 'Old Pete',
    body: 'Ends of the rock. You will feel it. Come back when the box runs clean.',
    options: [{ text: 'Right.', action: { kind: 'leave' } }],
  },
  rockerDone: {
    speaker: 'Old Pete',
    body: "That's the beat. A sluice is the next machine, when you want water doing the rocking for you.",
    options: [{ text: 'Thanks.', action: { kind: 'leave' } }],
  },
  sluiceOffer: {
    speaker: 'Old Pete',
    body: 'A full sluice is three jobs in one. Shovel gravel into the hopper when the load is over it. Set the gate so the riffles stay wet and do not flood. Then pick the gold that caught.',
    options: [
      { text: "I'll feed it.", action: { kind: 'acceptQuest', questId: 'pete_sluice', acceptedNode: 'sluiceAccepted' } },
      { text: 'Later.', action: { kind: 'goto', nodeId: 'root' } },
    ],
  },
  sluiceAccepted: {
    speaker: 'Old Pete',
    body: 'Hopper, gate, cleanup. The gold hides in the riffles, not in the pan.',
    options: [{ text: 'I see it.', action: { kind: 'leave' } }],
  },
  sluiceDone: {
    speaker: 'Old Pete',
    body: 'Clean riffles. A long tom is the same idea stretched out, with a grizzly to throw the cobbles.',
    options: [{ text: 'Then that is next.', action: { kind: 'leave' } }],
  },
  tomOffer: {
    speaker: 'Old Pete',
    body: 'The tom wants a yard of gravel. Shake the grizzly when it rises so the rocks dance off. The color falls into the lower box. Clean that box.',
    options: [
      { text: "I'll wash a yard.", action: { kind: 'acceptQuest', questId: 'pete_tom', acceptedNode: 'tomAccepted' } },
      { text: 'Later.', action: { kind: 'goto', nodeId: 'root' } },
    ],
  },
  tomAccepted: {
    speaker: 'Old Pete',
    body: 'Grizzly first. Lower box second. Do not rush the shake.',
    options: [{ text: 'Understood.', action: { kind: 'leave' } }],
  },
  tomDone: {
    speaker: 'Old Pete',
    body: 'A yard is a start. Hire a hand before you think about a monitor. Someone has to hold the hose.',
    options: [{ text: 'I will.', action: { kind: 'leave' } }],
  },
  hoseOffer: {
    speaker: 'Old Pete',
    body: 'The bank has a dark band. That is the pay. Aim the nozzle there and hold. Spray the barren dirt and you only move mud. Your hand keeps the hose from whipping.',
    options: [
      { text: "I'll cut it.", action: { kind: 'acceptQuest', questId: 'pete_hose', acceptedNode: 'hoseAccepted' } },
      { text: 'Not today.', action: { kind: 'goto', nodeId: 'root' } },
    ],
  },
  hoseAccepted: {
    speaker: 'Old Pete',
    body: 'Dark streak. Hold the spray. Walk the cut along the band.',
    options: [{ text: 'Right.', action: { kind: 'leave' } }],
  },
  hoseDone: {
    speaker: 'Old Pete',
    body: 'That bar will not look the same. File a lode on the ridge when you want rock instead of gravel.',
    options: [{ text: 'Much obliged.', action: { kind: 'leave' } }],
  },
  lesson: {
    speaker: 'Old Pete',
    body: 'Look before you count. Black sand on the inside shore is the streak. Gray rock standing in the creek is bedrock. A pile of gravel is the bar. White quartz on the bank means the color is close. Downstream of a boulder, a dark pocket. Press F and a hole remembers the number. Six is pay. Rain walks the black sand, so look again after a storm. J keeps the page.',
    options: [{ text: "I'll go look.", action: { kind: 'leave' } }],
  },
  bio: {
    speaker: 'Old Pete',
    body: "Long enough that I knew this stretch before they paved the highway. Came looking for color and never quite gave up looking. Just enough finds to keep the dream warm, ain't it?",
    options: [
      { text: 'How long, exactly?', action: { kind: 'goto', nodeId: 'bioMore' } },
      { text: 'Back to the streams.', action: { kind: 'goto', nodeId: 'root' } },
    ],
  },
  bioMore: {
    speaker: 'Old Pete',
    body: 'Long enough that the trees are taller than they used to be. Leave it at that, partner.',
    options: [{ text: 'All right.', action: { kind: 'goto', nodeId: 'root' } }],
  },
};

export const JUMPER_DIALOGUE: DialogueTree = {
  root: {
    speaker: 'Claim jumper',
    body: 'This bar was sitting empty. You want it, you can say so.',
    options: [
      { text: 'Get off my ground.', action: { kind: 'scareJumper' } },
      { text: "I'll run you down.", action: { kind: 'chaseJumper' } },
      { text: 'Forty dollars. Leave.', action: { kind: 'payJumper' } },
      { text: 'Walk away.', action: { kind: 'leave' } },
    ],
  },
  scared: {
    speaker: 'Claim jumper',
    body: 'All right. The shovel stays. The bar is yours.',
    options: [{ text: 'Go.', action: { kind: 'leave' } }],
  },
  paid: {
    speaker: 'Claim jumper',
    body: 'Pleasure doing business. I will be in town.',
    options: [{ text: 'Go.', action: { kind: 'leave' } }],
  },
  broke: {
    speaker: 'Claim jumper',
    body: 'Forty. You do not have it. Shout, or come and take the bar.',
    options: [
      { text: 'Get off my ground.', action: { kind: 'scareJumper' } },
      { text: "I'll run you down.", action: { kind: 'chaseJumper' } },
      { text: 'Walk away.', action: { kind: 'leave' } },
    ],
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
  if (node.body === DYNAMIC) return session.pendingBody ?? '';
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
