import type { AudioSystem } from '@/audio/system';

// Gameplay events for the audio pass. The wrapper forwards each cue into
// the audio system and publishes the same moment for other subscribers.

export interface GameplayEvents {
  'ui-tap': Record<string, never>;
  confirm: Record<string, never>;
  'quest-chime': Record<string, never>;
  footstep: { surface: 'grass' | 'water' | 'walk' | 'run' };
  splash: Record<string, never>;
  'dig-swing': { quality: number };
  'classify-beat': { quality: number };
  'pan-swirl': Record<string, never>;
  'flake-collect': Record<string, never>;
  'stage-complete': { stageIndex: number };
  find: { grams: number };
  'prospect-start': { siteId: string };
  sell: { vendorId: string; earned: number };
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
    playFootstep(surface = 'walk') {
      audio.playFootstep(surface);
      emitGameplay('footstep', { surface });
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
