import { priced } from '@/game/campaign';
import { EQUIPMENT, getNextUpgrade, type EquipmentCategory } from '@/economy/equipment';
import type { GroundRead } from '@/game/geology';
import { stakeable } from '@/game/geology';
import { isQuestCompleted } from '@/quests/quests';
import type {
  ClaimRecord,
  ConsumableId,
  FieldworkState,
  Habitat,
  JournalEntry,
  SaveV1,
  WorkMethod,
  WeatherState,
} from '@/save/schema';

// Rules for the long loop: which tool you are working with, what the
// store will sell, how a claim is filed, and how the town price moves.
// The store applies these and writes the save.

export const HIRE_COST = 1150;
export const LODE_FEE = 1700;
export const LEANTO_COST = 1600;
export const CABIN_COST = 1750;
export const CACHE_COST = 1680;
export const MAX_HANDS = 3;
export const MAX_CLAIMS = 3;

export interface SupplyDef {
  id: ConsumableId;
  name: string;
  cost: number;
  hunger: number;
  thirst: number;
}

export const SUPPLIES: readonly SupplyDef[] = [
  { id: 'coffee', name: 'Coffee', cost: 3, hunger: 0.06, thirst: 0.18 },
  { id: 'meal_ration', name: 'Beans', cost: 4, hunger: 0.28, thirst: 0.04 },
  { id: 'water_canteen', name: 'Canteen', cost: 6, hunger: 0, thirst: 0.5 },
  { id: 'nails', name: 'Nails', cost: 8, hunger: 0, thirst: 0 },
];

export interface RumorDef {
  id: string;
  title: string;
  body: string;
  unlocks?: string;
}

export const RUMORS: readonly RumorDef[] = [
  {
    id: 'inside',
    title: 'Inside bends',
    body: 'Gold is heavy. On a bend it drops where the water slows — the inside bank, not the fast outside.',
  },
  {
    id: 'boulders',
    title: 'Behind the rocks',
    body: 'Walk the downstream side of a boulder. The pocket in its lee hides flake the current could not carry.',
  },
  {
    id: 'bedrock',
    title: 'Down to bedrock',
    body: 'Where the creek has scoured to bedrock, color sits in the cracks. Those pans count high and run out fast.',
  },
  {
    id: 'rain',
    title: 'When the creek comes up',
    body: 'Rain swells the channel and walks the pay streak downstream. A spot that paid yesterday may be a tail tomorrow. Count it again.',
  },
  {
    id: 'buckeye',
    title: 'Buckeye Run',
    body: 'The green creek south of town is Buckeye Run. Same rules, a different streak. It stays thin until you know how to count color.',
    unlocks: 'buckeye_run',
  },
  {
    id: 'jumpers',
    title: 'Claim jumpers',
    body: 'An empty claim invites company. Hire a hand to watch it. Leave jumpers alone and they will take a cut of the pay.',
  },
  {
    id: 'tools',
    title: 'Boxes and toms',
    body: 'A rocker wants a beat. A sluice wants the water held in the riffles. A long tom eats a whole bar. The monitor needs a hired hand on the hose.',
  },
];

export const CREEK_LESSON =
  'Read the ground before you count it. Black sand on the inside shore is the streak. Gray rock standing in the water is bedrock. A pile of gravel is the bar. White quartz on the bank means color is close. The dark pocket downstream of a boulder is a trap. Press F and the hole keeps the count. Six or more is pay. Rain walks the black sand downstream. Stake what you can see. J opens this journal.';

export interface StoreListing {
  kind: 'upgrade' | 'supply' | 'sell' | 'improve' | 'hire';
  id: string;
  displayName: string;
  ownedLabel: string;
  nextLabel: string;
  nextCost: number | null;
  affordable: boolean;
  questGated: boolean;
}

export interface ThreatEvent {
  kind: 'jumper' | 'theft';
  claimId: string;
  detail: string;
}

export function remember(journal: readonly JournalEntry[], entry: JournalEntry): JournalEntry[] {
  if (journal.some((e) => e.id === entry.id)) return journal.slice();
  return [...journal, entry].slice(-48);
}

export function supplyDef(id: string): SupplyDef | null {
  return SUPPLIES.find((s) => s.id === id) ?? null;
}

