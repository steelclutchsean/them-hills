// Looping beds (creek, wind, rain, crickets, town) plus occasional birds
// and owls. Creek and town are positioned; the weather beds are not.

import type { AudioBank } from './bank';
import { AMBIENCE } from './catalog';
import { distanceCutoff, type AudioMixer } from './mixer';
import { nightAmount, TOWN_POINT, townAmount } from './zones';

export interface AmbienceFrame {
  dt: number;
  hour: number;
  weather: number;
  inWater: boolean;
  inCave: boolean;
  x: number;
  y: number;
  z: number;
  streamX: number;
  streamY: number;
  streamZ: number;
  streamDist: number;
}

interface LoopSlot {
  url: string;
  gain: GainNode;
  panner: PannerNode | null;
  filter: BiquadFilterNode | null;
  started: boolean;
}

export interface AmbienceBed {
  arm(): void;
  update(frame: AmbienceFrame): void;
}

function approach(param: AudioParam, target: number, dt: number, rate: number): void {
  const step = 1 - Math.exp(-Math.max(0, dt) * rate);
  param.value += (target - param.value) * step;
}

export function createAmbience(mixer: AudioMixer, bank: AudioBank): AmbienceBed {
  const ctx = mixer.context;

  function makeLoop(url: string, spatial: boolean): LoopSlot {
    const gain = ctx.createGain();
    gain.gain.value = 0;
    let panner: PannerNode | null = null;
    let filter: BiquadFilterNode | null = null;
    if (spatial) {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 4;
      panner.maxDistance = 40;
      panner.rolloffFactor = 0.15;
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 15000;
      filter.Q.value = 0.7;
      gain.connect(filter);
      filter.connect(panner);
      panner.connect(mixer.ambience);
    } else {
      gain.connect(mixer.ambience);
    }
    return { url, gain, panner, filter, started: false };
  }

  const creek = makeLoop(AMBIENCE.creek, true);
  const creekClose = makeLoop(AMBIENCE.creekClose, true);
  const wind = makeLoop(AMBIENCE.wind, false);
  const rain = makeLoop(AMBIENCE.rain, false);
  const crickets = makeLoop(AMBIENCE.crickets, false);
  const town = makeLoop(AMBIENCE.town, true);
  const loops = [creek, creekClose, wind, rain, crickets, town];

  let armed = false;
  let birdIn = 3.5;
  let owlIn = 9;

  function ensure(slot: LoopSlot): void {
    if (slot.started) return;
    const buffer = bank.peek(slot.url);
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(slot.gain);
    source.start();
    slot.started = true;
  }

  function place(slot: LoopSlot, x: number, y: number, z: number): void {
    if (!slot.panner) return;
    slot.panner.positionX.value = x;
    slot.panner.positionY.value = y;
    slot.panner.positionZ.value = z;
  }

  function chirp(urls: readonly string[], x: number, y: number, z: number, gain: number): void {
    const url = urls[Math.floor(Math.random() * urls.length)] ?? urls[0];
    if (!url) return;
    const buffer = bank.peek(url);
    if (!buffer) return;
    mixer.play(buffer, {
      bus: 'ambience',
      gain: gain * (0.72 + Math.random() * 0.5),
      rate: 0.92 + Math.random() * 0.16,
      position: { x, y, z },
      rolloff: 1.15,
      refDistance: 6,
    });
  }

  return {
    arm() {
      armed = true;
    },
    update(frame) {
      if (!armed) return;
      for (const slot of loops) ensure(slot);
      const night = nightAmount(frame.hour);
      const townLevel = townAmount(frame.x, frame.z);
      const cave = frame.inCave ? 1 : 0;
      const outdoors = 1 - cave * 0.92;

      const streamAudible =
        frame.streamDist < 8 ? 1 : frame.streamDist < 32 ? (32 - frame.streamDist) / 24 : 0;
      const creekGain = streamAudible * (frame.inWater ? 0.85 : 0.55) * outdoors;
      approach(creek.gain.gain, creekGain, frame.dt, 2.2);
      approach(creekClose.gain.gain, creekGain * (frame.inWater ? 0.7 : 0.28), frame.dt, 2.2);
      place(creek, frame.streamX, frame.streamY, frame.streamZ);
      place(creekClose, frame.streamX, frame.streamY + 0.2, frame.streamZ);
      const creekCut = distanceCutoff(frame.streamDist);
      if (creek.filter) creek.filter.frequency.value = creekCut;
      if (creekClose.filter) creekClose.filter.frequency.value = creekCut;

      approach(
        wind.gain.gain,
        (0.14 + frame.weather * 0.42) * (frame.inCave ? 0.06 : 1),
        frame.dt,
        1.4,
      );
      approach(rain.gain.gain, frame.weather * 0.55 * (frame.inCave ? 0.12 : 1), frame.dt, 1.8);
      approach(
        crickets.gain.gain,
        night * 0.22 * (1 - frame.weather * 0.45) * outdoors,
        frame.dt,
        1.2,
      );
      approach(town.gain.gain, townLevel * 0.34 * outdoors, frame.dt, 1.6);
      place(town, TOWN_POINT.x, frame.y + 1.2, TOWN_POINT.z);
      if (town.filter) {
        town.filter.frequency.value = distanceCutoff(
          Math.hypot(frame.x - TOWN_POINT.x, frame.z - TOWN_POINT.z),
        );
      }

      birdIn -= frame.dt;
      if (birdIn <= 0) {
        birdIn = 4.5 + Math.random() * 7;
        if (night < 0.35 && !frame.inCave && frame.weather < 0.65) {
          const angle = Math.random() * Math.PI * 2;
          const radius = 8 + Math.random() * 14;
          chirp(
            AMBIENCE.bird,
            frame.x + Math.cos(angle) * radius,
            frame.y + 4 + Math.random() * 6,
            frame.z + Math.sin(angle) * radius,
            0.32,
          );
        }
      }

      owlIn -= frame.dt;
      if (owlIn <= 0) {
        owlIn = 11 + Math.random() * 14;
        if (night > 0.55 && !frame.inCave) {
          const angle = Math.random() * Math.PI * 2;
          const radius = 14 + Math.random() * 18;
          chirp(
            AMBIENCE.owl,
            frame.x + Math.cos(angle) * radius,
            frame.y + 6,
            frame.z + Math.sin(angle) * radius,
            0.48,
          );
        }
      }
    },
  };
}
