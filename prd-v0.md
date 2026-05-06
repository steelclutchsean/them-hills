# Them Hills — PRD v0

**Game name:** *Them Hills*
**Document version:** v0 (MVP scope)
**Last updated:** 2026-05-06
**Owner:** Sean

**Companion documents:**
- `implementation-plan-v0.md` — 11-phase build sequence with demo states and exit criteria.
- `milestones-v0.md` — 6 external-value milestones (M0–M6) tracked by phases complete. M2 is the go/no-go checkpoint.
- `economy-model.md` — sanity check + tunable spreadsheet model for the gold economy.
- `save-schema-v1.md` — versioned save schema with migration runner contract.

---

## 1. Executive Summary

### Problem Statement
There is no accessible, modern, browser-playable 3D RPG that authentically captures the craft of modern-day recreational gold prospecting. Existing prospecting games are either dated 2D simulators or stylized arcade titles that strip out the satisfying step-by-step process of finding, working, and selling real gold from a stream.

### Proposed Solution
A 3D, third-person RPG/sim built in vanilla Three.js, set in present-day California gold country. The player explores a single open-world map (~1–2 km², mixed terrain), prospects 5 distinct freshwater streams across 100+ panning sites, and progresses through 8 categories of equipment (3 tiers each) by selling gold to in-game vendors. The core loop is a hybrid arcade-leaning interpretation of the authentic four-step prospecting process (shovel → classify → pan → collect), with weather, seasons, and light survival mechanics layered on top.

### Success Criteria (KPIs)
1. **Loop completion**: ≥ 90% of new players complete their first full prospect cycle (locate → dig → classify → pan → sell) within 15 minutes of starting.
2. **Session length**: median session length is 60–120 minutes (target medium-sim cadence).
3. **Retention**: ≥ 40% of players return for a second session within 7 days (proves persistence/upgrade loop is rewarding).
4. **Progression depth**: ≥ 25% of players reach Tier 2 in at least one tool category within 5 sessions.
5. **Performance**: maintain ≥ 60 FPS at 1080p on a mid-range 2022 laptop (e.g., M1 MacBook Air, GTX 1660-class GPU) with full draw distance.
6. **Input parity**: 100% of player actions are bindable to and equivalent on keyboard/mouse, Xbox-compatible gamepad, and DualShock (PS4/PS5) gamepad.

---

## 2. User Experience & Functionality

### User Personas

- **The Cozy Sim Player** — plays Stardew Valley, Power Wash Simulator, House Flipper. Wants a relaxing, progression-driven loop with no failure states. Plays in 1–2 hour evening sessions.
- **The Prospecting Enthusiast** — has watched *Gold Rush*, follows YouTube channels like Pioneer Pauly or Dan Hurd, may have actually panned recreationally. Wants authentic terminology, equipment, and process — will notice if a sluice box runs in still water.
- **The Browser Gamer** — discovers the game via a link, expects to be playing within 30 seconds of page load. Will bounce if the loading screen takes too long or input feels off.

### User Stories & Acceptance Criteria

#### Story 1: First-time prospect
> *As a new player, I want to find my first piece of gold within 10 minutes of starting, so that the loop hooks me before I lose interest.*

**Acceptance Criteria:**
- A guided "first claim" tutorial stream is visible from spawn.
- Tutorial prompts walk the player through all four steps (dig → classify → pan → collect) using the basic Tier 1 toolkit.
- Tutorial yields at least one visible flake of gold in ≤ 3 pan attempts.
- Tutorial can be skipped by returning players (detected via save state).

#### Story 2: Equipment upgrade loop
> *As a player who has sold some gold, I want to upgrade my pan from Tier 1 plastic to Tier 2 steel, so that I feel my prospecting effort is making me more efficient.*

**Acceptance Criteria:**
- The town's general store displays all 8 tool categories with current owned tier highlighted.
- Locked tiers display required gold cost and any prerequisite (e.g., "requires Tier 1 detector").
- Purchasing an upgrade is reflected in the player's gameplay within one session (faster pan animation, larger yield, etc.).
- Upgrade effects are observable: a visible stat tooltip shows before/after numerics (e.g., "Pan speed: 8s → 6s, Capture rate: 70% → 85%").

#### Story 3: Persistent progression
> *As a returning player, I want my saved progress (gold balance, owned tools, discovered claims, quest progress, world clock) to load automatically, so that I can pick up exactly where I left off.*

