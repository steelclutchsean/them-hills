import {
  ALL_ACTIONS,
  DEFAULT_GAMEPAD_BINDINGS,
  DEFAULT_KEYBOARD_BINDINGS,
  type ActionId,
} from './actions';
import { GamepadInput, type GamepadGlyphStyle } from './gamepad';
import { KeyboardInput } from './keyboard';

export type InputDevice = 'keyboard' | 'gamepad';

export interface ActionState {
  active: boolean;
  value: number;
}

export interface MoveInput {
  /** -1..1; positive is right (D / right stick X) */
  x: number;
  /** -1..1; positive is back (S / right stick Y) */
  y: number;
}

export interface LookDelta {
  /** Yaw delta in radians for this frame (positive turns right). */
  dx: number;
  /** Pitch delta in radians for this frame (positive looks down). */
  dy: number;
}

export interface InputManager {
  start(): void;
  stop(): void;
  /** Call once per frame from the game loop, before reading any state. */
  poll(): void;
  isActive(action: ActionId): boolean;
  getValue(action: ActionId): number;
  /** Combined keyboard + gamepad-stick movement, normalized to -1..1 per axis. */
  getMoveInput(): MoveInput;
  /** Combined mouse + gamepad-stick look delta, in radians per frame. */
  getLookDelta(dt: number): LookDelta;
  lastInputDevice(): InputDevice;
  gamepadGlyphStyle(): GamepadGlyphStyle;
  snapshot(): Readonly<Record<ActionId, ActionState>>;
}

// Mouse pixels → radians. Tunable via Settings later (Phase 9).
const MOUSE_LOOK_SENSITIVITY = 0.0022;
// Gamepad stick at full deflection turns this many radians per second.
const STICK_LOOK_RATE_RAD_PER_SEC = 2.6;

export function createInputManager(): InputManager {
  const kb = new KeyboardInput();
  const gp = new GamepadInput();
  let lastDevice: InputDevice = 'keyboard';

  // Per-frame consumed mouse delta (set in poll()).
  let frameMouseDx = 0;
  let frameMouseDy = 0;

  const isActiveRaw = (action: ActionId): boolean => {
    const kbBinding = DEFAULT_KEYBOARD_BINDINGS[action];
    const gpButton = DEFAULT_GAMEPAD_BINDINGS[action];
    if (kb.isPressed(kbBinding)) {
      lastDevice = 'keyboard';
      return true;
    }
    if (gpButton >= 0 && gp.isPressed(gpButton)) {
      lastDevice = 'gamepad';
      return true;
    }
    return false;
  };

  const getValueRaw = (action: ActionId): number => {
    const kbBinding = DEFAULT_KEYBOARD_BINDINGS[action];
    const gpButton = DEFAULT_GAMEPAD_BINDINGS[action];
    if (kb.isPressed(kbBinding)) return 1;
    if (gpButton >= 0) return gp.getButtonValue(gpButton);
    return 0;
  };

  return {
    start() {
      kb.start();
      gp.start();
    },
    stop() {
      kb.stop();
      gp.stop();
    },
    poll() {
      gp.poll();
      const { dx, dy } = kb.consumeMouseDelta();
      frameMouseDx = dx;
      frameMouseDy = dy;
    },
    isActive: isActiveRaw,
    getValue: getValueRaw,
    getMoveInput() {
      // Keyboard first; if any key is held, prefer it (deterministic for sims).
      let kx = 0;
      let ky = 0;
      if (kb.isPressed(DEFAULT_KEYBOARD_BINDINGS.MOVE_LEFT)) kx -= 1;
      if (kb.isPressed(DEFAULT_KEYBOARD_BINDINGS.MOVE_RIGHT)) kx += 1;
      if (kb.isPressed(DEFAULT_KEYBOARD_BINDINGS.MOVE_FORWARD)) ky -= 1;
      if (kb.isPressed(DEFAULT_KEYBOARD_BINDINGS.MOVE_BACKWARD)) ky += 1;
      if (kx !== 0 || ky !== 0) {
        lastDevice = 'keyboard';
        // Normalize diagonal so Pythagorean speed isn't > 1.
        const len = Math.hypot(kx, ky);
        return { x: kx / len, y: ky / len };
      }
      // Standard mapping: axis 0 = LX, axis 1 = LY.
      const sx = gp.getAxis(0);
      const sy = gp.getAxis(1);
      if (sx !== 0 || sy !== 0) {
        lastDevice = 'gamepad';
        return { x: sx, y: sy };
      }
      return { x: 0, y: 0 };
    },
    getLookDelta(dt) {
      const mouseDx = frameMouseDx * MOUSE_LOOK_SENSITIVITY;
      const mouseDy = frameMouseDy * MOUSE_LOOK_SENSITIVITY;
      // Standard mapping: axis 2 = RX, axis 3 = RY.
      const stickX = gp.getAxis(2) * STICK_LOOK_RATE_RAD_PER_SEC * dt;
      const stickY = gp.getAxis(3) * STICK_LOOK_RATE_RAD_PER_SEC * dt;
      if (mouseDx !== 0 || mouseDy !== 0) lastDevice = 'keyboard';
      else if (stickX !== 0 || stickY !== 0) lastDevice = 'gamepad';
      return { dx: mouseDx + stickX, dy: mouseDy + stickY };
    },
    lastInputDevice: () => lastDevice,
    gamepadGlyphStyle: () => gp.snapshot().glyph,
    snapshot() {
      const state = {} as Record<ActionId, ActionState>;
      for (const a of ALL_ACTIONS) {
        state[a] = { active: isActiveRaw(a), value: getValueRaw(a) };
      }
      return state;
    },
  };
}
