// One arrangement, six stems, all the same 16 bars in D at 84 BPM.
// Context changes which layers are up. The change waits for the next bar,
// then the levels glide across about a bar, so the key never jumps.

import type { AudioBank } from './bank';
import { MUSIC, STEMS, type Attention, type MusicCue, type StemName } from './catalog';
import type { AudioMixer } from './mixer';
import { desiredCue, nightAmount } from './zones';

export interface MusicFrame {
  dt: number;
  x: number;
  z: number;
  hour: number;
  inCave: boolean;
  prospecting: boolean;
  attention: Attention;
}

export interface MusicDirector {
  arm(): void;
  update(frame: MusicFrame): void;
  stinger(kind: 'flake' | 'nugget' | 'sale'): void;
  cue(): MusicCue;
}

const URLS: Record<StemName, string> = {
  guitar: MUSIC.guitar,
  banjo: MUSIC.banjo,
  fiddle: MUSIC.fiddle,
  harmonica: MUSIC.harmonica,
  pad: MUSIC.pad,
  percussion: MUSIC.percussion,
};

const STINGER_URL = {
  flake: MUSIC.stingerFlake,
  nugget: MUSIC.stingerNugget,
  sale: MUSIC.stingerSale,
} as const;

// Levels are the stem's share of the bed, not the slider. The bed is one
// piece; these just open and close the layers.
const MIX: Record<MusicCue, Record<StemName, number>> = {
  exploration: {
    guitar: 0.84,
    banjo: 0.36,
    fiddle: 0.22,
    harmonica: 0.08,
    pad: 0.16,
    percussion: 0,
  },
  prospecting: {
    guitar: 0.7,
    banjo: 0.62,
    fiddle: 0.8,
    harmonica: 0.28,
    pad: 0.1,
    percussion: 0.72,
  },
  town: { guitar: 0.74, banjo: 0.78, fiddle: 0.46, harmonica: 0.82, pad: 0.18, percussion: 0.5 },
  night: { guitar: 0.48, banjo: 0.08, fiddle: 0.06, harmonica: 0.14, pad: 0.62, percussion: 0 },
};

function approach(current: number, target: number, dt: number, rate: number): number {
  const step = 1 - Math.exp(-Math.min(0.1, Math.max(0, dt)) * rate);
  return current + (target - current) * step;
}

export function createMusic(mixer: AudioMixer, bank: AudioBank): MusicDirector {
  const ctx = mixer.context;
  const sum = ctx.createGain();
  sum.gain.value = 1;
  const color = ctx.createBiquadFilter();
  color.type = 'lowpass';
  color.frequency.value = 15000;
  color.Q.value = 0.7;
  const attentionGain = ctx.createGain();
  attentionGain.gain.value = 1;
  const stingerGain = ctx.createGain();
  stingerGain.gain.value = 1;
  sum.connect(color);
  color.connect(attentionGain);
  attentionGain.connect(stingerGain);
  stingerGain.connect(mixer.music);

  const gains = {} as Record<StemName, GainNode>;
  const level: Record<StemName, number> = {
    guitar: 0,
    banjo: 0,
    fiddle: 0,
    harmonica: 0,
    pad: 0,
    percussion: 0,
  };
  const target: Record<StemName, number> = { ...level };
  for (const stem of STEMS) {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(sum);
    gains[stem] = gain;
  }

  let armed = false;
  let started = false;
  let startedAt = 0;
  let loopDur = 0;
  let cue: MusicCue = 'exploration';
  let heading: MusicCue = 'exploration';
  let nextBarAt = 0;
  let attention: Attention = 'world';
  let dull = 0;

  function tryStart(): void {
    if (started) return;
    const buffers: AudioBuffer[] = [];
    for (const stem of STEMS) {
      const state = bank.status(URLS[stem]);
      if (state === 'pending' || state === 'idle') return;
      const buffer = bank.peek(URLS[stem]);
      if (buffer) buffers.push(buffer);
    }
    if (buffers.length === 0) return;
    const when = ctx.currentTime + 0.06;
    startedAt = when;
    loopDur = buffers[0]!.duration;
    nextBarAt = when;
    for (const stem of STEMS) {
      const buffer = bank.peek(URLS[stem]);
      if (!buffer) continue;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gains[stem]);
      source.start(when);
    }
    started = true;
    for (const stem of STEMS) target[stem] = MIX[heading][stem];
  }

  function consider(next: MusicCue, now: number): void {
    cue = next;
    if (!started || loopDur <= 0) {
      heading = next;
      return;
    }
    if (now + 0.02 >= nextBarAt && next !== heading) {
      heading = next;
      for (const stem of STEMS) target[stem] = MIX[next][stem];
    }
    if (now + 0.02 >= nextBarAt) {
      const bar = loopDur / 16;
      const elapsed = Math.max(0, now - startedAt);
      const pos = elapsed % loopDur;
      const into = pos % bar;
      const wait = into < 0.03 ? bar : bar - into;
      nextBarAt = now + wait;
    }
  }

  function setAttention(next: Attention): void {
    if (next === attention) return;
    attention = next;
    const value = next === 'dialogue' ? 0.22 : next === 'menu' ? 0.38 : 1;
    attentionGain.gain.setTargetAtTime(value, ctx.currentTime, 0.18);
  }

  return {
    arm() {
      armed = true;
    },
    update(frame) {
      if (!armed) return;
      consider(
        desiredCue({
          x: frame.x,
          z: frame.z,
          hour: frame.hour,
          inCave: frame.inCave,
          prospecting: frame.prospecting,
          previous: cue,
        }),
        ctx.currentTime,
      );
      tryStart();
      const stepRate = 1.15;
      for (const stem of STEMS) {
        level[stem] = approach(level[stem], target[stem], frame.dt, stepRate);
        gains[stem].gain.value = level[stem];
      }
      const night = nightAmount(frame.hour);
      const wantDull = Math.max(night * 0.42, frame.inCave ? 1 : 0);
      dull = approach(dull, wantDull, frame.dt, 1.6);
      color.frequency.value = 15000 * Math.pow(2800 / 15000, dull);
      setAttention(frame.attention);
    },
    stinger(kind) {
      if (!armed) return;
      const buffer = bank.peek(STINGER_URL[kind]);
      if (!buffer) return;
      const now = ctx.currentTime;
      const seconds = kind === 'nugget' ? 3.6 : kind === 'sale' ? 3.1 : 2.5;
      const gain = stingerGain.gain;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(Math.max(0.05, gain.value), now);
      gain.linearRampToValueAtTime(0.34, now + 0.05);
      gain.linearRampToValueAtTime(1, now + seconds);
      mixer.play(buffer, {
        bus: 'music',
        gain: kind === 'flake' ? 0.72 : 0.9,
      });
    },
    cue: () => cue,
  };
}
