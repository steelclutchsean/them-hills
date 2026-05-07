import * as THREE from 'three';
import type { WeatherView } from './weather';

// Day/night cycle. The world clock advances 1:1 with real time (worldTime
// is real-seconds), but the *sky hour* runs faster: 1 real-minute = 1.2
// game-hours, so a full visual day cycles in 20 real-minutes.
//
// Survival drain rates intentionally stay in real-time domain (see
// survival.ts) — they're tuned for player session pacing, not sky time.
//
// The optional `weather` argument to update() applies a gray tint after the
// time-of-day palette is computed: overcast and rain shift colors toward a
// muted gray and dim the sun. Clear weather is a no-op.

export const SKY_SECONDS_PER_DAY = 1200;
const START_HOUR_OFFSET = 8; // start the world at 08:00, not midnight

export function getSkyHour(worldTime: number): number {
  return ((((worldTime / SKY_SECONDS_PER_DAY) * 24 + START_HOUR_OFFSET) % 24) + 24) % 24;
}

interface SkyPalette {
  bg: number;
  fog: number;
  sunColor: number;
  sunIntensity: number;
  ambientColor: number;
  ambientIntensity: number;
}

// Key palette stops around the day. Linearly interpolated by hour.
// Painterly aim: muted, slightly saturated, warm at dawn/dusk, cool at night.
const KEY_PALETTES: { hour: number; palette: SkyPalette }[] = [
  {
    hour: 0,
    palette: {
      bg: 0x0a1024,
      fog: 0x0a1024,
      sunColor: 0x223044,
      sunIntensity: 0.02,
      ambientColor: 0x1a2238,
      ambientIntensity: 0.18,
    },
  },
  {
    hour: 5,
    palette: {
      bg: 0x3a2848,
      fog: 0x3a2848,
      sunColor: 0x553355,
      sunIntensity: 0.1,
      ambientColor: 0x3a2848,
      ambientIntensity: 0.25,
    },
  },
  {
    hour: 6.5,
    palette: {
      bg: 0xff9966,
      fog: 0xc06a44,
      sunColor: 0xff8a55,
      sunIntensity: 0.7,
      ambientColor: 0x886677,
      ambientIntensity: 0.4,
    },
  },
  {
    hour: 8,
    palette: {
      bg: 0xa8c4d8,
      fog: 0xa8c4d8,
      sunColor: 0xfff1d0,
      sunIntensity: 1.0,
      ambientColor: 0xb8c8d8,
      ambientIntensity: 0.5,
    },
  },
  {
    hour: 12,
    palette: {
      bg: 0x88aacc,
      fog: 0x9bb8d3,
      sunColor: 0xffffff,
      sunIntensity: 1.15,
      ambientColor: 0xffffff,
      ambientIntensity: 0.55,
    },
  },
  {
    hour: 17,
    palette: {
      bg: 0xb3c8d8,
      fog: 0xb3c8d8,
      sunColor: 0xfff1c0,
      sunIntensity: 1.0,
      ambientColor: 0xc0c8d0,
      ambientIntensity: 0.5,
    },
  },
  {
    hour: 18.5,
    palette: {
      bg: 0xff7744,
      fog: 0xc04422,
      sunColor: 0xff5522,
      sunIntensity: 0.75,
      ambientColor: 0x885566,
      ambientIntensity: 0.4,
    },
  },
  {
    hour: 20,
    palette: {
      bg: 0x3a2848,
      fog: 0x3a2848,
      sunColor: 0x553355,
      sunIntensity: 0.1,
      ambientColor: 0x282038,
      ambientIntensity: 0.25,
    },
  },
  {
    hour: 22,
    palette: {
      bg: 0x0a1024,
      fog: 0x0a1024,
      sunColor: 0x223044,
      sunIntensity: 0.02,
      ambientColor: 0x1a2238,
      ambientIntensity: 0.18,
    },
  },
];

