# Them Hills — v0 Implementation Plan

**Companion to:** `prd-v0.md`
**Last updated:** 2026-05-05
**Audience:** Implementer (single-developer assumption; scales down with help)

---

## How to Read This Plan

Each phase is a **vertical slice**: it ends with something playable and demoable, not a half-built system. The order is dependency-driven — earlier phases unblock later ones, and no phase requires backtracking through prior code.

Effort estimates use **T-shirt sizes** (S = ~1–2 weeks solo, M = ~2–4 weeks solo, L = ~6–10 weeks solo). For a single developer doing this evenings/weekends, multiply by ~2x. Total v0 estimate: **6–10 months of focused full-time work, or 12–18 months part-time.**

Each phase has:
- **Goal** — what this phase delivers
- **Tasks** — work chunks
- **Demo state** — the playable thing at end of phase
- **Exit criteria** — gates before moving on
- **Risks** — what could derail this phase specifically

---

## Phase 0 — Foundations *(S)*

**Goal:** Project bootstrapped, deployable, with the load-bearing systems stubbed in. Nothing is "fun" yet; everything is in place to start being fun.

### Tasks
- Repo setup: Vite + TypeScript + ESLint + Prettier
- Folder structure: `/src/{engine,game,ui,assets,state,save,input,audio}`
- Three.js scene with a single rotating cube (sanity check)
- State store: Zustand store with typed slices (`player`, `world`, `inventory`, `quests`, `economy`)
- Save system stub: IndexedDB via `idb-keyval`, versioned save schema (`{ version: 1, ...payload }`), migration runner that's a no-op for now but exists as a contract
- Input manager skeleton:
  - Keyboard/mouse event handlers
  - `navigator.getGamepads()` polling at 60 Hz
  - Detect Xbox vs. DualShock by `gamepad.id` string
  - Action map: bind raw inputs to abstract actions (`MOVE_X`, `INTERACT`, etc.)
- Deploy pipeline: GitHub repo + Vercel/Netlify preview branches on every push
- README with run/build/deploy instructions
- License/credits scaffolding (`LICENSES.md`)

### Demo state
A page loads, shows a cube, gamepad detection logs work in console, save/load round-trips a dummy `{ playerName: "Sean" }` payload across reloads.

### Exit criteria
- [ ] `npm run dev` works on a clean clone
- [ ] Production build deploys to a public URL
- [ ] Save round-trip verified across browser sessions
- [ ] At least one Xbox and one DualShock controller detected with correct glyphs

### Risks
- Over-engineering the state store before knowing real usage patterns. Stay lean — Zustand slices are easy to refactor.

---

## Phase 1 — Player & Camera Vertical Slice *(M)*

**Goal:** A character you actually want to walk around in. This phase is about *feel* — if movement isn't fun here, no amount of gold panning later will save it.

### Tasks
- Integrate Rapier (`@dimforge/rapier3d-compat`) — load WASM, set up world, fixed timestep
- Test heightmap terrain (~200m × 200m, placeholder textures)
- Character controller:
  - Capsule collider
  - Walk, sprint, jump, slope handling
  - Stamina meter (drains on sprint, regens at rest)
- Third-person camera:
  - Spring-arm rig with collision
  - Mouse look (pointer-locked) + right-stick look (gamepad)
  - Tunable sensitivity, deadzones, invert-Y
- Character model & rig (placeholder, e.g., Mixamo or Quaternius freebie)
- Animation state machine: idle / walk / run / jump / land
- Footstep SFX hook (placeholder sound, surface-aware later)

### Demo state
You spawn on a small terrain box, walk and run with KB/M or gamepad, the camera tracks well, sprint drains stamina.

### Exit criteria
- [ ] Movement feels responsive (subjective — playtest with at least 2 people on each input method)
- [ ] No camera clipping into terrain
- [ ] Stamina drain/regen tuned to feel meaningful but not punishing
- [ ] 60 FPS on target hardware

### Risks
- Character controller "feel" is famously hard; budget extra time. Consider Rapier's built-in `KinematicCharacterController` rather than rolling your own.
- Animation rigging can rabbit-hole. Use a free Mixamo character as placeholder; replace later.

---

## Phase 2 — Core Loop Prototype *(M)*

**Goal:** One panning site, all four steps work end-to-end. This is the moment the game becomes a *game*.

