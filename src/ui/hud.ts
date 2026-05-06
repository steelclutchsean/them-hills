import type { ActionId } from '@/input/actions';
import type { GamepadGlyphStyle } from '@/input/gamepad';
import type { ActionState, InputDevice } from '@/input/manager';
import type { CharacterState } from '@/game/character';

export interface HudUpdate {
  device: InputDevice;
  gamepadGlyph: GamepadGlyphStyle;
  actions: Readonly<Record<ActionId, ActionState>>;
  position: { x: number; y: number; z: number };
  characterState: CharacterState;
  stamina: number;
}

export interface MountedHud {
  update(state: HudUpdate): void;
}

const BAR_LENGTH = 20;

function makeBar(value: number, length = BAR_LENGTH): string {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

export function mountHud(root: HTMLElement): MountedHud {
  const lines: Record<string, HTMLDivElement> = {};
  const addLine = (key: string): HTMLDivElement => {
    const el = document.createElement('div');
    el.dataset.line = key;
    root.appendChild(el);
    lines[key] = el;
    return el;
  };

  addLine('title').textContent = 'Them Hills — Phase 1 (Player & Camera)';
  addLine('device');
  addLine('state');
  addLine('stamina');
  addLine('position');
  addLine('actions');
  addLine('fps');

  let frameCount = 0;
  let lastFpsTime = performance.now();
  let fps = 0;

  return {
    update(s) {
      const deviceLine = lines.device;
      const stateLine = lines.state;
      const staminaLine = lines.stamina;
      const positionLine = lines.position;
      const actionsLine = lines.actions;
      const fpsLine = lines.fps;
      if (!deviceLine || !stateLine || !staminaLine || !positionLine || !actionsLine || !fpsLine) {
        return;
      }

      const padInfo = s.gamepadGlyph === 'unknown' ? 'no pad' : `pad: ${s.gamepadGlyph}`;
      deviceLine.textContent = `Input: ${s.device} (${padInfo})`;
      stateLine.textContent = `State: ${s.characterState}`;
      staminaLine.textContent = `Stamina: ${makeBar(s.stamina)} ${(s.stamina * 100).toFixed(0)}%`;
      positionLine.textContent = `Pos: ${s.position.x.toFixed(1)}, ${s.position.y.toFixed(1)}, ${s.position.z.toFixed(1)}`;

      const active: string[] = [];
      for (const [name, a] of Object.entries(s.actions)) {
        if (a.active) {
          active.push(a.value < 1 ? `${name}(${a.value.toFixed(2)})` : name);
        }
      }
      actionsLine.textContent = active.length ? `Active: ${active.join(', ')}` : 'Active: —';

      frameCount++;
      const now = performance.now();
      if (now - lastFpsTime > 500) {
        fps = (frameCount * 1000) / (now - lastFpsTime);
        frameCount = 0;
        lastFpsTime = now;
      }
      fpsLine.textContent = `FPS: ${fps.toFixed(0)}`;
    },
  };
}