function findBracket(hour: number): { prev: SkyPalette; next: SkyPalette; t: number } {
  for (let i = 0; i < KEY_PALETTES.length - 1; i++) {
    const a = KEY_PALETTES[i]!;
    const b = KEY_PALETTES[i + 1]!;
    if (hour >= a.hour && hour < b.hour) {
      return { prev: a.palette, next: b.palette, t: (hour - a.hour) / (b.hour - a.hour) };
    }
  }
  // Wrap from last (hour 22) to first (hour 24 → 0)
  const last = KEY_PALETTES[KEY_PALETTES.length - 1]!;
  const first = KEY_PALETTES[0]!;
  const span = 24 - last.hour + first.hour;
  const into = hour >= last.hour ? hour - last.hour : 24 - last.hour + hour;
  return { prev: last.palette, next: first.palette, t: into / span };
}

const _bg = new THREE.Color();
const _fog = new THREE.Color();
const _sunCol = new THREE.Color();
const _ambCol = new THREE.Color();
const _bgB = new THREE.Color();
const _fogB = new THREE.Color();
const _sunB = new THREE.Color();
const _ambB = new THREE.Color();

function interpolate(hour: number): SkyPalette {
  const { prev, next, t } = findBracket(hour);
  _bg.set(prev.bg);
  _bgB.set(next.bg);
  _bg.lerp(_bgB, t);
  _fog.set(prev.fog);
  _fogB.set(next.fog);
  _fog.lerp(_fogB, t);
  _sunCol.set(prev.sunColor);
  _sunB.set(next.sunColor);
  _sunCol.lerp(_sunB, t);
  _ambCol.set(prev.ambientColor);
  _ambB.set(next.ambientColor);
  _ambCol.lerp(_ambB, t);
  return {
    bg: _bg.getHex(),
    fog: _fog.getHex(),
    sunColor: _sunCol.getHex(),
    sunIntensity: prev.sunIntensity + (next.sunIntensity - prev.sunIntensity) * t,
    ambientColor: _ambCol.getHex(),
    ambientIntensity: prev.ambientIntensity + (next.ambientIntensity - prev.ambientIntensity) * t,
  };
}

export interface SkyController {
  update(worldTime: number, weather?: WeatherView): void;
  getHour(): number;
}

const WEATHER_TINT = new THREE.Color(0x6a7080);

export function createSkyController(opts: {
  scene: THREE.Scene;
  ambient: THREE.AmbientLight;
  sun: THREE.DirectionalLight;
  renderer: THREE.WebGLRenderer;
}): SkyController {
  const { scene, ambient, sun, renderer } = opts;
  let lastHour = START_HOUR_OFFSET;

  function update(worldTime: number, weather?: WeatherView): void {
    const hour = getSkyHour(worldTime);
    lastHour = hour;
    const p = interpolate(hour);

    _bg.set(p.bg);
    _fog.set(p.fog);

    let sunIntensity = p.sunIntensity;
    let ambientIntensity = p.ambientIntensity;

    // Weather tint — pull colors toward a muted gray and dim the lights
    // proportional to weather state and intensity.
    if (weather && weather.state !== 'clear' && weather.intensity > 0) {
      const baseTint = weather.state === 'rain' ? 0.6 : 0.4;
      const t = baseTint * weather.intensity;
      _bg.lerp(WEATHER_TINT, t);
      _fog.lerp(WEATHER_TINT, t);
      _sunCol.set(p.sunColor);
      _sunCol.lerp(WEATHER_TINT, t * 0.5);
      sun.color.copy(_sunCol);
      sunIntensity *= 1 - t * 0.7;
      ambientIntensity *= 1 - t * 0.3;
    } else {
      sun.color.set(p.sunColor);
    }

    if (scene.background instanceof THREE.Color) {
      scene.background.copy(_bg);
    } else {
      scene.background = _bg.clone();
    }
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(_fog);
    }
    renderer.setClearColor(_bg);

    sun.intensity = sunIntensity;
    ambient.color.set(p.ambientColor);
    ambient.intensity = ambientIntensity;

    // Sun arc: 0° at sunrise (east horizon), 90° at noon (overhead),
    // 180° at sunset (west horizon), 270° at midnight (below ground).
    const theta = ((hour - 6) / 24) * Math.PI * 2;
    const sx = Math.cos(theta);
    const sy = Math.sin(theta);
    sun.position.set(sx * 100, sy * 100, 30);
  }

  return {
    update,
    getHour: () => lastHour,
  };
}

/** Format hour-as-decimal (e.g., 14.5) → "14:30". */
export function formatClock(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.floor((hour - h) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
