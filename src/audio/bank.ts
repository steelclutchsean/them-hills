// Decodes clips on demand and remembers them. A missing or corrupt file
// warns once and returns null so the game keeps running on the synth fallback.

export interface AudioBank {
  prefetch(urls: readonly string[]): void;
  peek(url: string): AudioBuffer | null;
}

export function createAudioBank(ctx: AudioContext): AudioBank {
  const pending = new Map<string, Promise<AudioBuffer | null>>();
  const ready = new Map<string, AudioBuffer>();
  const failed = new Set<string>();

  function load(url: string): Promise<AudioBuffer | null> {
    const existing = pending.get(url);
    if (existing) return existing;
    const task = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${url}`);
        return response.arrayBuffer();
      })
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((buffer) => {
        ready.set(url, buffer);
        return buffer;
      })
      .catch((error: unknown) => {
        if (!failed.has(url)) {
          failed.add(url);
          console.warn('[audio] clip unavailable', url, error);
        }
        return null;
      });
    pending.set(url, task);
    return task;
  }

  return {
    prefetch(urls) {
      for (const url of urls) void load(url);
    },
    peek(url) {
      return ready.get(url) ?? null;
    },
  };
}