### Tasks
- One stream geometry with stylized water shader (custom GLSL: scrolling normals, painted-edge foam, translucent depth)
- Interaction system: contextual prompt UI ("Press E / X / Square to dig"), raycast detection
- Four-step interaction sequence:
  1. **Dig** — hold-button progress bar, plays shovel anim, produces "paydirt" item
  2. **Classify** — button-mash mini-interaction (or simple timed press), filters paydirt → fine sediment
  3. **Pan** — timed-press rhythm (3–4 successive presses on a beat, tunable difficulty), reveals gold
  4. **Collect** — instant button press to add gold to inventory
- Inventory data model: gold by quality tier (flake/picker/nugget), each as gram totals
- Single hardcoded Tier 1 toolset (pan, trowel, sieve, snuffer)
- Gold spawn algorithm:
  - Seeded RNG keyed on `(siteId, playerActionCount)` for reproducibility
  - Weighted distribution by stream richness profile
  - Sites have a finite "richness pool" that depletes and slowly regenerates over game-time
- HUD: inventory readout, current action prompt

### Demo state
Walk to the test stream, perform the full prospect cycle, watch gold accumulate. Repeat at the same site and see depletion. Move 50m up the stream and find a fresh spot.

### Exit criteria
- [ ] Full cycle completable in <2 minutes for a new player
- [ ] At least one piece of gold appears within the first 3 attempts (player's first-ever try is rigged to succeed)
- [ ] Site richness depletion behaves as designed
- [ ] All four steps work on KB/M and gamepad

### Risks
- "Pan" mini-interaction is the most-likely-to-feel-bad step. Prototype 2–3 variations and pick by feel before committing.
- Don't over-engineer the gold spawn algorithm yet — a simple weighted-table is fine for v0.

---

## Phase 3 — Economy & Persistence *(M)*

**Goal:** Sell what you find, see your wallet grow, real-world gold prices in the HUD, progress survives a reload.

### Tasks
- Vendor NPC stub (silent shopkeep model, interact prompt, transaction UI)
- Sell flow:
  - Vendor UI shows current spot, vendor multiplier, gross/net payout
  - Sell-all and sell-by-quality options
  - Animated cash transfer
- Spot price service:
  - HTTP fetch on session start (final endpoint chosen during this phase — candidates: `metals.live`, CoinGecko PAXG, or ship a small CDN-hosted JSON proxy)
  - 15-minute refresh interval
  - Fallback to cached value, then baseline ($2,500/ozt)
  - HUD spot widget with trend arrow
- Wallet system, persisted in save
- Save schema fleshed out:
  - `player` (position, stats, equipped tools)
  - `inventory` (gold by quality, items)
  - `wallet` ($)
  - `world` (clock, weather, season — stubs OK if those systems aren't built yet)
  - `economy` (last spot price, last fetch timestamp)
- Save versioning + migration runner (real this time)
- Autosave on: sale, level-up, sleep, every 60s

### Demo state
Prospect → return to vendor → sell → see wallet grow → reload page → wallet still there. HUD shows live spot price.

### Exit criteria
- [ ] Spot fetch works in production deploy (not just localhost)
- [ ] Graceful offline behavior (no errors, just stale price)
- [ ] Save migration runner has a test case (write v1, simulate reading as v2, migrate)
- [ ] Wallet/inventory/spot all persist across reloads

### Risks
- CORS issues with the spot price API. Test in production-like environment early. If no good free CORS endpoint exists, host a small static JSON file on the deployer's CDN that's manually updated — degraded but viable for v0.

---

## Phase 4 — Equipment Progression *(M)*

**Goal:** Earn → upgrade → notice the upgrade → keep going. The dopamine engine.

### Tasks
- Equipment data model: 8 categories × 3 tiers, each with stats (`speed_mult`, `yield_mult`, `unlock_flags`, `detection_radius`, etc.)
- General Store UI:
  - Browse all categories
  - See current tier, next tier stats, cost, prerequisites
  - Locked tiers shown grayed with unlock condition
  - Comparison tooltip (current vs. next)
- Equipment effects wired into gameplay:
  - Pan tier: capture rate + yield
  - Shovel tier: dig speed + new ground types unlocked (Tier 3 pickaxe enables hard-pack sites)
  - Classifier tier: fewer wasted pans + better gold-quality concentration
  - Sluice tier: passive yield over time while placed in flowing water
  - Detector tier: pings near sites; higher tier = larger radius + richness preview
  - Dredge tier: highest yield but quest-gated and noisy (NPC reactions later)
  - Snuffer tier: stash capacity (forces sell trips at low tiers, removes friction at high)
  - Personal gear tier: stamina pool, carry weight, stream-mid-access (waders), mine access (headlamp)
- Inventory/equip menu UI (Tab / View / Touchpad)
- Save schema extended for owned tiers per category

### Demo state
Walk to General Store, browse upgrades, buy a Tier 2 pan, return to stream, see noticeably better yield. Save, reload, equipment still owned.

### Exit criteria
- [ ] All 24 tiers (8 × 3) defined with concrete stat numbers (subject to balance)
- [ ] Each tier upgrade produces a measurable, observable difference in gameplay
- [ ] At least one upgrade gates a new physical area (pickaxe → hard-pack site, waders → mid-stream, headlamp → mine)
- [ ] Buy flow, equip flow, and persistence all work end-to-end

### Risks
- Balance hell. Don't try to perfect numbers in this phase — get them roughly defensible, then balance during Phase 9 polish. Build a spreadsheet model now to enable later tuning without code changes.

---

## Phase 5 — World Build-out *(L)*

**Goal:** The real map. The single biggest phase — and the one most likely to slip. Plan for it.

### Tasks

**Terrain & geography**
- Hand-author terrain (~1–2 km²): foothills → forest → high-country gradient
- 5 named streams with distinct character (see PRD Appendix B)
- Terrain texturing in painterly style (low-res hand-painted texture atlases per biome)
- Ambient props: rocks, fallen logs, fences, signs
- Vegetation: billboard cards for distance + low-poly clusters near player

**Panning sites**
- 100+ panning sites (20+ per stream)
- Each site has: position, richness profile, quality bias, depletion timer, optional "hidden" flag
- Markers for discovered sites; subtle environmental tells (gravel patches, exposed bedrock) for undiscovered

**Town**
- Layout: main square with General Store, Assayer, Tourist Pawn Shop, Inn (sleep)
- Outskirts: Camp (player rest point + storage vault for held gold)
- 4+ named NPC placement spots (interactions wired in Phase 8)

**Mines & hidden claims**
- 3 abandoned mines (interior cave systems, simple tunnel layouts, headlamp required)
- 5 hidden claims (require detector pings or quest hints)

**Map UI**
- Pause map (M / Touchpad-hold) with discovered streams, sites, town, camp, mines
- Player position + facing
- No fast-travel in v0; sleep at camp/inn advances time but not position

### Demo state
You can walk the entire map, find every stream, every panning site, all three mines. Town has interactable building doors (some are still placeholders).

### Exit criteria
- [ ] Full map traversable on foot in ~10 min (medium walking pace)
- [ ] All 100+ sites populated and prospectable
- [ ] No level geometry holes or fall-through-world bugs
- [ ] 60 FPS sustained across all regions

### Risks
- **Asset bottleneck.** This is the phase where solo devs die. Mitigate with: a 2–4 week asset-sourcing sprint *before* starting Phase 5; modular kit-bashing (assemble props from a small library); leaning hard on stylization to forgive imperfect models.
- **Scope creep.** It's tempting to add a 6th stream "while you're in there." Don't. Lock the scope here.

---

## Phase 6 — Atmospheric Systems *(M)*

**Goal:** The world feels alive. Music, weather, time, ambience all working together.

### Tasks
- Game clock service (configurable: default 1 real min = 1 game hour)
- 4 seasons (Spring/Summer/Fall/Winter) advancing on sleep cycles, ~7 game-days per season
- Season-gated content: Granite Fork closed in Winter, certain hidden claims spring-only
- Weather state machine:
  - States: Clear, Overcast, Rain, Fog, Snow (Winter only)
  - Random transitions every 10–30 game-minutes (configurable)
  - Each state has visual + gameplay effects (rain raises stream level + flake redistribution; fog reduces detector effectiveness; snow blocks high-country)
- Skybox: gradient shader with per-region + per-weather palette presets
- Particle systems: rain, snow, fog volumes
- Audio system buildout:
  - Howler.js music bus with crossfading between tracks
  - Three.js `PositionalAudio` for streams (volume by proximity), tools (one-shot), NPC barks (later)
  - Ambient layer: birds, wind in trees, distant water
  - Music: 4–6 fingerpicked guitar tracks, cross-faded by region/time/weather (commission early — see PRD asset pipeline)

### Demo state
Sit in one spot for a real-time minute. Watch the clock advance, weather shift, music breathe between tracks. Sleep to skip a day; season eventually changes; one stream becomes inaccessible due to snow.

### Exit criteria
- [ ] Each weather state visibly changes the world
- [ ] Each season visibly changes the world
- [ ] Music never abruptly cuts (always crossfaded)
- [ ] Audio mixing tested on speakers and headphones; nothing clips

### Risks
- Custom guitar music commissioning has a long lead time. Start that procurement at the *beginning* of Phase 5, not Phase 6, so it's ready when you need it.
- Particle systems can tank perf. Test on minimum-spec hardware.

---

## Phase 7 — Survival Layer *(S)*

**Goal:** Stamina/Hunger/Thirst meters that gate session length without ever killing the player.

### Tasks
- Three meters (already have stamina from Phase 1; add hunger/thirst)
- Drain rates:
  - Stamina drains on sprint, dig, pan; regens at rest
  - Hunger drains slowly with game-time
  - Thirst drains slightly faster than hunger
- Restoration:
  - Drink from any stream: instant, free, restores thirst fully
  - Eat food (purchased/foraged inventory items): restores hunger by amount
  - Sleep at camp/inn: full restore + advances clock 6 game-hours
- Effects when meters bottom out: tool action speeds and yields drop 50%; no death
- HUD widgets for all three meters
- Forage points scattered in world (berries, mushrooms — flavor + cheap food source)
- Inn meal purchase ($X for full hunger restore)

### Demo state
Spend a long uninterrupted prospect session. Meters drain. Eat berries to keep going. Eventually return to camp to sleep.

### Exit criteria
- [ ] Meters never reach zero in a "normal" 60–90 min session if player drinks/eats reasonably
- [ ] Sleep loop works (clock advances, season can advance, full restore)
- [ ] No way to die or lose progress

### Risks
- Tuning drain rates is finicky. Build them as JSON config at the start so playtesting can adjust without code changes.

---

## Phase 8 — NPCs & Quests *(M)*

**Goal:** Town feels populated, world has handcrafted goals beyond grinding.

### Tasks
- NPC system: placement, idle anims (loop), interact prompt, name/dialog data binding
- Dialogue UI: text panels with branching choices, fully readable on KB/M and gamepad, no voice
- Quest system:
  - Quest data model: id, giver, objectives, progress state, rewards, prerequisites
  - Objective types: visit-location, deliver-item, gather-X-grams-of-gold, find-item-in-mine, sell-X-dollars-worth-to-vendor
  - Quest log UI (pause menu)
  - Quest tracker HUD (current objective subtle banner)
- 4 named NPCs with personality:
  - The Assayer (knowledgeable, terse — gives "deliver X grams" quests)
  - The Innkeeper (warm, gossip — gives delivery quests between NPCs)
  - The Old Prospector (lives at camp, leaves notes — also tutorial-adjacent; gives "find lost equipment in mine" quest, reveals hidden claim)
  - The Drifter (rotates between locations — gives map-reveal quests for hidden claims)
- 6+ quests authored (see types above)
- Save schema extended for quest progress

### Demo state
Walk into town, talk to all four NPCs, accept quests, complete them, turn in for rewards. Quest reveals one of the hidden claims on the map.

### Exit criteria
- [ ] All 6 quests playable end-to-end
- [ ] Dialogue UI works on KB/M and gamepad
- [ ] At least one quest gates a hidden claim
- [ ] Quest log persists across sessions

### Risks
- Writing personality into 4 distinct NPCs is more work than expected. Budget time for a writing pass. If undermanned, focus on the Old Prospector (tutorial-relevant) and Assayer (economy-relevant) first.

---

## Phase 9 — Polish, Performance & Tutorial *(M)*

**Goal:** The product is feature-complete; now it has to feel *good*.

### Tasks

**Tutorial polish**
- Spawn at Camp with a handwritten note explaining the basics (4 steps, vendors, sleep)
- Tutorial stream just outside camp, generously seeded
- Subtle on-screen prompts the first time the player encounters a new mechanic
- Skippable for returning players (detected via save)

**Settings menu**
- Graphics: quality preset (Low/Med/High/Ultra), draw distance, shadow quality, particle density
- Audio: master / music / SFX / ambient sliders
- Controls: rebinding for KB/M and gamepad, sensitivity, deadzone, invert-Y

**Input parity QA**
- Full playthrough on each input method (KB/M, Xbox, DualShock)
- Glyph swap verified
- Menu navigation works fully on gamepad (no mouse fallback required)

**Performance pass**
- LOD setup for vegetation and distant geometry
- Instanced meshes for grass/rocks
- Texture compression (KTX2)
- Geometry compression (Draco)
- Frustum culling tuning
- Occlusion culling for town buildings/mines
- Profile on minimum-spec hardware

**Accessibility (light pass)**
- Subtitle/text size option
- High-contrast HUD toggle
- Colorblind-friendly meter colors

**Bug bash & save migration verification**
- Run the v0 save through a simulated v0→v1 schema migration to prove the runner works
- Edge cases: full inventory, empty wallet, all tools maxed, mid-quest reload

### Demo state
Game is shippable. New player downloads, opens link, plays through tutorial, gets first piece of gold, returns next day to find their save intact.

### Exit criteria
- [ ] 60 FPS at 1080p on target hardware (M1 Air / GTX 1660)
- [ ] Initial load <15s on 50 Mbps connection
- [ ] All 6+ quests, 8 tool categories, 5 streams, all weather states, all seasons exercised in QA
- [ ] No P0/P1 bugs in the bug tracker

### Risks
- Polish is infinitely deep. Set a hard cap on this phase or v0 ships in 2028. Two-week timebox per polish pass.

---

## Phase 10 — Beta & Launch *(S)*

**Goal:** External eyes. Balance. Ship.

### Tasks
- Closed beta (5–10 playtesters, friends + community)
- Collect feedback via in-game form or external survey
- Economy balance pass based on telemetry:
  - Are upgrade costs hitting the target session counts?
  - Is one stream over/underfunded?
  - Are weather effects appreciable?
- Final asset pass (replace remaining placeholders)
- LICENSES.md complete and audited
- Privacy notice (lightweight — v0 has no data collection beyond local save)
- Public deploy
- Postmortem doc: what went well, what to change for v1

### Demo state
Game is publicly playable at a URL.

### Exit criteria
- [ ] At least 5 external playtesters completed a full session
- [ ] No P0/P1 bugs from beta
- [ ] Public URL live, with a landing page explaining what the game is and how to play

---

## Cross-Cutting Concerns (Run Continuously)

Some work isn't a phase — it runs throughout:

- **Asset sourcing & creation**: Start Phase 5 prep during Phase 2. Music commissioning starts during Phase 5. Don't wait until you need an asset to look for it.
- **Save schema discipline**: Every phase that adds state extends the save schema. Bump version, write a migration, test it. Skipping this once = pain forever.
- **Input parity**: Every new UI screen and interaction must work on KB/M and gamepad before merge. Don't defer this — retrofitting gamepad support is 3x harder than building it in.
- **Performance budgeting**: Profile at the end of every phase. A 2 ms regression now is a 20 ms regression by Phase 9.
- **Documentation**: Keep a `CHANGELOG.md` and a running `decisions-log.md` for non-obvious choices. Future-you will thank present-you.

---

## Dependency Graph (visual)

```
Phase 0 (Foundations)
  ↓
Phase 1 (Player & Camera)
  ↓
Phase 2 (Core Loop) ──→ Phase 4 (Equipment Progression)
  ↓                          ↓
Phase 3 (Economy)             ↓
  ↓                          ↓
  └──────────→ Phase 5 (World Build-out)
                    ↓
              Phase 6 (Atmospheric Systems)
                    ↓
              Phase 7 (Survival Layer)
                    ↓
              Phase 8 (NPCs & Quests)
                    ↓
              Phase 9 (Polish & Performance)
                    ↓
              Phase 10 (Beta & Launch)
```

Phases 6, 7, 8 can partially overlap if the dev has bandwidth; the rest are strictly sequential.

---

## Why This Order Yields the Highest-Quality MVP

1. **Feel first, content later.** Phase 1 nails movement before there's anything to do. A player will forgive bare content with great feel; the inverse is fatal.
2. **Vertical slice loop in Phase 2.** Proves the central fantasy works *before* investing in scale. If panning doesn't feel good with one stream, it won't feel good with 100 sites.
3. **Economy & persistence in Phase 3, before progression in Phase 4.** You need a wallet before you can buy upgrades; you need saves before progression matters across sessions. Skipping this order would cause rework.
4. **World build-out is the longest phase, deliberately placed in the middle.** All systems it depends on are in place; later atmospheric layers paint over a working foundation.
5. **Survival and NPCs come after the world exists** because they need places to live. Building NPCs before the town would mean placeholder-everywhere.
6. **Polish is the second-to-last phase, not interleaved.** Polishing systems that might be cut is wasted effort. Polish what's known to ship.
7. **Beta is dedicated, not implicit.** External feedback at the end catches issues that single-dev tunnel vision misses.
