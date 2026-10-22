import type { GoldStash, JournalEntry, SaveV1 } from '@/save/schema';

function remember(journal: readonly JournalEntry[], entry: JournalEntry): JournalEntry[] {
  if (journal.some((row) => row.id === entry.id)) return journal.slice();
  return [...journal, entry].slice(-48);
}

// Mid-game and endgame. Act 1 is the placer creek. Act 2 opens the north
// lode. Act 3 is the stamp mill. Act 4 is Ada Quinn's lease: buy her out,
// or mill enough ore and timber the drift that the town can refuse her.
// Missing fields on a v6 save are filled here. The save version stays 6.

export const POWDER_COST = 18;
export const TIMBER_COST = 40;
export const STAMP_FEE_PER_ORE = 2;
export const GRAMS_PER_ORE = 0.2;
export const BUYOUT_COST = 4200;
export const MILL_GOAL = 20;
export const TIMBER_GOAL = 3;
export const RUSH_PRICE = 1.18;

export interface CampaignState {
  act: 1 | 2 | 3 | 4;
  companyPressure: number;
  boughtOut: boolean;
  savedTown: boolean;
  heard: string[];
}

export interface LodeState {
  air: number;
  timber: number;
  ore: number;
  charges: number;
  creak: number;
  drilled: number;
  milled: number;
  collapses: number;
}

export type WorldEventId = 'calm' | 'flood' | 'drought' | 'rush' | 'fire';

export interface WorldEventState {
  id: WorldEventId;
  startedAt: number;
  until: number;
  /** Matches startedAt once the one-shot effect has been applied. */
  stamp: number;
}

export function defaultCampaign(): CampaignState {
  return { act: 1, companyPressure: 0, boughtOut: false, savedTown: false, heard: [] };
}

export function defaultLode(): LodeState {
  return { air: 1, timber: 0, ore: 0, charges: 0, creak: 0, drilled: 0, milled: 0, collapses: 0 };
}

export function defaultWorldEvent(): WorldEventState {
  return { id: 'calm', startedAt: 0, until: 0, stamp: 0 };
}

const SCHEDULE: readonly { id: WorldEventId; start: number; end: number }[] = [
  { id: 'flood', start: 1100, end: 1700 },
  { id: 'drought', start: 2400, end: 3100 },
  { id: 'rush', start: 3600, end: 4600 },
  { id: 'fire', start: 5200, end: 5900 },
];

export function priced(save: SaveV1, cost: number): number {
  if (save.world.event?.id !== 'rush') return cost;
  return Math.round(cost * RUSH_PRICE);
}

export function eventBanner(id: WorldEventId): string | null {
  switch (id) {
    case 'flood':
      return 'Spring flood — the pay streak walked downstream.';
    case 'drought':
      return 'Dry season — the creek is thin and the pans are light.';
    case 'rush':
      return 'Gold rush — the store is dear, and strangers are on the bars.';
    case 'fire':
      return 'Town fire — the mill is down. The bucket line needs you.';
    default:
      return null;
  }
}

export function placerEventFactor(save: SaveV1): number {
  const id = save.world.event?.id ?? 'calm';
  let factor = id === 'drought' ? 0.68 : 1;
  if (
    save.fieldwork.campaign.act >= 3 &&
    save.fieldwork.campaign.companyPressure > 0.85 &&
    !save.fieldwork.campaign.boughtOut &&
    !save.fieldwork.campaign.savedTown
  ) {
    factor *= 0.72;
  }
  return factor;
}

/** Fill arc fields missing from an older v6 blob. Does not bump the version. */
export function ensureArc(save: SaveV1): SaveV1 {
  const campaign = { ...defaultCampaign(), ...(save.fieldwork?.campaign ?? {}) };
  if (!Array.isArray(campaign.heard)) campaign.heard = [];
  const lode = { ...defaultLode(), ...(save.fieldwork?.lode ?? {}) };
  const event = { ...defaultWorldEvent(), ...(save.world?.event ?? {}) };
  return {
    ...save,
    fieldwork: { ...save.fieldwork, campaign, lode },
    world: { ...save.world, event },
  };
}

export interface ArcTick {
  save: SaveV1;
  changed: boolean;
  banner: string | null;
  status: string | null;
  creakPulse: boolean;
  collapsed: boolean;
  blackout: boolean;
}