export function availableMethods(owned: SaveV1['equipment']['ownedTiers']): WorkMethod[] {
  const methods: WorkMethod[] = ['pan'];
  if (owned.rocker >= 1) methods.push('rocker');
  if (owned.sluice >= 2) methods.push('sluice');
  if (owned.longTom >= 1) methods.push('long_tom');
  if (owned.hydraulic >= 1) methods.push('hydraulic');
  if (owned.pick >= 1 || owned.shovel >= 3) methods.push('hardrock');
  return methods;
}

export function nextMethod(current: WorkMethod, owned: SaveV1['equipment']['ownedTiers'], dir: 1 | -1): WorkMethod {
  const methods = availableMethods(owned);
  const idx = Math.max(0, methods.indexOf(current));
  const next = (idx + dir + methods.length) % methods.length;
  return methods[next] ?? 'pan';
}

export function methodLabel(method: WorkMethod): string {
  switch (method) {
    case 'pan':
      return 'Pan';
    case 'rocker':
      return 'Rocker';
    case 'sluice':
      return 'Sluice';
    case 'long_tom':
      return 'Long tom';
    case 'hydraulic':
      return 'Hydraulic';
    case 'hardrock':
      return 'Hard-rock';
  }
}

export function townQuote(spot: number, bias: number, weather: WeatherState, hour: number): number {
  let m = bias;
  if (weather === 'rain') m *= 1.06;
  if (weather === 'snow' || weather === 'fog') m *= 0.97;
  if (hour < 6 || hour >= 21) m *= 0.93;
  return spot * m;
}

export function stakePrice(existing: number): number {
  if (existing <= 0) return 0;
  if (existing === 1) return 1650;
  return 1800;
}

export function evaluatePlacer(
  save: SaveV1,
  x: number,
  z: number,
  read: GroundRead,
): { ok: true; cost: number; name: string } | { ok: false; reason: string } {
  if (!read.streamId) return { ok: false, reason: 'File a claim in the creek, not on the flat.' };
  if (!stakeable(read.habitat)) {
    return { ok: false, reason: `${read.advice} Not worth the filing fee.` };
  }
  if (save.fieldwork.claims.length >= MAX_CLAIMS) {
    return { ok: false, reason: 'Three claims is all the county will record.' };
  }
  for (const claim of save.fieldwork.claims) {
    if (Math.hypot(claim.x - x, claim.z - z) < 10) {
      return { ok: false, reason: 'Too close to a claim you already hold.' };
    }
  }
  const cost = stakePrice(save.fieldwork.claims.length);
  if (save.wallet.balance < cost) return { ok: false, reason: `The filing fee is $${cost}.` };
  const streamName = read.streamId === 'buckeye_run' ? 'Buckeye' : 'Coyote';
  return { ok: true, cost, name: `${streamName} ${read.label}` };
}

export function creekYieldFactor(save: SaveV1, read: GroundRead): number {
  let geo = read.yieldScale;
  if (read.streamId === 'buckeye_run' && !save.fieldwork.unlockedStreams.includes('buckeye_run')) {
    geo *= 0.45;
  }
  return Math.max(0.35, geo);
}

export function claimYieldFactor(claims: readonly ClaimRecord[], x: number, z: number, habitat: Habitat): number {
  const claim = nearestClaim(claims, 'placer', x, z, 12);
  if (!claim) return 1;
  let factor = 0.5 + 0.5 * claim.pay;
  if (claim.habitat === habitat) factor *= 1.12;
  if (claim.improvements.camp >= 1) factor *= 1.05;
  return factor;
}

export function lodeYieldFactor(claims: readonly ClaimRecord[], mineId: string | null): number {
  if (!mineId) return 1;
  const lode = claims.find((c) => c.kind === 'lode' && c.streamId === mineId);
  if (!lode) return 1;
  return (0.7 + 0.3 * lode.pay) * 1.45;
}

export function nearestClaim(
  claims: readonly ClaimRecord[],
  kind: ClaimRecord['kind'] | undefined,
  x: number,
  z: number,
  radius: number,
): ClaimRecord | null {
  let best: ClaimRecord | null = null;
  let bestD = radius;
  for (const claim of claims) {
    if (kind && claim.kind !== kind) continue;
    const d = Math.hypot(claim.x - x, claim.z - z);
    if (d <= bestD) {
      best = claim;
      bestD = d;
    }
  }
  return best;
}

