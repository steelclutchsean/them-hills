import { emitGameplay } from '@/game/events';
import type { Minigame, MinigameUpdate, MinigameViz, StageOptions } from '@/game/minigames/types';

// Each machine is its own minigame. None of these emit a pan viz.

function progress(message: string, value: number, viz: MinigameViz, left = 0): MinigameUpdate {
  return {
    kind: 'in_progress',
    progress: { progress: value, message, panTapsRemaining: left, viz },
  };
}

function done(score: number, message: string, viz: MinigameViz): MinigameUpdate {
  return {
    kind: 'complete',
    score: Math.max(0.5, Math.min(2, score)),
    progress: { progress: 1, message, panTapsRemaining: 0, viz },
  };
}

export function createRockerMinigame(): Minigame {
  let t = 0;
  let rocks = 0;
  let scoreSum = 0;
  let lastTap = 9;
  let water = 1;
  const need = 5;
  return {
    start(_tier: number, _options?: StageOptions) {
      t = 0;
      rocks = 0;
      scoreSum = 0;
      lastTap = 9;
      water = 1;
    },
    update({ dt, justPressedInteract, audio, effects }): MinigameUpdate {
      t += dt;
      lastTap += dt;
      const phase = (t / 0.85) % 2;
      const rock = phase < 1 ? phase : 2 - phase;
      const atEnd = rock < 0.16 || rock > 0.84;
      if (justPressedInteract) {
        lastTap = 0;
        if (atEnd) {
          rocks += 1;
          water = Math.max(0, water - 0.16);
          scoreSum += 1.35;
          audio.playClassifyBeat(0.9);
          effects.shake(0.02, 0.1);
          emitGameplay('machine-beat', { kind: 'rocker', quality: 0.9 });
        } else {
          scoreSum += 0.45;
          audio.playClassifyBeat(0.3);
          emitGameplay('machine-beat', { kind: 'rocker', quality: 0.3 });
        }
      }
      const viz: MinigameViz = {
        kind: 'rocker',
        rock,
        rocksDone: rocks,
        rocksNeeded: need,
        water,
        lastTap,
        gold: rocks / need,
      };
      if (rocks >= need) return done(scoreSum / need, 'The box is clean.', viz);
      const hint = atEnd ? 'ROCK — end of the swing' : 'Let the box reach the end';
      return progress(`${hint}  ${rocks}/${need}`, rocks / need, viz, need - rocks);
    },
  };
}

export function createSluiceMinigame(): Minigame {
  let phase: 'feed' | 'flow' | 'cleanup' = 'feed';
  let t = 0;
  let shovels = 0;
  let flow = 0.5;
  let held = 0;
  let slot = 2;
  let cleaned = 0;
  let score = 0;
  const slots = [1, 0, 1, 1, 0];
  return {
    start() {
      phase = 'feed';
      t = 0;
      shovels = 0;
      flow = 0.5;
      held = 0;
      slot = 2;
      cleaned = 0;
      score = 0;
    },
    update({ dt, justPressedInteract, axes, audio, effects }): MinigameUpdate {
      t += dt;
      const indicator = (Math.sin(t * 2.4) + 1) / 2;
      if (phase === 'feed') {
        if (justPressedInteract) {
          const hit = Math.abs(indicator - 0.72) < 0.12;
          shovels += 1;
          score += hit ? 1.4 : 0.55;
          audio.playDigSwing(hit ? 0.8 : 0.3);
          effects.burst({ x: 0.1, y: -0.05, z: -0.6 }, 0x8a6240, 8, 'dirt');
          emitGameplay('machine-beat', { kind: 'sluice', quality: hit ? 0.8 : 0.3 });
          if (shovels >= 3) phase = 'flow';
        }
      } else if (phase === 'flow') {
        flow = Math.max(0, Math.min(1, flow - axes.dy * 0.85));
        const inBand = flow > 0.38 && flow < 0.64;
        if (inBand) held += dt;
        else if (flow > 0.82) score -= dt * 0.15;
        if (held > 2.2) {
          phase = 'cleanup';
          score += 1.3;
          emitGameplay('machine-beat', { kind: 'sluice', quality: 1 });
        }
      } else {
        slot = Math.max(0, Math.min(4, slot + axes.dx * 4));
        if (justPressedInteract) {
          const idx = Math.round(slot);
          if (slots[idx] === 1) {
            slots[idx] = 0;
            cleaned += 1;
            score += 1.2;
            audio.playFlakeCollect();
            emitGameplay('machine-beat', { kind: 'sluice', quality: 1 });
          }
        }
      }
      const viz: MinigameViz = {
        kind: 'sluice',
        phase,
        indicator,
        flow,
        slot,
        slots: [...slots],
        cleaned,
      };
      const goldLeft = slots.reduce((n, v) => n + v, 0);
      if (phase === 'cleanup' && goldLeft === 0) return done(score / 6, 'Riffles are clean.', viz);
      const message =
        phase === 'feed'
          ? `Shovel the hopper when the load is over it  ${shovels}/3`
          : phase === 'flow'
            ? flow > 0.64
              ? 'Ease the gate — the riffles are flooding'
              : flow < 0.38
                ? 'Open the gate — the riffles are dry'
                : 'Hold the water in the riffles'
            : 'Pick the gold sitting in the riffles';
      return progress(
        message,
        phase === 'feed' ? shovels / 3 : phase === 'flow' ? held / 2.2 : cleaned / 3,
        viz,
        goldLeft,
      );
    },
  };
}