export function tickArc(
  raw: SaveV1,
  dt: number,
  ctx: { allowEvents: boolean; inNorth: boolean; gameTime: number },
): ArcTick {
  const save = ensureArc(raw);
  const campaign = { ...save.fieldwork.campaign, heard: save.fieldwork.campaign.heard.slice() };
  const lode = { ...save.fieldwork.lode };
  const event = { ...save.world.event };
  let payShift = save.fieldwork.payShift;
  let journal = save.fieldwork.journal;
  let claims = save.fieldwork.claims;
  let creakPulse = false;
  let collapsed = false;
  let blackout = false;
  let changed = false;

  if (ctx.inNorth) {
    const nextAir = Math.max(0, lode.air - dt * 0.045);
    const creakRate = Math.max(-0.02, 0.028 - lode.timber * 0.009);
    const nextCreak = Math.max(0, Math.min(1, lode.creak + dt * creakRate));
    if ((lode.creak < 0.55 && nextCreak >= 0.55) || (lode.creak < 0.8 && nextCreak >= 0.8)) {
      creakPulse = true;
    }
    lode.air = nextAir;
    lode.creak = nextCreak;
    changed = true;
    if (lode.air <= 0) {
      lode.air = 0.55;
      blackout = true;
      journal = remember(journal, {
        id: `blackout-${Math.floor(ctx.gameTime)}`,
        title: 'Bad air',
        body: 'The candle died. Walk for the portal before the next breath.',
        gameTime: ctx.gameTime,
      });
    }
    if (lode.creak >= 0.96 && lode.timber < 2) {
      lode.creak = 0.2;
      lode.air = Math.min(lode.air, 0.5);
      lode.timber = Math.max(0, lode.timber - 1);
      lode.ore = Math.round(lode.ore * 0.65 * 10) / 10;
      lode.collapses += 1;
      collapsed = true;
      journal = remember(journal, {
        id: `cavein-${lode.collapses}`,
        title: 'Cave-in',
        body: 'The cap rock came down across the drift. Dig through it, or back out the way you came.',
        gameTime: ctx.gameTime,
      });
    }
  } else if (lode.air < 1) {
    lode.air = Math.min(1, lode.air + dt * 0.12);
    changed = true;
  }

  if (ctx.allowEvents) {
    const window =
      SCHEDULE.find((row) => ctx.gameTime >= row.start && ctx.gameTime < row.end) ?? null;
    const scripted = event.id !== 'calm' && ctx.gameTime < event.until;
    const nextId = scripted ? event.id : (window?.id ?? 'calm');
    if (event.id !== nextId) {
      event.id = nextId;
      event.startedAt = ctx.gameTime;
      event.until = window?.end ?? ctx.gameTime;
      event.stamp = 0;
      changed = true;
      const line = eventBanner(nextId);
      if (line) {
        journal = remember(journal, {
          id: `event-${nextId}-${Math.floor(ctx.gameTime / 100)}`,
          title:
            nextId === 'flood'
              ? 'Spring flood'
              : nextId === 'drought'
                ? 'Dry season'
                : nextId === 'rush'
                  ? 'The rush'
                  : 'Town fire',
          body: line,
          gameTime: ctx.gameTime,
        });
      }
    }
    if (event.id !== 'calm' && event.stamp !== event.startedAt) {
      event.stamp = event.startedAt;
      changed = true;
      if (event.id === 'flood') {
        payShift = {
          ...payShift,
          coyote_creek: Math.min(1.4, (payShift.coyote_creek ?? 0) + 0.55),
          buckeye_run: Math.min(1.4, (payShift.buckeye_run ?? 0) + 0.4),
        };
      }
      if (event.id === 'rush') {
        const open = claims.find(
          (c) => c.kind === 'placer' && c.jumperSince === null && c.pay > 0.2,
        );
        if (open && save.fieldwork.hands < 1) {
          claims = claims.map((c) => (c.id === open.id ? { ...c, jumperSince: ctx.gameTime } : c));
        }
      }
    }
    if (campaign.act >= 3 && !campaign.boughtOut && !campaign.savedTown) {
      const next = Math.min(1, campaign.companyPressure + dt * 0.00045);
      if (next !== campaign.companyPressure) {
        campaign.companyPressure = next;
        changed = true;
      }
    }
  }

  const banner = eventBanner(event.id);
  let status: string | null = null;
  if (ctx.inNorth) {
    const air =
      lode.air < 0.35
        ? 'Bad air. Get out or the candle dies.'
        : `Air ${Math.round(lode.air * 100)}%`;
    const wood = lode.creak > 0.55 ? 'The timbers are talking.' : `Timber ${lode.timber}`;
    status = `${air}  ·  ${wood}  ·  Ore ${lode.ore.toFixed(1)}`;
  } else if (campaign.act >= 2) {
    status = `Act ${campaign.act}  ·  Ore ${lode.ore.toFixed(1)}  ·  Milled ${lode.milled.toFixed(0)}`;
  }

  return {
    save: {
      ...save,
      fieldwork: { ...save.fieldwork, campaign, lode, payShift, journal, claims },
      world: { ...save.world, event },
    },
    changed,
    banner,
    status,
    creakPulse,
    collapsed,
    blackout,
  };
}

