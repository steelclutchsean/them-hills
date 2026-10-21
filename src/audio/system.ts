// Web Audio mixer for Them Hills.
//
// Buses: master, music, ambience, sfx. Sliders persist on the save. The
// context stays silent until tryEnable() runs inside a user gesture
// (browser autoplay). Clips are fetched after that gesture, not at boot.
// One-shots at the player and the creek/town beds are HRTF-spatialized.
// A generated impulse stands in for mine reverb.

import { allAudioUrls, type MusicCue } from './catalog';
import { createAmbience } from './ambience';
import { createAudioBank } from './bank';
import { createFoley } from './foley';
import { createMixer, type MixLevels } from './mixer';
import { createMusic } from './music';
import { surfaceAt, type Surface } from './zones';

export interface AudioUpdateState {
  dt: number;
  distanceToNearestStream: number;
  weatherIntensity: number;
  hour: number;
  inWater: boolean;
  inCave: boolean;
  prospecting: boolean;
  player: { x: number; y: number; z: number };
  stream: { x: number; y: number; z: number };
  listener: {
    x: number;
    y: number;
    z: number;
    fx: number;
    fy: number;
    fz: number;
    ux: number;
    uy: number;
    uz: number;
  };
}

export interface AudioDebug {
  context: AudioContextState | 'absent';
  buses: { master: boolean; music: boolean; sfx: boolean; ambience: boolean };
  master: number;
  music: number;
  sfx: number;
  ambient: number;
  cue: MusicCue;
  surface: Surface;
}

export interface AudioSystem {
  tryEnable(): void;
  update(state: AudioUpdateState): void;
  playUITap(): void;
  playUIHover(): void;
  playUIOpen(): void;
  playUIClose(): void;
  playConfirm(): void;
  playQuestChime(): void;
  playFootstep(kind?: 'walk' | 'run' | 'grass' | 'water'): void;
  playJump(): void;
  playLand(): void;
  playSplash(): void;
  playDigSwing(quality: number): void;
  playClassifyBeat(quality: number): void;
  playPanSwirl(): void;
  playFlakeCollect(): void;
  playStageComplete(stageIdx: number): void;
  playFind(grams: number, detail?: { nuggetGrams?: number; firstFind?: boolean }): void;
  playSale(): void;
  isEnabled(): boolean;
  setMasterVolume(value: number): void;
  setMusicVolume(value: number): void;
  setAmbientVolume(value: number): void;
  setSfxVolume(value: number): void;
  debug(): AudioDebug;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function createAudioSystem(): AudioSystem {
  let ctx: AudioContext | null = null;
  let mixer: ReturnType<typeof createMixer> | null = null;
  let music: ReturnType<typeof createMusic> | null = null;
  let ambience: ReturnType<typeof createAmbience> | null = null;
  let foley: ReturnType<typeof createFoley> | null = null;
  let armed = false;
  let heardFind = false;
  let pending: (() => void) | null = null;
  let cave = 0;
  let surface: Surface = 'grass';
  const levels: MixLevels = { master: 1, music: 0.85, sfx: 1, ambient: 1 };

  function ensure(): AudioContext | null {
    if (ctx) return ctx;
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      mixer = createMixer(ctx, levels);
      const bank = createAudioBank(ctx);
      music = createMusic(mixer, bank);
      ambience = createAmbience(mixer, bank);
      foley = createFoley(mixer, bank);
      bank.prefetch(allAudioUrls());
    } catch (error) {
      console.warn('[audio] AudioContext init failed', error);
      return null;
    }
    return ctx;
  }

  function flush(): void {
    if (!ctx || ctx.state !== 'running' || !music || !ambience) return;
    if (!armed) {
      armed = true;
      music.arm();
      ambience.arm();
    }
    const job = pending;
    pending = null;
    job?.();
  }

  function ready(): boolean {
    return ctx !== null && ctx.state === 'running' && foley !== null;
  }

