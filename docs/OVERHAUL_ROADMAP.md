# Them Hills — overhaul roadmap

## Round 3 — creek, town edge, and the night grade

Coyote Creek and Buckeye Run share one spline across the carve, the water ribbon, the sites, the rocks, and the minimap. Width opens into pools and pinches into riffles. Gravel bars lift one side of the bed, and panning sites prefer that side. The surface scrolls along the tangent, foams on the lip and in the shallows, and goes darker teal in the pools. A planar reflection is in the high and ultra chain. SwiftShader skips it (the mirrored pass never returned a screenshot), so the review frames show the water color and the fresnel fallback, not a reflection of the trees.

Cabins are log courses with end grain and clay chinking, shake roofs, stone footings, porch rails, framed windows, and chimney smoke. The street has a hitching rail, a wagon, crates, and a laundry line. These are still built from primitives. No scanned building was imported.

The prospector head is the Quaternius superhero head, eyes, and brows baked onto the ranger. Dig and pan stay third person: the wrist aims the grip at the work point, and the review camera sits in front of the hands. Classify, collect, and the mine steps stay first person. The pan bowl opens toward that camera.

Dusk shade is purple against a warm sun. Night is moonlit blue with a tight lantern pool instead of a tan flood. Screen-space god rays run while the sun is up. GTAO is in the high and ultra chain and is skipped on software GL, so these frames do not show it. Scatter is placed at the ultra count and hidden down by quality. Trees, rocks, and brush swap to impostors with distance. Worn paths are a darker dirt mix between town, camp, the creek, and the mines.

`npm run test:smoke` passed 3/3 in 4.8 minutes on `52aa763` (SwiftShader). The prospect loop sold for a wallet of $24.14. Save version stays 4.

Still the weak part of the picture: the creek is a colored channel, not a place you remember. Buildings read as a kit. The face is a game-asset head under a hat. Dawn is still the warmest, least separated grade. Contact shadow is the shadow map plus a cavity term.

## Round 2 — Sierra poster

The world is one painted palette: dry-grass gold, pine green, sunbaked dirt, creek teal, warm dust in the distance. Photo ground maps and the Quaternius albedo maps are no longer what you see. Cabins, shop counters, a camp sluice, and mine headframes replace the box shells. Grass and water sample the shadow map. The creek has a raised lip, foam, a sky reflection, and caustics. The prospector has a built face, a dig clip, a pan clip, and tools in hand. Light shafts, valley mist, and dust or fireflies fill the air. Terrain is sixteen frustum-culled chunks. The pause menu has Low / Medium / High / Ultra, auto-detected, stored in localStorage (not the save).

Still weak, on purpose until a later pass: the buildings are procedural timber, not a scanned set. Water reflection is a fresnel tint, not a grab of the scene. There is no SSAO. Dig and pan are authored keyframe poses. Trees are culled by distance, not a mesh LOD chain. The quality preset does not respawn scatter that was already placed.

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
