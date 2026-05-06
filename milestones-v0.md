# Them Hills — v0 Milestones

**Companion to:** `prd-v0.md`, `implementation-plan-v0.md`
**Last updated:** 2026-05-06
**Tracking unit:** Phases complete (out of 11). Week ranges are guidance, not gates.
**Working assumption:** Single developer, full-time.

---

## At a Glance

| # | Milestone | Phases | Phases Complete | Week Range (FT) | Audience |
|---|---|---|---|---|---|
| **M0** | Tech Foundation Ready | 0 | 1 / 11 | ~2 | Internal |
| **M1** | Movement Vertical Slice | 1 | 2 / 11 | ~5 | Internal |
| **M2** | Core Loop Playable | 2, 3, 4 | 5 / 11 | ~13 | Internal — **go/no-go checkpoint** |
| **M3** | World Complete | 5 | 6 / 11 | ~22 | **First external testers** (5 closed alpha) |
| **M4** | Living World | 6, 7 | 8 / 11 | ~27 | Closed alpha continues |
| **M5** | Feature Complete | 8, 9 | 10 / 11 | ~33 | **Open beta** |
| **M6** | v0 Public Launch | 10 | 11 / 11 | ~35 | **Public** |

---

## M0 — Tech Foundation Ready

**Phase:** 0 (Foundations)
**Audience:** Internal only.
**Done when:**
- [ ] Repo is bootstrapped and `npm run dev` works on a clean clone
- [ ] Production build deploys to a public URL via CI
- [ ] Save round-trip verified across browser sessions (write → close → open → read)
- [ ] At least one Xbox and one DualShock controller detected with correct glyphs
- [ ] Save schema v1 contract documented (even if mostly empty payload)

**Why this is its own milestone:** The plumbing has to be solid before any gameplay code is written. Cutting corners here causes pain in every subsequent milestone.

---

## M1 — Movement Vertical Slice

**Phase:** 1 (Player & Camera)
**Audience:** Internal only.
**Done when:**
- [ ] Character moves on KB/M and gamepad with subjectively good "feel" (validated by 2+ playtesters)
- [ ] Third-person camera handles terrain collision, no clipping
- [ ] Stamina meter drains/regens at tunable rates
- [ ] 60 FPS sustained on target hardware (M1 Air / GTX 1660)
- [ ] No movement-related blockers identified

**Why this is its own milestone:** A game whose locomotion doesn't feel good will never feel good. Front-load the tactile work; everything else builds on top.

---

## M2 — Core Loop Playable ⚠️ GO/NO-GO CHECKPOINT

**Phases:** 2 (Core Loop), 3 (Economy & Persistence), 4 (Equipment Progression)
**Audience:** **Internal only.** No external testers yet.
**Done when:**
- [ ] Player can complete full prospect cycle (dig → classify → pan → collect) at a single test stream
- [ ] Player can sell gold to a stub vendor at the current real-world spot price
- [ ] Wallet, inventory, and progress persist across page reloads
- [ ] Player can purchase a Tier 2 upgrade and feel the gameplay difference
- [ ] All 8 tool categories × 3 tiers are wired up with stat data (placeholder visuals OK)
- [ ] Spot price API integration works in production deploy with graceful fallback

**Go/No-Go Decision Gate:**
After M2 lands, take a deliberate pause. The question isn't "is the game finished?" — it's **"is the prospect → sell → upgrade loop fun, by itself, at a single stream, with placeholder art?"**

- **If yes** → continue to M3, confidence is high.
- **If no** → revisit the plan before investing in 9 weeks of world build-out. Possible interventions: retune the panning interaction, rebalance economy, change vendor structure, simplify or extend the loop. Better to spend 4 weeks fixing the loop than 12 weeks building a world around a loop that doesn't land.

This is the highest-leverage decision point in the entire v0 timeline. Honor it.

---

## M3 — World Complete (First External Audience)

