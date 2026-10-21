# Them Hills — overhaul roadmap

## Round 2 — Sierra poster

The world is one painted palette: dry-grass gold, pine green, sunbaked dirt, creek teal, warm dust in the distance. Photo ground maps and the Quaternius albedo maps are no longer what you see. Cabins, shop counters, a camp sluice, and mine headframes replace the box shells. Grass and water sample the shadow map. The creek has a raised lip, foam, a sky reflection, and caustics. The prospector has a built face, a dig clip, a pan clip, and tools in hand. Light shafts, valley mist, and dust or fireflies fill the air. Terrain is sixteen frustum-culled chunks. The pause menu has Low / Medium / High / Ultra, auto-detected, stored in localStorage (not the save).

Gameplay events live in `src/game/events.ts` (`onGameplay` / `emitGameplay`). The current synth still plays; an audio pass can subscribe without editing the mixer.

The game is already a full prospecting loop (explore, four-step dig, carry gold, sell, upgrade, quests, mines, day and night, weather, IndexedDB saves). The gap this pass went after was presentation, and the live playtest showed a new player never reaches that loop.

Save schema stays at version 4. Existing saves load.

## What was wrong

- Custom terrain, grass, and water shaders lit themselves. The ground did not receive shadows or fog, and the sun direction was dotted in view space, so the hills relit when the camera turned.
- No tone mapping, no image-based light, a flat sky color, and unstyled particle dots.
- Character skin maps 404'd (`T_Regular_Male_*` were never vendored).
- First load was a black canvas until bootstrap and the first shader compile finished. There was no progress UI.
- Tab, M, and H were bound and then ignored. Tab also moved browser focus and dropped pointer lock. Esc only released the cursor; the settings panel was not a pause menu.
- Pointer lock required a click, and that click was also the tool button.
- Input was level-polled. A tap shorter than a frame (easy at 12 FPS) never registered.
- The character controller reports ungrounded for a step on flat ground, so the animation flickered to falling.
- The chase camera ray only sees physics colliders. Trees are visual, so the camera entered the canopy. A ray that started inside the ground pinned the arm at the minimum distance and looked straight down.
- Boulders were scattered on the mine mouth.
- Mine interiors and the inn were flat-colored boxes.
- The minimap sat on top of the carry card, and the spot-price line overflowed.
- Pressing E, F, or the mouse on empty ground did nothing.
- No title, no objective, and no active quest on a fresh save. Hunger and thirst drained during that wandering. Debug rows (position, FPS, input device) were part of the HUD.

## Phase 1 — shipped here

**Rendering.** Shared frame uniforms, one shadow map that follows the player, exponential fog, a sky dome (sun, clouds, stars), PMREM lighting that rebuilds when the sky bucket changes, and an HDR post chain (grade, bloom, ACES). Terrain, grass, and water sample that lighting. Terrain takes the forest-floor and river-rock textures. Prospect swings throw dirt, droplets, and sparks, with a short find sting.

**Boot and the first gold.** A loading card is in the HTML, so it paints before the module runs. Progress yields between the heavy steps. Grass and the environment map wait until after the first frames, so the shader compile is not a black screen. The title lists the controls. A gold beam marks the nearest Coyote Creek ring, and the objective tracker says to walk east and press E. After the first gold it points west at the Town Assayer. Hunger and thirst do not drain until that first prospect has started. Shift-to-sprint is in the objective and the help panel.

**Input and camera.** Key and mouse edges latch until the next poll, so a tap between frames still counts. Tab, M, H, and Esc are prevented from leaving the page. Tab opens the pack, M enlarges the map, H opens controls, Esc opens pause (Resume / Settings). The click that takes pointer lock is not a tool swing. Grounded animation keeps a short grace. The camera ignores tiny ray hits, eases the arm back out, fades trees between the lens and the player, and will not pitch to a full top-down.

**Places.** Mine mouths and their walk-up are clear of boulders. Cave stone uses the Namaqualand boulder texture. The inn walls, roof, and door use a wood grain instead of a flat color. The carry card no longer shares a corner with the minimap. Debug rows are hidden unless `?debug=1`.

**Playtest harness.** `npm run test:smoke` builds, boots headless Chromium (SwiftShader), fails on console errors and uncaught exceptions, walks, opens the panels, runs the real dig → classify → pan → collect → sell loop, reloads the save, and writes fixed-camera screenshots under `test-results/visual/`. GitHub Actions runs it on pull requests. Screenshots are for review, not pixel diffs — software GL will not match a laptop GPU.

## Honest limits

- The first prospect is still the real minigames: pan is a hard 6 seconds and collect is a hard 9. A player who follows the beam finishes inside two minutes; the timers are most of that time.
- Grass does not sample the shadow map (too many blades). Water does not either.
- The terrain is one heightfield. The textures break up the facets; the silhouette does not.
- Quaternius trees and a photogrammetry ground still disagree. The inn and mines are textured boxes, not built structures.
- The face is a skin-toned sphere. The skin maps are the Superhero atlas standing in for the missing regular-male set.
- No music. Wind and rain are noise beds.
- Software WebGL still spends a long time on the first shader compile. The loading card stays up through it; the compile itself is not free.
- One shadow map, a 1.5 pixel-ratio cap, and no fullscreen ambient occlusion. That is the budget for a 2022 laptop at 1080p.

## What to do next

1. **Art direction.** Pick one look and push the kit, the ground, and the buildings toward it. Contact shadow or a ground AO under the trees matters more than another post effect.
2. **The prospector.** A face, and clips (or a much better procedural pass) for the walk and the four tools.
3. **Ground and water.** Chunk the terrain, vary biomes, and give the creek a readable lip, caustics, and shadow.
4. **Sound.** A music bed and a real stinger for the first flake. The procedural noises are placeholders.
5. **The first session, shorter.** A tutorial tier of the minigames with fewer swings and a shorter pan, then the full timers. The guidance is in; the clock is still the game's clock.
6. **Presets.** A quality menu (shadows, grass count, pixel ratio) and a loading path that compiles shaders off the first interaction where the browser allows it.
