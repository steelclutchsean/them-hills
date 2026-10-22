// Headless first-3-hours economy. Numbers are copied from the live
// prospect, vendor, and equipment tables. Run: node tools/balance/simulate.mjs
//
// A "gap" is minutes from the moment a purchase becomes the next goal
// until the wallet (and any gram gate) can pay it. Story beats before
// the first tool are listed separately: the opening flake is a two-minute
// promise, not a store purchase.

const BASE_YIELD_GRAMS = 0.18;
const GRAMS_PER_OZT = 31.1035;
const SPOT = 2500;
const TOWN = 1;
const ASSAYER = 0.85 * 0.85 + 0.13 * 0.92 + 0.02 * 1;
const DOLLARS_PER_GRAM = (SPOT / GRAMS_PER_OZT) * TOWN * ASSAYER;

const PRICE = {
  rocker: 236,
  panSteel: 750,
  sluice: 840,
  tom: 1120,
  hire: 1150,
  monitor: 1350,
  pick: 1500,
  rockerApron: 1700,
  sluicePower: 1800,
  gear: 1450,
  pick2: 1700,
};

const METHOD = {
  pan: { scale: 1, tier: 1, dig: 0.82, geo: true, sec: { steady: 34, rusher: 42, reader: 30 } },
  rocker: { scale: 1.65, tier: 1.25, dig: 1, geo: false, sec: { steady: 20, rusher: 26, reader: 18 } },
  sluice: { scale: 2.2, tier: 1.45, dig: 1, geo: false, sec: { steady: 24, rusher: 30, reader: 22 } },
  tom: { scale: 2.75, tier: 1.55, dig: 1, geo: false, sec: { steady: 28, rusher: 34, reader: 24 } },
  monitor: { scale: 3.9, tier: 1.7, dig: 1, geo: false, sec: { steady: 32, rusher: 40, reader: 28 } },
  // North lode after milling. A run is drill, blast, muck, and the walk to Silas.
  hardrock: { scale: 4.6, tier: 1.55, dig: 1, geo: false, sec: { steady: 48, rusher: 56, reader: 42 } },
};

// Styles share the marked creek. The spread is how clean the wash is,
// whether the player bothered to read the tells, and how long a trip takes.
const STYLE = {
  steady: { skill: 1.22, geo: 1.15, comfort: 1.08, story: 6.0 },
  rusher: { skill: 1.0, geo: 1.05, comfort: 1, story: 5.4 },
  reader: { skill: 1.38, geo: 1.32, comfort: 1.12, story: 7.0 },
};

const LADDER = [
  { name: 'Rocker box', cost: PRICE.rocker, next: 'rocker' },
  // Steel pan is the step after the rocker is running. Income stays on the
  // rocker until the sluice, which is what keeps every style inside 5–15.
  { name: 'Steel pan', cost: PRICE.panSteel, next: null },
  { name: 'Sluice', cost: PRICE.sluice, next: 'sluice' },
  { name: 'Long tom', cost: PRICE.tom, next: 'tom' },
  { name: 'Hire a hand', cost: PRICE.hire, next: null },
  { name: 'Monitor', cost: PRICE.monitor, hold: 8, next: 'monitor' },
  { name: 'Pick', cost: PRICE.pick, next: null },
  { name: 'Rocker apron', cost: PRICE.rockerApron, next: null },
  { name: 'Power sluice', cost: PRICE.sluicePower, next: null },
  { name: 'Waders', cost: PRICE.gear, next: null },
  { name: 'Double jack', cost: PRICE.pick2, next: null },
  { name: 'Full shovel', cost: 1550, next: null },
  { name: 'Long shovel', cost: 1680, next: null },
  { name: 'Classifier stack', cost: 1580, next: null },
  { name: 'Five-stack', cost: 1720, next: null },
  { name: 'Headlamp', cost: 1520, next: null },
  { name: 'Snuffer vials', cost: 1500, next: null },
  { name: 'Snuffer scale', cost: 1680, next: null },
  { name: 'Detector', cost: 1600, next: null },
  { name: 'Pinpointer', cost: 1750, next: null },
  { name: 'Riffled pan', cost: 1720, next: null },
  { name: 'Insulated gear', cost: 1750, next: null },
  { name: 'Hard-rock kit', cost: 1750, next: null },
  { name: 'Second claim', cost: 1650, next: null },
  { name: 'Third claim', cost: 1800, next: null },
  { name: 'Lode filing', cost: 1700, next: null },
  { name: 'Lean-to', cost: 1600, next: null },
  { name: 'Cabin', cost: 1750, next: null },
  { name: 'Cache', cost: 1680, next: null },
  { name: 'Hand dredge', cost: 1700, next: null },
];

