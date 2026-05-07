import type { ActionId } from '@/input/actions';
import type { GamepadGlyphStyle } from '@/input/gamepad';
import type { ActionState, InputDevice } from '@/input/manager';
import type { CharacterState } from '@/game/character';
import type { ProspectingSnapshot } from '@/game/prospecting';
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
    font-size: 13px;
    line-height: 1.6;
    color: rgba(255,255,255,0.92);
    text-shadow: 0 1px 2px rgba(0,0,0,0.85);
    pointer-events: none;
    user-select: none;
    font-variant-numeric: tabular-nums;
  }
  .hud-info { top: 12px; left: 12px; max-width: 40vw; }
  .hud-inventory { top: 12px; right: 12px; min-width: 200px; text-align: right; }
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
`;

function injectStyle(): void {
  if (document.getElementById('hud-style')) return;
  const tag = document.createElement('style');
  tag.id = 'hud-style';
  tag.textContent = STYLE;
  document.head.appendChild(tag);
}

function glyphFor(device: InputDevice, glyph: GamepadGlyphStyle, action: 'INTERACT'): string {
  if (device === 'gamepad') {
    if (glyph === 'playstation') return action === 'INTERACT' ? '□' : '?';
    return action === 'INTERACT' ? 'X' : '?';
  }
  return action === 'INTERACT' ? 'E' : '?';
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

  const lines: Record<string, HTMLDivElement> = {};
  const addInfoLine = (key: string): HTMLDivElement => {
    const el = document.createElement('div');
    info.appendChild(el);
    lines[key] = el;
    return el;
  };
  const addInvLine = (key: string): HTMLDivElement => {
    const el = document.createElement('div');
    inventory.appendChild(el);
    lines[key] = el;
    return el;
  };

  addInfoLine('title').textContent = 'Them Hills — Phase 8a (NPC dialogue)';
  addInfoLine('clock');
  addInfoLine('device');
  addInfoLine('state');
  addInfoLine('stamina');
  addInfoLine('hunger');
  addInfoLine('thirst');
  addInfoLine('position');
  addInfoLine('actions');
  addInfoLine('fps');

  addInvLine('invTitle').textContent = 'Carry';
  addInvLine('invFlake');
  addInvLine('invPicker');
  addInvLine('invNugget');
  addInvLine('invTotal');
  addInvLine('invValue');
  addInvLine('invSpacer').innerHTML = '&nbsp;';
  addInvLine('invWallet');
  addInvLine('invSpot');

  let frameCount = 0;
  let lastFpsTime = performance.now();
  let fps = 0;

  return {
    update(s) {
      lines.clock!.textContent = `Time: ${s.clockText}`;
      const padInfo = s.gamepadGlyph === 'unknown' ? 'no pad' : `pad: ${s.gamepadGlyph}`;
      lines.device!.textContent = `Input: ${s.device} (${padInfo})`;
      lines.state!.textContent = `State: ${s.characterState}`;
      lines.stamina!.textContent = `Stamina: ${makeBar(s.stamina)} ${(s.stamina * 100).toFixed(0)}%`;
      lines.hunger!.textContent = `Hunger:  ${makeBar(s.hunger)} ${(s.hunger * 100).toFixed(0)}%`;
      const thirstSuffix = s.inStreamWater ? '  (drinking)' : '';
      lines.thirst!.textContent = `Thirst:  ${makeBar(s.thirst)} ${(s.thirst * 100).toFixed(0)}%${thirstSuffix}`;
      lines.position!.textContent = `Pos: ${s.position.x.toFixed(1)}, ${s.position.y.toFixed(1)}, ${s.position.z.toFixed(1)}`;

      const active: string[] = [];
      for (const [name, a] of Object.entries(s.actions)) {
        if (a.active) {
          active.push(a.value < 1 ? `${name}(${a.value.toFixed(2)})` : name);
        }
      }
      lines.actions!.textContent = active.length ? `Active: ${active.join(', ')}` : 'Active: —';

      frameCount++;
      const now = performance.now();
      if (now - lastFpsTime > 500) {
        fps = (frameCount * 1000) / (now - lastFpsTime);
        frameCount = 0;
        lastFpsTime = now;
      }
      lines.fps!.textContent = `FPS: ${fps.toFixed(0)}`;

      // Compass
      drawCompass(compassCtx, s.bearingDeg);

      // Inventory
      const totalG = s.inventory.flake_g + s.inventory.picker_g + s.inventory.nugget_g;
      lines.invFlake!.textContent = `Flake:  ${s.inventory.flake_g.toFixed(3)} g`;
      lines.invPicker!.textContent = `Picker: ${s.inventory.picker_g.toFixed(3)} g`;
      lines.invNugget!.textContent = `Nugget: ${s.inventory.nugget_g.toFixed(3)} g`;
      lines.invTotal!.textContent = `Total:  ${totalG.toFixed(3)} g`;
      const dollarEst = (totalG / GRAMS_PER_OZT) * s.spotPricePerOzt * ASSAYER_MULT;
      lines.invValue!.textContent = `≈ $${dollarEst.toFixed(2)} (Assayer)`;

      lines.invWallet!.textContent = `Wallet: $${s.walletBalance.toFixed(2)}`;

      // Live spot price + source indicator (live = filled circle, cached =
      // half, baseline = empty). Updated by the spot-price service every 15 min.
      const sourceLabel =
        s.spotPriceSource === 'live'
          ? '● live'
          : s.spotPriceSource === 'cached'
            ? '◐ cached'
            : '○ baseline';
      lines.invSpot!.textContent = `Spot: $${s.spotPricePerOzt.toFixed(2)}/oz  ${sourceLabel}`;

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
        const glyph = glyphFor(s.device, s.gamepadGlyph, 'INTERACT');
        msg.textContent = `[${glyph}]  ${s.prospect.message}`;
        prospect.appendChild(msg);

        if (s.prospect.step === 'pan') {
          const extra = document.createElement('div');
          extra.className = 'step-extra';
          extra.textContent = `${s.prospect.panTapsRemaining} swirl${s.prospect.panTapsRemaining === 1 ? '' : 's'} remaining`;
          prospect.appendChild(extra);
        }
      } else {
        prospect.hidden = true;
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
        footer.textContent = `[ / ] cycle    [${glyph}] choose    [Esc] leave`;
        dialogue.appendChild(footer);
      } else {
        dialogue.hidden = true;
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
        footer.textContent = `[ / ] cycle    [${glyph}] buy    [Esc] leave`;
        store.appendChild(footer);
      } else {
        store.hidden = true;
      }
    },
  };
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