**Acceptance Criteria:**
- On page load, the game detects an existing save in IndexedDB and loads it within 2 seconds.
- Save autoinstalls every 60 seconds and on every major state transition (sale, upgrade, quest progress, sleep).
- A manual "Save & Quit" button is available in the pause menu.
- If save data is corrupt or missing, the game falls back to a "New Game" flow without crashing.

#### Story 4: Stream-by-stream exploration
> *As a player, I want to discover and claim panning spots across 5 distinct streams, so that the world feels rich and rewards exploration.*

**Acceptance Criteria:**
- 5 named streams exist on the map, each with 20+ marked or hidden panning spots (≥ 100 total).
- Each stream has a distinct visual character (high alpine creek, oak woodland river, deep canyon, etc.) and yields a slightly different gold profile (fine flakes vs. coarse, frequency, max nugget size).
- A discovered claim is marked on the player's map and persists across sessions.
- Hidden claims can only be revealed via tools (e.g., Tier 2 detector pings) or quest hints from NPCs.

#### Story 5: Quest-driven NPC interaction
> *As a player, I want to accept and complete quests from town NPCs, so that the world feels populated and I have goals beyond pure grinding.*

**Acceptance Criteria:**
- v0 ships with at least 6 quests across 4+ named NPCs.
- Quest types include: locate-a-claim (delivery to coordinates), bring-X-grams-of-gold (fetch), find-lost-equipment-in-mine (exploration), and deliver-item (between NPCs).
- Quest log is accessible from the pause menu and persists in save state.
- Quest rewards include gold, unique upgrades, or map reveals (hidden claims).

#### Story 6: Input parity
> *As a player using a DualShock controller, I want every action available on keyboard/mouse to also be bindable and intuitive on my gamepad, so that I can play how I prefer.*

**Acceptance Criteria:**
- Game detects connected gamepad via the Gamepad API and switches HUD prompts dynamically (Xbox vs. PlayStation glyphs).
- All movement, camera, action prompts, menu navigation, and panning interactions work on gamepad with no keyboard required.
- Input rebinding UI exposes both keyboard and gamepad bindings.
- Stick deadzones and sensitivity are configurable.

#### Story 7: Atmospheric world
> *As a player, I want weather and seasons to affect my prospecting, so that the world feels alive and gives me reasons to revisit familiar streams.*

**Acceptance Criteria:**
- Weather changes at random intervals (10–30 game-minute cadence, configurable). Types: clear, overcast, rain, fog, snow (winter only).
- Rain raises stream water level slightly and increases gold-flake redistribution at affected sites (gameplay impact).
- Each season (Spring/Summer/Fall/Winter) gates 1+ stream or 1+ region (e.g., high-country streams snowed in during Winter, spring runoff opens new spots).
- Weather and season are visible in the HUD and persist in save.

#### Story 8: Survival without failure
> *As a player, I want food, drink, and rest to gate how long I can prospect efficiently, but I never want to die or lose progress.*

**Acceptance Criteria:**
- Three meters: Stamina (drains from digging/panning), Hunger, Thirst.
- When any meter reaches zero, the player's tool actions become 50%+ slower and yield drops sharply, but the player never dies.
- Restoration: drink from any stream (free, instant), eat purchased/foraged food, sleep at camp/town inn (full restore + advances clock by 6 in-game hours).
- No combat, no fall damage, no environmental death states.

### Non-Goals (v0)

- **Multiplayer / co-op**: single-player only.
- **Combat**: no fighting NPCs, wildlife, or rival prospectors.
- **Player death**: no fail states beyond reduced efficiency.
- **Vehicle traversal**: walking only in v0 (ATVs/horses deferred).
- **Procedurally generated maps**: one hand-authored map only.
- **Mobile/touch support**: deferred.
- **VR support**: deferred.
- **Modding/user-generated claims**: deferred.
- **Cloud save & accounts**: planned for v1.x (local IndexedDB only in v0).
- **Real-money transactions / cosmetic store**: not in v0.
- **Character customization beyond preset**: deferred.
- **Suction dredging realism debate**: included as a Tier 3 unlock with an in-game "permit" gate to acknowledge real-world legal constraints, but no full simulation.

---

## 3. AI System Requirements

**Not applicable to v0.**

