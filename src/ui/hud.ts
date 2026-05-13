import type { ActionId } from '@/input/actions';
import type { GamepadGlyphStyle } from '@/input/gamepad';
import type { ActionState, InputDevice } from '@/input/manager';
import type { CharacterState } from '@/game/character';
import type { ProspectingSnapshot } from '@/game/prospecting';
import type { WeatherView } from '@/game/weather';
import type { QuestProgressView } from '@/quests/quests';
import type { GoldStash } from '@/save/schema';

export interface HudUpdate {
  device: InputDevice;
  gamepadGlyph: GamepadGlyphStyle;
  actions: Readonly<Record<ActionId, ActionState>>;
  position: { x: number; y: number; z: number };
  characterState: CharacterState;
  stamina: number;
  hunger: number;
  thirst: number;
  /** True while the player is standing in stream water (passive thirst regen). */
  inStreamWater: boolean;
  /** "HH:MM" clock string from the day-night cycle. */
  clockText: string;
  /** Current weather state + intensity. */
  weather: WeatherView;
  /** True when the headlamp is currently illuminating (gear T2 + dark conditions). */
  headlampOn: boolean;
  inventory: GoldStash;
  walletBalance: number;
  spotPricePerOzt: number;
  spotPriceSource: 'live' | 'cached' | 'baseline';
  /** Compass bearing in degrees (0=N, 90=E, 180=S, 270=W). */
  bearingDeg: number;
  /** Bottom-center prompt — shown while idle near an interactable. */
  prompt: { text: string; glyph: string } | null;
  /** Center overlay — shown while a prospecting session is active. */
  prospect: ProspectingSnapshot | null;
  /** Center overlay — shown while at a vendor; offers a sale confirmation. */
  vendor: {
    name: string;
    multiplierLabel: string;
    grossDollars: number;
    canSell: boolean;
  } | null;
  /** Center overlay — shown while at the General Store; lists upgrade options. */
  store: {
    rows: {
      category: string;
      displayName: string;
      ownedTier: number;
      nextLabel: string;
      nextCost: number | null;
      affordable: boolean;
      questGated: boolean;
    }[];
    selectedIndex: number;
    walletBalance: number;
  } | null;
  /** Center overlay — shown while in a dialogue session with an NPC. */
  dialogue: {
    speaker: string;
    body: string;
    options: { text: string; enabled: boolean; hint?: string }[];
    selectedIndex: number;
  } | null;
  /** Persistent corner banner — list of all active quests + their objective progress. */
  questTracker: QuestProgressView[];
}

export interface MountedHud {
  update(state: HudUpdate): void;
}

const BAR_LENGTH = 20;
const GRAMS_PER_OZT = 31.1035;
const ASSAYER_MULT = 0.85;

// Compass dimensions and tick spacing.
const COMPASS_WIDTH = 320;
const COMPASS_HEIGHT = 40;
const COMPASS_PX_PER_DEG = 4; // 80° visible across COMPASS_WIDTH

const CARDINAL_LABELS: Record<number, string> = {
  0: 'N',
  45: 'NE',
  90: 'E',
  135: 'SE',
  180: 'S',
  225: 'SW',
  270: 'W',
  315: 'NW',
};

function drawCompass(ctx: CanvasRenderingContext2D | null, bearingDeg: number): void {
  if (!ctx) return;
  const w = COMPASS_WIDTH;
  const h = COMPASS_HEIGHT;
  ctx.clearRect(0, 0, w, h);

  // Bearing readout (top)
  ctx.fillStyle = '#c89b3b';
  ctx.font = '11px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`${Math.round(bearingDeg).toString().padStart(3, '0')}°`, w / 2, 2);

  // Strip: render markers within visible range
  const visibleDegRange = w / COMPASS_PX_PER_DEG; // 80°
  const minDeg = bearingDeg - visibleDegRange / 2;
  const maxDeg = bearingDeg + visibleDegRange / 2;
  const startTick = Math.ceil(minDeg / 5) * 5;

  for (let d = startTick; d <= maxDeg; d += 5) {
    const x = (d - minDeg) * COMPASS_PX_PER_DEG;
    const norm = ((d % 360) + 360) % 360;

    if (norm % 45 === 0) {
      // Cardinal/ordinal label
      ctx.fillStyle = norm === 0 ? '#ff6b6b' : '#ffffff';
      ctx.font =
        norm === 0
          ? 'bold 14px ui-monospace, Menlo, monospace'
          : 'bold 12px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(CARDINAL_LABELS[norm] ?? '?', x, h / 2 + 4);
      // Tick mark
      ctx.fillStyle = norm === 0 ? '#ff6b6b' : 'rgba(255,255,255,0.85)';
      ctx.fillRect(Math.round(x), h - 6, 1, 4);
    } else if (norm % 15 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(Math.round(x), h - 8, 1, 6);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(Math.round(x), h - 5, 1, 3);
    }
  }

  // Center heading marker
  ctx.fillStyle = '#c89b3b';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 5, 16);
  ctx.lineTo(w / 2 + 5, 16);
  ctx.lineTo(w / 2, 22);
  ctx.closePath();
  ctx.fill();
}

