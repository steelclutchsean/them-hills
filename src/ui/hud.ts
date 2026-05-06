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
  inventory: GoldStash;
  spotPricePerOzt: number;
  /** Compass bearing in degrees (0=N, 90=E, 180=S, 270=W). */
  bearingDeg: number;
  /** Bottom-center prompt — shown while idle near an interactable. */
  prompt: { text: string; glyph: string } | null;
  /** Center overlay — shown while a prospecting session is active. */
  prospect: ProspectingSnapshot | null;
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
  .hud-compass[hidden] { display: none; }
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

  addInfoLine('title').textContent = 'Them Hills — Phase 3.9 (Single skeleton)';
  addInfoLine('device');
  addInfoLine('state');
  addInfoLine('stamina');
  addInfoLine('position');
  addInfoLine('actions');
  addInfoLine('fps');

  addInvLine('invTitle').textContent = 'Carry';
  addInvLine('invFlake');
  addInvLine('invPicker');
  addInvLine('invNugget');
  addInvLine('invTotal');
  addInvLine('invValue');

  let frameCount = 0;
  let lastFpsTime = performance.now();
  let fps = 0;

  return {
    update(s) {
      const padInfo = s.gamepadGlyph === 'unknown' ? 'no pad' : `pad: ${s.gamepadGlyph}`;
      lines.device!.textContent = `Input: ${s.device} (${padInfo})`;
      lines.state!.textContent = `State: ${s.characterState}`;
      lines.stamina!.textContent = `Stamina: ${makeBar(s.stamina)} ${(s.stamina * 100).toFixed(0)}%`;
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