v0 contains no LLM-driven NPCs, no ML-driven gold-spawn algorithms, and no AI-generated runtime content. NPC dialogue is hand-written. Gold spawning uses deterministic seeded randomness keyed off site IDs and player actions.

*Note: AI tools (Stable Diffusion, Tripo3D, Meshy, ElevenLabs) may be used during the asset-creation pipeline, but no AI is invoked at runtime.*

---

## 4. Technical Specifications

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (v0 target)                   │
│                                                          │
│  ┌──────────────────┐   ┌──────────────────────────┐   │
│  │   UI / HUD       │   │   Three.js Scene Graph   │   │
│  │   (DOM + CSS)    │◄─►│   - World, terrain, water│   │
│  │   - Menus        │   │   - Character (3rd person)│   │
│  │   - Inventory    │   │   - NPCs, props, FX       │   │
│  │   - Quest log    │   │   - Cameras, lights       │   │
│  └──────────────────┘   └──────────────────────────┘   │
│           ▲                       ▲                     │
│           │                       │                     │
│  ┌────────┴───────────────────────┴──────────────────┐ │
│  │          Game State Manager (single store)        │ │
│  │  - Player (position, inventory, stats, tools)     │ │
│  │  - World (clock, weather, season, claims)         │ │
│  │  - Quests, NPCs, economy                          │ │
│  └───────────────────────────────────────────────────┘ │
│           ▲           ▲           ▲           ▲         │
│           │           │           │           │         │
│  ┌────────┴──┐ ┌──────┴───┐ ┌────┴─────┐ ┌──┴──────┐  │
│  │  Input    │ │ Physics  │ │  Audio   │ │  Save   │  │
│  │  Manager  │ │ (Rapier) │ │ (Howler+ │ │ (Idx-   │  │
│  │  - KB/M   │ │          │ │  Three   │ │  edDB)  │  │
│  │  - Pad API│ │          │ │  PosAud) │ │         │  │
│  └───────────┘ └──────────┘ └──────────┘ └─────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Tech Stack

| Concern | Choice | Reason |
|---|---|---|
| **Renderer** | Vanilla Three.js (latest stable) | User preference; full control over the scene graph and shader pipeline. |
| **Build tooling** | Vite | Fast HMR, ES module-first, trivial deployment to any static host. |
| **Language** | TypeScript | Type safety across a state-heavy codebase; catches save-schema regressions early. |
| **Physics** | **Rapier** (`@dimforge/rapier3d-compat`) | WASM-based, high performance, modern API, character-controller built-in. Cannon-es is older with known performance issues at scale; Ammo.js has a heavier API and larger bundle. Rapier is the right "simple but solid" choice. |
| **Audio** | **Howler.js** for UI/2D sounds + **Three.js `PositionalAudio`** for spatial sources | Howler handles cross-browser compatibility and asset loading robustly; Three's PositionalAudio integrates with the scene graph for stream/tool/wildlife ambient SFX. |
| **State** | Custom store + Zustand (lightweight) | Avoid React-only state libs since UI is DOM-driven; Zustand works framework-free. |
| **Persistence (v0)** | IndexedDB via `idb-keyval` | Larger quota than LocalStorage; suitable for binary save blobs and future expansion. |
| **Persistence (v1+)** | Supabase (auth + Postgres for cloud save) | Plan-ahead choice; not built in v0. |
| **HUD/UI** | Plain DOM + CSS, layered over canvas | Faster iteration than canvas-drawn UI; accessible to screen readers if desired later. |
| **Asset format** | glTF 2.0 (`.glb`) for models, Draco-compressed | Three.js native support, smallest payload. |
| **Texture compression** | KTX2 / Basis Universal | GPU-friendly, reduced VRAM and download size. |
| **Hosting (MVP)** | Static host (Vercel / Netlify / Cloudflare Pages) | Browser-only MVP. |

### Data Flow

1. **Input Manager** polls keyboard, mouse, and `navigator.getGamepads()` each frame; emits normalized actions (e.g., `INTERACT`, `MOVE_FORWARD`, `PAN_SHAKE`) to the Game State Manager.
2. **Game State Manager** mutates state in response to actions and a fixed-step game loop (60 Hz).
3. **Three.js scene** reads relevant state each frame to update transforms, animations, and shaders.
4. **Save subsystem** debounces state writes to IndexedDB every 60s and on key events.
5. **Weather/Season subsystem** ticks game-time forward (configurable scale, default ~1 real minute = 1 game hour) and emits state changes to renderer (skybox, particles, fog) and gameplay (stream-level multipliers, season gates).

