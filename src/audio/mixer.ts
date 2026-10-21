// Master / music / sfx / ambience buses, a shared listener, and a cave
// impulse that the buses can send into. Volumes can be set before the
// context exists; they apply when the gesture finally creates it.

export interface MixLevels {
  master: number;
  music: number;
  sfx: number;
  ambient: number;
}

export interface ShotOptions {
  bus: 'sfx' | 'ambience' | 'music';
  gain: number;
  rate?: number;
  /** World position. Omit for a non-spatial (UI / music) voice. */
  position?: { x: number; y: number; z: number };
  rolloff?: number;
  refDistance?: number;
  delay?: number;
}

export interface AudioMixer {
  context: AudioContext;
  music: GainNode;
  sfx: GainNode;
  ambience: GainNode;
  setLevels(levels: MixLevels): void;
  setListener(state: {
    x: number;
    y: number;
    z: number;
    fx: number;
    fy: number;
    fz: number;
    ux: number;
    uy: number;
    uz: number;
  }): void;
  /** 0 outdoors, 1 inside a mine. Smoothed by the caller via dt. */
  setCave(amount: number): void;
  play(buffer: AudioBuffer, opts: ShotOptions): void;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function makeImpulse(ctx: AudioContext): AudioBuffer {
  const seconds = 2.1;
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let energy = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // A few early taps, then a long cave tail.
      const early = i === Math.floor(rate * 0.017) || i === Math.floor(rate * 0.031) ? 0.6 : 0;
      const sample =
        ((Math.random() * 2 - 1) * Math.pow(1 - t, 2.4) + early) * (channel === 0 ? 1 : 0.92);
      data[i] = sample;
      energy += sample * sample;
    }
    const rms = Math.sqrt(energy / length) || 1;
    const scale = 0.12 / rms;
    for (let i = 0; i < length; i++) data[i] = (data[i] ?? 0) * scale;
  }
  return buffer;
}

export function createMixer(ctx: AudioContext, levels: MixLevels): AudioMixer {
  const master = ctx.createGain();
  master.gain.value = clamp01(levels.master);
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.knee.value = 10;
  compressor.ratio.value = 2;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.22;
  master.connect(compressor);
  compressor.connect(ctx.destination);

  const music = ctx.createGain();
  music.gain.value = clamp01(levels.music);
  const sfx = ctx.createGain();
  sfx.gain.value = clamp01(levels.sfx);
  const ambience = ctx.createGain();
  ambience.gain.value = clamp01(levels.ambient);
  music.connect(master);
  sfx.connect(master);
  ambience.connect(master);

  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0;
  convolver.connect(wet);
  wet.connect(master);

  const sends = {
    music: ctx.createGain(),
    sfx: ctx.createGain(),
    ambience: ctx.createGain(),
  };
  sends.music.gain.value = 0;
  sends.sfx.gain.value = 0;
  sends.ambience.gain.value = 0;
  music.connect(sends.music);
  sfx.connect(sends.sfx);
  ambience.connect(sends.ambience);
  sends.music.connect(convolver);
  sends.sfx.connect(convolver);
  sends.ambience.connect(convolver);

  const buses = { music, sfx, ambience };

  function play(buffer: AudioBuffer, opts: ShotOptions): void {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = opts.rate ?? 1;
    const gain = ctx.createGain();
    gain.gain.value = opts.gain;
    const destination = buses[opts.bus];
    if (opts.position) {
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = opts.refDistance ?? 2.2;
      panner.maxDistance = 48;
      panner.rolloffFactor = opts.rolloff ?? 0.35;
      panner.positionX.value = opts.position.x;
      panner.positionY.value = opts.position.y;
      panner.positionZ.value = opts.position.z;
      source.connect(panner);
      panner.connect(gain);
      source.onended = () => {
        source.disconnect();
        panner.disconnect();
        gain.disconnect();
      };
    } else {
      source.connect(gain);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
    }
    gain.connect(destination);
    const when = ctx.currentTime + (opts.delay ?? 0);
    source.start(when);
  }

  return {
    context: ctx,
    music,
    sfx,
    ambience,
    setLevels(next) {
      master.gain.value = clamp01(next.master);
      music.gain.value = clamp01(next.music);
      sfx.gain.value = clamp01(next.sfx);
      ambience.gain.value = clamp01(next.ambient);
    },
    setListener(state) {
      const listener = ctx.listener;
      const forwardSq = state.fx * state.fx + state.fy * state.fy + state.fz * state.fz;
      if (forwardSq < 1e-6) return;
      listener.positionX.value = state.x;
      listener.positionY.value = state.y;
      listener.positionZ.value = state.z;
      listener.forwardX.value = state.fx;
      listener.forwardY.value = state.fy;
      listener.forwardZ.value = state.fz;
      listener.upX.value = state.ux;
      listener.upY.value = state.uy;
      listener.upZ.value = state.uz;
    },
    setCave(amount) {
      const wetAmount = Math.max(0, Math.min(1, amount));
      wet.gain.value = wetAmount * 0.85;
      sends.sfx.gain.value = wetAmount * 0.7;
      sends.ambience.gain.value = wetAmount * 0.28;
      sends.music.gain.value = wetAmount * 0.22;
    },
    play,
  };
}
