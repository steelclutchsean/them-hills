// Boot card, title gate, and the panels the keyboard was already bound to
// (Tab inventory, M map, H help, Esc pause). The boot card is static HTML
// so it paints before any script runs.

export type PanelId = 'none' | 'pause' | 'help' | 'inventory' | 'map' | 'journal';

export interface OverlayController {
  showTitle(opts: TitleOpts): void;
  hide(): void;
  current(): PanelId;
  isBlocking(): boolean;
  toggle(id: Exclude<PanelId, 'none'>): void;
  close(): void;
  setInventory(lines: readonly string[]): void;
  setJournal(lines: readonly string[]): void;
  setSlotNotes(notes: readonly string[]): void;
  move(delta: number): void;
  activate(): void;
}

export interface TitleOpts {
  hasContinue: boolean;
  notice: string | null;
  onContinue: () => void;
  onNewGame: () => void;
  onSettings: () => void;
}

const CONTROLS: readonly string[] = [
  'WASD move · Shift sprint · Space jump',
  'Mouse look after you click into the world',
  'E use what’s in front of you · F or right-click digs at a site',
  'In the pan, tilt and swirl — sand leaves in the band, gold spills if you tip too far',
  'Left-click picks gold flakes out of the pan',
  'F in the creek counts colors · E on a pay streak stakes a claim',
  '[ ] swaps pan, rocker, sluice, long tom once you own them',
  'Tab pack · J journal · M map · H help · Esc pause',
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

function fillLines(id: string, lines: readonly string[]): void {
  const body = document.getElementById(id);
  if (!body) return;
  body.replaceChildren();
  const list = document.createElement('ul');
  for (const line of lines) {
    const item = document.createElement('li');
    item.textContent = line;
    list.appendChild(item);
  }
  body.appendChild(list);
}

export function mountOverlays(opts: {
  onResume: () => void;
  onSettings: () => void;
  onQuality?: (name: 'low' | 'medium' | 'high' | 'ultra') => void;
  onSaveSlot?: (slot: 'manual-1' | 'manual-2' | 'manual-3') => void;
  onLoadSlot?: (slot: 'manual-1' | 'manual-2' | 'manual-3') => void;
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
  card.className = 'panel-card paper';
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  root.append(scrim, card);

  let panel: PanelId = 'none';
  let slotNotes = ['Book 1 — empty', 'Book 2 — empty', 'Book 3 — empty'];
  let choices: HTMLButtonElement[] = [];
  let selected = 0;
  let titleChoices: HTMLButtonElement[] = [];
  let titleIndex = 0;

  function paint(list: HTMLButtonElement[], index: number): void {
    list.forEach((button, i) => {
      button.classList.toggle('is-selected', i === index);
      button.tabIndex = i === index ? 0 : -1;
    });
    list[index]?.focus();
  }

  function render(id: PanelId): void {
    panel = id;
    document.body.dataset.map = id === 'map' ? '1' : '0';
    document.body.dataset.journal = id === 'journal' ? '1' : '0';
    choices = [];
    selected = 0;
    if (id === 'none') {
      scrim.hidden = true;
      card.hidden = true;
      card.textContent = '';
      return;
    }
    scrim.hidden = false;
    card.hidden = false;
    document.exitPointerLock?.();
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
    title.textContent =
      id === 'pause' ? 'Paused' : id === 'help' ? 'Controls' : id === 'journal' ? 'Journal' : 'Pack';
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
    if (id === 'inventory' || id === 'journal') {
      const body = document.createElement('div');
      body.id = id === 'journal' ? 'panel-journal' : 'panel-inventory';
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

      const books = document.createElement('div');
      books.className = 'panel-books';
      const bookTitle = document.createElement('p');
      bookTitle.className = 'panel-kicker';
      bookTitle.textContent = 'Claim books';
      books.appendChild(bookTitle);
      const slots = ['manual-1', 'manual-2', 'manual-3'] as const;
      slots.forEach((slot, index) => {
        const line = document.createElement('div');
        line.className = 'panel-actions';
        const save = document.createElement('button');
        save.type = 'button';
        save.textContent = `Save ${slotNotes[index] ?? `Book ${index + 1}`}`;
        save.addEventListener('click', () => opts.onSaveSlot?.(slot));
        const load = document.createElement('button');
        load.type = 'button';
        load.textContent = 'Load';
        load.addEventListener('click', () => opts.onLoadSlot?.(slot));
        line.append(save, load);
        books.appendChild(line);
      });
      card.appendChild(books);

      const label = document.createElement('p');
      label.className = 'panel-kicker';
      label.textContent = 'Graphics';
      card.appendChild(label);
      const quality = document.createElement('div');
      quality.className = 'panel-actions';
      for (const name of ['low', 'medium', 'high', 'ultra'] as const) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.quality = name;
        button.textContent = name[0]!.toUpperCase() + name.slice(1);
        button.addEventListener('click', () => {
          document.documentElement.dataset.quality = name;
          opts.onQuality?.(name);
        });
        quality.appendChild(button);
      }
      card.appendChild(quality);
    }
    choices = [...card.querySelectorAll('button')];
    paint(choices, selected);
  }

  function close(): void {
    render('none');
  }

  function toggle(id: Exclude<PanelId, 'none'>): void {
    render(panel === id ? 'none' : id);
  }

  window.addEventListener('keydown', (event) => {
    const settingsOpen = document.querySelector('.settings-panel:not([hidden])');
    if (settingsOpen) return;
    if (boot && !boot.hidden && titleChoices.length > 0) {
      if (event.code === 'ArrowDown') {
        event.preventDefault();
        titleIndex = (titleIndex + 1) % titleChoices.length;
        paint(titleChoices, titleIndex);
      } else if (event.code === 'ArrowUp') {
        event.preventDefault();
        titleIndex = (titleIndex - 1 + titleChoices.length) % titleChoices.length;
        paint(titleChoices, titleIndex);
      } else if (event.code === 'Enter') {
        event.preventDefault();
        titleChoices[titleIndex]?.click();
      }
      return;
    }
    if (panel === 'none' || document.body.dataset.sim !== '1') return;
    if (event.code === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.code === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.code === 'Enter') {
      event.preventDefault();
      activate();
    }
  });

  let padFrame = 0;
  let padLatch = false;
  function pollTitlePad(): void {
    padFrame = requestAnimationFrame(pollTitlePad);
    if (!boot || boot.hidden || titleChoices.length === 0) return;
    if (document.querySelector('.settings-panel:not([hidden])')) return;
    const pads = navigator.getGamepads?.() ?? [];
    let down = false;
    let up = false;
    let confirm = false;
    for (const pad of pads) {
      if (!pad) continue;
      down = down || (pad.buttons[13]?.pressed ?? false);
      up = up || (pad.buttons[12]?.pressed ?? false);
      confirm = confirm || (pad.buttons[0]?.pressed ?? false);
    }
    const edge = down || up || confirm;
    if (!edge) {
      padLatch = false;
      return;
    }
    if (padLatch) return;
    padLatch = true;
    if (down) {
      titleIndex = (titleIndex + 1) % titleChoices.length;
      paint(titleChoices, titleIndex);
    } else if (up) {
      titleIndex = (titleIndex - 1 + titleChoices.length) % titleChoices.length;
      paint(titleChoices, titleIndex);
    } else if (confirm) titleChoices[titleIndex]?.click();
  }
  padFrame = requestAnimationFrame(pollTitlePad);
  void padFrame;

  function move(delta: number): void {
    if (choices.length === 0) return;
    selected = (selected + delta + choices.length) % choices.length;
    paint(choices, selected);
  }

  function activate(): void {
    choices[selected]?.click();
  }

  return {
    showTitle(titleOpts) {
      const status = document.getElementById('boot-status');
      const track = document.querySelector('.boot-track');
      if (status) {
        const creek = 'Coyote Creek is a short walk east. Your first gold is that way.';
        status.textContent = titleOpts.notice ? `${titleOpts.notice} ${creek}` : creek;
      }
      if (track) (track as HTMLElement).hidden = true;
      if (!actions) return;
      actions.hidden = false;
      actions.textContent = '';
      const start = document.createElement('button');
      start.type = 'button';
      start.id = 'boot-start';
      start.textContent = titleOpts.hasContinue ? 'Continue' : 'Enter the hills';
      start.addEventListener('click', () => {
        if (titleOpts.hasContinue) titleOpts.onContinue();
        else titleOpts.onNewGame();
      });
      const fresh = document.createElement('button');
      fresh.type = 'button';
      fresh.id = 'boot-new';
      fresh.textContent = 'New game';
      fresh.hidden = !titleOpts.hasContinue;
      fresh.addEventListener('click', () => {
        if (titleOpts.hasContinue && !window.confirm('Start a new claim book? The continue page is set aside.')) {
          return;
        }
        titleOpts.onNewGame();
      });
      const settings = document.createElement('button');
      settings.type = 'button';
      settings.id = 'boot-settings';
      settings.textContent = 'Settings';
      settings.addEventListener('click', () => titleOpts.onSettings());
      actions.append(start, fresh, settings);
      titleChoices = [start, ...(titleOpts.hasContinue ? [fresh] : []), settings];
      titleIndex = 0;
      paint(titleChoices, 0);
    },
    hide() {
      if (boot) boot.hidden = true;
    },
    current: () => panel,
    isBlocking: () => panel !== 'none' || (boot !== null && !boot.hidden),
    toggle,
    close,
    setInventory(lines) {
      fillLines('panel-inventory', lines);
    },
    setJournal(lines: readonly string[]) {
      fillLines('panel-journal', lines);
    },
    setSlotNotes(notes) {
      slotNotes = [...notes];
      if (panel === 'pause') render('pause');
    },
    move,
    activate,
  };
}
