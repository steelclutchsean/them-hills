// Top-right mini-map. Canvas-based, ~160px square. Renders the 200m world
// extent, the stream centerlines, key fixtures, the mine, and a heading
// arrow for the player. Redrawn each frame; cheap because the canvas is
// small (~25k pixels) and we only do simple shape primitives.

const SIZE_PX = 160;
const WORLD_HALF = 100; // matches terrain EXTENT_X / 2 — full map covered
const PX_PER_M = SIZE_PX / (WORLD_HALF * 2);

export interface MinimapStream {
  centerX: number;
  centerZ: number;
  halfWidth: number;
  halfLength: number;
  orientation: 'NS' | 'EW';
  /** CSS-style hex string used to draw the centerline. */
  color: string;
}

export interface MinimapLandmark {
  x: number;
  z: number;
  label: string;
  /** CSS-style hex color. */
  color: string;
  /** Render shape — 'dot' for NPCs / fixtures, 'square' for buildings, 'mine' for the mine. */
  shape: 'dot' | 'square' | 'mine';
}

export interface MinimapStatic {
  streams: readonly MinimapStream[];
  landmarks: readonly MinimapLandmark[];
}

export interface MountedMinimap {
  update(state: { x: number; z: number; yaw: number }): void;
  destroy(): void;
}

const STYLE = `
  .hud-minimap {
    position: fixed;
    top: 220px;
    right: 12px;
    width: ${SIZE_PX}px;
    height: ${SIZE_PX}px;
    background: rgba(10, 14, 22, 0.6);
    border: 1px solid rgba(212, 166, 71, 0.45);
    border-radius: 4px;
    pointer-events: none;
    user-select: none;
    backdrop-filter: blur(2px);
  }
  .hud-minimap .mm-canvas {
    display: block;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }
  .hud-minimap .mm-label {
    position: absolute;
    top: -16px;
    left: 50%;
    transform: translateX(-50%);
    color: #c89b3b;
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    text-shadow: 0 1px 2px rgba(0,0,0,0.85);
  }
`;

function injectStyle(): void {
  if (document.getElementById('hud-minimap-style')) return;
  const tag = document.createElement('style');
  tag.id = 'hud-minimap-style';
  tag.textContent = STYLE;
  document.head.appendChild(tag);
}

function worldToCanvas(x: number, z: number): { cx: number; cy: number } {
  // World (x, z) → canvas (cx, cy). Center of canvas is world (0, 0); +X
  // is right, +Z is down (south). Matches the game's compass convention.
  return {
    cx: SIZE_PX / 2 + x * PX_PER_M,
    cy: SIZE_PX / 2 + z * PX_PER_M,
  };
}

export function mountMinimap(staticData: MinimapStatic): MountedMinimap {
  injectStyle();

  const root = document.createElement('div');
  root.className = 'hud-minimap';

  const labelEl = document.createElement('div');
  labelEl.className = 'mm-label';
  labelEl.textContent = 'Map';
  root.appendChild(labelEl);

  const canvas = document.createElement('canvas');
  canvas.className = 'mm-canvas';
  canvas.width = SIZE_PX;
  canvas.height = SIZE_PX;
  root.appendChild(canvas);
  document.body.appendChild(root);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      update() {},
      destroy() {
        root.remove();
      },
    };
  }

  function drawFrame(playerX: number, playerZ: number, yaw: number): void {
    if (!ctx) return;
    ctx.clearRect(0, 0, SIZE_PX, SIZE_PX);

    // Subtle ground tint so the map area reads as terrain even when the
    // player is far from any landmark.
    ctx.fillStyle = 'rgba(74, 106, 58, 0.35)';
    ctx.fillRect(0, 0, SIZE_PX, SIZE_PX);

    // Streams as thick lines along their orientation. Drawn first so
    // landmarks render on top.
    for (const s of staticData.streams) {
      const halfX = s.orientation === 'NS' ? s.halfWidth : s.halfLength;
      const halfZ = s.orientation === 'NS' ? s.halfLength : s.halfWidth;
      const a = worldToCanvas(s.centerX - halfX, s.centerZ - halfZ);
      const b = worldToCanvas(s.centerX + halfX, s.centerZ + halfZ);
      ctx.fillStyle = s.color;
      ctx.fillRect(
        Math.min(a.cx, b.cx),
        Math.min(a.cy, b.cy),
        Math.abs(b.cx - a.cx),
        Math.abs(b.cy - a.cy),
      );
    }

    // Landmarks
    for (const l of staticData.landmarks) {
      const { cx, cy } = worldToCanvas(l.x, l.z);
      ctx.fillStyle = l.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 1;
      if (l.shape === 'dot') {
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (l.shape === 'square') {
        ctx.fillRect(cx - 3, cy - 3, 6, 6);
        ctx.strokeRect(cx - 3, cy - 3, 6, 6);
      } else if (l.shape === 'mine') {
        // Triangle = mine entrance
        ctx.beginPath();
        ctx.moveTo(cx, cy - 4);
        ctx.lineTo(cx + 4, cy + 3);
        ctx.lineTo(cx - 4, cy + 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // Player heading arrow on top
    const { cx, cy } = worldToCanvas(playerX, playerZ);
    const len = 6;
    const tipX = cx + Math.sin(yaw) * len;
    const tipY = cy - Math.cos(yaw) * len;
    const leftX = cx + Math.sin(yaw + Math.PI * 0.78) * (len * 0.6);
    const leftY = cy - Math.cos(yaw + Math.PI * 0.78) * (len * 0.6);
    const rightX = cx + Math.sin(yaw - Math.PI * 0.78) * (len * 0.6);
    const rightY = cy - Math.cos(yaw - Math.PI * 0.78) * (len * 0.6);
    ctx.fillStyle = '#f0d089';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // North indicator (top edge)
    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 9px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('N', SIZE_PX / 2, 1);
  }

  return {
    update(state) {
      drawFrame(state.x, state.z, state.yaw);
    },
    destroy() {
      root.remove();
    },
  };
}
