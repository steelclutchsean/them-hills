// Boot card, title gate, and the panels the keyboard was already bound to
// (Tab inventory, M map, H help, Esc pause). The boot card is static HTML
// so it paints before any script runs.

export type PanelId = 'none' | 'pause' | 'help' | 'inventory' | 'map';

export interface OverlayController {
  showTitle(onStart: () => void): void;
  hide(): void;
  current(): PanelId;
  isBlocking(): boolean;
  toggle(id: Exclude<PanelId, 'none'>): void;
  close(): void;
  setInventory(lines: readonly string[]): void;
}

const CONTROLS: readonly string[] = [
  'WASD move · Shift sprint · Space jump',
  'Mouse look after you click into the world',
  'E use what’s in front of you · F or right-click digs at a site',
  'Left-click picks gold flakes out of the pan',
  'Tab inventory · M map · H help · Esc pause',
];

export function reportBoot(pct: number, label: string): Promise<void> {
  const fill = document.getElementById('boot-fill');
  const status = document.getElementById('boot-status');
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (status) status.textContent = label;
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export function mountOverlays(opts: {
  onResume: () => void;
  onSettings: () => void;
  onQuality?: (name: 'low' | 'medium' | 'high' | 'ultra') => void;
}): OverlayController {
  const boot = document.getElementById('boot');
  const actions = document.getElementById('boot-actions');
  const root = document.createElement('div');
  root.id = 'panels';
  document.body.appendChild(root);

  const scrim = document.createElement('div');
  scrim.className = 'panel-scrim';
  scrim.hidden = true;
  const card = document.createElement('div');
  card.className = 'panel-card';
  card.hidden = true;
  root.append(scrim, card);

  let panel: PanelId = 'none';

  function render(id: PanelId): void {
    panel = id;
    document.body.dataset.map = id === 'map' ? '1' : '0';
    if (id === 'none') {
      scrim.hidden = true;
      card.hidden = true;
      card.textContent = '';
      return;
    }
    scrim.hidden = false;
    card.hidden = false;
    card.textContent = '';
    if (id === 'map') {
      const note = document.createElement('p');
      note.className = 'panel-map-note';
      note.textContent =
        'M or Esc to close. Gold marks buyers. The beam in the world is your next stop.';
      card.appendChild(note);
      return;
    }
    const title = document.createElement('h2');
    title.textContent = id === 'pause' ? 'Paused' : id === 'help' ? 'Controls' : 'Pack';
    card.appendChild(title);
    if (id === 'help' || id === 'pause') {
      const list = document.createElement('ul');
      for (const line of CONTROLS) {
        const item = document.createElement('li');
        item.textContent = line;
        list.appendChild(item);
      }
      card.appendChild(list);
    }
    if (id === 'inventory') {
      const body = document.createElement('div');
      body.id = 'panel-inventory';
      card.appendChild(body);
    }
    if (id === 'pause') {
      const row = document.createElement('div');
      row.className = 'panel-actions';
      const resume = document.createElement('button');
      resume.type = 'button';
      resume.textContent = 'Resume';
      resume.addEventListener('click', () => {
        close();
        opts.onResume();
      });
      const settings = document.createElement('button');
      settings.type = 'button';
      settings.textContent = 'Settings';
      settings.addEventListener('click', () => {
        close();
        opts.onSettings();
      });
      row.append(resume, settings);
      card.appendChild(row);
      const quality = document.createElement('div');
      quality.className = 'panel-actions';
      const label = document.createElement('p');
      label.textContent = 'Graphics';
      card.appendChild(label);
      for (const name of ['low', 'medium', 'high', 'ultra'] as const) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.quality = name;
        button.textContent = name[0]!.toUpperCase() + name.slice(1);
        button.addEventListener('click', () => opts.onQuality?.(name));
        quality.appendChild(button);
      }
      card.appendChild(quality);
    }
  }

  function close(): void {
    render('none');
  }

  function toggle(id: Exclude<PanelId, 'none'>): void {
    render(panel === id ? 'none' : id);
  }

  return {
    showTitle(onStart) {
      const status = document.getElementById('boot-status');
      const track = document.querySelector('.boot-track');
      if (status) {
        status.textContent = 'Coyote Creek is a short walk east. Your first gold is that way.';
      }
      if (track) (track as HTMLElement).hidden = true;
      if (!actions) return;
      actions.hidden = false;
      actions.textContent = '';
      const list = document.createElement('ul');
      list.className = 'boot-controls';
      for (const line of CONTROLS) {
        const item = document.createElement('li');
        item.textContent = line;
        list.appendChild(item);
      }
      const start = document.createElement('button');
      start.type = 'button';
      start.id = 'boot-start';
      start.textContent = 'Enter the hills';
      start.addEventListener('click', () => {
        onStart();
      });
      actions.append(list, start);
    },
    hide() {
      if (boot) boot.hidden = true;
    },
    current: () => panel,
    isBlocking: () => panel !== 'none' || (boot !== null && !boot.hidden),
    toggle,
    close,
    setInventory(lines) {
      const body = document.getElementById('panel-inventory');
      if (!body) return;
      body.replaceChildren();
      for (const line of lines) {
        const p = document.createElement('p');
        p.textContent = line;
        body.appendChild(p);
      }
    },
  };
}
