// Keyboard + mouse polling primitive used by the input manager.
// Frame-scoped consumers (camera look in Phase 1) call consumeMouseDelta() once per frame.

export class KeyboardInput {
  private heldKeys = new Set<string>();
  private heldMouseButtons = new Set<number>();
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

  isPressed(binding: string): boolean {
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
    this.heldKeys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code);
  };
  private onMouseDown = (e: MouseEvent): void => {
    this.heldMouseButtons.add(e.button);
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