// Chapter 2 starts after the placer ladder. Gaps here are not held to the
// 5–15 minute band: powder is a pocket cost, and the lease is the ending.
const ARC = [
  { name: 'Timber the drift', cost: 160, next: 'hardrock' },
  { name: 'Powder and fuse', cost: 108, next: null },
  { name: 'Stamp fees', cost: 96, next: null },
  { name: 'Buy the lease', cost: 4200, next: null, rush: 1.18 },
];

function gramsPerRun(styleName, methodName) {
  const style = STYLE[styleName];
  const method = METHOD[methodName];
  const geo = method.geo ? style.geo : 1;
  return BASE_YIELD_GRAMS * method.dig * style.skill * style.comfort * method.scale * method.tier * geo;
}

function play(styleName) {
  const style = STYLE[styleName];
  let method = 'pan';
  let wallet = gramsPerRun(styleName, 'pan') * DOLLARS_PER_GRAM;
  let minute = style.story;
  const rows = [];
  for (const goal of LADDER) {
    if (minute > 180) break;
    const perRun = gramsPerRun(styleName, method);
    const sec = METHOD[method].sec[styleName];
    const gPerMin = (perRun * 60) / sec;
    const dPerMin = gPerMin * DOLLARS_PER_GRAM;
    const cashMin = Math.max(0, goal.cost - wallet) / dPerMin;
    const holdMin = ((goal.hold ?? 0) / gPerMin);
    const gap = Math.max(cashMin, holdMin);
    minute += gap;
    wallet = wallet + dPerMin * gap - goal.cost;
    rows.push({
      goal: goal.name,
      gap: gap,
      at: minute,
      method,
      perRun,
      dPerMin,
      wallet,
    });
    if (goal.next) method = goal.next;
  }
  const arc = [];
  for (const goal of ARC) {
    const perRun = gramsPerRun(styleName, method);
    const sec = METHOD[method].sec[styleName];
    const gPerMin = (perRun * 60) / sec;
    let dPerMin = gPerMin * DOLLARS_PER_GRAM;
    if (goal.name === 'Powder and fuse') dPerMin *= 0.68;
    const cost = goal.cost * (goal.rush ?? 1);
    const gap = Math.max(0, cost - wallet) / dPerMin;
    minute += gap;
    wallet = wallet + dPerMin * gap - cost;
    arc.push({ goal: `${goal.name}${goal.rush ? ' (rush)' : ''}`, gap, at: minute, method, dPerMin, wallet });
    if (goal.next) method = goal.next;
  }
  return { style: styleName, walletStart: gramsPerRun(styleName, 'pan') * DOLLARS_PER_GRAM, rows, arc };
}

const report = ['steady', 'rusher', 'reader'].map(play);
for (const played of report) {
  console.log(`\n${played.style}  first sale $${played.walletStart.toFixed(2)}  $/g ${DOLLARS_PER_GRAM.toFixed(2)}`);
  for (const row of played.rows) {
    const flag = row.gap < 5 || row.gap > 15 ? '  <<' : '';
    console.log(
      `  ${row.at.toFixed(1).padStart(6)} min  gap ${row.gap.toFixed(1).padStart(5)}  ${row.goal.padEnd(16)} via ${row.method.padEnd(8)} $${row.dPerMin.toFixed(0)}/min${flag}`,
    );
  }
  console.log('  -- arc --');
  for (const row of played.arc) {
    console.log(
      `  ${row.at.toFixed(1).padStart(6)} min  gap ${row.gap.toFixed(1).padStart(5)}  ${row.goal.padEnd(22)} via ${row.method.padEnd(8)} $${row.dPerMin.toFixed(0)}/min`,
    );
  }
}

const bad = report.flatMap((played) =>
  played.rows
    .filter((row) => row.at <= 180 && (row.gap < 5 || row.gap > 15))
    .map((row) => `${played.style}:${row.goal}`),
);
if (bad.length) {
  console.log(`\ngaps outside 5–15: ${bad.join(', ')}`);
  process.exitCode = 2;
}