  function stageChime(stageIdx: number): void {
    if (!ctx || !mixer) return;
    const freqs = [523, 659, 784, 1047];
    const freq = freqs[Math.max(0, Math.min(3, stageIdx))] ?? 523;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const env = ctx.createGain();
    const t0 = ctx.currentTime;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(0.07, t0 + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    osc.connect(env);
    env.connect(mixer.sfx);
    osc.start(t0);
    osc.stop(t0 + 0.24);
    const fifth = ctx.createOscillator();
    fifth.type = 'sine';
    fifth.frequency.value = freq * 1.5;
    const env2 = ctx.createGain();
    env2.gain.setValueAtTime(0.0001, t0 + 0.05);
    env2.gain.exponentialRampToValueAtTime(0.04, t0 + 0.06);
    env2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    fifth.connect(env2);
    env2.connect(mixer.sfx);
    fifth.start(t0 + 0.05);
    fifth.stop(t0 + 0.24);
  }

  function questChime(): void {
    if (!ctx || !mixer) return;
    const notes = [523, 659, 784];
    notes.forEach((freq, index) => {
      const osc = ctx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const env = ctx!.createGain();
      const t0 = ctx!.currentTime + index * 0.09;
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(0.08, t0 + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + (index === 2 ? 0.32 : 0.14));
      osc.connect(env);
      env.connect(mixer!.sfx);
      osc.start(t0);
      osc.stop(t0 + 0.36);
    });
  }

  return {
    tryEnable() {
      const context = ensure();
      if (!context) return;
      if (context.state === 'suspended') {
        context
          .resume()
          .then(flush)
          .catch(() => undefined);
      } else {
        flush();
      }
    },
    isEnabled: () => ctx !== null && ctx.state === 'running',
    update(state) {
      if (!mixer || !music || !ambience || !foley || !armed) return;
      mixer.setListener(state.listener);
      const targetCave = state.inCave ? 1 : 0;
      const step = 1 - Math.exp(-Math.max(0, state.dt) * 2.5);
      cave += (targetCave - cave) * step;
      mixer.setCave(cave);
      surface = surfaceAt({
        x: state.player.x,
        z: state.player.z,
        inWater: state.inWater,
        inCave: state.inCave,
        prospecting: state.prospecting,
      });
      foley.setOrigin({ x: state.player.x, y: state.player.y - 0.2, z: state.player.z });
      foley.setSurface(surface);
      music.update({
        x: state.player.x,
        z: state.player.z,
        hour: state.hour,
        inCave: state.inCave,
        prospecting: state.prospecting,
      });
      ambience.update({
        dt: state.dt,
        hour: state.hour,
        weather: state.weatherIntensity,
        inWater: state.inWater,
        inCave: state.inCave,
        x: state.player.x,
        y: state.player.y,
        z: state.player.z,
        streamX: state.stream.x,
        streamY: state.stream.y,
        streamZ: state.stream.z,
        streamDist: state.distanceToNearestStream,
      });
    },
    playUITap() {
      if (!ready()) {
        // The gesture that creates the context may still be resuming.
        // Keep the click if that resume is in flight; ignore calls from
        // the sim before any gesture.
        if (ctx && ctx.state !== 'running') pending = () => foley?.click();
        return;
      }
      foley!.click();
    },
    playUIHover() {
      if (!ready()) return;
      foley!.hover();
    },
    playUIOpen() {
      if (!ready()) return;
      foley!.open();
    },
    playUIClose() {
      if (!ready()) return;
      foley!.close();
    },
    playConfirm() {
      if (!ready()) return;
      foley!.confirm();
    },
    playQuestChime() {
      if (!ready()) return;
      questChime();
    },
    playFootstep(kind = 'walk') {
      if (!ready()) return;
      const pace = kind === 'run' ? 'run' : 'walk';
      foley!.footstep(pace);
    },
    playJump() {
      if (!ready()) return;
      foley!.jump();
    },
    playLand() {
      if (!ready()) return;
      foley!.land();
    },
    playSplash() {
      if (!ready()) return;
      foley!.splash();
    },
    playDigSwing(quality) {
      if (!ready()) return;
      foley!.dig(quality);
    },
    playClassifyBeat(quality) {
      if (!ready()) return;
      foley!.classify(quality);
    },
    playPanSwirl() {
      if (!ready()) return;
      foley!.pan();
    },
    playFlakeCollect() {
      if (!ready()) return;
      foley!.gold(1.25);
    },
    playStageComplete(stageIdx) {
      if (!ready()) return;
      stageChime(stageIdx);
      const rates = [0.8, 1, 1.2, 1.5];
      foley!.pluck(rates[Math.max(0, Math.min(3, stageIdx))] ?? 1);
    },
    playFind(grams, detail) {
      if (!ready() || !music) return;
      const first = detail?.firstFind ?? !heardFind;
      const nugget = (detail?.nuggetGrams ?? 0) >= 0.008 || grams >= 0.55;
      if (first) {
        heardFind = true;
        music.stinger('flake');
        foley!.gold(1.05);
        return;
      }
      if (nugget) {
        music.stinger('nugget');
        foley!.gold(0.85);
        return;
      }
      foley!.gold(1.15);
    },
    playSale() {
      if (!ready() || !music) return;
      music.stinger('sale');
      foley!.coins();
    },
    setMasterVolume(value) {
      levels.master = clamp01(value);
      mixer?.setLevels(levels);
    },
    setMusicVolume(value) {
      levels.music = clamp01(value);
      mixer?.setLevels(levels);
    },
    setAmbientVolume(value) {
      levels.ambient = clamp01(value);
      mixer?.setLevels(levels);
    },
    setSfxVolume(value) {
      levels.sfx = clamp01(value);
      mixer?.setLevels(levels);
    },
    debug: () => ({
      context: ctx?.state ?? 'absent',
      buses: {
        master: mixer !== null,
        music: mixer !== null,
        sfx: mixer !== null,
        ambience: mixer !== null,
      },
      master: levels.master,
      music: levels.music,
      sfx: levels.sfx,
      ambient: levels.ambient,
      cue: music?.cue() ?? 'exploration',
      surface,
    }),
  };
}