export function buildListings(save: SaveV1): StoreListing[] {
  const rows: StoreListing[] = [];
  const wallet = save.wallet.balance;
  for (const category of Object.keys(EQUIPMENT) as EquipmentCategory[]) {
    const ownedTier = save.equipment.ownedTiers[category];
    const next = getNextUpgrade(category, ownedTier);
    const gated = next?.questGated === true && !(next.gateQuest && isQuestCompleted(save, next.gateQuest));
    rows.push({
      kind: 'upgrade',
      id: category,
      displayName: EQUIPMENT[category].displayName,
      ownedLabel: ownedTier > 0 ? `T${ownedTier}` : '—',
      nextLabel: next ? (gated ? 'Quest locked' : next.label) : 'Maxed',
      nextCost: next && !gated ? priced(save, next.cost) : null,
      affordable: Boolean(next && !gated && wallet >= priced(save, next.cost)),
      questGated: gated,
    });
  }
  for (const supply of SUPPLIES) {
    const owned = save.inventory.carry.consumables[supply.id] ?? 0;
    rows.push({
      kind: 'supply',
      id: supply.id,
      displayName: supply.name,
      ownedLabel: `×${owned}`,
      nextLabel: 'Buy',
      nextCost: priced(save, supply.cost),
      affordable: wallet >= priced(save, supply.cost),
      questGated: false,
    });
    if (owned > 0) {
      const sell = Math.round(supply.cost * 50) / 100;
      rows.push({
        kind: 'sell',
        id: supply.id,
        displayName: `Sell ${supply.name.toLowerCase()}`,
        ownedLabel: `×${owned}`,
        nextLabel: 'Sell',
        nextCost: sell,
        affordable: true,
        questGated: false,
      });
    }
  }
  const nails = save.inventory.carry.consumables.nails ?? 0;
  const campTier = bestCamp(save.fieldwork.claims);
  const hasClaim = save.fieldwork.claims.length > 0;
  rows.push({
    kind: 'improve',
    id: 'leanto',
    displayName: 'Lean-to on your claim',
    ownedLabel: campTier >= 1 ? 'built' : '—',
    nextLabel: campTier >= 1 ? 'Built' : nails >= 4 ? 'Build' : 'Need 4 nails',
    nextCost: campTier >= 1 ? null : 20,
    affordable: hasClaim && campTier < 1 && nails >= 4 && wallet >= 20,
    questGated: false,
  });
  rows.push({
    kind: 'improve',
    id: 'cabin',
    displayName: 'Cabin frame',
    ownedLabel: campTier >= 2 ? 'built' : '—',
    nextLabel: campTier >= 2 ? 'Built' : campTier < 1 ? 'Lean-to first' : nails >= 8 ? 'Build' : 'Need 8 nails',
    nextCost: campTier >= 2 || campTier < 1 ? null : 80,
    affordable: hasClaim && campTier === 1 && nails >= 8 && wallet >= 80,
    questGated: false,
  });
  const cache = save.fieldwork.claims.some((c) => c.improvements.cache);
  rows.push({
    kind: 'improve',
    id: 'cache',
    displayName: 'Lockbox cache',
    ownedLabel: cache ? 'built' : '—',
    nextLabel: cache ? 'Built' : 'Build',
    nextCost: cache ? null : 55,
    affordable: hasClaim && !cache && wallet >= 55,
    questGated: false,
  });
  rows.push({
    kind: 'hire',
    id: 'hand',
    displayName: 'Hire a hand',
    ownedLabel: `${save.fieldwork.hands}`,
    nextLabel: save.fieldwork.hands >= MAX_HANDS ? 'Crew full' : 'Hire',
    nextCost: save.fieldwork.hands >= MAX_HANDS ? null : priced(save, HIRE_COST),
    affordable: save.fieldwork.hands < MAX_HANDS && wallet >= priced(save, HIRE_COST),
    questGated: false,
  });
  return rows;
}

