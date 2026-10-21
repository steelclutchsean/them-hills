// Sampled footsteps, tools, gold, and UI. Until a clip has decoded, the
// call falls back to a short synth tone so the first gesture is not silent.

import type { AudioBank } from './bank';
import { SFX } from './catalog';
import type { AudioMixer } from './mixer';
import type { Surface } from './zones';

export interface Foley {
  setOrigin(position: { x: number; y: number; z: number }): void;
  setSurface(surface: Surface): void;
  footstep(kind: 'walk' | 'run'): void;
  jump(): void;
  land(): void;
  dig(quality: number): void;
  classify(quality: number): void;
  pan(): void;
  splash(): void;
  gold(rate: number): void;
  coins(): void;
  click(): void;
  hover(): void;
  open(): void;
  close(): void;
  confirm(): void;
  pluck(rate: number): void;
  /** Gameplay-event one-shots. Clips are the Kenney beds already in the bank. */
  world(name: WorldCue, rate?: number): void;
}

export type WorldCue =
  | 'wash'
  | 'spill'
  | 'sample'
  | 'stake'
  | 'jumper'
  | 'rise'
  | 'rocker'
  | 'sluice'
  | 'tom'
  | 'monitor'
  | 'coins'
  | 'chime';

const FEET: Record<Surface, readonly string[]> = {
  grass: SFX.footGrass,
  dirt: SFX.footDirt,
  gravel: SFX.footGravel,
  wood: SFX.footWood,
  water: SFX.footWater,
};

