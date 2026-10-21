// Four licensed beds crossfade on context. They are different pieces, so
// the handoff is a slow equal-ish fade with the outgoing track low-passed,
// not a hard cut and not a synced stem mix.

import type { AudioBank } from './bank';
import { MUSIC, type MusicCue } from './catalog';
import type { AudioMixer } from './mixer';
import { desiredCue } from './zones';

export interface MusicFrame {
  x: number;
  z: number;
  hour: number;
  inCave: boolean;
  prospecting: boolean;
}

export interface MusicDirector {
  arm(): void;
  update(frame: MusicFrame): void;
  stinger(kind: 'flake' | 'nugget' | 'sale'): void;
  cue(): MusicCue;
}

const CUES: MusicCue[] = ['exploration', 'prospecting', 'town', 'night'];
const URLS: Record<MusicCue, string> = {
  exploration: MUSIC.exploration,
  prospecting: MUSIC.prospecting,
  town: MUSIC.town,
  night: MUSIC.night,
};
const STINGER_URL = {
  flake: MUSIC.stingerFlake,
  nugget: MUSIC.stingerNugget,
  sale: MUSIC.stingerSale,
} as const;

export function createMusic(mixer: AudioMixer, bank: AudioBank): MusicDirector {
  const ctx = mixer.context;
  const bed = ctx.createGain();
  bed.gain.value = 1;
  bed.connect(mixer.music);

  const gains: Record<MusicCue, GainNode> = {
    exploration: ctx.createGain(),
    prospecting: ctx.createGain(),
    town: ctx.createGain(),
    night: ctx.createGain(),
  };
  const filters: Record<MusicCue, BiquadFilterNode> = {
    exploration: ctx.createBiquadFilter(),
    prospecting: ctx.createBiquadFilter(),
    town: ctx.createBiquadFilter(),
    night: ctx.createBiquadFilter(),
  };
  const started: Record<MusicCue, boolean> = {
    exploration: false,
    prospecting: false,
    town: false,
    night: false,
  };
  for (const cue of CUES) {
    gains[cue].gain.value = 0;
    filters[cue].type = 'lowpass';
    filters[cue].frequency.value = 14000;
    gains[cue].connect(filters[cue]);
    filters[cue].connect(bed);
  }

  let armed = false;
  let cue: MusicCue = 'exploration';
  let applied: MusicCue | null = null;

  function startCue(name: MusicCue): void {
    if (started[name]) return;
    const buffer = bank.peek(URLS[name]);
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gains[name]);
    source.start();
    started[name] = true;
  }

  function apply(next: MusicCue): void {
    if (applied === next) return;
    applied = next;
    cue = next;
    const now = ctx.currentTime;
    for (const name of CUES) {
      const active = name === next;
      gains[name].gain.setTargetAtTime(active ? 0.86 : 0, now, 1.05);
      filters[name].frequency.setTargetAtTime(active ? 15000 : 1200, now, 0.5);
    }
  }

  function duck(seconds: number): void {
    const now = ctx.currentTime;
    bed.gain.cancelScheduledValues(now);
    bed.gain.setValueAtTime(Math.max(0.05, bed.gain.value), now);
    bed.gain.linearRampToValueAtTime(0.3, now + 0.05);
    bed.gain.linearRampToValueAtTime(1, now + seconds);
  }

  return {
    arm() {
      armed = true;
    },
    update(frame) {
      if (!armed) return;
      for (const name of CUES) startCue(name);
      apply(
        desiredCue({
          x: frame.x,
          z: frame.z,
          hour: frame.hour,
          inCave: frame.inCave,
          prospecting: frame.prospecting,
          previous: cue,
        }),
      );
    },
    stinger(kind) {
      if (!armed) return;
      const buffer = bank.peek(STINGER_URL[kind]);
      if (!buffer) return;
      duck(kind === 'nugget' ? 3.6 : kind === 'sale' ? 3.1 : 2.5);
      mixer.play(buffer, {
        bus: 'music',
        gain: kind === 'flake' ? 0.72 : 0.9,
      });
    },
    cue: () => cue,
  };
}