export function bestCamp(claims: readonly ClaimRecord[]): 0 | 1 | 2 {
  let tier: 0 | 1 | 2 = 0;
  for (const claim of claims) {
    if (claim.improvements.camp > tier) tier = claim.improvements.camp;
  }
  return tier;
}

export function openingGuide(save: SaveV1): {
  title: string;
  detail: string;
  beam: 'creek' | 'assayer' | 'pete' | 'store' | 'claim' | 'rocker' | 'sluice' | 'tom' | 'monitor' | 'lode' | 'mill' | 'company';
} | null {
  const carry =
    save.inventory.carry.gold.flake_g +
    save.inventory.carry.gold.picker_g +
    save.inventory.carry.gold.nugget_g;
  const jumped = save.fieldwork.claims.find((c) => c.jumperSince !== null);
  if (jumped) {
    return {
      title: 'Someone on your claim',
      detail: `A jumper is working ${jumped.name}. Walk up and confront them — shout, chase, or pay them off.`,
      beam: 'claim',
    };
  }
  if (!save.progression.firstSaleCompleted && carry > 1e-4) {
    return {
      title: 'Cash it in',
      detail: 'Walk west to the Town Assayer (gold sign) and press E to sell.',
      beam: 'assayer',
    };
  }
  const fresh =
    !save.progression.firstSaleCompleted &&
    !save.progression.tutorialCompleted &&
    save.fieldwork.claims.length === 0 &&
    carry <= 1e-4;
  if (fresh) {
    return {
      title: 'First claim',
      detail: 'Walk east along Coyote Creek. When the gravel glints underfoot, press E. Shift sprints.',
      beam: 'creek',
    };
  }
  if (!save.fieldwork.rumorsHeard.includes('lesson')) {
    return {
      title: 'Ask Old Pete',
      detail: 'His fire is just west of the trail you spawned on. He names the tells: black sand, gray bedrock, white quartz, gravel, and the lee of a boulder.',
      beam: 'pete',
    };
  }
  if (save.fieldwork.samples.length === 0) {
    return {
      title: 'Read the creek',
      detail: 'Follow the black sand on the inside shore. Gray rock and white quartz confirm it. Press F and the hole keeps the count.',
      beam: 'creek',
    };
  }
  if (save.fieldwork.claims.length === 0) {
    return {
      title: 'Stake a stretch',
      detail: 'When the tells line up, stand on that ground and press E. The first filing is free.',
      beam: 'creek',
    };
  }
  const owned = save.equipment.ownedTiers;
  const runs = save.fieldwork.machineRuns;
  if (owned.rocker < 1) {
    return {
      title: 'A rocker box',
      detail: 'The rocker is $236 at the store. Keep panning Coyote Creek until you can pay. It sits on your claim.',
      beam: 'store',
    };
  }
  if (runs.rocker < 1) {
    return {
      title: 'Rock the box',
      detail: 'Stand at the rocker on your claim and press E. Tap when the box reaches either end.',
      beam: 'rocker',
    };
  }
  if (owned.pan < 2) {
    const steel = EQUIPMENT.pan.upgrades.find((row) => row.toTier === 2);
    return {
      title: 'A steel pan',
      detail: `The 14 inch steel pan is $${steel?.cost ?? 750} at the store. Run the rocker until it is paid, then the sluice.`,
      beam: 'store',
    };
  }
  if (owned.sluice < 2) {
    return {
      title: 'A sluice',
      detail: 'Next is a full sluice. Shovel the hopper, hold the water in the riffles, then pick the gold out.',
      beam: 'store',
    };
  }
  if (runs.sluice < 1) {
    return {
      title: 'Run the sluice',
      detail: 'Work the sluice on your claim. Feed, set the flow, clean the riffles.',
      beam: 'sluice',
    };
  }
  if (owned.longTom < 1) {
    return {
      title: 'A long tom',
      detail: 'The tom is a longer box with a grizzly on top. Ask Pete, then buy it. Shake the bars, then clean the lower box.',
      beam: 'pete',
    };
  }
  if (runs.long_tom < 1) {
    return {
      title: 'Wash a yard',
      detail: 'Stand at the long tom and press E. Shake the grizzly when it rises, then clean the riffles.',
      beam: 'tom',
    };
  }
  if (save.fieldwork.hands < 1) {
    return {
      title: 'Hire a hand',
      detail: 'Pete knows a hand. They walk the machines and watch the claim. One of them can hold a monitor hose. $1150.',
      beam: 'pete',
    };
  }
  if (owned.hydraulic < 1) {
    return {
      title: 'Earn the monitor',
      detail: 'Bring Pete eight grams and $1350 and he will sign for the hose. Aim it at the dark streak in the bank.',
      beam: 'pete',
    };
  }
  if (runs.hydraulic < 1) {
    return {
      title: 'Cut the streak',
      detail: 'A hand is on the hose. Sweep the dark band and keep the water pressure in the middle.',
      beam: 'monitor',
    };
  }
  const arc = save.fieldwork.campaign;
  const lode = save.fieldwork.lode;
  if (arc && arc.act < 2) {
    return {
      title: 'The north vein',
      detail:
        owned.pick < 1
          ? 'Buy a pick, then ask Pete about the quartz on the north ridge. White is barren. Honey is the vein.'
          : 'Ask Pete to open the north vein. Drill the honey quartz, not the white.',
      beam: 'pete',
    };
  }
  if (arc && lode && arc.act < 3) {
    return {
      title: lode.ore >= 1 ? 'Haul the ore' : 'Drill the north lode',
      detail:
        lode.ore >= 1
          ? 'The cart is loaded. Silas Voss at the stamp mill will run it. Two dollars a unit.'
          : 'In the north drift: single-jack, a timed fuse, then muck the ore. Timber the set if the caps creak.',
      beam: lode.ore >= 1 ? 'mill' : 'lode',
    };
  }
  if (arc && !arc.boughtOut && !arc.savedTown && arc.act < 4) {
    return {
      title: 'Quinn is in town',
      detail: 'Ada Quinn of Consolidated Hydraulic is with the wagon. Hear the offer before the monitors take the bars.',
      beam: 'company',
    };
  }
  if (arc && !arc.boughtOut && !arc.savedTown) {
    return {
      title: 'The lease',
      detail: 'Buy Quinn out for $4200, or mill 20 loads and timber the drift so Mae and Pete can refuse her.',
      beam: 'company',
    };
  }
  if (owned.pick < 1) {
    return {
      title: 'A pick for the ridge',
      detail: 'The north mine opens with a pick ($1500). File a lode with Pete once you own one.',
      beam: 'store',
    };
  }
  const tail: {
    when: boolean;
    title: string;
    detail: string;
    beam: 'store' | 'pete' | 'claim';
  }[] = [
    { when: owned.rocker < 2, title: 'An apron on the rocker', detail: 'The store fits an apron for $1700. It keeps the gravel in the box.', beam: 'store' },
    { when: owned.sluice < 3, title: 'A power sluice', detail: 'Pump-fed riffles are $1800. The box you have is the manual one.', beam: 'store' },
    { when: owned.gear < 2, title: 'Waders', detail: 'Personal gear, tier 2, is $1450. Cold water stops being the job.', beam: 'store' },
    { when: owned.pick < 2, title: 'A double jack', detail: 'The next pick is $1700. The single jack opened the ridge.', beam: 'store' },
    { when: owned.shovel < 2, title: 'A full shovel', detail: 'Replace the toy spade. $1550 at the store.', beam: 'store' },
    { when: owned.shovel < 3, title: 'A real shovel', detail: 'The long-handled shovel is $1680.', beam: 'store' },
    { when: owned.classifier < 2, title: 'A classifier stack', detail: 'Three screens are $1580. The dirt you skip is the dirt you re-wash.', beam: 'store' },
    { when: owned.classifier < 3, title: 'The five-stack', detail: 'The stand classifier is $1720.', beam: 'store' },
    { when: owned.headlamp < 2, title: 'A headlamp', detail: 'The store lamp is $1520. The north adit is dark.', beam: 'store' },
    { when: owned.snuffer < 2, title: 'Vials and a glass', detail: 'A snuffer bottle set is $1500.', beam: 'store' },
    { when: owned.snuffer < 3, title: 'A scale', detail: 'The pro snuffer is $1680.', beam: 'store' },
    { when: owned.detector < 2, title: 'A metal detector', detail: 'The mid-range PI is $1600.', beam: 'store' },
    { when: owned.detector < 3, title: 'A pinpointer', detail: 'The pro detector is $1750.', beam: 'store' },
    { when: owned.pan < 3, title: 'A riffled pan', detail: 'The 17 inch pan is $1720. The steel 14 inch can wait if you already bought it.', beam: 'store' },
    { when: owned.gear < 3, title: 'Insulated gear', detail: 'The GPS kit is $1750.', beam: 'store' },
    { when: owned.pick < 3, title: 'A hard-rock kit', detail: 'The last pick is $1750.', beam: 'store' },
    { when: save.fieldwork.claims.length < 2, title: 'A second claim', detail: 'The county fee on a second stretch is $1650.', beam: 'claim' },
    { when: save.fieldwork.claims.length < 3, title: 'A third claim', detail: 'The last filing the county allows is $1800.', beam: 'claim' },
    { when: !save.fieldwork.claims.some((c) => c.kind === 'lode'), title: 'File the lode', detail: 'Pete will record the north mine for $1700 once the pick is yours.', beam: 'pete' },
    { when: bestCamp(save.fieldwork.claims) < 1, title: 'A lean-to', detail: 'Nails and $1600 put a roof on the claim.', beam: 'store' },
    { when: bestCamp(save.fieldwork.claims) < 2, title: 'A cabin', detail: 'The cabin is $1750. Nights stop costing you.', beam: 'store' },
    {
      when: !save.fieldwork.claims.some((c) => c.improvements.cache),
      title: 'A cache',
      detail: 'A lockbox on the claim is $1680.',
      beam: 'store',
    },
    {
      when: owned.dredge < 1,
      title: 'A hand dredge',
      detail: 'The hand dredge is $1700. It is the last box the store will sell you this season.',
      beam: 'store',
    },
  ];
  for (const step of tail) {
    if (step.when) return { title: step.title, detail: step.detail, beam: step.beam };
  }
  return null;
}