function makeBar(value: number, length = BAR_LENGTH): string {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

const STYLE = `
  .hud-info, .hud-inventory {
    position: fixed;
    color: rgba(255,255,255,0.92);
    pointer-events: none;
    user-select: none;
    font-variant-numeric: tabular-nums;
    background: rgba(10, 12, 14, 0.62);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 10px 14px;
    backdrop-filter: blur(6px);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
    font-size: 13px;
    line-height: 1.5;
  }
  .hud-info { top: 12px; left: 12px; max-width: 28vw; min-width: 220px; }
  .hud-inventory { top: 12px; right: 12px; min-width: 220px; text-align: left; }
  /* Section titles for both info + inventory cards. */
  .hud-info .card-title, .hud-inventory .card-title {
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #c89b3b;
    margin-bottom: 8px;
    font-weight: 600;
  }
  /* Default row layout: label on the left, value on the right. */
  .hud-info .row, .hud-inventory .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
  }
  .hud-info .row .label, .hud-inventory .row .label {
    color: rgba(255, 255, 255, 0.62);
    font-size: 12px;
  }
  .hud-info .row .val, .hud-inventory .row .val {
    color: rgba(255, 255, 255, 0.96);
  }
  .hud-info .row .val.big, .hud-inventory .row .val.big {
    font-size: 16px;
    font-weight: 700;
    color: #ffe39b;
  }
  /* Slim meter bars (stamina / hunger / thirst). */
  .hud-info .meter {
    display: flex; align-items: center; gap: 8px;
  }
  .hud-info .meter .label { width: 64px; }
  .hud-info .meter .bar {
    flex: 1;
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    overflow: hidden;
  }
  .hud-info .meter .bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 80ms linear, background-color 200ms;
  }
  .hud-info .meter .pct { width: 36px; text-align: right; font-size: 11px; color: rgba(255,255,255,0.62); }
  /* Quality-coded gold dots in inventory. */
  .hud-inventory .gold-dot {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    margin-right: 8px;
    vertical-align: 0.04em;
    box-shadow: 0 0 4px currentColor;
  }
  .hud-inventory .gold-dot.flake { background: #ffe26a; color: #ffe26a; }
  .hud-inventory .gold-dot.picker { background: #f0b145; color: #f0b145; }
  .hud-inventory .gold-dot.nugget { background: #c66a2a; color: #c66a2a; }
  /* Divider between sections inside the inventory card. */
  .hud-inventory .divider {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    margin: 8px 0;
  }
  /* Dimmed dev-debug rows kept visible but quiet. */
  .hud-info .debug-row {
    color: rgba(255, 255, 255, 0.4);
    font-size: 11px;
    margin-top: 2px;
  }
  .hud-compass {
    position: fixed;
    top: 12px; left: 50%; transform: translateX(-50%);
    pointer-events: none;
    user-select: none;
    image-rendering: pixelated;
    background: rgba(0,0,0,0.45);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 4px;
  }
  .hud-info > div:first-child, .hud-inventory > div:first-child {
    font-weight: 600;
    margin-bottom: 4px;
  }
  .hud-prompt {
    position: fixed;
    bottom: 80px; left: 50%; transform: translateX(-50%);
    background: rgba(0,0,0,0.55);
    border: 1px solid rgba(255,255,255,0.2);
    padding: 10px 18px;
    border-radius: 6px;
    color: #fff;
    font-size: 14px;
    pointer-events: none;
    user-select: none;
    backdrop-filter: blur(2px);
  }
  .hud-prompt .glyph {
    display: inline-block;
    background: rgba(255,255,255,0.15);
    padding: 2px 8px;
    border-radius: 4px;
    font-family: ui-monospace, Menlo, monospace;
    margin-right: 8px;
  }
  .hud-prospect {
    position: fixed;
    bottom: 64px; left: 50%; transform: translateX(-50%);
    width: 420px;
    background: rgba(0,0,0,0.7);
    border: 1px solid rgba(200,155,59,0.45);
    padding: 14px 18px 16px;
    border-radius: 8px;
    color: #fff;
    pointer-events: none;
    user-select: none;
    backdrop-filter: blur(3px);
    text-align: center;
  }
  .hud-prospect .step-label {
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #c89b3b;
    margin-bottom: 6px;
  }
  .hud-prospect .step-bar {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 16px;
    line-height: 1.0;
    margin: 4px 0 8px;
    color: #f0d089;
  }
  .hud-prospect .step-message {
    font-size: 13px;
    color: rgba(255,255,255,0.85);
  }
  .hud-prospect .step-extra {
    font-size: 12px;
    color: rgba(255,255,255,0.55);
    margin-top: 4px;
  }
  .hud-prospect.confirm {
    background: rgba(0,0,0,0.82);
    border-color: rgba(200,155,59,0.85);
  }
  .hud-prospect .confirm-label {
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #c89b3b;
    margin-bottom: 6px;
  }
  .hud-prospect .confirm-mult {
    font-size: 36px;
    font-weight: 700;
    line-height: 1.05;
    margin: 6px 0 8px;
    text-shadow: 0 1px 0 rgba(0,0,0,0.5);
  }
  .hud-prospect .confirm-mult.poor { color: #e87a4f; }
  .hud-prospect .confirm-mult.ok { color: #f0d089; }
  .hud-prospect .confirm-mult.good { color: #b6e89e; }
  .hud-prospect .confirm-mult.great { color: #ffe26a; }
  .hud-prospect .confirm-prompt {
    font-size: 12px;
    color: rgba(255,255,255,0.75);
  }
  .hud-info[hidden], .hud-inventory[hidden],
  .hud-prompt[hidden], .hud-prospect[hidden],
  .hud-compass[hidden], .hud-vendor[hidden], .hud-store[hidden],
  .hud-dialogue[hidden] { display: none; }
  .hud-vendor { border-color: rgba(212, 166, 71, 0.7); }
  .hud-vendor .step-label { color: #d4a647; }
  .hud-store {
    width: 520px;
    border-color: rgba(74, 140, 42, 0.7);
    text-align: left;
  }
  .hud-store .store-title { font-weight: 600; color: #8fc466; margin-bottom: 8px; text-align: center; letter-spacing: 0.1em; text-transform: uppercase; font-size: 12px; }
  .hud-store .store-row { padding: 4px 8px; border-radius: 4px; display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
  .hud-store .store-row.selected { background: rgba(74, 140, 42, 0.18); outline: 1px solid rgba(74, 140, 42, 0.45); }
  .hud-store .store-name { color: #fff; }
  .hud-store .store-owned { color: rgba(255,255,255,0.5); margin-left: 8px; }
  .hud-store .store-next { color: rgba(255,255,255,0.85); flex: 1; text-align: right; }
  .hud-store .store-next.locked { color: rgba(255,255,255,0.35); font-style: italic; }
  .hud-store .store-next.cant-afford { color: #b87a4a; }
  .hud-store .store-next.affordable { color: #8fc466; }
  .hud-store .store-footer { margin-top: 10px; font-size: 12px; color: rgba(255,255,255,0.6); text-align: center; }
  .hud-dialogue {
    width: 540px;
    border-color: rgba(212, 122, 42, 0.7);
    text-align: left;
  }
  .hud-dialogue .dlg-speaker {
    font-weight: 600;
    color: #d47a2a;
    margin-bottom: 6px;
    text-align: center;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-size: 12px;
  }
  .hud-dialogue .dlg-body {
    font-size: 14px;
    line-height: 1.5;
    color: #f5e0c0;
    margin-bottom: 12px;
    font-style: italic;
  }
  .hud-dialogue .dlg-option {
    padding: 5px 10px;
    border-radius: 4px;
    color: rgba(255,255,255,0.85);
    font-size: 13px;
  }
  .hud-dialogue .dlg-option.selected {
    background: rgba(212, 122, 42, 0.18);
    outline: 1px solid rgba(212, 122, 42, 0.45);
    color: #fff;
  }
  .hud-dialogue .dlg-option.disabled { color: rgba(255,255,255,0.35); font-style: italic; }
  .hud-dialogue .dlg-hint { color: rgba(255,255,255,0.5); margin-left: 6px; font-size: 12px; }
  .hud-dialogue .dlg-footer {
    margin-top: 10px;
    font-size: 12px;
    color: rgba(255,255,255,0.6);
    text-align: center;
  }
  .hud-quest-tracker {
    position: fixed;
    bottom: 24px; left: 24px;
    min-width: 240px; max-width: 320px;
    padding: 10px 14px;
    background: rgba(0,0,0,0.5);
    border: 1px solid rgba(212, 122, 42, 0.45);
    border-radius: 6px;
    color: rgba(255,255,255,0.9);
    text-shadow: 0 1px 2px rgba(0,0,0,0.85);
    pointer-events: none;
    user-select: none;
    font-size: 12px;
    line-height: 1.5;
    backdrop-filter: blur(2px);
  }
  .hud-quest-tracker .qt-header {
    color: #d47a2a;
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  .hud-quest-tracker .qt-title { font-weight: 600; color: #f5d088; margin-bottom: 4px; }
  .hud-quest-tracker .qt-obj { color: rgba(255,255,255,0.85); }
  .hud-quest-tracker .qt-obj.complete { color: #8fc466; text-decoration: line-through; opacity: 0.85; }
  .hud-quest-tracker .qt-progress { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: rgba(255,255,255,0.7); }
  .hud-quest-tracker[hidden] { display: none; }
`;

function injectStyle(): void {
  if (document.getElementById('hud-style')) return;
  const tag = document.createElement('style');
  tag.id = 'hud-style';
  tag.textContent = STYLE;
  document.head.appendChild(tag);
}

function glyphFor(
  device: InputDevice,
  glyph: GamepadGlyphStyle,
  action: 'INTERACT' | 'USE_TOOL',
): string {
  if (device === 'gamepad') {
    if (glyph === 'playstation') {
      if (action === 'INTERACT') return '□';
      if (action === 'USE_TOOL') return 'R2';
      return '?';
    }
    if (action === 'INTERACT') return 'X';
    if (action === 'USE_TOOL') return 'RT';
    return '?';
  }
  if (action === 'INTERACT') return 'E';
  if (action === 'USE_TOOL') return 'LMB';
  return '?';
}

export function mountHud(root: HTMLElement): MountedHud {
  injectStyle();

  // Re-style the index.html host to be a no-op container; we mount our own panels.
  root.style.position = 'static';
  root.innerHTML = '';

  const info = document.createElement('div');
  info.className = 'hud-info';
  document.body.appendChild(info);

  const inventory = document.createElement('div');
  inventory.className = 'hud-inventory';
  document.body.appendChild(inventory);

  const compass = document.createElement('canvas');
  compass.className = 'hud-compass';
  compass.width = COMPASS_WIDTH;
  compass.height = COMPASS_HEIGHT;
  document.body.appendChild(compass);
  const compassCtx = compass.getContext('2d');

  const prompt = document.createElement('div');
  prompt.className = 'hud-prompt';
  prompt.hidden = true;
  document.body.appendChild(prompt);

  const prospect = document.createElement('div');
  prospect.className = 'hud-prospect';
  prospect.hidden = true;
  document.body.appendChild(prospect);

  const vendor = document.createElement('div');
  vendor.className = 'hud-prospect hud-vendor';
  vendor.hidden = true;
  document.body.appendChild(vendor);

  const store = document.createElement('div');
  store.className = 'hud-prospect hud-store';
  store.hidden = true;
  document.body.appendChild(store);

  const dialogue = document.createElement('div');
  dialogue.className = 'hud-prospect hud-dialogue';
  dialogue.hidden = true;
  document.body.appendChild(dialogue);

  const questTracker = document.createElement('div');
  questTracker.className = 'hud-quest-tracker';
  questTracker.hidden = true;
  document.body.appendChild(questTracker);

  const lines: Record<string, HTMLElement> = {};
  const meters: Record<string, { fill: HTMLElement; pct: HTMLElement }> = {};

  // Info card (top-left) ——————————————————————————————————————
  const infoTitle = document.createElement('div');
  infoTitle.className = 'card-title';
  infoTitle.textContent = 'STATUS';
  info.appendChild(infoTitle);

  function makeRow(parent: HTMLElement, key: string, labelText: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'row';
    const lab = document.createElement('span');
    lab.className = 'label';
    lab.textContent = labelText;
    const val = document.createElement('span');
    val.className = 'val';
    row.appendChild(lab);
    row.appendChild(val);
    parent.appendChild(row);
    lines[key] = val;
    return val;
  }
  function makeMeterRow(parent: HTMLElement, key: string, labelText: string): void {
    const row = document.createElement('div');
    row.className = 'meter';
    const lab = document.createElement('span');
    lab.className = 'label';
    lab.textContent = labelText;
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    bar.appendChild(fill);
    const pct = document.createElement('span');
    pct.className = 'pct';
    row.appendChild(lab);
    row.appendChild(bar);
    row.appendChild(pct);
    parent.appendChild(row);
    meters[key] = { fill, pct };
  }
  function makeDebugRow(parent: HTMLElement, key: string): void {
    const row = document.createElement('div');
    row.className = 'debug-row';
    parent.appendChild(row);
    lines[key] = row;
  }

  makeRow(info, 'clock', '🕐 Time');
  makeRow(info, 'weather', '☁ Weather');
  makeRow(info, 'headlamp', '◉ Headlamp');
  makeMeterRow(info, 'stamina', '⚡ Stamina');
  makeMeterRow(info, 'hunger', '🍞 Hunger');
  makeMeterRow(info, 'thirst', '💧 Thirst');
  makeDebugRow(info, 'position');
  makeDebugRow(info, 'state');
  makeDebugRow(info, 'device');
  makeDebugRow(info, 'fps');

  // Inventory card (top-right) ——————————————————————————————————
  const invTitle = document.createElement('div');
  invTitle.className = 'card-title';
  invTitle.textContent = 'CARRY';
  inventory.appendChild(invTitle);

  function makeGoldRow(key: string, dotClass: string, label: string): void {
    const row = document.createElement('div');
    row.className = 'row';
    const lab = document.createElement('span');
    lab.className = 'label';
    const dot = document.createElement('span');
    dot.className = `gold-dot ${dotClass}`;
    lab.appendChild(dot);
    lab.appendChild(document.createTextNode(label));
    const val = document.createElement('span');
    val.className = 'val';
    row.appendChild(lab);
    row.appendChild(val);
    inventory.appendChild(row);
    lines[key] = val;
  }
  makeGoldRow('invFlake', 'flake', 'Flake');
  makeGoldRow('invPicker', 'picker', 'Picker');
  makeGoldRow('invNugget', 'nugget', 'Nugget');

  const div1 = document.createElement('div');
  div1.className = 'divider';
  inventory.appendChild(div1);

  const totalRow = document.createElement('div');
  totalRow.className = 'row';
  const totalLab = document.createElement('span');
  totalLab.className = 'label';
  totalLab.textContent = 'Total';
  const totalVal = document.createElement('span');
  totalVal.className = 'val big';
  totalRow.appendChild(totalLab);
  totalRow.appendChild(totalVal);
  inventory.appendChild(totalRow);
  lines.invTotal = totalVal;

  makeRow(inventory, 'invValue', '≈ Assayer');

  const div2 = document.createElement('div');
  div2.className = 'divider';
  inventory.appendChild(div2);

  const walletRow = document.createElement('div');
  walletRow.className = 'row';
  const walletLab = document.createElement('span');
  walletLab.className = 'label';
  walletLab.textContent = '💵 Wallet';
  const walletVal = document.createElement('span');
  walletVal.className = 'val big';
  walletRow.appendChild(walletLab);
  walletRow.appendChild(walletVal);
  inventory.appendChild(walletRow);
  lines.invWallet = walletVal;

  makeRow(inventory, 'invSpot', 'Spot / oz');

  let frameCount = 0;
  let lastFpsTime = performance.now();
  let fps = 0;

  return {
    update(s) {
      lines.clock!.textContent = s.clockText;
      const wIcon =
        s.weather.state === 'clear'
          ? '☀'
          : s.weather.state === 'overcast'
            ? '☁'
            : s.weather.state === 'rain'
              ? '☂'
              : '◐';
      const wPct = (s.weather.intensity * 100).toFixed(0);
      lines.weather!.textContent = `${wIcon} ${s.weather.state} ${wPct}%`;
      // Headlamp row collapses to a low-key dash when off.
      lines.headlamp!.textContent = s.headlampOn ? 'on' : 'off';
      lines.headlamp!.style.color = s.headlampOn ? '#ffe39b' : 'rgba(255,255,255,0.4)';

      setMeter(meters.stamina!, s.stamina);
      setMeter(meters.hunger!, s.hunger);
      const thirstSuffix = s.inStreamWater ? '  (drinking)' : '';
      setMeter(meters.thirst!, s.thirst, thirstSuffix);

      const padInfo = s.gamepadGlyph === 'unknown' ? 'no pad' : `pad: ${s.gamepadGlyph}`;
      lines.device!.textContent = `Input: ${s.device} (${padInfo})  •  State: ${s.characterState}`;
      lines.position!.textContent = `Pos: ${s.position.x.toFixed(1)}, ${s.position.y.toFixed(1)}, ${s.position.z.toFixed(1)}`;
      // Drop the verbose Active-actions debug line entirely from the
      // polished card; it was dev-only noise.
      lines.state!.textContent = '';

      frameCount++;
      const now = performance.now();
      if (now - lastFpsTime > 500) {
        fps = (frameCount * 1000) / (now - lastFpsTime);
        frameCount = 0;
        lastFpsTime = now;
      }
      lines.fps!.textContent = `FPS ${fps.toFixed(0)}`;

      // Compass
      drawCompass(compassCtx, s.bearingDeg);

      // Inventory
      const totalG = s.inventory.flake_g + s.inventory.picker_g + s.inventory.nugget_g;
      lines.invFlake!.textContent = `${s.inventory.flake_g.toFixed(3)} g`;
      lines.invPicker!.textContent = `${s.inventory.picker_g.toFixed(3)} g`;
      lines.invNugget!.textContent = `${s.inventory.nugget_g.toFixed(3)} g`;
      lines.invTotal!.textContent = `${totalG.toFixed(3)} g`;
      const dollarEst = (totalG / GRAMS_PER_OZT) * s.spotPricePerOzt * ASSAYER_MULT;
      lines.invValue!.textContent = `$${dollarEst.toFixed(2)}`;

      lines.invWallet!.textContent = `$${s.walletBalance.toFixed(2)}`;

      // Live spot price + source indicator (live = filled circle, cached =
      // half, baseline = empty). Updated by the spot-price service every 15 min.
      const sourceLabel =
        s.spotPriceSource === 'live'
          ? '● live'
          : s.spotPriceSource === 'cached'
            ? '◐ cached'
            : '○ baseline';
      lines.invSpot!.textContent = `$${s.spotPricePerOzt.toFixed(2)}  ${sourceLabel}`;

      // Prompt
      if (s.prompt) {
        prompt.hidden = false;
        prompt.innerHTML = '';
        const g = document.createElement('span');
        g.className = 'glyph';
        g.textContent = s.prompt.glyph;
        prompt.appendChild(g);
        const t = document.createElement('span');
        t.textContent = s.prompt.text;
        prompt.appendChild(t);
      } else {
        prompt.hidden = true;
      }

      // Prospect overlay
      if (s.prospect) {
        prospect.hidden = false;
        prospect.innerHTML = '';
        // Collect uses USE_TOOL for the in-game prompt; everything else
        // (and all confirmation prompts) uses INTERACT.
        const glyph = glyphFor(s.device, s.gamepadGlyph, s.prospect.primaryAction);

        if (s.prospect.awaitingConfirm) {
          // Between-stage banner: show the multiplier the player just
          // earned + a press-to-continue prompt.
          prospect.classList.add('confirm');
          const label = document.createElement('div');
          label.className = 'confirm-label';
          label.textContent = `${s.prospect.step.toUpperCase()} complete`;
          prospect.appendChild(label);

          const mult = document.createElement('div');
          mult.className = 'confirm-mult ' + multiplierClass(s.prospect.lastStageScore);
          mult.textContent = `${s.prospect.lastStageScore.toFixed(2)}× multiplier`;
          prospect.appendChild(mult);

          const prompt = document.createElement('div');
          prompt.className = 'confirm-prompt';
          prompt.textContent = `[${glyph}]  Continue`;
          prospect.appendChild(prompt);
        } else {
          prospect.classList.remove('confirm');
          const stepLabel = document.createElement('div');
          stepLabel.className = 'step-label';
          stepLabel.textContent = `Step ${stepNumber(s.prospect.step)} of 4 — ${s.prospect.step.toUpperCase()}`;
          prospect.appendChild(stepLabel);

          const bar = document.createElement('div');
          bar.className = 'step-bar';
          bar.textContent = makeBar(s.prospect.progress);
          prospect.appendChild(bar);

          const msg = document.createElement('div');
          msg.className = 'step-message';
          msg.textContent = `[${glyph}]  ${s.prospect.message}`;
          prospect.appendChild(msg);

          if (s.prospect.step === 'pan') {
            const extra = document.createElement('div');
            extra.className = 'step-extra';
            extra.textContent = `${s.prospect.panTapsRemaining} swirl${s.prospect.panTapsRemaining === 1 ? '' : 's'} remaining`;
            prospect.appendChild(extra);
          }
        }
      } else {
        prospect.hidden = true;
        prospect.classList.remove('confirm');
      }

      // Vendor sale overlay
      if (s.vendor) {
        vendor.hidden = false;
        vendor.innerHTML = '';
        const label = document.createElement('div');
        label.className = 'step-label';
        label.textContent = s.vendor.name;
        vendor.appendChild(label);

        const amount = document.createElement('div');
        amount.className = 'step-bar';
        amount.textContent = s.vendor.canSell
          ? `Sell all gold for $${s.vendor.grossDollars.toFixed(2)}`
          : 'No gold to sell';
        vendor.appendChild(amount);

        const sub = document.createElement('div');
        sub.className = 'step-extra';
        sub.textContent = s.vendor.multiplierLabel;
        vendor.appendChild(sub);

        const msg = document.createElement('div');
        msg.className = 'step-message';
        const glyph = glyphFor(s.device, s.gamepadGlyph, 'INTERACT');
        msg.textContent = s.vendor.canSell
          ? `[${glyph}]  Confirm sale     [Esc]  Cancel`
          : `[Esc]  Leave`;
        vendor.appendChild(msg);
      } else {
        vendor.hidden = true;
      }

      // Dialogue overlay
      if (s.dialogue) {
        dialogue.hidden = false;
        dialogue.innerHTML = '';

        const speaker = document.createElement('div');
        speaker.className = 'dlg-speaker';
        speaker.textContent = s.dialogue.speaker;
        dialogue.appendChild(speaker);

        const body = document.createElement('div');
        body.className = 'dlg-body';
        body.textContent = s.dialogue.body;
        dialogue.appendChild(body);

        s.dialogue.options.forEach((opt, idx) => {
          const row = document.createElement('div');
          const cls = ['dlg-option'];
          if (idx === s.dialogue!.selectedIndex) cls.push('selected');
          if (!opt.enabled) cls.push('disabled');
          row.className = cls.join(' ');
          row.textContent = opt.text;
          if (opt.hint) {
            const hint = document.createElement('span');
            hint.className = 'dlg-hint';
            hint.textContent = ` ${opt.hint}`;
            row.appendChild(hint);
          }
          dialogue.appendChild(row);
        });

        const footer = document.createElement('div');
        footer.className = 'dlg-footer';
        const glyph = glyphFor(s.device, s.gamepadGlyph, 'INTERACT');
        const cycleGlyph = s.device === 'gamepad' ? 'D-pad' : '↑↓';
        footer.textContent = `[${cycleGlyph}] cycle    [${glyph}] choose    [Esc] leave`;
        dialogue.appendChild(footer);
      } else {
        dialogue.hidden = true;
      }

      // Active quest tracker — one block per active quest, in acceptance order
      if (s.questTracker.length > 0) {
        questTracker.hidden = false;
        questTracker.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'qt-header';
        const anyComplete = s.questTracker.some((q) => q.allComplete);
        header.textContent = anyComplete
          ? `Active Quests (${s.questTracker.length}) — ready to turn in`
          : `Active Quests (${s.questTracker.length})`;
        questTracker.appendChild(header);

        s.questTracker.forEach((q, qIdx) => {
          const title = document.createElement('div');
          title.className = 'qt-title';
          if (qIdx > 0) title.style.marginTop = '8px';
          title.textContent = q.allComplete ? `${q.title} ✓` : q.title;
          questTracker.appendChild(title);

          q.objectives.forEach((o) => {
            const obj = document.createElement('div');
            obj.className = `qt-obj ${o.complete ? 'complete' : ''}`;
            obj.textContent = `▸ ${o.description}`;
            questTracker.appendChild(obj);
            const prog = document.createElement('div');
            prog.className = 'qt-progress';
            prog.textContent = `${o.progress.toFixed(2)} / ${o.target.toFixed(2)}`;
            questTracker.appendChild(prog);
          });
        });
      } else {
        questTracker.hidden = true;
      }

      // General Store overlay
      if (s.store) {
        store.hidden = false;
        store.innerHTML = '';

        const title = document.createElement('div');
        title.className = 'store-title';
        title.textContent = `General Store — Wallet $${s.store.walletBalance.toFixed(2)}`;
        store.appendChild(title);

        s.store.rows.forEach((r, idx) => {
          const row = document.createElement('div');
          row.className = `store-row ${idx === s.store!.selectedIndex ? 'selected' : ''}`;
          const left = document.createElement('span');
          left.innerHTML = `<span class="store-name">${r.displayName}</span><span class="store-owned">T${r.ownedTier}</span>`;
          row.appendChild(left);
          const right = document.createElement('span');
          if (r.nextCost === null) {
            right.className = 'store-next locked';
            right.textContent = r.nextLabel;
          } else if (r.questGated) {
            right.className = 'store-next locked';
            right.textContent = `${r.nextLabel}`;
          } else {
            right.className = `store-next ${r.affordable ? 'affordable' : 'cant-afford'}`;
            right.textContent = `${r.nextLabel}  $${r.nextCost.toFixed(2)}`;
          }
          row.appendChild(right);
          store.appendChild(row);
        });

        const footer = document.createElement('div');
        footer.className = 'store-footer';
        const glyph = glyphFor(s.device, s.gamepadGlyph, 'INTERACT');
        const cycleGlyph = s.device === 'gamepad' ? 'D-pad' : '↑↓';
        footer.textContent = `[${cycleGlyph}] cycle    [${glyph}] buy    [Esc] leave`;
        store.appendChild(footer);
      } else {
        store.hidden = true;
      }
    },
  };
}

function setMeter(
  m: { fill: HTMLElement; pct: HTMLElement },
  value: number,
  suffix = '',
): void {
  const clamped = Math.max(0, Math.min(1, value));
  m.fill.style.width = `${(clamped * 100).toFixed(0)}%`;
  // Color shifts red → amber → green as the meter fills.
  const color =
    clamped < 0.25 ? '#d65454' : clamped < 0.55 ? '#e0a542' : '#7cbf6c';
  m.fill.style.background = color;
  m.pct.textContent = `${(clamped * 100).toFixed(0)}%${suffix}`;
}

function stepNumber(step: ProspectingSnapshot['step']): number {
  switch (step) {
    case 'dig':
      return 1;
    case 'classify':
      return 2;
    case 'pan':
      return 3;
    case 'collect':
      return 4;
  }
}

/** Bucket a per-stage skill score into a quality tier for the banner color. */
function multiplierClass(score: number): string {
  if (score >= 1.8) return 'great';
  if (score >= 1.4) return 'good';
  if (score >= 1.0) return 'ok';
  return 'poor';
}
