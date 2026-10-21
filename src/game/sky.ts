import * as THREE from 'three';
import { createAtmosphere, type Atmosphere, type SkyGrade } from '@/render/atmosphere';
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

/** Inverse of getSkyHour, used by dev review bookmarks. */
export function worldTimeForSkyHour(hour: number): number {
  const wrapped = ((hour % 24) + 24) % 24;
  let worldTime = ((wrapped - START_HOUR_OFFSET) / 24) * SKY_SECONDS_PER_DAY;
  if (worldTime < 0) worldTime += SKY_SECONDS_PER_DAY;
  return worldTime;
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
      bg: 0x142033,
      fog: 0x1c2c48,
      sunColor: 0xb7c9e6,
      sunIntensity: 0.16,
      ambientColor: 0x9eb4d2,
      ambientIntensity: 0.32,
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
      bg: 0xc9866a,
      fog: 0x7e6a86,
      sunColor: 0xffc18a,
      sunIntensity: 0.72,
      ambientColor: 0x7f8eae,
      ambientIntensity: 0.42,
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
      bg: 0x7ea4c4,
      fog: 0xc6b48a,
      sunColor: 0xfff0d2,
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
      bg: 0x6e4e6e,
      fog: 0x8a625c,
      sunColor: 0xffb07a,
      sunIntensity: 0.85,
      ambientColor: 0x6a7a98,
      ambientIntensity: 0.42,
    },
  },
  {
    hour: 20,
    palette: {
      bg: 0x1a2744,
      fog: 0x243656,
      sunColor: 0x9bb4d8,
      sunIntensity: 0.22,
      ambientColor: 0x8aa4c8,
      ambientIntensity: 0.34,
    },
  },
  {
    hour: 22,
    palette: {
      bg: 0x142033,
      fog: 0x1c2c48,
      sunColor: 0xb7c9e6,
      sunIntensity: 0.16,
      ambientColor: 0x9eb4d2,
      ambientIntensity: 0.32,
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

const _ground = new THREE.Color(0x3c4a2e);
const _grade: SkyGrade = {
  horizon: new THREE.Color(),
  sunColor: new THREE.Color(),
  sunDirection: new THREE.Vector3(),
  cloudCover: 0.3,
  starStrength: 0,
  ground: new THREE.Color(),
};

function smooth01(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function createSkyController(opts: {
  scene: THREE.Scene;
  camera: THREE.Camera;
  ambient: THREE.AmbientLight;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  renderer: THREE.WebGLRenderer;
  onGrade?: (grade: SkyGrade) => void;
}): SkyController {
  const { scene, camera, ambient, hemi, sun, renderer, onGrade } = opts;
  const atmosphere: Atmosphere = createAtmosphere(camera);
  // The dome is the background. A solid scene.background would fight it.
  scene.background = null;
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

    // Exponential fog. Density rises at night and in weather so the map
    // edge stays hidden without a hard linear wall at noon.
    const theta = ((hour - 6) / 24) * Math.PI * 2;
    const sx = Math.cos(theta);
    const sy = Math.sin(theta);
    const elev = sy;
    let density = 0.0072 + smooth01(0.4, -0.15, elev) * 0.0045;
    let cloudCover = 0.28;
    if (weather && weather.intensity > 0 && weather.state !== 'clear') {
      const storm = weather.state === 'rain';
      density += weather.intensity * (storm ? 0.011 : 0.005);
      cloudCover = (storm ? 0.78 : 0.58) + weather.intensity * 0.18;
    }
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(_fog);
      scene.fog.density = density;
    }
    renderer.setClearColor(_fog);

    sun.intensity = sunIntensity;
    // Ambient is the flat fill. Hemisphere carries the sky/ground split
    // for standard materials; custom shaders read both from the frame block.
    ambient.color.set(p.ambientColor);
    ambient.intensity = ambientIntensity * 0.72;
    // Warm dirt bounce so shade is not a flat grey. The fog still pulls
    // the fill toward the sky color at the horizon.
    _ground.set(0x8a5a32);
    const coolShade = smooth01(0.25, -0.05, elev);
    _ground.lerp(_fog, 0.28 + coolShade * 0.45);
    hemi.color.copy(_bg);
    hemi.groundColor.copy(_ground);
    hemi.intensity = ambientIntensity * 1.05;

    // Sun arc: 0° at sunrise (east horizon), 90° at noon (overhead),
    // 180° at sunset (west horizon), 270° at midnight (below ground).
    // Position is the arc only. main.ts slides it onto the player for shadows.
    sun.position.set(sx * 100, Math.max(sy, -0.15) * 100, 30);

    const starStrength = smooth01(0.12, -0.18, elev) * (1 - Math.min(1, cloudCover) * 0.85);
    // Night tone-mapping lift so the moonlit hills stay readable. Caves
    // still crush the lights after this runs.
    const night = smooth01(0.18, -0.2, elev);
    let exposure = 1.02 + night * 0.34;
    if (weather && weather.state !== 'clear') exposure *= 1 - weather.intensity * 0.1;
    renderer.toneMappingExposure = exposure;

    _grade.horizon.copy(_fog);
    _grade.sunColor.copy(sun.color);
    _grade.sunDirection.set(sx, sy, 0.3).normalize();
    _grade.cloudCover = cloudCover;
    _grade.starStrength = starStrength;
    _grade.ground.copy(_ground);
    atmosphere.update(_grade, worldTime);
    onGrade?.(_grade);
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
