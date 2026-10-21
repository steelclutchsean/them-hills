// Gameplay events -> sampled foley. The mixer already plays footsteps,
// pans, and finds through bindGameplayAudio. These are the fieldwork
// moments that used to be silent: a wash, a color count, a stake, a
// jumper, the creek coming up, and each machine.

import type { AudioSystem } from './system';
import type { WorldCue } from './foley';
import { onGameplay } from '@/game/events';

export function attachGameplayCues(audio: AudioSystem): void {
  let washAt = 0;
  const play = (name: WorldCue, rate?: number) => audio.playWorld(name, rate);

  onGameplay('pan-wash', (e) => {
    const now = performance.now();
    if (now - washAt < 160) return;
    washAt = now;
    play(e.spilled ? 'spill' : 'wash', 0.85 + e.rhythm * 0.3);
  });
  onGameplay('sample', (e) => play('sample', 0.8 + Math.min(1, e.colors / 12) * 0.35));
  onGameplay('claim-staked', () => play('stake', 0.9));
  onGameplay('claim-jumper', () => play('jumper', 0.86));
  onGameplay('creek-rise', () => play('rise', 0.8));
  onGameplay('machine-beat', (e) => {
    const name: WorldCue =
      e.kind === 'rocker'
        ? 'rocker'
        : e.kind === 'sluice'
          ? 'sluice'
          : e.kind === 'longtom' || e.kind === 'tom'
            ? 'tom'
            : 'monitor';
    play(name, 0.75 + e.quality * 0.4);
  });
  onGameplay('machine-run', (e) => {
    const name: WorldCue =
      e.kind === 'rocker' ? 'rocker' : e.kind === 'sluice' ? 'sluice' : e.kind === 'hydraulic' ? 'monitor' : 'tom';
    play(name, 1.05);
    play('chime', 1.15);
  });
  onGameplay('jumper-confront', (e) => play(e.how === 'pay' ? 'coins' : 'jumper', e.how === 'scare' ? 1.15 : 0.9));
  onGameplay('rumor', () => play('chime', 0.95));
  onGameplay('hire', () => play('coins', 0.92));
  onGameplay('supply-bought', () => play('coins', 1));
  onGameplay('area-unlock', () => play('chime', 1.2));
  onGameplay('method-change', () => play('chime', 0.84));
}