export function journalLines(save: SaveV1): string[] {
  const lines: string[] = [];
  const arc = save.fieldwork.campaign;
  const lode = save.fieldwork.lode;
  if (arc) {
    const ending = arc.boughtOut ? 'The lease is yours.' : arc.savedTown ? 'The town held.' : `Act ${arc.act}.`;
    lines.push(ending);
  }
  if (lode && (lode.ore > 0 || lode.milled > 0)) {
    lines.push(`Ore in the cart ${lode.ore.toFixed(1)}. Milled ${lode.milled.toFixed(0)}. Timber sets ${lode.timber}.`);
  }
  const eventId = save.world.event?.id;
  if (eventId && eventId !== 'calm') lines.push(`The country is in a ${eventId}.`);
  lines.push(`Working with a ${methodLabel(save.fieldwork.method).toLowerCase()}.`);
  if (save.fieldwork.hands > 0) lines.push(`Crew: ${save.fieldwork.hands} hand${save.fieldwork.hands === 1 ? '' : 's'}.`);
  if (save.fieldwork.claims.length === 0) {
    lines.push('No claim filed.');
  } else {
    for (const claim of save.fieldwork.claims) {
      const watch = claim.jumperSince !== null ? ' — jumpers on it' : '';
      lines.push(
        `${claim.name} (${claim.kind}, pay ${Math.round(claim.pay * 100)}%)${watch}`,
      );
    }
  }
  if (save.fieldwork.samples.length > 0) {
    lines.push('Color counts:');
    for (const sample of save.fieldwork.samples.slice(-6)) {
      lines.push(`${sample.colors} colors · ${sample.habitat.replace('_', ' ')} · ${sample.streamId ?? 'dry'}`);
    }
  }
  const quests = Object.keys(save.quests.active);
  if (quests.length > 0) lines.push(`Open jobs: ${quests.join(', ')}`);
  if (save.fieldwork.journal.length === 0) {
    lines.push('The journal is empty. Talk to Old Pete.');
  } else {
    for (const entry of save.fieldwork.journal) {
      lines.push(`${entry.title} — ${entry.body}`);
    }
  }
  return lines;
}

export function habitatName(habitat: Habitat): string {
  return habitat.replaceAll('_', ' ');
}
