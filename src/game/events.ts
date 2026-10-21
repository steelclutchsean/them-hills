import type { AudioSystem } from '@/audio/system';

// Gameplay events for the audio pass. This module does not play sound.
// Subscribers (the audio agent) listen here. The wrapper below still
// forwards into the existing synth so current cues keep working.

export interface GameplayEvents {
  'ui-tap': Record<string, never>;
  confirm: Record<string, never>;
  'quest-chime': Record<string, never>;
  footstep: { surface: 'grass' | 'water' };
  splash: Record<string, never>;
  'dig-swing': { quality: number };
  'classify-beat': { quality: number };
  'pan-swirl': Record<string, never>;
  'flake-collect': Record<string, never>;
  'stage-complete': { stageIndex: number };
  find: { grams: number };
  'prospect-start': { siteId: string };
  sell: { vendorId: string; earned: number };
  /** A wash pulse in the pan: tilt is the pan radius 0..1, rhythm is 0..1, spilled means gold slid off. */
  'pan-wash': { tilt: number; rhythm: number; spilled: boolean };
  sample: { colors: number; habitat: string };
  'claim-staked': { claimId: string; habitat: string };
  'claim-jumper': { claimId: string };
  'creek-rise': { shift: number };
  'method-change': { method: string };
  rumor: { id: string };
  hire: { hands: number };
  'supply-bought': { id: string };
  'area-unlock': { streamId: string };
  /** A beat inside a rocker, sluice, long tom, or monitor. */
  'machine-beat': { kind: string; quality: number };
  'machine-run': { kind: string };
  'jumper-confront': { claimId: string; how: string };
}

type Handler<K extends keyof GameplayEvents> = (payload: GameplayEvents[K]) => void;

const listeners = new Map<keyof GameplayEvents, Set<Handler<never>>>();

export function onGameplay<K extends keyof GameplayEvents>(
  type: K,
  handler: Handler<K>,
): () => void {
  let set = listeners.get(type);
  if (!set) {
    set = new Set();
    listeners.set(type, set);
  }
  set.add(handler as Handler<never>);
  return () => set?.delete(handler as Handler<never>);
}

export function emitGameplay<K extends keyof GameplayEvents>(
  type: K,
  payload: GameplayEvents[K],
): void {
  const set = listeners.get(type);
  if (!set) return;
  for (const handler of set) (handler as Handler<K>)(payload);
}

const EMPTY = {} as Record<string, never>;

/** Forward the current synth and publish the same moments as events. */
export function bindGameplayAudio(audio: AudioSystem): AudioSystem {
  return {
    ...audio,
    playUITap() {
      audio.playUITap();
      emitGameplay('ui-tap', EMPTY);
    },
    playConfirm() {
      audio.playConfirm();
      emitGameplay('confirm', EMPTY);
    },
    playQuestChime() {
      audio.playQuestChime();
      emitGameplay('quest-chime', EMPTY);
    },
    playFootstep(kind = 'walk') {
      audio.playFootstep(kind);
      emitGameplay('footstep', { surface: kind === 'water' ? 'water' : 'grass' });
    },
    playSplash() {
      audio.playSplash();
      emitGameplay('splash', EMPTY);
    },
    playDigSwing(quality) {
      audio.playDigSwing(quality);
      emitGameplay('dig-swing', { quality });
    },
    playClassifyBeat(quality) {
      audio.playClassifyBeat(quality);
      emitGameplay('classify-beat', { quality });
    },
    playPanSwirl() {
      audio.playPanSwirl();
      emitGameplay('pan-swirl', EMPTY);
    },
    playFlakeCollect() {
      audio.playFlakeCollect();
      emitGameplay('flake-collect', EMPTY);
    },
    playStageComplete(stageIndex) {
      audio.playStageComplete(stageIndex);
      emitGameplay('stage-complete', { stageIndex });
    },
    playFind(grams) {
      audio.playFind(grams);
      emitGameplay('find', { grams });
    },
  };
}
