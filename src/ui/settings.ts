import {
  ALL_ACTIONS,
  DEFAULT_KEYBOARD_BINDINGS,
  type ActionId,
} from '@/input/actions';
import type { SettingsState } from '@/save/schema';

// Frontier-paper settings. Keyboard arrows and the controller D-pad move
// the same rows. Esc still closes even if Pause is rebound.

export interface SettingsPanelOpts {
  initial: SettingsState;
  updateSetting<K extends 'audio' | 'look' | 'graphics'>(
    key: K,
    patch: Partial<SettingsState[K]>,
  ): void;
  setSettings(patch: Partial<SettingsState>): void;
  apply: {
    masterVolume(value: number): void;
    musicVolume(value: number): void;
    ambientVolume(value: number): void;
    sfxVolume(value: number): void;
    mouseSensitivity(value: number): void;
    invertY(value: boolean): void;
    fov(value: number): void;
    shadowsEnabled(value: boolean): void;
    quality(name: 'low' | 'medium' | 'high' | 'ultra'): void;
    textScale(value: number): void;
    subtitles(value: boolean): void;
    colorblind(value: boolean): void;
    binding(action: ActionId, code: string): void;
  };
}

export interface SettingsPanel {
  isOpen(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
  move(delta: number): void;
  nudge(delta: number): void;
  activate(): void;
}

const STYLE_ID = 'them-hills-settings-style';

const ACTION_LABEL: Record<ActionId, string> = {
  MOVE_FORWARD: 'Move forward',
  MOVE_BACKWARD: 'Move back',
  MOVE_LEFT: 'Move left',
  MOVE_RIGHT: 'Move right',
  JUMP: 'Jump',
  SPRINT: 'Sprint',
  INTERACT: 'Use / confirm',
  USE_TOOL: 'Pick gold',
  DIG: 'Dig',
  PAN: 'Pan',
  INVENTORY: 'Pack',
  MAP: 'Map',
  PAUSE: 'Pause',
  HELP: 'Help',
  JOURNAL: 'Journal',
  TOOL_NEXT: 'Next',
  TOOL_PREV: 'Previous',
};

function prettyKey(code: string): string {
  if (!code) return '—';
  if (code === 'Mouse0') return 'LMB';
  if (code === 'Mouse1') return 'MMB';
  if (code === 'Mouse2') return 'RMB';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'Space') return 'Space';
  if (code === 'Escape') return 'Esc';
  if (code === 'BracketLeft') return '[';
  if (code === 'BracketRight') return ']';
  return code;
}

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.settings-panel {
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: min(560px, calc(100vw - 28px));
  max-height: min(86vh, 760px);
  overflow-y: auto;
  background:
    radial-gradient(ellipse at 20% 0%, rgba(255,248,230,0.7), transparent 50%),
    repeating-linear-gradient(0deg, rgba(90,60,30,0.04) 0 1px, transparent 1px 7px),
    #f3e6c8;
  border: 1px solid #8a6a3b;
  border-radius: 4px;
  padding: 22px 26px 18px;
  color: #2a2118;
  font-family: Palatino, 'Iowan Old Style', Palatino Linotype, Georgia, serif;
  font-size: calc(15px * var(--text-scale, 1));
  pointer-events: auto;
  user-select: none;
  box-shadow: 0 18px 50px rgba(20, 12, 4, 0.45), inset 0 0 0 4px rgba(138, 106, 59, 0.25);
  z-index: 1000;
}
.settings-panel[hidden] { display: none; }
.settings-panel h2 {
  font-family: Palatino, Georgia, serif;
  font-size: 22px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #6b3e16;
  margin: 0 0 6px;
  text-align: center;
  font-weight: 650;
}
.settings-panel h3 {
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #8a5a12;
  margin: 16px 0 8px;
  border-bottom: 1px solid rgba(138, 90, 18, 0.35);
  padding-bottom: 4px;
}
.settings-panel .row, .settings-panel .bind-row, .settings-panel .preset-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 4px 0;
  padding: 6px 8px;
  border-radius: 3px;
  border: 1px solid transparent;
}
.settings-panel .row.is-selected, .settings-panel .bind-row.is-selected, .settings-panel .preset-row.is-selected {
  background: rgba(138, 90, 18, 0.12);
  border-color: rgba(138, 90, 18, 0.45);
}
.settings-panel .row .label, .settings-panel .bind-row .label { flex: 1; color: #2a2118; }
.settings-panel .row .value {
  width: 58px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: #6b3e16;
}
.settings-panel input[type=range] { width: 180px; accent-color: #8a5a12; }
.settings-panel input[type=checkbox] { width: 18px; height: 18px; accent-color: #8a5a12; }
.settings-panel .preset-row button, .settings-panel .bind-row button, .settings-panel .close-row button {
  font: inherit;
  color: #2a2118;
  background: #f7edd4;
  border: 1px solid #8a6a3b;
  border-radius: 3px;
  padding: 6px 10px;
  cursor: pointer;
}
.settings-panel .preset-row button:hover, .settings-panel .bind-row button:hover, .settings-panel .close-row button:hover,
.settings-panel .preset-row button:focus-visible, .settings-panel .bind-row button:focus-visible {
  background: #efe0b8;
}
.settings-panel .preset-row button:active, .settings-panel .bind-row button:active {
  transform: translateY(1px);
  background: #e4d2a4;
}
.settings-panel .preset-row button[aria-pressed="true"] {
  background: #6b3e16;
  color: #f3e6c8;
}
.settings-panel .close-hint {
  margin-top: 14px;
  text-align: center;
  font-size: 12px;
  color: #6b5344;
  letter-spacing: 0.08em;
}
.settings-panel .bind-row button.capturing { outline: 2px solid #8a5a12; }
`;
  document.head.appendChild(style);
}

interface FocusRow {
  el: HTMLElement;
  onLeft?: () => void;
  onRight?: () => void;
  onActivate?: () => void;
}

export function createSettingsPanel(opts: SettingsPanelOpts): SettingsPanel {
  injectStyle();
  const root = document.createElement('div');
  root.className = 'settings-panel paper';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Settings');

  const title = document.createElement('h2');
  title.textContent = 'Settings';
  root.appendChild(title);

  const rows: FocusRow[] = [];
  let focus = 0;
  let capturing: ActionId | null = null;
  const bindings: Record<string, string> = {
    ...DEFAULT_KEYBOARD_BINDINGS,
    ...(opts.initial.bindings ?? {}),
  };

  function paintFocus(): void {
    rows.forEach((row, i) => row.el.classList.toggle('is-selected', i === focus));
    const current = rows[focus];
    const button = current?.el.querySelector('button');
    (button ?? current?.el)?.focus?.();
  }

  function addSlider(
    labelText: string,
    min: number,
    max: number,
    step: number,
    initial: number,
    format: (v: number) => string,
    dataAudio: string | undefined,
    onChange: (v: number) => void,
  ): void {
    const row = document.createElement('div');
    row.className = 'row';
    row.tabIndex = -1;
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(initial);
    if (dataAudio) input.dataset.audio = dataAudio;
    const value = document.createElement('span');
    value.className = 'value';
    value.textContent = format(initial);
    const commit = (v: number) => {
      input.value = String(v);
      value.textContent = format(v);
      onChange(v);
    };
    input.addEventListener('input', () => commit(parseFloat(input.value)));
    row.append(label, input, value);
    root.appendChild(row);
    rows.push({
      el: row,
      onLeft: () => commit(Math.max(min, parseFloat(input.value) - step)),
      onRight: () => commit(Math.min(max, parseFloat(input.value) + step)),
      onActivate: () => input.focus(),
    });
  }

  function addToggle(labelText: string, initial: boolean, onChange: (v: boolean) => void): void {
    const row = document.createElement('div');
    row.className = 'row';
    row.tabIndex = -1;
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = initial;
    input.addEventListener('change', () => onChange(input.checked));
    row.append(label, input);
    root.appendChild(row);
    rows.push({
      el: row,
      onActivate: () => {
        input.checked = !input.checked;
        onChange(input.checked);
      },
    });
  }

  function heading(text: string): void {
    const h = document.createElement('h3');
    h.textContent = text;
    root.appendChild(h);
  }

  heading('Audio');
  addSlider('Master', 0, 1, 0.01, opts.initial.audio.master, (v) => `${Math.round(v * 100)}%`, 'master', (v) => {
    opts.updateSetting('audio', { master: v });
    opts.apply.masterVolume(v);
  });
  addSlider('Music', 0, 1, 0.01, opts.initial.audio.music ?? 0.85, (v) => `${Math.round(v * 100)}%`, 'music', (v) => {
    opts.updateSetting('audio', { music: v });
    opts.apply.musicVolume(v);
  });
  addSlider('Ambience', 0, 1, 0.01, opts.initial.audio.ambient, (v) => `${Math.round(v * 100)}%`, 'ambient', (v) => {
    opts.updateSetting('audio', { ambient: v });
    opts.apply.ambientVolume(v);
  });
  addSlider('Effects', 0, 1, 0.01, opts.initial.audio.sfx, (v) => `${Math.round(v * 100)}%`, 'sfx', (v) => {
    opts.updateSetting('audio', { sfx: v });
    opts.apply.sfxVolume(v);
  });

  heading('Look');
  addSlider(
    'Mouse sensitivity',
    0.1,
    3,
    0.05,
    opts.initial.look.mouseSensitivity,
    (v) => `${v.toFixed(2)}×`,
    undefined,
    (v) => {
      opts.updateSetting('look', { mouseSensitivity: v });
      opts.apply.mouseSensitivity(v);
    },
  );
  addToggle('Invert Y', opts.initial.look.invertY === true, (v) => {
    opts.updateSetting('look', { invertY: v });
    opts.apply.invertY(v);
  });

  heading('Graphics');
  const presetRow = document.createElement('div');
  presetRow.className = 'preset-row';
  presetRow.tabIndex = -1;
  const presetLabel = document.createElement('span');
  presetLabel.className = 'label';
  presetLabel.textContent = 'Preset';
  presetRow.appendChild(presetLabel);
  const presetButtons: HTMLButtonElement[] = [];
  const names = ['low', 'medium', 'high', 'ultra'] as const;
  const currentPreset = opts.initial.graphics.preset ?? 'high';
  let presetFocus = Math.max(0, names.indexOf(currentPreset));
  for (const name of names) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.preset = name;
    button.textContent = name[0]!.toUpperCase() + name.slice(1);
    button.setAttribute('aria-pressed', name === currentPreset ? 'true' : 'false');
    button.addEventListener('click', () => choosePreset(name));
    presetButtons.push(button);
    presetRow.appendChild(button);
  }
  function choosePreset(name: (typeof names)[number]): void {
    for (const button of presetButtons) {
      button.setAttribute('aria-pressed', button.dataset.preset === name ? 'true' : 'false');
    }
    opts.updateSetting('graphics', { preset: name, shadowsEnabled: name !== 'low' });
    opts.apply.quality(name);
    opts.apply.shadowsEnabled(name !== 'low');
  }
  root.appendChild(presetRow);
  rows.push({
    el: presetRow,
    onLeft: () => {
      presetFocus = (presetFocus + names.length - 1) % names.length;
      choosePreset(names[presetFocus]!);
    },
    onRight: () => {
      presetFocus = (presetFocus + 1) % names.length;
      choosePreset(names[presetFocus]!);
    },
    onActivate: () => presetButtons[presetFocus]?.click(),
  });

  addSlider('Field of view', 50, 90, 1, opts.initial.graphics.fovDegrees, (v) => `${Math.round(v)}°`, undefined, (v) => {
    opts.updateSetting('graphics', { fovDegrees: v });
    opts.apply.fov(v);
  });
  addToggle('Sun shadows', opts.initial.graphics.shadowsEnabled, (v) => {
    opts.updateSetting('graphics', { shadowsEnabled: v });
    opts.apply.shadowsEnabled(v);
  });

  heading('Reading');
  addSlider('Text size', 0.85, 1.4, 0.05, opts.initial.textScale ?? 1, (v) => `${Math.round(v * 100)}%`, undefined, (v) => {
    opts.setSettings({ textScale: v });
    opts.apply.textScale(v);
  });
  addToggle('Subtitles', opts.initial.subtitles === true, (v) => {
    opts.setSettings({ subtitles: v });
    opts.apply.subtitles(v);
  });
  addToggle('Colorblind-safe markers', opts.initial.colorblind === true, (v) => {
    opts.setSettings({ colorblind: v });
    opts.apply.colorblind(v);
  });

  heading('Keys');
  for (const action of ALL_ACTIONS) {
    const row = document.createElement('div');
    row.className = 'bind-row';
    row.tabIndex = -1;
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = ACTION_LABEL[action];
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = prettyKey(bindings[action] ?? '');
    button.addEventListener('click', () => beginCapture(action, button));
    row.append(label, button);
    root.appendChild(row);
    rows.push({
      el: row,
      onActivate: () => beginCapture(action, button),
    });
  }

  function beginCapture(action: ActionId, button: HTMLButtonElement): void {
    capturing = action;
    button.classList.add('capturing');
    button.textContent = 'Press a key';
  }

  function finishCapture(code: string): void {
    if (!capturing) return;
    const action = capturing;
    capturing = null;
    for (const other of ALL_ACTIONS) {
      if (other !== action && bindings[other] === code) bindings[other] = '';
    }
    bindings[action] = code;
    opts.setSettings({ bindings: { ...bindings } });
    opts.apply.binding(action, code);
    root.querySelectorAll('.bind-row button').forEach((node, index) => {
      const act = ALL_ACTIONS[index];
      if (!act) return;
      node.classList.remove('capturing');
      node.textContent = prettyKey(bindings[act] ?? '');
    });
  }

  const closeHint = document.createElement('div');
  closeHint.className = 'close-hint';
  closeHint.textContent = '↑↓ move · ←→ change · Enter confirm · Esc closes';
  root.appendChild(closeHint);

  document.body.appendChild(root);

  window.addEventListener('keydown', (event) => {
    if (!open) return;
    if (capturing) {
      event.preventDefault();
      event.stopPropagation();
      if (event.code === 'Escape') {
        capturing = null;
        root.querySelectorAll('.bind-row button').forEach((node, index) => {
          const act = ALL_ACTIONS[index];
          if (!act) return;
          node.classList.remove('capturing');
          node.textContent = prettyKey(bindings[act] ?? '');
        });
        return;
      }
      finishCapture(event.code);
      return;
    }
    if (event.code === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.code === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.code === 'ArrowLeft') {
      event.preventDefault();
      nudge(-1);
    } else if (event.code === 'ArrowRight') {
      event.preventDefault();
      nudge(1);
    } else if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault();
      activate();
    }
  }, true);

  let open = false;

  function move(delta: number): void {
    if (rows.length === 0) return;
    focus = (focus + delta + rows.length) % rows.length;
    paintFocus();
    rows[focus]?.el.scrollIntoView({ block: 'nearest' });
  }
  function nudge(delta: number): void {
    const row = rows[focus];
    if (!row) return;
    if (delta < 0) row.onLeft?.();
    else if (delta > 0) row.onRight?.();
  }
  function activate(): void {
    rows[focus]?.onActivate?.();
  }

  return {
    isOpen: () => open,
    open: () => {
      open = true;
      root.hidden = false;
      paintFocus();
    },
    close: () => {
      open = false;
      capturing = null;
      root.hidden = true;
    },
    toggle() {
      if (open) this.close();
      else this.open();
    },
    move,
    nudge,
    activate,
  };
}