export function createLongTomMinigame(): Minigame {
  let phase: 'grizzly' | 'cleanup' = 'grizzly';
  let t = 0;
  let shakes = 0;
  let lastTap = 9;
  let slot = 1;
  let cleaned = 0;
  let score = 0;
  const slots = [1, 1, 0, 1, 0, 1];
  return {
    start() {
      phase = 'grizzly';
      t = 0;
      shakes = 0;
      lastTap = 9;
      slot = 1;
      cleaned = 0;
      score = 0;
      for (let i = 0; i < slots.length; i++) slots[i] = i % 2 === 0 ? 1 : i === 1 ? 1 : 0;
    },
    update({ dt, justPressedInteract, axes, audio, effects }): MinigameUpdate {
      t += dt;
      lastTap += dt;
      const shake = (Math.sin(t * 5.5) + 1) / 2;
      if (phase === 'grizzly') {
        if (justPressedInteract) {
          lastTap = 0;
          const hit = shake > 0.78;
          shakes += 1;
          score += hit ? 1.45 : 0.5;
          audio.playDigSwing(hit ? 1 : 0.35);
          effects.shake(0.018, 0.08);
          emitGameplay('machine-beat', { kind: 'longtom', quality: hit ? 1 : 0.35 });
          if (shakes >= 4) phase = 'cleanup';
        }
      } else {
        slot = Math.max(0, Math.min(5, slot + axes.dx * 3.4));
        if (justPressedInteract) {
          const idx = Math.round(slot);
          if (slots[idx] === 1) {
            slots[idx] = 0;
            cleaned += 1;
            score += 1.15;
            audio.playFlakeCollect();
            emitGameplay('machine-beat', { kind: 'longtom', quality: 1 });
          }
        }
      }
      const viz: MinigameViz = {
        kind: 'longtom',
        phase,
        shake,
        hopper: Math.min(1, shakes / 4),
        slot,
        slots: [...slots],
        cleaned,
        lastTap,
      };
      const goldLeft = slots.reduce((n, v) => n + v, 0);
      if (phase === 'cleanup' && goldLeft === 0)
        return done(score / 7, 'The tom is cleaned out.', viz);
      const message =
        phase === 'grizzly'
          ? shake > 0.78
            ? 'SHAKE the grizzly — now'
            : 'Wait for the grizzly to rise'
          : 'Clean the lower box. Gold sits in the riffles.';
      return progress(message, phase === 'grizzly' ? shakes / 4 : cleaned / 4, viz, goldLeft);
    },
  };
}

export function createMonitorMinigame(): Minigame {
  let aim = 0.55;
  let pressure = 0.55;
  let cut = 0;
  let waste = 0;
  let t = 0;
  let pulse = 0;
  const band = 0.64;
  const pressureBand = 0.55;
  return {
    start() {
      aim = 0.55;
      pressure = 0.55;
      cut = 0;
      waste = 0;
      t = 0;
      pulse = 0;
    },
    update({ dt, axes, isUseToolDown, effects }): MinigameUpdate {
      t += dt;
      aim = Math.max(0.08, Math.min(0.92, aim - axes.dy * 0.7));
      pressure = Math.max(0.08, Math.min(0.92, pressure + axes.dx * 0.65));
      const aimed = Math.abs(aim - band) < 0.09;
      const held = Math.abs(pressure - pressureBand) < 0.12;
      const onPay = aimed && held;
      if (isUseToolDown) {
        if (onPay) {
          cut = Math.min(1.2, cut + dt * 0.42);
          if (Math.floor(t * 8) % 4 === 0)
            effects.burst({ x: 0.2, y: aim * 0.2, z: -0.7 }, 0xc4a06a, 4, 'dirt');
        } else {
          waste += dt * (pressure > 0.78 ? 0.48 : 0.28);
          if (pressure > 0.78) effects.shake(0.015, 0.08);
        }
        pulse += dt;
        if (pulse > 0.45) {
          pulse = 0;
          emitGameplay('machine-beat', { kind: 'monitor', quality: onPay ? 1 : 0.2 });
        }
      }
      const viz: MinigameViz = {
        kind: 'monitor',
        aim,
        band,
        pressure,
        pressureBand,
        spray: isUseToolDown,
        cut,
        waste,
        gold: Math.min(1, cut),
      };
      if (cut >= 1 || t > 9) {
        const score = 0.55 + 1.3 * Math.min(1, cut) * Math.max(0.4, 1 - waste * 0.35);
        return done(score, cut >= 1 ? 'The pay streak is cut.' : 'The bank is chewed up.', viz);
      }
      const message = !isUseToolDown
        ? 'Look up and down to sweep. Look sideways to set the pressure.'
        : onPay
          ? 'Cutting the pay'
          : !held
            ? pressure > pressureBand
              ? 'Pressure is high — ease off'
              : 'Pressure is low — open the valve'
            : 'Off the streak — sweep back onto the dark band';
      return progress(message, Math.min(1, cut), viz);
    },
  };
}