**Phase:** 5 (World Build-out)
**Audience:** **First external testers** — 5 closed-alpha invitees. Friends, prospecting enthusiasts, sim-game communities.
**Done when:**
- [ ] All 5 streams traversable with 100+ panning sites populated
- [ ] Town with General Store, Assayer, Tourist Pawn Shop, Inn placed (NPC dialogue still stubbed; that's M5)
- [ ] Camp with vault and rest functionality
- [ ] 3 abandoned mines explorable, 5 hidden claims placeable on map
- [ ] Map UI works on KB/M and gamepad
- [ ] All site assets (terrain, water, vegetation, props) at "alpha quality" — final art pass deferred to M5
- [ ] 60 FPS holds across all regions
- [ ] No fall-through-world or unreachable-area bugs

**External audience plan:**
- Distribute private build URL with a feedback form
- 5 testers × 1–2 sessions each over 2 weeks
- Track: bugs, "where did you get stuck?", "did the world feel big enough/too big?", "which streams felt rich vs. empty?"
- Use feedback to inform M4 atmospheric tuning and M5 quest placement

**Why now:** M3 is the first build where the game has *enough* content to evaluate the world's character without the noise of weather/quest/audio variables muddying the signal.

---

## M4 — Living World

**Phases:** 6 (Atmospheric Systems), 7 (Survival Layer)
**Audience:** Closed alpha continues — same 5 testers, refreshed build.
**Done when:**
- [ ] Weather state machine functional with 5 states; rain visibly affects streams
- [ ] 4 seasons cycle with content gating (Granite Fork snowed in Winter; etc.)
- [ ] Calm fingerpicked-guitar music loop set is in (commissioned tracks delivered)
- [ ] Stream/forest/wildlife ambient SFX deployed via positional audio
- [ ] Stamina/Hunger/Thirst meters tuned to medium-sim drain rates
- [ ] Sleep loop advances clock, restores meters, can advance season
- [ ] No way to die

**External audience plan:**
- Refresh the alpha cohort with the M4 build
- Specifically ask: "Does the world feel alive?" "Is the music the right vibe?" "Are the survival meters annoying or invisible (both bad)?"

---

## M5 — Feature Complete (Open Beta)

**Phases:** 8 (NPCs & Quests), 9 (Polish & Performance)
**Audience:** **Open beta** — public-facing form, target 30–50 testers, broader sim-gamer/prospecting communities.
**Done when:**
- [ ] 4+ named NPCs with personality and dialogue
- [ ] 6+ authored quests playable end-to-end
- [ ] Quest log, dialogue UI, NPC interactions all gamepad-equivalent to KB/M
- [ ] Settings menu (graphics, audio, controls, accessibility) complete
- [ ] Input rebinding UI works for both KB/M and gamepad
- [ ] Tutorial polish complete (notes at camp, on-screen prompts, skippable for returning players)
- [ ] LOD, instancing, texture/geometry compression passes done
- [ ] Save migration runner has a verified test case
- [ ] No P0 or P1 bugs in the tracker
- [ ] Final art pass on town, key NPCs, hero props

**External audience plan:**
- Soft-launch beta URL with a clear "this is a beta" framing
- Collect feedback for ~2–4 weeks
- Final economy balance pass based on telemetry (do the per-tier yield numbers actually hold up under real player behavior?)

---

## M6 — v0 Public Launch

**Phase:** 10 (Beta & Launch)
**Audience:** **Public.**
**Done when:**
- [ ] All beta-surfaced bugs resolved or knowingly deferred
- [ ] Public landing page live (what is the game, how to play, system requirements, browser compat notes)
- [ ] LICENSES.md complete and audited
- [ ] Privacy notice published (lightweight; v0 collects nothing)
- [ ] Postmortem doc drafted: what went well, what to change for v1
- [ ] Final URL announced

**This is "v0 done."** Plan v1 from a position of having shipped, not from a vacuum.

---

## Tracking

Source of truth: phases complete (e.g., "5 of 11 — finished M2, started M3"). Use the GitHub Projects board (or equivalent) with one column per phase. A phase moves to Done only when its **demo state** in `implementation-plan-v0.md` is verifiable.

Weekly cadence:
- Monday: scope the week against the current phase's task list
- Friday: log progress against phases-complete; update README badge if applicable
- End of milestone: write a short retro (what slipped, what surprised, what to carry forward)

---

## What This Plan Doesn't Promise

- Weekly delivery is guidance, not contract. Phases will slip; that's the medium-sim of project management.
- M3 is the riskiest milestone by week count and asset load. Plan a 2–4 week asset-sourcing sprint *before* starting Phase 5 — that prep time is not counted in the M3 estimate.
- The "full-time solo" assumption is fragile. If life intervenes, the realistic timeline doubles. Acknowledge that in the moment rather than at the end.
- Music commissioning has a long lead time. Start that procurement at the *start of M3*, not the start of M4, so it's ready when M4 needs it.
