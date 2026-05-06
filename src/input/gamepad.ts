// Gamepad polling. Detects Xbox vs DualShock by inspecting the gamepad.id string,
// which on most browsers includes vendor/product info. We use the standard W3C mapping
// for button indices; the only difference between Xbox and PlayStation here is the *glyph*
// shown to the user (A/B/X/Y vs Cross/Circle/Square/Triangle).

export type GamepadGlyphStyle = 'xbox' | 'playstation' | 'unknown';

export interface GamepadSnapshot {
  connected: boolean;
  glyph: GamepadGlyphStyle;
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}

const DEADZONE = 0.15;

function applyDeadzone(v: number): number {
  return Math.abs(v) < DEADZONE ? 0 : v;
}

function detectGlyph(id: string): GamepadGlyphStyle {
  const lower = id.toLowerCase();
  if (lower.includes('xbox') || lower.includes('xinput') || lower.includes('microsoft')) {
    return 'xbox';
  }
  if (
    lower.includes('dualshock') ||
    lower.includes('dualsense') ||
    lower.includes('playstation') ||
    lower.includes('sony') ||
    lower.includes('054c') // Sony USB vendor ID
  ) {
    return 'playstation';
  }
  return 'unknown';
}

const EMPTY_SNAPSHOT: GamepadSnapshot = {
  connected: false,
  glyph: 'unknown',
  axes: [],
  buttons: [],
};

export class GamepadInput {
  private current: GamepadSnapshot = EMPTY_SNAPSHOT;
  private connectedIndex: number | null = null;

  start(): void {
    window.addEventListener('gamepadconnected', this.onConnect);
    window.addEventListener('gamepaddisconnected', this.onDisconnect);
  }

  stop(): void {
    window.removeEventListener('gamepadconnected', this.onConnect);
    window.removeEventListener('gamepaddisconnected', this.onDisconnect);
  }

  poll(): void {
    if (this.connectedIndex === null) {
      // Re-scan in case the gamepadconnected event was missed (e.g., pad already
      // attached when the page loaded — common on Safari).
      const pads = navigator.getGamepads();
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (pad) {
          this.connectedIndex = i;
          break;
        }
      }
    }

    if (this.connectedIndex !== null) {
      const pad = navigator.getGamepads()[this.connectedIndex];
      if (!pad) {
        this.connectedIndex = null;
        this.current = EMPTY_SNAPSHOT;
        return;
      }
      this.current = {
        connected: true,
        glyph: detectGlyph(pad.id),
        axes: pad.axes.map(applyDeadzone),
        buttons: pad.buttons.map((b) => ({ pressed: b.pressed, value: b.value })),
      };
    }
  }

  snapshot(): GamepadSnapshot {
    return this.current;
  }

  isPressed(buttonIndex: number): boolean {
    return this.current.buttons[buttonIndex]?.pressed ?? false;
  }

  getButtonValue(buttonIndex: number): number {
    return this.current.buttons[buttonIndex]?.value ?? 0;
  }

  getAxis(axisIndex: number): number {
    return this.current.axes[axisIndex] ?? 0;
  }

  private onConnect = (e: GamepadEvent): void => {
    this.connectedIndex = e.gamepad.index;
    console.log(
      `[gamepad] Connected: "${e.gamepad.id}" (mapping: ${e.gamepad.mapping}, glyph: ${detectGlyph(e.gamepad.id)})`,
    );
  };

  private onDisconnect = (e: GamepadEvent): void => {
    if (this.connectedIndex === e.gamepad.index) {
      this.connectedIndex = null;
      this.current = EMPTY_SNAPSHOT;
    }
    console.log(`[gamepad] Disconnected: "${e.gamepad.id}"`);
  };
}
