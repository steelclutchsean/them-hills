// Action IDs are the abstract gameplay verbs. Bindings map raw inputs (keys, buttons, axes) to these.
// Defaults below; rebinding UI is a Phase 9 deliverable.

export type ActionId =
  | 'MOVE_FORWARD'
  | 'MOVE_BACKWARD'
  | 'MOVE_LEFT'
  | 'MOVE_RIGHT'
  | 'JUMP'
  | 'SPRINT'
  | 'INTERACT'
  | 'USE_TOOL'
  | 'DIG'
  | 'PAN'
  | 'INVENTORY'
  | 'MAP'
  | 'PAUSE'
  | 'TOOL_NEXT'
  | 'TOOL_PREV';

export const ALL_ACTIONS: readonly ActionId[] = [
  'MOVE_FORWARD',
  'MOVE_BACKWARD',
  'MOVE_LEFT',
  'MOVE_RIGHT',
  'JUMP',
  'SPRINT',
  'INTERACT',
  'USE_TOOL',
  'DIG',
  'PAN',
  'INVENTORY',
  'MAP',
  'PAUSE',
  'TOOL_NEXT',
  'TOOL_PREV',
];

// Keyboard binding values:
//   - 'KeyX' / 'Space' / 'Escape' / 'ShiftLeft' etc. follow KeyboardEvent.code
//   - 'Mouse0' / 'Mouse2' for mouse buttons (LMB / RMB respectively)
export const DEFAULT_KEYBOARD_BINDINGS: Record<ActionId, string> = {
  MOVE_FORWARD: 'KeyW',
  MOVE_BACKWARD: 'KeyS',
  MOVE_LEFT: 'KeyA',
  MOVE_RIGHT: 'KeyD',
  JUMP: 'Space',
  SPRINT: 'ShiftLeft',
  INTERACT: 'KeyE',
  USE_TOOL: 'Mouse0',
  DIG: 'Mouse2',
  PAN: 'KeyF',
  INVENTORY: 'Tab',
  MAP: 'KeyM',
  PAUSE: 'Escape',
  TOOL_NEXT: 'BracketRight',
  TOOL_PREV: 'BracketLeft',
};

// Standard W3C gamepad mapping (https://w3c.github.io/gamepad/#remapping):
// Buttons: 0=A/Cross, 1=B/Circle, 2=X/Square, 3=Y/Triangle,
//          4=LB/L1, 5=RB/R1, 6=LT/L2, 7=RT/R2,
//          8=View/Share, 9=Menu/Options, 10=L3, 11=R3,
//          12-15=Dpad U/D/L/R, 16=Home/PS
// -1 means "this action is bound to an axis or doesn't have a direct button".
export const DEFAULT_GAMEPAD_BINDINGS: Record<ActionId, number> = {
  MOVE_FORWARD: -1,
  MOVE_BACKWARD: -1,
  MOVE_LEFT: -1,
  MOVE_RIGHT: -1,
  JUMP: 0, // A / Cross
  SPRINT: 10, // L3
  INTERACT: 2, // X / Square
  USE_TOOL: 7, // RT / R2
  DIG: 6, // LT / L2
  PAN: 3, // Y / Triangle
  INVENTORY: 8, // View / Share
  MAP: 8, // View (hold) — same as inventory; resolved by hold detection in later phases
  PAUSE: 9, // Menu / Options
  TOOL_NEXT: 5, // RB / R1
  TOOL_PREV: 4, // LB / L1
};
