# Them Hills

A 3D third-person RPG/sim about modern-day gold prospecting. Browser-first (Three.js, WebGL2), full keyboard/mouse and gamepad (Xbox / DualShock) parity, persistent saves, real-world spot-price-driven economy.

**Status:** Phase 1 (Player & Camera Vertical Slice) complete.

---

## Quickstart

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

You should see:
- A rolling-hills heightmap (~200m × 200m) under a soft blue sky.
- A capsule character (gold) with a red cone indicating its facing direction.
- A HUD in the top-left showing input device, character state, stamina bar, position, FPS, and active actions.
- Console logs from `[save]`, `[bootstrap]`, and `[gamepad]` (when a controller connects).

### Controls

| Action | Keyboard / Mouse | Xbox | DualShock |
|---|---|---|---|
| Move | WASD | Left stick | Left stick |
| Look / Camera | Mouse (click canvas to lock) | Right stick | Right stick |
| Sprint (drains stamina) | Shift | L3 | L3 |
| Jump | Space | A | Cross |
| Interact (Phase 2) | E | X | Square |

### Things to verify

- **Save persistence**: refresh after ~60s, console shows `[save] Loaded existing save (saveCount=N…)` with N incrementing.
- **Gamepad detection**: plug in a controller, press any button — HUD device line shows `pad: xbox` or `pad: playstation`.
- **Movement feel**: WASD + mouse-look; the character should turn smoothly toward movement direction; sprint drains stamina noticeably; jump arcs feel snappy not floaty.
- **Camera collision**: walk against a slope so the camera would clip into terrain — the spring-arm should pull the camera in, not pierce ground.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR (port 5173) |
| `npm run build` | Type-check (`tsc --noEmit`) + production build to `/dist` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint over `src/` |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check (CI) |

---

## Tech stack

| Concern | Choice |
|---|---|
| Renderer | Three.js (vanilla) |
| Build | Vite + TypeScript |
| State | Zustand (vanilla, no React) |
| Persistence | IndexedDB via `idb-keyval` |
| Physics | Rapier (`@dimforge/rapier3d-compat` 0.19) |
| Audio | Howler.js + Three.js PositionalAudio (added in Phase 6) |
| Lint/format | ESLint 9 (flat config) + Prettier |

---

## Folder structure

```
/
├── src/
│   ├── engine/        # Three.js renderer + game loop
│   ├── input/         # KB/M + gamepad with action mapping
│   ├── physics/       # Rapier wrapper (init, world, step)
│   ├── save/          # SaveV1 schema, migrations, IndexedDB store
│   ├── state/         # Zustand store (vanilla)
│   ├── ui/            # DOM-based HUD/menus
│   ├── audio/         # (Phase 6)
│   ├── game/          # terrain, character, camera-rig (Phase 1+)
│   ├── assets/        # (sourced/created during M3)
│   └── main.ts        # entry point
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── eslint.config.js
└── design docs (*.md)
```

---

## Design documents

| File | What it covers |
|---|---|
| `prd-v0.md` | Product Requirements Document — game vision, scope, all locked decisions |
| `implementation-plan-v0.md` | 11-phase build sequence with demo states and exit criteria |
| `milestones-v0.md` | 6 external-value milestones (M0–M6) and audience plan |
| `economy-model.md` | Sanity check + tunable spreadsheet model for the gold economy |
| `save-schema-v1.md` | Versioned save schema contract |

---

## Deploy (manual for now)

The repo is not yet linked to Vercel/Netlify. Recommended setup:

1. `git init && git add . && git commit -m "Phase 0: foundations"`
2. Create a private GitHub repo and push
3. Connect Vercel (or Netlify) to the repo with these settings:
   - Build command: `npm run build`
   - Output directory: `dist`
   - Node version: 20+
4. Confirm the preview URL renders the rotating cube.

---

## Browser support

- Required: WebGL2, IndexedDB, Gamepad API, Pointer Lock API.
- Tested targets: Chrome 120+, Firefox 120+, Safari 17+, Edge 120+.
- WebGPU is not used in v0 (planned exploration in v1).

---

## Contributing

Solo project at this stage. If that changes, see `CONTRIBUTING.md` (will be added at M3).

## License

TBD — see `LICENSES.md` for third-party asset licensing tracking.