export interface ArcActionResult {
  save: SaveV1;
  node: string;
  hint: string | null;
}

function withHeard(save: SaveV1, id: string): SaveV1 {
  const heard = save.fieldwork.campaign.heard.includes(id)
    ? save.fieldwork.campaign.heard
    : [...save.fieldwork.campaign.heard, id];
  return {
    ...save,
    fieldwork: { ...save.fieldwork, campaign: { ...save.fieldwork.campaign, heard } },
  };
}

function spend(save: SaveV1, cost: number, gameTime: number, item: string): SaveV1 {
  return {
    ...save,
    wallet: {
      ...save.wallet,
      balance: save.wallet.balance - cost,
      lifetimeSpending: save.wallet.lifetimeSpending + cost,
      recentTransactions: [
        ...save.wallet.recentTransactions.slice(-49),
        {
          id: `tx_${gameTime.toFixed(0)}_${item}`,
          timestamp: gameTime,
          type: 'purchase' as const,
          amount: -cost,
          vendorId: 'general_store' as const,
          details: { itemPurchased: item },
        },
      ],
    },
  };
}

export function applyArcAction(
  raw: SaveV1,
  action:
    | { kind: 'beginLode' }
    | { kind: 'millOre' }
    | { kind: 'buyPowder' }
    | { kind: 'buyTimber' }
    | { kind: 'buyOutCompany' }
    | { kind: 'standWithTown' }
    | { kind: 'meetCompany' }
    | { kind: 'fightFire' },
  gameTime: number,
): ArcActionResult {
  let save = ensureArc(raw);
  const broke = save.wallet.balance;

  if (action.kind === 'beginLode') {
    if (save.equipment.ownedTiers.pick < 1) {
      return { save, node: 'veinNeedPick', hint: null };
    }
    save = withHeard(save, 'lode-open');
    save = {
      ...save,
      fieldwork: {
        ...save.fieldwork,
        campaign: {
          ...save.fieldwork.campaign,
          act: save.fieldwork.campaign.act < 2 ? 2 : save.fieldwork.campaign.act,
        },
        lode: { ...save.fieldwork.lode, charges: Math.max(2, save.fieldwork.lode.charges) },
        journal: remember(save.fieldwork.journal, {
          id: 'lode-open',
          title: 'The north vein',
          body: 'Pete says drill the honey quartz, not the white. Two rounds of powder are in the crib.',
          gameTime,
        }),
      },
    };
    return { save, node: 'veinOpen', hint: 'The north drift is open.' };
  }

  if (action.kind === 'millOre') {
    if (save.world.event.id === 'fire') return { save, node: 'millFire', hint: null };
    const ore = save.fieldwork.lode.ore;
    if (ore < 1) return { save, node: 'millEmpty', hint: null };
    const fee = Math.round(ore * STAMP_FEE_PER_ORE);
    if (broke < fee) return { save, node: 'millBroke', hint: null };
    const grams = ore * GRAMS_PER_ORE;
    const gold: GoldStash = {
      flake_g: save.inventory.carry.gold.flake_g + grams,
      picker_g: save.inventory.carry.gold.picker_g,
      nugget_g: save.inventory.carry.gold.nugget_g,
    };
    save = spend(save, fee, gameTime, 'stamp');
    save = withHeard(save, 'milled');
    save = {
      ...save,
      inventory: { ...save.inventory, carry: { ...save.inventory.carry, gold } },
      fieldwork: {
        ...save.fieldwork,
        campaign: {
          ...save.fieldwork.campaign,
          act: (save.fieldwork.campaign.act < 3 ? 3 : save.fieldwork.campaign.act) as 1 | 2 | 3 | 4,
        },
        lode: { ...save.fieldwork.lode, ore: 0, milled: save.fieldwork.lode.milled + ore },
        journal: remember(save.fieldwork.journal, {
          id: `mill-${Math.floor(gameTime)}`,
          title: 'Stamp mill',
          body: `Silas ran ${ore.toFixed(1)} ore into ${grams.toFixed(2)} g. Fee $${fee}.`,
          gameTime,
        }),
      },
    };
    return { save, node: 'millDone', hint: `Milled ${grams.toFixed(2)} g.` };
  }

  if (action.kind === 'buyPowder') {
    const cost = priced(save, POWDER_COST);
    if (broke < cost) return { save, node: 'millBroke', hint: null };
    save = spend(save, cost, gameTime, 'powder');
    save = {
      ...save,
      fieldwork: {
        ...save.fieldwork,
        lode: { ...save.fieldwork.lode, charges: save.fieldwork.lode.charges + 2 },
      },
    };
    return { save, node: 'powderBought', hint: null };
  }

  if (action.kind === 'buyTimber') {
    const cost = priced(save, TIMBER_COST);
    if (broke < cost) return { save, node: 'millBroke', hint: null };
    save = spend(save, cost, gameTime, 'timber');
    save = {
      ...save,
      fieldwork: {
        ...save.fieldwork,
        lode: {
          ...save.fieldwork.lode,
          timber: save.fieldwork.lode.timber + 1,
          creak: Math.max(0, save.fieldwork.lode.creak - 0.45),
        },
      },
    };
    return { save, node: 'timberBought', hint: 'A set of timbers is on the drift.' };
  }

  if (action.kind === 'meetCompany') {
    save = withHeard(save, 'ada');
    save = {
      ...save,
      fieldwork: {
        ...save.fieldwork,
        campaign: {
          ...save.fieldwork.campaign,
          act: 4,
          companyPressure: Math.max(0.35, save.fieldwork.campaign.companyPressure),
        },
      },
    };
    return { save, node: 'offer', hint: null };
  }

  if (action.kind === 'buyOutCompany') {
    const cost = priced(save, BUYOUT_COST);
    if (broke < cost) return { save, node: 'short', hint: null };
    save = spend(save, cost, gameTime, 'lease');
    save = withHeard(save, 'bought-out');
    save = {
      ...save,
      fieldwork: {
        ...save.fieldwork,
        campaign: { ...save.fieldwork.campaign, act: 4, boughtOut: true, companyPressure: 0 },
        journal: remember(save.fieldwork.journal, {
          id: 'bought-out',
          title: 'The lease',
          body: 'Quinn signed the creek over. The monitors leave with her.',
          gameTime,
        }),
      },
    };
    return { save, node: 'bought', hint: 'The lease is yours.' };
  }

  if (action.kind === 'standWithTown') {
    const ready =
      save.fieldwork.lode.milled >= MILL_GOAL && save.fieldwork.lode.timber >= TIMBER_GOAL;
    if (!ready) return { save, node: 'notYet', hint: null };
    save = withHeard(save, 'stood');
    save = {
      ...save,
      fieldwork: {
        ...save.fieldwork,
        campaign: { ...save.fieldwork.campaign, act: 4, savedTown: true, companyPressure: 0 },
        journal: remember(save.fieldwork.journal, {
          id: 'stood',
          title: 'The town holds',
          body: 'The mill and the timbered drift gave Mae and Pete a reason to refuse the company.',
          gameTime,
        }),
      },
    };
    return { save, node: 'stood', hint: 'Quinn has no creek left to take.' };
  }

  if (save.world.event.id !== 'fire')
    return { save, node: 'root', hint: 'The fire is already out.' };
  save = withHeard(save, 'fire-out');
  save = {
    ...save,
    world: {
      ...save.world,
      event: { ...save.world.event, id: 'calm', until: gameTime, stamp: gameTime },
    },
    fieldwork: {
      ...save.fieldwork,
      journal: remember(save.fieldwork.journal, {
        id: 'fire-out',
        title: 'Bucket line',
        body: 'The shed is charred and the inn is still standing. Silas can run the stamps again.',
        gameTime,
      }),
    },
  };
  return { save, node: 'held', hint: 'The bucket line holds.' };
}