### Integration Points

- **Gamepad API**: native browser support; auto-detect connect/disconnect, glyph swap (Xbox/PlayStation).
- **Pointer Lock API**: for mouse-look in third-person camera.
- **IndexedDB**: save persistence.
- **WebGL2** (required), with WebGPU as a future-state opt-in.

### Security & Privacy

- v0 is **fully client-side** with no server, no analytics, no cookies, no tracking.
- All save data lives in the player's browser. No PII is collected.
- When cloud save is added (v1.x), explicit opt-in flow + privacy policy required.
- No third-party SDKs at runtime.

### Asset Pipeline

User has indicated they need assistance choosing/creating assets. Tuned to the selected **Firewatch Painterly** style:

1. **Source stylized CC0 base assets** from Quaternius (low-poly nature packs), Kenney.nl (props/UI), Poly Pizza, and Sketchfab (CC0 filter). Skip Quixel Megascans — its photoreal materials fight the painted style.
2. **Custom shader work** is critical for the look:
   - **Toon/posterized lighting shader** for the character and key props (2–3 light bands).
   - **Stylized water shader** with painted-edge foam and animated normal noise.
   - **Vegetation wind shader** with subtle billboard sway.
   - **Skybox gradient shader** with per-region color presets (golden foothill, alpine cool, canyon dusk).
3. **Texturing**: hand-painted texture maps (low-resolution, 256–512px) over low-poly geometry. AI-generate base textures with Stable Diffusion using painterly LoRAs, then hand-tweak in Krita/Photoshop.
4. **Vegetation**: billboard cards for distant trees, low-poly clusters for mid-distance, slightly more detailed for hero trees near the player.
5. **Audio sourcing**: Freesound.org (CC-licensed) for nature ambience and tool SFX. Original guitar music recorded directly (or commissioned from a fingerpicking guitarist on Fiverr/SoundBetter — typical cost $200–800 for a 30-min loop set).
6. **Asset budget per scene**: target < 50 MB initial download (the painterly style allows lower texture resolution), streaming additional regions on demand.

### Performance Targets

- 60 FPS at 1080p on mid-range 2022 hardware.
- Initial load: < 15 seconds on a 50 Mbps connection.
- Frame budget: < 16 ms; scene draw call count < 200; triangle count < 1.5M visible.
- LOD for vegetation; instanced meshes for grass/rocks; baked lighting for static geometry; only character + key NPCs receive real-time shadows.

---

## 5. Gold Economy & Spot Price Integration

### Design Principle
The in-game economy is anchored to **real-world gold spot prices**, fetched live during play. Players sell raw placer gold to vendors who pay a percentage of the current spot price — so the game's earning curve breathes with real-world market conditions. This is a defining authenticity feature: a player who sits down to play during a real gold rally finds their stash worth more than yesterday.

### Core Units & Conversions

