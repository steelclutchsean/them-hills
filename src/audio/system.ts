// Web Audio system. All sounds are procedurally synthesized for v0 — no
// audio asset files yet. Browsers require a user gesture before AudioContext
// can produce sound, so the system silently no-ops until tryEnable() is
// called from a click/keypress handler.
//
// What's wired today:
//   - Stream ambient (pink-noise → bandpass → gain) modulated by the
//     player's distance to the nearest water plane
//   - One-shot UI tones: tap, confirm, quest chime
//
// Sounds you might expect that ARE NOT here yet:
//   - Music (locked design wants fingerpicked guitar — a commission item)
//   - Footsteps, panning splashes, dig grunts, animal/nature ambience
// Adding any of these is mostly extra functions on this module.

export interface AudioUpdateState {
  distanceToNearestStream: number;
  weatherIntensity: number;
}

export interface AudioSystem {
  /** Call from a user-gesture handler; first call starts the AudioContext. */
  tryEnable(): void;
  /** Per-frame update — drives the ambient gain. */
  update(state: AudioUpdateState): void;
  /** Short tap, ~80ms. For menu cycle. */
  playUITap(): void;
  /** Two-note confirm, ~250ms. For vendor sale, store buy. */
  playConfirm(): void;
  /** Three-note ascending chime, ~450ms. For quest turn-in. */
  playQuestChime(): void;
  /** Per-step footstep tone — caller throttles the cadence. */
  playFootstep(surface: 'grass' | 'water'): void;
  /** One-shot splash — fired when a pan-prospect begins. */
  playSplash(): void;
  /** Dig swing thunk. `quality` in [0, 1] (0 = miss, 1 = perfect). */
  playDigSwing(quality: number): void;
  /** Classify rhythm tap. `quality` colors the tone brightness. */
  playClassifyBeat(quality: number): void;
  /** Pan swirl swish — once per completed revolution. */
  playPanSwirl(): void;
  /** Bright pluck — one flake collected by the snuffer. */
  playFlakeCollect(): void;
  /** Ascending stage-complete chime. `stageIdx` 0..3 → C5, E5, G5, C6. */
  playStageComplete(stageIdx: number): void;
  /** True if the AudioContext has been created and is running. */
  isEnabled(): boolean;
}

export function createAudioSystem(): AudioSystem {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let streamGain: GainNode | null = null;
  let started = false;

  function ensureContext(): AudioContext | null {
    if (ctx) return ctx;
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.5;
      masterGain.connect(ctx.destination);
    } catch (e) {
      console.warn('[audio] AudioContext init failed', e);
      return null;
    }
    return ctx;
  }

  function startStreamAmbient(): void {
    if (!ctx || !masterGain || started) return;
    started = true;

    // Pink-noise generator using Paul Kellett's filter coefficients — three
    // accumulators sum into a flat-low rumble that reads as flowing water
    // once bandpassed. 3-second buffer loops imperceptibly.
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, sr * 3, sr);
    const data = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < data.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16;
    }

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1300;
    filter.Q.value = 0.9;

    streamGain = ctx.createGain();
    streamGain.gain.value = 0;

    src.connect(filter);
    filter.connect(streamGain);
    streamGain.connect(masterGain);
    src.start();
  }

  function scheduleTone(
    freqHz: number,
    startOffsetSec: number,
    durationSec: number,
    peakGain: number,
    type: OscillatorType = 'sine',
  ): void {
    if (!ctx || !masterGain) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freqHz;
    const env = ctx.createGain();
    const t0 = ctx.currentTime + startOffsetSec;
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peakGain, t0 + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);
    osc.connect(env);
    env.connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + durationSec + 0.02);
  }

  return {
    tryEnable() {
      const c = ensureContext();
      if (!c) return;
      if (c.state === 'suspended') c.resume().catch(() => undefined);
      startStreamAmbient();
    },
    isEnabled: () => ctx !== null && ctx.state === 'running',
    update({ distanceToNearestStream, weatherIntensity }) {
      if (!streamGain) return;
      // Full volume in-stream and out to ~10m, fade to silence by 30m.
      const audible =
        distanceToNearestStream < 10
          ? 1
          : distanceToNearestStream < 30
            ? (30 - distanceToNearestStream) / 20
            : 0;
      // Storm weather makes the whole world louder (rain on the surface,
      // gusty noise floor) so push the ambient floor up a bit.
      const target = audible * 0.35 * (1 + weatherIntensity * 0.25);
      // Smooth toward target; don't snap on transitions.
      const cur = streamGain.gain.value;
      streamGain.gain.value = cur + (target - cur) * 0.05;
    },
    playUITap() {
      scheduleTone(880, 0, 0.08, 0.08, 'sine');
    },
    playConfirm() {
      scheduleTone(660, 0, 0.1, 0.1, 'sine');
      scheduleTone(990, 0.06, 0.18, 0.1, 'sine');
    },
    playQuestChime() {
      // C major arpeggio at C5/E5/G5 — clean, recognizable "completed" tone.
      scheduleTone(523, 0.0, 0.12, 0.1, 'sine');
      scheduleTone(659, 0.09, 0.12, 0.1, 'sine');
      scheduleTone(784, 0.18, 0.32, 0.1, 'sine');
    },
    playFootstep(surface) {
      // Low, brief thump. Triangle wave reads softer than sine for percussive
      // tones. Water variant sits slightly higher with a quicker decay to
      // hint at a wetter impact.
      if (surface === 'water') {
        scheduleTone(220, 0, 0.09, 0.05, 'triangle');
      } else {
        scheduleTone(160, 0, 0.11, 0.045, 'triangle');
      }
    },
    playSplash() {
      // Descending two-tone strike — high splatter into the lower body of
      // water. Pairs with the prospecting animation's first dip.
      scheduleTone(600, 0.0, 0.14, 0.08, 'triangle');
      scheduleTone(360, 0.06, 0.22, 0.07, 'sine');
    },
    playDigSwing(quality) {
      // Low thunk. Quality scales the brightness — perfect swings get a
      // sharp upper harmonic; bad swings just thud.
      const q = Math.max(0, Math.min(1, quality));
      scheduleTone(75, 0, 0.16, 0.13, 'sine');
      if (q > 0.4) {
        scheduleTone(180 + q * 120, 0, 0.09, 0.05 * q, 'triangle');
      }
    },
    playClassifyBeat(quality) {
      // Crisp tap that brightens with quality. 660Hz floor, +330 at perfect.
      const q = Math.max(0, Math.min(1, quality));
      scheduleTone(660 + q * 330, 0, 0.06, 0.07, 'triangle');
    },
    playPanSwirl() {
      // Quick rising swish — fakes a wet swoosh with a fast frequency
      // sweep between two tones overlapped at low gain.
      scheduleTone(300, 0, 0.12, 0.05, 'sine');
      scheduleTone(540, 0.03, 0.1, 0.04, 'sine');
    },
    playFlakeCollect() {
      // Bright pluck — high E (1320Hz) with quick decay.
      scheduleTone(1320, 0, 0.06, 0.07, 'sine');
    },
    playStageComplete(stageIdx) {
      // Major-triad ascent: C5, E5, G5, C6 for stages 0..3.
      const freqs = [523, 659, 784, 1047];
      const f = freqs[Math.max(0, Math.min(3, stageIdx))]!;
      scheduleTone(f, 0, 0.18, 0.08, 'sine');
      scheduleTone(f * 1.5, 0.05, 0.14, 0.05, 'sine');
    },
  };
}