export function bankOre(save: SaveV1, skill: number, gameTime: number): SaveV1 {
  const next = ensureArc(save);
  const gained = 6 + skill * 2.2;
  const charges = Math.max(0, next.fieldwork.lode.charges - 1);
  return {
    ...next,
    fieldwork: {
      ...next.fieldwork,
      lode: {
        ...next.fieldwork.lode,
        ore: next.fieldwork.lode.ore + gained,
        charges,
        drilled: next.fieldwork.lode.drilled + 1,
        creak: Math.min(1, next.fieldwork.lode.creak + 0.18),
      },
      journal: remember(next.fieldwork.journal, {
        id: `muck-${Math.floor(gameTime / 30)}`,
        title: 'Ore in the cart',
        body: `${gained.toFixed(1)} ore from the honey quartz. Silas can stamp it.`,
        gameTime,
      }),
    },
  };
}

export function timberInPlace(
  save: SaveV1,
  gameTime: number,
): { save: SaveV1; ok: boolean; reason: string } {
  const next = ensureArc(save);
  const cost = priced(next, TIMBER_COST);
  if (next.wallet.balance < cost)
    return { save: next, ok: false, reason: `A timber set is $${cost}.` };
  const spent = spend(next, cost, gameTime, 'timber-set');
  return {
    ok: true,
    reason: 'The set is lagged in. The drift goes quiet.',
    save: {
      ...spent,
      fieldwork: {
        ...spent.fieldwork,
        lode: {
          ...spent.fieldwork.lode,
          timber: spent.fieldwork.lode.timber + 1,
          creak: Math.max(0, spent.fieldwork.lode.creak - 0.5),
        },
      },
    },
  };
}
