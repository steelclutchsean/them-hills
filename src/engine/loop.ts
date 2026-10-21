// Fixed-timestep game loop with rAF rendering. Decouples simulation rate from frame rate
// (https://gafferongames.com/post/fix_your_timestep/). update() may be called multiple
// times per render() if the frame ran long; it is never called with a variable dt.

export interface GameLoopOptions {
  update(dt: number): void;
  render(): void;
  /** Default 1/60s. */
  fixedStep?: number;
  /**
   * Longest real-time gap one frame is allowed to feed the accumulator.
   * Default 0.25s so a backgrounded tab cannot spiral. The playtest pilot
   * raises this so a multi-second shader compile still advances the sim.
   */
  maxFrameDt?: number;
}

export interface GameLoop {
  start(): void;
  stop(): void;
}

export function createGameLoop(opts: GameLoopOptions): GameLoop {
  const fixedStep = opts.fixedStep ?? 1 / 60;
  const maxFrameDt = opts.maxFrameDt ?? 0.25;
  let running = false;
  let last = 0;
  let accumulator = 0;

  const tick = (now: number): void => {
    if (!running) return;
    if (last === 0) last = now;
    let dt = (now - last) / 1000;
    last = now;
    // Clamp dt after a long pause (e.g., tab switch) to avoid spiral-of-death.
    if (dt > maxFrameDt) dt = maxFrameDt;
    accumulator += dt;
    while (accumulator >= fixedStep) {
      opts.update(fixedStep);
      accumulator -= fixedStep;
    }
    opts.render();
    requestAnimationFrame(tick);
  };

  return {
    start(): void {
      if (running) return;
      running = true;
      last = 0;
      accumulator = 0;
      requestAnimationFrame(tick);
    },
    stop(): void {
      running = false;
    },
  };
}
