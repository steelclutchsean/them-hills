import { emitGameplay } from '@/game/events';
import type { Minigame, MinigameUpdate, MinigameViz, StageOptions } from './types';

// Pan minigame — read the pan, then wash.
//
// Look input tilts the bowl (cursor radius) and swirls it (angular speed).
// Lighter sand leaves only inside a tilt band. Too flat and it sits. Too
// steep and gold slides off the lip. A steady swirl in the rhythm window
// clears sand faster than a frantic one. The stage ends when the sand is
// gone, or when the clock runs out — the clock is the failure, not the game.
//
// The first prospect is a tutorial: a wide band, a fast wash, a short cap.
// A sluice wants you to hold the tilt in the riffles. A long tom is the
// same motion, slower, because the yield is elsewhere.

interface WashProfile {
  duration: number;
  bandLo: number;
  bandHi: number;
  spillAt: number;
  /** Sand cleared per second while the tilt is in the band and the pan is moving. */
  rate: number;
  rhythmRate: number;
  layers: number;
}

const PAN_PROFILES: Record<1 | 2 | 3, WashProfile> = {
  1: {
    duration: 8,
    bandLo: 0.46,
    bandHi: 0.7,
    spillAt: 0.84,
    rate: 0.16,
    rhythmRate: 0.28,
    layers: 4,
  },
  2: {
    duration: 8,
    bandLo: 0.4,
    bandHi: 0.76,
    spillAt: 0.86,
    rate: 0.18,
    rhythmRate: 0.3,
    layers: 4,
  },
  3: {
    duration: 8,
    bandLo: 0.36,
    bandHi: 0.8,
    spillAt: 0.92,
    rate: 0.2,
    rhythmRate: 0.32,
    layers: 4,
  },
};

const TUTORIAL: WashProfile = {
  duration: 4.2,
  bandLo: 0.28,
  bandHi: 0.92,
  spillAt: 0.98,
  rate: 0.38,
  rhythmRate: 0.67,
  layers: 2,
};

const SLUICE: WashProfile = {
  duration: 7.5,
  bandLo: 0.22,
  bandHi: 0.84,
  spillAt: 0.94,
  rate: 0.2,
  rhythmRate: 0.2,
  layers: 3,
};

const LONG_TOM: WashProfile = {
  duration: 10,
  bandLo: 0.38,
  bandHi: 0.8,
  spillAt: 0.9,
  rate: 0.1,
  rhythmRate: 0.14,
  layers: 4,
};

const CURSOR_SENSITIVITY = 2.0;
const RHYTHM_MIN = 1.6;
const RHYTHM_MAX = 9.5;
const SCORE_FLOOR = 0.5;