| Quantity | Value |
|---|---|
| 1 troy ounce (ozt) | 31.1035 grams |
| Display unit (in-game) | grams (g) for amounts < 1 ozt; ozt for larger |
| Spot reference | XAU/USD (gold per troy ounce in US dollars) |
| Refresh cadence | Every 15 real-time minutes during a session |
| Fallback baseline | $2,500/ozt (used if API fails — configurable) |
| API source (v0) | A free CORS-enabled endpoint (e.g. `metals.live`, CoinGecko PAXG which tracks spot, or a small static JSON proxy on the deployer's CDN) — finalized in implementation phase |
| API source (v1+) | Server-side proxy (Supabase edge function) to hide keys and centralize caching |

### Gold Quality Tiers

Real placer gold isn't homogeneous. v0 models three quality tiers found at panning sites:

| Quality | Description | Vendor pays | Notes |
|---|---|---|---|
| **Flake** | Small flat pieces, < 0.1g each | Standard rate | Most common find |
| **Picker** | Larger flakes, ~0.1–1g, can be picked up with fingers | +10% premium over flake rate | Modestly rare |
| **Nugget** | Solid pieces > 1g | +25% premium, occasionally sold to collectors at +50% | Rare; biggest in alpine streams |

Stream richness profiles modulate quality drop rates (e.g., Granite Fork has the highest nugget chance; Coyote Creek favors flake yield for tutorial generosity).

### Vendor Payouts (% of current spot)

Real dealers pay below spot to cover refining, purity gaps, and margin. Game models this with three vendors:

| Vendor | Location | Flake | Picker | Nugget | Unlock |
|---|---|---|---|---|---|
| **Tourist Pawn Shop** | Town center | 60% | 65% | 70% | Available from start |
| **Town Assayer** | Town (off main square) | 85% | 92% | 100% | Available from start |
| **Online Buyer** (mail-in) | Camp mailbox | 90% | 95% | 105% | Tier 2 personal-gear unlock; pays 24 in-game hours after deposit |
| **Collector** (rare event) | Travels to town randomly | — | — | 120–150% (specimen-grade nuggets only) | Random NPC visit, weather-gated |

The Tourist Pawn Shop is intentionally a "noob trap" — fast cash but bad rate. The Assayer is the default path. Online Buyer rewards patience. The Collector is a rare delight.

### Yield-Multiplier Model (canonical)

Active prospecting yield (g/hr) is computed as:

```
yield_g_per_hour = base_yield(site_tier) × geometric_mean(tool_mults)
                 + sluice_passive_yield (if deployed at flowing-water site)
                 + dredge_active_bonus  (if actively dredging)
```

`tool_mults` is the multiplier set for the five tools that affect active prospecting: **pan, shovel, classifier, detector, gear**. Sluice and dredge contribute additively (not via the geometric mean) because they're alternative/parallel work modes. Snuffer is a quality-of-life capacity tool and does not affect yield.

#### Tier Multipliers (per tool)

| Tier | Multiplier |
|---|---|
| 1 | 1.00 |
| 2 | 1.45 |
| 3 | 1.95 |

#### Site Access Tiers (gear-gated)

| Site Tier | Base Yield (g/hr) | Unlock |
|---|---|---|
| Easy | 0.80 | Available from start (Gear T1) |
| Mid | 1.40 | Requires Gear T2 (waders + headlamp) |
| Rich | 2.50 | Requires Gear T3 (insulated waders + GPS) |

Site tier is set per panning site by the level designer and captured in the world data — not procedurally assigned.

#### Sluice & Dredge Bonuses (additive)

| Tier | Sluice passive (g/hr) | Dredge active bonus (g/hr) |
|---|---|---|
| 1 | 0.50 | +2.00 |
| 2 | 1.00 | +3.00 |
| 3 | 2.00 | +4.00 |

### Earning Curve Targets

Tuned so the median player progresses through tiers at the medium-sim cadence. Working examples computed from the model above:

| Configuration | Site | Total g/hr | $/hr at Assayer 85% |
|---|---|---|---|
| Starting kit (all T1) | Easy | 0.80 | $54.65 |
| Pan T2 only, rest T1 | Easy | 0.86 | $58.71 |
| All T2, no sluice | Mid | 2.03 | $138.65 |
| All T2 + sluice T2 deployed | Mid | 3.03 | $207.00 |
| All T3, sluice T3, no dredge | Rich | 4.88 | $333.40 |
| Full T3 + dredge T3 + sluice T3 | Rich | 10.88 | $743.21 |

### Upgrade Costs (v0 canonical — tunable per spreadsheet model)

| Tool | T1→T2 | T2→T3 |
|---|---|---|
| Pan | $200 | $800 |
| Shovel | $150 | $700 |
| Classifier | $250 | $900 |
| Sluice Box | $500 | $2,500 (power sluice) |
| Detector | **$600** | $4,500 |
| Dredge | quest-gated unlock + $3,500 | $10,000 |
| Snuffer/Vials | $80 | $400 |
| Personal Gear | $400 | $1,500 |

**Cumulative totals (corrected):**
- All T2 across all 7 active tools (excludes dredge): **$2,180**
- All T3 across the same 7 tools (excludes dredge): **$13,480**
- Full T3 including dredge unlock + dredge T3: **$26,980**

### Pacing Targets (median player at progressive income)

| Milestone | Cumulative Cost | Cumulative Hours | Sessions @ 1.5h | Weeks @ 3 sessions/wk |
|---|---|---|---|---|
| First T2 upgrade (snuffer) | $80 | 1.5 | 1 | <1 |
| First meaningful T2 (pan) | $280 | 5 | 3 | 1 |
| Gear T2 (unlocks Mid sites) | $830 | 14 | 9 | 3 |
| All T2 | $2,180 | 22 | 15 | 5 |
| First T3 (pan T3) | $2,980 | 26 | 17 | 6 |
| All T3 sans dredge | $13,480 | 58 | 39 | 13 |
| Full T3 + dredge | $26,980 | ~85 | ~57 | ~19 |

A casual player playing 3 sessions/week reaches all-T2 in ~5 weeks, all-T3 sans dredge in ~13 weeks, and full kit completion in ~19 weeks (~5 months) — which fits "medium sim" pacing without ever feeling out of reach.

*All numbers above reproduce from `economy-model.md` § Part 2 — paste those tables into Google Sheets to live-tune any of these values.*

### Spot Price as Strategic Layer

Because spot fluctuates, the game introduces an emergent "hold or sell" decision:

- **Sell now**: lock in today's price.
- **Hold**: keep gold in your vault at camp; sell later if price rises. Risk: price could drop.
- **HUD widget**: shows current spot, 24-game-hour trend arrow (▲ ▼), and player's current stash value at current spot.

Spot price advances slightly each in-game day even when offline (smoothed interpolation toward the next real-world fetched value), so a player who sleeps to skip ahead gets some movement — but the only way to see real-world current spot is to be online.

### Acceptance Criteria (Gold Economy)

- Spot price is fetched on game start and refreshed every 15 minutes; cached value persists in save state.
- If the API fails, the game falls back to the cached value (or baseline) with a non-blocking notification ("Live price unavailable — using last known").
- HUD displays current spot, player wallet, and stash value-at-spot.
- Vendor sale UI shows: gross spot value, vendor multiplier, final payout, and a side-by-side comparison of all unlocked vendors before confirming a sale.
- All payouts use the spot price at the moment of the sale.
- Save state stores: wallet ($), stash (gold by quality tier), last cached spot, last spot fetch timestamp.

### Risks Specific to Spot Integration

| Risk | Mitigation |
|---|---|
| API rate limits / outage | Aggressive caching (15 min), graceful fallback to cached/baseline value, never block gameplay on the network. |
| Browser-exposed API keys | v0: use no-key endpoints. v1+: move to server proxy with rotating keys. |
| Wild real-world spot swings disrupting balance | Cap in-game spot at ±20% of session-start value to prevent wallet whiplash. Lift cap via toggle for "hardcore market" mode in v1+. |
| Player confusion from changing prices | HUD always shows current spot prominently; sale screens show historical receipts so players can audit. |

---

## 6. Risks & Roadmap

### Phased Rollout

#### **v0 — MVP (this document)**
*Target: playable browser build, single-player, single map.*

- Core loop (shovel → classify → pan → collect → sell)
- 8 tool categories × 3 tiers (24 upgrades)
- 5 streams × 20+ sites (≥ 100 panning spots)
- Town with general store, assayer, inn, 4+ named NPCs, 6+ quests
- Camp (rest/sleep)
- Abandoned mines (≥ 3) and hidden claims (≥ 5)
- Always daytime, 4 seasons, gameplay-impacting weather
- Stamina/Hunger/Thirst (no death)
- Local IndexedDB save, full Keyboard/Mouse + Xbox + DualShock support

#### **v1.0 — Polish & Persistence**
- Cloud save + account system (Supabase)
- Photo mode
- Achievements
- Performance pass + WebGPU experimental backend
- Localization framework (English baseline; Spanish next)

#### **v1.1 — Living World**
- Day/night cycle (gameplay-impacting)
- Wildlife (ambient, non-hostile)
- Vehicles (ATV unlock for fast traversal)
- Expanded quests (15+) and named NPC rep system

#### **v2.0 — Desktop & Beyond**
- Tauri-wrapped desktop build (itch.io / Steam Early Access candidate)
- Second map (alternate biome — Klondike or modern Brazil)
- Co-op (2-player claim sharing)
- Mod support (community claims/quests)

### Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| **WebGL performance ceiling on low-end hardware** | High | Medium | Aggressive LOD; quality settings menu; minimum-spec advisory at load. Profile early and often. |
| **Browser memory/quota limits for save data** | Medium | Low | IndexedDB has generous quota (≥ 50% of disk). Compress saves with `pako` if size grows. |
| **Asset pipeline bottleneck (one person sourcing/creating models)** | High | High | Plan a 2–4 week asset-sourcing sprint up front; use modular kit-bashing (rocks, trees, props) to multiply variety from few sources; keep terrain handcrafted but populate procedurally. |
| **Gamepad API inconsistency across browsers** | Medium | Medium | Test on Chrome, Firefox, Safari; ship a known-issues page; use a battle-tested wrapper like `gamepadtester` patterns. |
| **Authenticity vs. accessibility tension** | Medium | Medium | Lock the "hybrid arcade-leaning" decision now; resist scope creep toward sim-deep mini-games unless playtests demand. |
| **Single-developer scope** | High | High | This PRD is intentionally scoped tight. Cut features before extending the timeline; v0 is a vertical slice. |
| **Audio licensing confusion** | Low | Medium | Maintain a `LICENSES.md` for every asset; only use clearly CC0/CC-BY/owned sources. |
| **Gold economy balancing** | Medium | High | Build a spreadsheet model first: yield per session × tier × stream → expected upgrade time. Validate via 5+ playtests before launch. |
| **Save schema migrations** | Medium | High | Version every save blob from day one; write a migration runner before v0 ships even if v0 schema is stable. |

### Locked Decisions

- **World setting**: A **fictional analog** of California gold country — inspired by the real Mother Lode region (Coloma, Auburn, Placerville, the South Fork American River, the high Sierra) but with invented place names, towns, and geography. Avoids real-world licensing concerns and gives full creative latitude.
- **Soundtrack direction**: Calm, gentle, **fingerpicked acoustic guitar** as the dominant musical bed. Mostly chord-progression fingerpicking (think *Firewatch*-adjacent, Chris Remo / William Tyler / John Fahey territory). Layered sparingly with ambient pads or harmonica. No vocals. Music is non-intrusive — it sits under the world ambience, not on top of it.
- **Tutorial framing**: **Silent / diegetic, no NPC required**. The player learns through environmental cues, on-screen prompts, and a tutorial stream at spawn that subtly funnels them through the four-step loop. Notes left at the camp (handwritten letters from a "previous prospector") deliver any necessary lore or instruction.
- **Visual style**: **Firewatch Painterly** — flat, hand-painted vistas with limited per-region color palettes, soft gradient skies, silhouetted distant hills, simple low-poly geometry, near-zero PBR. Vegetation is billboard cards or low-poly clusters. Water uses a stylized translucent shader with painted highlights. Warm, contemplative, golden-hour-leaning. Forgiving of imperfect assets because the style is intentional. See Appendix C for full details and trade-off rationale.

### Open Questions / TBD

*All major design decisions for v0 are now locked. Implementation specifics tracked in `implementation-plan-v0.md`.*

---

## Appendix A: Equipment Tier Reference

| Category | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|---|
| **Pan** | Plastic 10" | Steel 14" | Pro steel 17" w/ riffles |
| **Shovel** | Garden trowel | Full shovel | Pickaxe (unlocks hard-pack ground) |
| **Classifier** | Single hand sieve | 3-stack classifier | 5-stack classifier with stand |
| **Sluice Box** | Mini portable sluice | Full-size sluice | Power sluice (pump-fed) |
| **Detector** | Basic VLF detector | Mid-range PI detector | Pro PI w/ pinpointer |
| **Dredge** | — (locked v0 start) | Hand dredge / sniper bottle | 2" suction dredge (requires permit quest) |
| **Snuffer/Vials** | Plastic snuffer + 1 vial | Glass snuffer + 3 vials | Pro snuffer + 6 vials w/ scale |
| **Personal Gear** | Boots + small backpack | Waders + medium pack + headlamp | Insulated waders + large pack + pro headlamp + GPS |

## Appendix B: Stream Concept Sketch

| Stream | Biome | Difficulty | Notable Feature |
|---|---|---|---|
| **Coyote Creek** | Oak woodland (foothills) | Tutorial | Player spawn area; richest tutorial spot |
| **Bear Gulch** | Pine forest (mid) | Easy–Mid | Adjacent to abandoned mine #1 |
| **Devil's Run** | Deep canyon | Mid | Requires Tier 2 boots/waders for mid-stream spots |
| **Granite Fork** | High Sierra alpine | Hard | Snowed in during Winter; biggest nuggets |
| **Lost Chinaman** | Hidden side-canyon | Endgame | Requires quest unlock; coarse gold + lore |

## Appendix C: Visual Style Candidates

Five directions to choose from. Each is internally consistent and matches the calm, fingerpicked-guitar tone of the soundtrack. Trade-offs are honest: realism = more art labor, stylized = more art-direction labor. Browser performance favors the stylized end.

### Option 1 — **"Firewatch Painterly"** ✅ **SELECTED**
Flat, hand-painted vistas with limited color palettes per region, soft gradient skies, silhouetted distant hills, simple geometry, near-zero PBR. Vegetation is billboard cards or low-poly clusters. Water is stylized translucent shader with painted highlights.
- **Vibe**: warm, contemplative, golden-hour-leaning.
- **Asset cost**: low–medium. Forgiving of imperfect models because the style is intentional.
- **Browser perf**: excellent.
- **Reference**: *Firewatch*, *Eastshade*, *The Witness* (in spirit).

### Option 2 — **"Studio Ghibli Naturalism"**
Cel-shaded with hand-drawn texture overlays. Slightly exaggerated proportions on flora (big puffy trees, oversized rocks). Strong silhouette readability. Warm palette with painterly cloud shaders. Character is cel-shaded with a single thick outline pass.
- **Vibe**: nostalgic, gentle, slightly whimsical — leans family-friendly.
- **Asset cost**: medium. Cel-shading needs custom shaders; flora needs care to look hand-drawn.
- **Browser perf**: good.
- **Reference**: *Sable*, *The Plucky Squire*, anything Ghibli landscape-inspired.

### Option 3 — **"Low-Poly Cozy"**
Strictly faceted geometry, solid vertex colors (no textures), gentle ambient occlusion. Everything readable at a glance. Water is a flat plane with animated normal noise. Trees are 50–200 polys each.
- **Vibe**: cozy, approachable, indie-warm.
- **Asset cost**: lowest. Easiest path to a populated 1–2 km² map for a single dev.
- **Browser perf**: excellent — could run on Chromebooks.
- **Reference**: *A Short Hike*, *Lake*, *Alba: A Wildlife Adventure*.

### Option 4 — **"Stylized PBR Realism"**
Real-world materials (rock, water, wood, metal) with PBR shaders, but slightly pushed color grading and softer-than-life lighting. Geometry is detailed but not photoreal. Vegetation uses Quixel Megascans-style atlases.
- **Vibe**: grounded, "this could be a real place", filmic.
- **Asset cost**: high. Needs proper PBR materials, normal maps, baked AO across the whole map.
- **Browser perf**: borderline — demands aggressive LOD, may push the FPS target on low-end hardware.
- **Reference**: *Red Dead Redemption 2* (toned down), *The Long Drive*, *Far Cry 5*.

### Option 5 — **"Watercolor Diorama"**
The world looks like an illustrated children's book or a National Park poster. Hand-painted textures with visible brush strokes, faked depth-of-field that mimics tilt-shift, subtly desaturated palette. Characters are simple low-poly with painted texture maps.
- **Vibe**: storybook, intimate, almost miniature-feeling.
- **Asset cost**: medium-high. Watercolor texturing requires either a strong manual painter or careful AI texture generation + cleanup.
- **Browser perf**: good.
- **Reference**: *Tunic*, *Book of Travels*, WPA-era National Park posters.

### Recommendation
For a single-developer browser MVP with the calm, fingerpicked-guitar tone you described, **Option 1 (Firewatch Painterly)** or **Option 3 (Low-Poly Cozy)** offer the best ratio of mood-fit to feasible scope. Option 4 (Stylized PBR) is the highest-risk choice and would likely require a larger team or a longer timeline to ship the v0 scope.

---

## Appendix D: Control Scheme Reference (v0)

| Action | Keyboard/Mouse | Xbox | DualShock |
|---|---|---|---|
| Move | WASD | Left stick | Left stick |
| Look / Camera | Mouse | Right stick | Right stick |
| Sprint | L-Shift | L3 (click) | L3 (click) |
| Jump | Space | A | Cross |
| Interact | E | X | Square |
| Use tool / Pan | LMB | RT | R2 |
| Dig | RMB | LT | L2 |
| Switch tool | Q / E | LB / RB | L1 / R1 |
| Inventory | Tab | View | Touchpad |
| Map | M | View (hold) | Touchpad (hold) |
| Pause | Esc | Menu | Options |
