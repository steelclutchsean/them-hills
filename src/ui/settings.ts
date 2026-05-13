import type { SettingsState } from '@/save/schema';

// Settings panel — opens from the in-world PAUSE state. Owns three
// vertical sections (Audio / Look / Graphics) with sliders and a single
// toggle. Each control writes to the game store + invokes a `onApply`
// callback so the runtime systems (audio mixer, input manager, camera,
// renderer) pick up changes immediately. Keybinding rebinding is
// out of scope for v1 — added later.

export interface SettingsPanelOpts {
  /** Initial values to seed the sliders with on first mount. */
  initial: SettingsState;
  /** Push a partial settings update back to the game store. */
  updateSetting<K extends keyof SettingsState>(key: K, patch: Partial<SettingsState[K]>): void;
  /** Apply a freshly-changed setting to the live runtime. */
  apply: {
    masterVolume(value: number): void;
    ambientVolume(value: number): void;
    sfxVolume(value: number): void;
    mouseSensitivity(value: number): void;
    fov(value: number): void;
    shadowsEnabled(value: boolean): void;
  };
}

export interface SettingsPanel {
  isOpen(): boolean;
  open(): void;
  close(): void;
  toggle(): void;
}

const STYLE_ID = 'them-hills-settings-style';

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.settings-panel {
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 460px;
  max-height: 80vh;
  overflow-y: auto;
  background: rgba(8, 10, 14, 0.92);
  border: 1px solid rgba(200, 155, 59, 0.5);
  border-radius: 12px;
  padding: 22px 26px 24px;
  color: #fff;
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 14px;
  pointer-events: auto;
  user-select: none;
  backdrop-filter: blur(8px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.55);
  z-index: 1000;
}
.settings-panel[hidden] { display: none; }
.settings-panel h2 {
  font-size: 14px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #c89b3b;
  margin: 0 0 14px;
  text-align: center;
}
.settings-panel h3 {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #c89b3b;
  margin: 18px 0 8px;
  border-bottom: 1px solid rgba(200,155,59,0.25);
  padding-bottom: 4px;
}
.settings-panel .row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 8px 0;
}
.settings-panel .row .label {
  flex: 1;
  font-size: 13px;
  color: rgba(255,255,255,0.85);
}
.settings-panel .row .value {
  width: 50px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  color: rgba(255,255,255,0.7);
}
.settings-panel input[type=range] {
  width: 200px;
  accent-color: #c89b3b;
}
.settings-panel input[type=checkbox] {
  width: 18px; height: 18px;
  accent-color: #c89b3b;
}
.settings-panel .close-hint {
  margin-top: 18px;
  text-align: center;
  font-size: 11px;
  color: rgba(255,255,255,0.5);
  letter-spacing: 0.1em;
}
`;
  document.head.appendChild(style);
}

interface SliderOpts {
  label: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  format?: (v: number) => string;
  onChange(v: number): void;
}

function makeSlider(opts: SliderOpts): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = opts.label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(opts.min);
  input.max = String(opts.max);
  input.step = String(opts.step);
  input.value = String(opts.initial);
  const value = document.createElement('span');
  value.className = 'value';
  const fmt = opts.format ?? ((v) => v.toFixed(2));
  value.textContent = fmt(opts.initial);
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    value.textContent = fmt(v);
    opts.onChange(v);
  });
  row.appendChild(label);
  row.appendChild(input);
  row.appendChild(value);
  return row;
}

function makeToggle(
  labelText: string,
  initial: boolean,
  onChange: (v: boolean) => void,
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'row';
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = initial;
  input.addEventListener('change', () => onChange(input.checked));
  row.appendChild(label);
  row.appendChild(input);
  return row;
}

export function createSettingsPanel(opts: SettingsPanelOpts): SettingsPanel {
  injectStyle();
  const root = document.createElement('div');
  root.className = 'settings-panel';
  root.hidden = true;

  const title = document.createElement('h2');
  title.textContent = 'Settings';
  root.appendChild(title);

  // Audio section
  const audioH = document.createElement('h3');
  audioH.textContent = 'Audio';
  root.appendChild(audioH);
  root.appendChild(
    makeSlider({
      label: 'Master volume',
      min: 0,
      max: 1,
      step: 0.01,
      initial: opts.initial.audio.master,
      format: (v) => `${Math.round(v * 100)}%`,
      onChange: (v) => {
        opts.updateSetting('audio', { master: v });
        opts.apply.masterVolume(v);
      },
    }),
  );
  root.appendChild(
    makeSlider({
      label: 'Ambient (streams)',
      min: 0,
      max: 1,
      step: 0.01,
      initial: opts.initial.audio.ambient,
      format: (v) => `${Math.round(v * 100)}%`,
      onChange: (v) => {
        opts.updateSetting('audio', { ambient: v });
        opts.apply.ambientVolume(v);
      },
    }),
  );
  root.appendChild(
    makeSlider({
      label: 'SFX (taps + chimes)',
      min: 0,
      max: 1,
      step: 0.01,
      initial: opts.initial.audio.sfx,
      format: (v) => `${Math.round(v * 100)}%`,
      onChange: (v) => {
        opts.updateSetting('audio', { sfx: v });
        opts.apply.sfxVolume(v);
      },
    }),
  );

  // Look section
  const lookH = document.createElement('h3');
  lookH.textContent = 'Look';
  root.appendChild(lookH);
  root.appendChild(
    makeSlider({
      label: 'Mouse sensitivity',
      min: 0.1,
      max: 3.0,
      step: 0.05,
      initial: opts.initial.look.mouseSensitivity,
      format: (v) => `${v.toFixed(2)}×`,
      onChange: (v) => {
        opts.updateSetting('look', { mouseSensitivity: v });
        opts.apply.mouseSensitivity(v);
      },
    }),
  );

  // Graphics section
  const graphicsH = document.createElement('h3');
  graphicsH.textContent = 'Graphics';
  root.appendChild(graphicsH);
  root.appendChild(
    makeSlider({
      label: 'Field of view',
      min: 50,
      max: 90,
      step: 1,
      initial: opts.initial.graphics.fovDegrees,
      format: (v) => `${Math.round(v)}°`,
      onChange: (v) => {
        opts.updateSetting('graphics', { fovDegrees: v });
        opts.apply.fov(v);
      },
    }),
  );
  root.appendChild(
    makeToggle('Real-time shadows', opts.initial.graphics.shadowsEnabled, (v) => {
      opts.updateSetting('graphics', { shadowsEnabled: v });
      opts.apply.shadowsEnabled(v);
    }),
  );

  const closeHint = document.createElement('div');
  closeHint.className = 'close-hint';
  closeHint.textContent = '[ESC] Close';
  root.appendChild(closeHint);

  document.body.appendChild(root);

  let open = false;
  return {
    isOpen: () => open,
    open: () => {
      open = true;
      root.hidden = false;
    },
    close: () => {
      open = false;
      root.hidden = true;
    },
    toggle: () => {
      open = !open;
      root.hidden = !open;
    },
  };
}