export function createPanMinigame(): Minigame {
  let tier: 1 | 2 | 3 = 1;
  let wash: 'pan' | 'sluice' | 'long_tom' = 'pan';
  let profile: WashProfile = PAN_PROFILES[1];
  let cx = 0.55;
  let cy = 0;
  let lastAngle = 0;
  let angular = 0;
  let sand = 1;
  let gold = 1;
  let sessionTime = 0;
  let swirlCount = 0;
  let rhythmTime = 0;
  let moveTime = 0;
  let spilled = false;

  return {
    start(toolTier: number, options?: StageOptions) {
      const t = Math.max(1, Math.min(3, Math.floor(toolTier))) as 1 | 2 | 3;
      tier = t;
      wash = options?.wash ?? 'pan';
      const tutorial = options?.tutorial === true && wash === 'pan';
      profile = tutorial
        ? TUTORIAL
        : wash === 'sluice'
          ? SLUICE
          : wash === 'long_tom'
            ? LONG_TOM
            : PAN_PROFILES[t];
      cx = 0.55;
      cy = 0;
      lastAngle = 0;
      angular = 0;
      sand = 1;
      gold = 1;
      sessionTime = 0;
      swirlCount = 0;
      rhythmTime = 0;
      moveTime = 0;
      spilled = false;
    },
    update({ dt, axes, audio, effects }): MinigameUpdate {
      sessionTime += dt;
      cx += axes.dx * CURSOR_SENSITIVITY;
      cy += axes.dy * CURSOR_SENSITIVITY;
      const r0 = Math.sqrt(cx * cx + cy * cy);
      if (r0 > 1) {
        cx /= r0;
        cy /= r0;
      }
      const radius = Math.min(1, r0);

      let dA = 0;
      if (radius > 0.12) {
        const angle = Math.atan2(cy, cx);
        dA = angle - lastAngle;
        if (dA > Math.PI) dA -= 2 * Math.PI;
        else if (dA < -Math.PI) dA += 2 * Math.PI;
        lastAngle = angle;
        angular += dA;
      }

      while (Math.abs(angular) >= Math.PI * 2) {
        swirlCount += 1;
        angular += angular > 0 ? -Math.PI * 2 : Math.PI * 2;
        audio.playPanSwirl();
        effects.burst({ x: 0, y: -0.3, z: -0.5 }, 0xc5dde8, 8, 'droplet');
        effects.burst({ x: 0, y: -0.22, z: -0.48 }, 0xffd96a, 4, 'spark');
        emitGameplay('pan-wash', { tilt: radius, rhythm: 1, spilled: false });
      }

      const inBand = radius >= profile.bandLo && radius <= profile.bandHi;
      const speed = dt > 1e-4 ? Math.abs(dA) / dt : 0;
      const rhythmic = speed >= RHYTHM_MIN && speed <= RHYTHM_MAX;
      const moving = wash === 'sluice' ? inBand : inBand && speed > 0.35;
      if (moving) {
        moveTime += dt;
        if (rhythmic || wash === 'sluice') rhythmTime += dt;
        const rate =
          wash === 'sluice' ? profile.rate : rhythmic ? profile.rhythmRate : profile.rate;
        sand = Math.max(0, sand - rate * dt);
      }
      if (radius > profile.spillAt && wash !== 'sluice') {
        const loss = (radius - profile.spillAt) * dt * (tier === 3 ? 0.45 : 0.9);
        gold = Math.max(0, gold - loss);
        if (!spilled && gold < 0.9) {
          spilled = true;
          emitGameplay('pan-wash', { tilt: radius, rhythm: 0, spilled: true });
          effects.burst({ x: 0, y: -0.28, z: -0.46 }, 0xffd96a, 6, 'spark');
        }
      }

      const layersGone = Math.min(profile.layers, Math.floor((1 - sand) * profile.layers + 1e-4));
      const timeRemaining = Math.max(0, profile.duration - sessionTime);
      const viz: MinigameViz = {
        kind: 'pan',
        cursorX: cx,
        cursorY: cy,
        radius,
        swirlCount,
        swirlTarget: profile.layers,
        circularity: gold,
        timeRemaining,
        tier,
        riffleHits: layersGone,
      };

      let hint = 'find the wash angle';
      if (radius > profile.spillAt && wash !== 'sluice') hint = 'too steep — gold is sliding';
      else if (!inBand && radius < profile.bandLo) hint = 'too flat — sand is sitting';
      else if (!inBand) hint = 'ease the tilt back';
      else if (wash === 'sluice') hint = 'hold the water in the riffles';
      else if (wash === 'long_tom') hint = rhythmic ? 'tom is taking sand' : 'keep a steady swirl';
      else hint = rhythmic ? 'good rhythm — sand is leaving' : 'swirl steadier';
      const verb = wash === 'sluice' ? 'FEED' : wash === 'long_tom' ? 'TOM' : 'WASH';
      const message = `${verb} — ${hint} — ${timeRemaining.toFixed(1)}s`;
      const reported = {
        progress: Math.min(1, Math.max(sessionTime / profile.duration, 1 - sand)),
        message,
        panTapsRemaining: Math.ceil(sand * profile.layers),
        viz,
      };

      const cleanEnough = sand <= 0.06;
      if ((cleanEnough || sessionTime >= profile.duration) && sessionTime > 0.3) {
        const clean = 1 - sand;
        const kept = Math.max(0, Math.min(1, gold));
        const rhythmFactor = moveTime > 0.15 ? 0.78 + 0.22 * (rhythmTime / moveTime) : 0.8;
        let score = SCORE_FLOOR + 1.5 * Math.max(0, Math.min(1, clean)) * kept * rhythmFactor;
        if (wash === 'sluice') score = Math.min(1.55, score);
        else if (wash === 'long_tom') score = Math.min(1.7, score);
        else if (tier === 3 && clean > 0.92 && kept > 0.9) score = Math.min(2.5, score + 0.3);
        else score = Math.min(2.15, score);
        score = Math.max(SCORE_FLOOR, score);
        return { kind: 'complete', score, progress: reported };
      }
      return { kind: 'in_progress', progress: reported };
    },
  };
}
