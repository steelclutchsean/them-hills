// Keyboard + mouse polling primitive used by the input manager.
// Frame-scoped consumers (camera look in Phase 1) call consumeMouseDelta() once per frame.

export class KeyboardInput {
  private heldKeys = new Set<string>();
  private heldMouseButtons = new Set<number>();
  /** Presses that happened since the last poll, including taps already released. */
  private edges = new Set<string>();
  private frameEdges = new Set<string>();
  private mouseDx = 0;
  private mouseDy = 0;

  start(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('blur', this.onBlur);
  }

  stop(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('blur', this.onBlur);
  }

  /**
   * Copy edge latches into this frame and clear the pending set.
   * Call once at the start of the update, before any isPressed reads.
   * A tap that lands entirely between frames still shows up for one poll.
   */
  consumeEdges(): void {
    this.frameEdges = this.edges;
    this.edges = new Set();
  }

  isPressed(binding: string): boolean {
    if (this.frameEdges.has(binding)) return true;
    if (binding.startsWith('Mouse')) {
      const btn = parseInt(binding.slice(5), 10);
      return this.heldMouseButtons.has(btn);
    }
    return this.heldKeys.has(binding);
  }

  consumeMouseDelta(): { dx: number; dy: number } {
    const result = { dx: this.mouseDx, dy: this.mouseDy };
    this.mouseDx = 0;
    this.mouseDy = 0;
    return result;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    // Tab would move focus out of the canvas and drop pointer lock.
    // Esc still exits pointer lock; we just want the pause handler to see it.
    if (
      e.code === 'Tab' ||
      e.code === 'Escape' ||
      e.code === 'KeyM' ||
      e.code === 'KeyH' ||
      e.code === 'KeyE' ||
      e.code === 'KeyF' ||
      e.code === 'Space'
    ) {
      e.preventDefault();
    }
    this.heldKeys.add(e.code);
    this.edges.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code);
  };
  private onMouseDown = (e: MouseEvent): void => {
    // The click that acquires pointer lock is not a tool swing.
    if (document.pointerLockElement === null && (e.button === 0 || e.button === 2)) {
      return;
    }
    this.heldMouseButtons.add(e.button);
    this.edges.add(`Mouse${e.button}`);
  };
  private onMouseUp = (e: MouseEvent): void => {
    this.heldMouseButtons.delete(e.button);
  };
  private onMouseMove = (e: MouseEvent): void => {
    if (document.pointerLockElement) {
      this.mouseDx += e.movementX;
      this.mouseDy += e.movementY;
    }
  };
  private onBlur = (): void => {
    this.heldKeys.clear();
    this.heldMouseButtons.clear();
  };
}