export function createFoley(mixer: AudioMixer, bank: AudioBank): Foley {
  const ctx = mixer.context;
  let origin = { x: 0, y: 0, z: 0 };
  let surface: Surface = 'grass';
  let hoverAt = 0;

  function tone(freq: number, duration: number, gain: number, type: OscillatorType = 'sine'): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const env = ctx.createGain();
    const t0 = ctx.currentTime;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(env);
    env.connect(mixer.sfx);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function noise(freq: number, q: number, duration: number, gain: number): void {
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, Math.max(1, length), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const env = ctx.createGain();
    const t0 = ctx.currentTime;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    source.connect(filter);
    filter.connect(env);
    env.connect(mixer.sfx);
    source.start(t0);
    source.stop(t0 + duration + 0.02);
  }

  function pick(urls: readonly string[]): string | null {
    if (urls.length === 0) return null;
    return urls[Math.floor(Math.random() * urls.length)] ?? null;
  }

  function humanize(kind: 'foley' | 'close' | 'ui'): { gain: number; rate: number } {
    if (kind === 'ui')
      return { gain: 0.92 + Math.random() * 0.16, rate: 0.985 + Math.random() * 0.03 };
    if (kind === 'close')
      return { gain: 0.86 + Math.random() * 0.28, rate: 0.96 + Math.random() * 0.08 };
    return { gain: 0.78 + Math.random() * 0.44, rate: 0.93 + Math.random() * 0.14 };
  }

  function shot(
    urls: readonly string[],
    gain: number,
    opts?: {
      rate?: number;
      spatial?: boolean;
      delay?: number;
      vary?: 'foley' | 'close' | 'ui';
      fallback?: () => void;
    },
  ): boolean {
    const url = pick(urls);
    const buffer = url ? bank.peek(url) : null;
    if (!buffer) {
      opts?.fallback?.();
      return false;
    }
    const human = humanize(opts?.vary ?? (opts?.spatial === false ? 'ui' : 'foley'));
    mixer.play(buffer, {
      bus: 'sfx',
      gain: gain * human.gain,
      rate: (opts?.rate ?? 1) * human.rate,
      delay: opts?.delay,
      position: opts?.spatial === false ? undefined : { x: origin.x, y: origin.y, z: origin.z },
      rolloff: 0.45,
      refDistance: 2.4,
    });
    return true;
  }

  return {
    setOrigin(position) {
      origin = position;
    },
    setSurface(next) {
      surface = next;
    },
    footstep(kind) {
      const gain = (kind === 'run' ? 0.5 : 0.36) * (surface === 'water' ? 1.15 : 1);
      const rate = kind === 'run' ? 1.06 : 1;
      shot(FEET[surface], gain, {
        rate,
        fallback: () => {
          if (surface === 'water') noise(700, 0.7, 0.12, 0.05);
          else tone(surface === 'wood' ? 180 : 90, 0.07, 0.04, 'triangle');
        },
      });
    },
    jump() {
      shot(SFX.jump, 0.4, { fallback: () => tone(240, 0.09, 0.04, 'triangle') });
    },
    land() {
      shot(SFX.land, 0.48, { fallback: () => tone(70, 0.12, 0.06) });
      shot(FEET[surface], 0.42, { rate: 0.92 });
    },
    dig(quality) {
      const q = Math.max(0, Math.min(1, quality));
      shot(SFX.dig, 0.32 + q * 0.38, {
        rate: 0.9 + q * 0.18,
        fallback: () => {
          tone(75, 0.14, 0.1);
          noise(160, 0.8, 0.12, 0.08);
        },
      });
      shot(SFX.dirt, 0.36 + q * 0.15);
    },
    classify(quality) {
      const q = Math.max(0, Math.min(1, quality));
      shot(SFX.uiPluck, 0.22, {
        rate: 0.85 + q * 0.55,
        spatial: false,
        fallback: () => tone(660 + q * 330, 0.05, 0.06, 'triangle'),
      });
    },
    pan() {
      shot(SFX.slosh, 0.46, { fallback: () => noise(640, 0.6, 0.16, 0.05) });
    },
    splash() {
      shot(SFX.slosh, 0.42, { fallback: () => noise(500, 0.5, 0.2, 0.07) });
      shot(SFX.footWater, 0.36, { rate: 0.9 });
    },
    gold(rate) {
      shot(SFX.gold, 0.38, {
        vary: 'close',
        rate,
        fallback: () => {
          tone(1320 * rate, 0.06, 0.06);
          tone(1760 * rate, 0.08, 0.03, 'triangle');
        },
      });
    },
    coins() {
      shot(SFX.coins, 0.55, {
        spatial: false,
        fallback: () => tone(880, 0.08, 0.07),
      });
      shot(SFX.coins, 0.4, { spatial: false, delay: 0.09, rate: 1.08 });
    },
    click() {
      shot(SFX.uiClick, 0.32, { spatial: false, fallback: () => tone(880, 0.06, 0.06) });
    },
    hover() {
      const now = ctx.currentTime;
      if (now - hoverAt < 0.07) return;
      hoverAt = now;
      shot(SFX.uiHover, 0.16, { spatial: false, fallback: () => tone(620, 0.03, 0.03) });
    },
    open() {
      shot(SFX.uiOpen, 0.34, { spatial: false, fallback: () => tone(520, 0.08, 0.05) });
    },
    close() {
      shot(SFX.uiClose, 0.32, { spatial: false, fallback: () => tone(340, 0.08, 0.05) });
    },
    confirm() {
      shot(SFX.uiConfirm, 0.36, {
        spatial: false,
        fallback: () => {
          tone(660, 0.09, 0.07);
          tone(990, 0.14, 0.06);
        },
      });
    },
    pluck(rate) {
      shot(SFX.uiPluck, 0.2, { spatial: false, rate });
    },
    world(name, rate = 1) {
      const r = Math.max(0.5, Math.min(1.6, rate));
      if (name === 'wash' || name === 'sluice' || name === 'rise') {
        shot(SFX.slosh, name === 'rise' ? 0.62 : 0.5, { rate: r });
        if (name === 'rise') shot(SFX.footWater, 0.4, { rate: 0.86, delay: 0.06 });
        return;
      }
      if (name === 'spill') {
        shot(SFX.slosh, 0.34, { rate: 1.15 });
        shot(SFX.gold, 0.22, { rate: 1.3, delay: 0.05 });
        return;
      }
      if (name === 'sample' || name === 'tom') {
        shot(SFX.dirt, 0.48, { rate: r });
        shot(SFX.footGravel, 0.36, { rate: 0.94, delay: 0.04 });
        return;
      }
      if (name === 'stake' || name === 'rocker') {
        shot(SFX.footWood, 0.55, { rate: name === 'rocker' ? r : 0.82 });
        shot(SFX.dig, name === 'stake' ? 0.42 : 0.28, { rate: 0.9, delay: 0.03 });
        return;
      }
      if (name === 'monitor') {
        shot(SFX.slosh, 0.58, { rate: 1.22 });
        shot(SFX.footWater, 0.32, { rate: 1.4, delay: 0.04 });
        return;
      }
      if (name === 'jumper') {
        shot(SFX.dig, 0.46, { rate: 0.78 });
        shot(SFX.footWood, 0.34, { rate: 1.18, delay: 0.08 });
        return;
      }
      if (name === 'coins') {
        shot(SFX.coins, 0.5, { spatial: false, rate: r });
        return;
      }
      shot(SFX.uiPluck, 0.28, { spatial: false, rate: r });
    },
  };
}
