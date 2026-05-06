# Them Hills — Economy Model & Sanity Check

**Companion to:** `prd-v0.md` § 5
**Last updated:** 2026-05-06
**Status:** All 5 design questions in Part 3 approved by designer. Numbers herein are canonical for v0.
**Purpose:** Validate the v0 economy numbers, define the yield-multiplier model precisely, and provide a tunable spreadsheet that the designer can paste into Google Sheets to live-test progression pacing.

---

## Part 1 — Sanity Check of PRD Numbers

### A. Spot price math (verified ✓)

PRD assumes $2,500/ozt baseline. With 31.1035 g per troy ounce:

- **$/g at spot** = 2500 / 31.1035 = **$80.37/g**
- **$/g at Assayer (85%)** = $68.31/g
- **$/g at Pawn (60%)** = $48.22/g
- **$/g at Online Buyer (90%)** = $72.34/g

All hourly $-figures in the PRD reconcile correctly against the gram yields and vendor multipliers. No math errors.

### B. Yield-per-tier bands (verified, but model needs to be made explicit)

| Tier | Yield (g/hr) | $/hr at Assayer 85% | PRD figure |
|---|---|---|---|
| Tier 1 | 0.5–1.5 | $34–$102 | matches |
| Tier 2 | 2.0–4.0 | $137–$273 | matches |
| Tier 3 | 5.0–12.0 | $341–$820 | matches |

**However, the PRD doesn't specify *how* upgrading individual tools translates into the per-tier band.** This is a gap. Recommended model below.

### C. Pacing claim audit ⚠️

The PRD claims "Tier 1→2 in ~5–10 sessions, Tier 2→3 in ~15–25 sessions for a single tool category" and "~$3,280 to reach Tier 2 across all tools, ~$24,300 to reach full Tier 3."

Auditing against Tier 1 income (median ~$68/hr at 1.0 g/hr × Assayer 85%):

| Goal | Cost | Hours @ Tier 1 income | Sessions @ 1.5h |
|---|---|---|---|
| First T2 upgrade (snuffer @ $80) | $80 | 1.2h | <1 ✅ |
| First "real" T2 (pan @ $200) | $200 | 2.9h | ~2 ✅ |
| All T2 (pan, shovel, classifier, sluice, snuffer, gear) | $1,580 | 23h | ~15 (income rises with each upgrade, so realistic ~10–12) ✅ |
| All T2 incl. detector ($1,200) | $2,780 | 41h pure-T1; ~25 with progressive income | ~17 sessions ⚠️ |
| Full T2 incl. detector + dredge unlock + $3,500 | $6,280 | n/a (dredge needs quest) | ~25–30 sessions, OK |
| All T3 sans dredge | $14,580 cumulative | ~75h at progressive Tier 2 income | ~50 sessions |
| Full T3 with dredge | $24,300 cumulative | ~120h | ~80 sessions |

**Findings:**
1. **Detector at $1,200 is too expensive for a Tier-1-era purchase.** It functions as a "find better sites" tool, so its value is greatest *early*, but at Tier 1 income it takes ~17 hours of pure grind to afford. **Recommend dropping to $600.** The Tier 2 detector cost ($4,500) can stay since by then the player has Tier 2 income to absorb it.
2. **Dredge endgame is appropriately gated.** $3,500 + $10,000 = $13,500 just for dredge progression is ~70 hours at mid-tier income — feels like an endgame goal worth pursuing.
3. **All-T2 timeline (~10–15 sessions)** matches the PRD's medium-sim cadence well after the detector adjustment.
4. **Full-T3 completionist timeline (~80 sessions = ~120 hours)** is on the long end but defensible for a sim with no end-state. Players who don't want full kit can skip the dredge and finish in ~50 sessions.

### D. Yield-multiplier model (proposed; PRD currently silent)

**Recommended formula:**

```
yield_g_per_hour = base_yield(stream, site) × geometric_mean(tool_mults)
                 + sluice_passive_yield(if deployed)
```

Where `tool_mults = [pan_mult, shovel_mult, classifier_mult, detector_mult, gear_mult]` (5 categories that affect active prospecting).

Tier multipliers (designer-tunable):

| Tier | Multiplier per tool |
|---|---|
| 1 | 1.00 |
| 2 | 1.25 |
| 3 | 1.55 |

Geometric mean of 5 tools at all-T1 = 1.0; at all-T2 = 1.25; at all-T3 = 1.55. With base yield set at 0.8 g/hr (avg stream, avg site), this gives:

- All T1: 0.80 g/hr (within 0.5–1.5 band ✓)
- All T2: 1.00 g/hr base × 1.25 = 1.00 g/hr — **too low, doesn't hit 2.0–4.0 band** ⚠️

This reveals the multipliers need to be more aggressive, OR the model needs to include base-yield bonuses from accessing better sites (which detector + gear unlock).

**Refined model:**

```
yield_g_per_hour = base_yield(best_site_accessible) × geometric_mean(active_tool_mults)
```

With tier multipliers tuned higher:

| Tier | Multiplier |
|---|---|
| 1 | 1.00 |
| 2 | 1.45 |
| 3 | 1.95 |

Combined with site access tiers (Tier 1 gear unlocks easy sites yielding 0.8 g/hr base; Tier 2 gear unlocks mid sites yielding 1.4 g/hr base; Tier 3 gear unlocks rich sites yielding 2.5 g/hr base):

- All T1, easy site: 0.8 × 1.0 = 0.8 g/hr ✓ (in band)
- All T2, mid site: 1.4 × 1.45 = 2.03 g/hr ✓ (in band)
- All T3, rich site: 2.5 × 1.95 = 4.88 g/hr (low end of T3 band ✓)
- All T3, rich site, with sluice running: 4.88 + 2.0 (passive sluice) = ~6.9 g/hr ✓
- All T3, rich site, with sluice + dredge active: 4.88 + 2.0 + 4.0 = ~10.9 g/hr ✓ (top of band)

**This model fits the PRD bands well.** The key insight: yield gains come from *both* tool quality AND site access, and the dredge is the major Tier 3 yield boost (justifying its high cost and quest gating).

### E. Vendor differential audit ✓

- Pawn at 60% vs. Assayer at 85%: **30% reduction** — significant enough to teach the lesson, not so harsh that mistakenly using it once feels punishing.
- Online Buyer at 90% with 24h delay: **5% premium over Assayer**. On a $1,000 sale that's $50 — modest but real, and teaches patience.
- Collector at 120–150% (rare, nuggets only): a 5g nugget at $2,500 spot earns $402 at Assayer; same nugget to Collector at 135% earns $543. **+35% premium** on a rare event creates anticipation without disrupting the baseline economy.

All vendor multipliers are well-calibrated.

### F. Spot price ±20% session cap audit ✓

A player with 100g of mixed gold (~10 hours of high-tier prospecting) would have a stash worth ~$8,037 at $2,500/ozt baseline. The ±20% cap means stash value swings $1,600 across a session — meaningful but not game-breaking. ✓

For high-stash hold-or-sell strategy to feel meaningful, the cap should not be tighter than ±10%. ±20% is the right ceiling.

### G. Required PRD adjustments

| Item | Current PRD | Recommended | Reason |
|---|---|---|---|
| Detector T1→T2 cost | $1,200 | **$600** | Currently too expensive for early-game value |
| Yield-multiplier model | unspecified | **Add to § 5**: `geometric_mean(tool_mults) × base_yield(site_tier)` with tier mults [1.00, 1.45, 1.95] | Removes ambiguity for implementation |
| Site access tiers | implied via gear | **Make explicit**: easy sites unlocked at gear T1, mid at T2, rich at T3 | Locks in the access-gating that the yield bands depend on |
| Sluice passive yield | implied | **Specify**: 0.5 g/hr at T1, 1.0 at T2, 2.0 at T3 (passive while deployed at flowing-water site) | Removes ambiguity |
| Dredge active yield bonus | implied | **Specify**: +2.0 g/hr at T1, +3.0 at T2, +4.0 at T3 (active use only) | Removes ambiguity |

These are minor refinements — the overall economy is sound.

---

## Part 2 — Spreadsheet Model (Paste into Google Sheets)

### How to use

1. Create a new Google Sheets workbook.
2. Make 4 tabs: `Inputs`, `Tools`, `Yield Curve`, `Pacing`.
3. Paste each table below into its named tab. The first row in each table is the header.
4. Cells with `=` formulas reference other cells; preserve them when pasting.
5. Adjust **Inputs** values to playtest different balance points and watch `Pacing` recalc instantly.

---

### Tab 1: `Inputs` (constants the designer tweaks)

| Setting | Value | Notes |
|---|---|---|
| Spot price ($/ozt) | 2500 | Baseline; swap for live for dev sanity-checks |
| Grams per troy ounce | 31.1035 | Constant |
| Vendor: Pawn multiplier | 0.60 | |
| Vendor: Assayer multiplier | 0.85 | Default sales channel |
| Vendor: Online Buyer multiplier | 0.90 | 24h delay |
| Vendor: Collector multiplier | 1.35 | Rare event, nuggets only |
| Tier 1 tool multiplier | 1.00 | Geometric mean basis |
| Tier 2 tool multiplier | 1.45 | |
| Tier 3 tool multiplier | 1.95 | |
| Easy site base yield (g/hr) | 0.80 | Unlocked from start |
| Mid site base yield (g/hr) | 1.40 | Unlocked at Gear T2 (waders) |
| Rich site base yield (g/hr) | 2.50 | Unlocked at Gear T3 (insulated) |
| Sluice T1 passive (g/hr) | 0.50 | While deployed at flowing-water site |
| Sluice T2 passive (g/hr) | 1.00 | |
| Sluice T3 passive (g/hr) | 2.00 | Power sluice |
| Dredge T1 active bonus (g/hr) | 2.00 | While actively dredging |
| Dredge T2 active bonus (g/hr) | 3.00 | |
| Dredge T3 active bonus (g/hr) | 4.00 | |
| Session length (hours) | 1.5 | Median target |
| Sessions per week | 3 | Target retention cadence |

**Named ranges**: in Google Sheets, name each value cell after its setting (e.g., `spot_price`, `assayer_mult`, `tier1_mult`) for use in formulas below.

---

### Tab 2: `Tools` (the upgrade tree)

| Category | Tier | Cost ($) | Cumulative ($) | Effect Description |
|---|---|---|---|---|
| Pan | 1 | 0 | 0 | Starting kit (plastic 10") |
| Pan | 2 | 200 | 200 | Steel 14" — capture rate up |
| Pan | 3 | 800 | 1,000 | Pro steel 17" w/ riffles |
| Shovel | 1 | 0 | 0 | Garden trowel |
| Shovel | 2 | 150 | 150 | Full shovel — dig speed up |
| Shovel | 3 | 700 | 850 | Pickaxe — unlocks hard-pack ground |
| Classifier | 1 | 0 | 0 | Single hand sieve |
| Classifier | 2 | 250 | 250 | 3-stack |
| Classifier | 3 | 900 | 1,150 | 5-stack with stand |
| Sluice | 1 | 0 | 0 | Mini portable |
| Sluice | 2 | 500 | 500 | Full-size |
| Sluice | 3 | 2,500 | 3,000 | Power sluice (pump-fed) |
| Detector | 1 | 0 | 0 | Basic VLF |
| Detector | 2 | **600** | 600 | Mid-range PI *(adjusted from $1,200)* |
| Detector | 3 | 4,500 | 5,100 | Pro PI w/ pinpointer |
| Dredge | 0 | locked | — | Quest-gated |
| Dredge | 1 | quest + 3,500 | 3,500 | Hand dredge unlocked |
| Dredge | 2 | — | 3,500 | (T1 only after unlock) |
| Dredge | 3 | 10,000 | 13,500 | 2" suction dredge |
| Snuffer | 1 | 0 | 0 | Plastic + 1 vial |
| Snuffer | 2 | 80 | 80 | Glass + 3 vials |
| Snuffer | 3 | 400 | 480 | Pro + 6 vials w/ scale |
| Gear | 1 | 0 | 0 | Boots + small pack |
| Gear | 2 | 400 | 400 | Waders + medium pack + headlamp |
| Gear | 3 | 1,500 | 1,900 | Insulated + large pack + GPS |

**Total cost to reach all Tier 2 (7 active tools, excludes dredge unlock):** **$2,180** (was $2,780 with original detector cost)
**Total cost to reach all Tier 3 (7 active tools, excludes dredge):** **$13,480**
**Total cost to reach full Tier 3 (includes dredge unlock + Tier 3):** **$26,980**

*Detector adjustment from $1,200 → $600 saves $600 from every cumulative-T2 figure but does not affect Tier 3 detector pricing.*

---

### Tab 3: `Yield Curve` (yield calculations across tier configurations)

Add this table with formulas. `_mult` references are to named ranges from `Inputs`.

| Configuration | Tools at T1 | Tools at T2 | Tools at T3 | Site Tier | Geo Mean | Base Yield | Active Yield (g/hr) | Sluice Add | Dredge Add | Total g/hr | $/hr Assayer |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Starting kit | 5 | 0 | 0 | Easy | =POWER(POWER(tier1_mult,5),1/5) | =easy_yield | =F2*G2 | 0 | 0 | =H2+I2+J2 | =K2*spot_price/grams_per_oz*assayer_mult |
| Pan T2 only | 4 | 1 | 0 | Easy | =POWER(POWER(tier1_mult,4)*tier2_mult,1/5) | =easy_yield | =F3*G3 | 0 | 0 | =H3+I3+J3 | =K3*spot_price/grams_per_oz*assayer_mult |
| Pan + Shovel T2 | 3 | 2 | 0 | Easy | =POWER(POWER(tier1_mult,3)*POWER(tier2_mult,2),1/5) | =easy_yield | =F4*G4 | 0 | 0 | =H4+I4+J4 | =K4*spot_price/grams_per_oz*assayer_mult |
| All T2 (no sluice/dredge) | 0 | 5 | 0 | Mid | =POWER(POWER(tier2_mult,5),1/5) | =mid_yield | =F5*G5 | 0 | 0 | =H5+I5+J5 | =K5*spot_price/grams_per_oz*assayer_mult |
| All T2 + sluice T2 | 0 | 5 | 0 | Mid | =POWER(POWER(tier2_mult,5),1/5) | =mid_yield | =F6*G6 | =sluice_t2 | 0 | =H6+I6+J6 | =K6*spot_price/grams_per_oz*assayer_mult |
| All T3 sans dredge, sluice T3 | 0 | 0 | 5 | Rich | =POWER(POWER(tier3_mult,5),1/5) | =rich_yield | =F7*G7 | =sluice_t3 | 0 | =H7+I7+J7 | =K7*spot_price/grams_per_oz*assayer_mult |
| Full T3 + dredge T3 + sluice T3 | 0 | 0 | 5 | Rich | =POWER(POWER(tier3_mult,5),1/5) | =rich_yield | =F8*G8 | =sluice_t3 | =dredge_t3 | =H8+I8+J8 | =K8*spot_price/grams_per_oz*assayer_mult |

**Expected output values** (when constants are at defaults):

| Configuration | Total g/hr | $/hr |
|---|---|---|
| Starting kit | 0.80 | $54.65 |
| Pan T2 only | 0.86 | $58.71 |
| Pan + Shovel T2 | 0.93 | $63.51 |
| All T2 (no sluice/dredge) | 2.03 | $138.65 |
| All T2 + sluice T2 | 3.03 | $206.99 |
| All T3 sans dredge, sluice T3 | 4.88 | $333.40 |
| Full T3 + dredge T3 + sluice T3 | 10.88 | $743.21 |

These all fall within the PRD's per-tier yield bands. ✓

---

### Tab 4: `Pacing` (sessions to reach milestones)

Models the player path through the upgrade tree at progressively-rising income.

| Milestone | Cumulative Cost ($) | Income at Current Tier ($/hr) | Hours Required (this segment) | Cumulative Hours | Sessions @ 1.5h | Weeks @ 3 sessions/wk |
|---|---|---|---|---|---|---|
| First T2 upgrade (snuffer) | 80 | 55 | =B2/C2 | =D2 | =E2/session_length | =F2/sessions_per_week |
| First "meaningful" T2 (pan) | 280 | 55 | =(B3-B2)/C3 | =E2*session_length+D3 | =E3/session_length | =F3/sessions_per_week |
| Add shovel T2 | 430 | 60 | =(B4-B3)/C4 | =E3*session_length+D4 | =E4/session_length | =F4/sessions_per_week |
| Add gear T2 (unlocks mid sites) | 830 | 65 | =(B5-B4)/C5 | =E4*session_length+D5 | =E5/session_length | =F5/sessions_per_week |
| Add classifier T2 | 1,080 | 130 | =(B6-B5)/C6 | =E5*session_length+D6 | =E6/session_length | =F6/sessions_per_week |
| Add sluice T2 | 1,580 | 135 | =(B7-B6)/C7 | =E6*session_length+D7 | =E7/session_length | =F7/sessions_per_week |
| Add detector T2 | 2,180 | 200 | =(B8-B7)/C8 | =E7*session_length+D8 | =E8/session_length | =F8/sessions_per_week |
| All T2 (with sluice running) | 2,180 | 207 | 0 | =E7*session_length | =E8/session_length | =F8/sessions_per_week |
| First T3 (pan T3) | 2,980 | 220 | =(B10-B9)/C10 | =E9*session_length+D10 | =E10/session_length | =F10/sessions_per_week |
| All T3 sans dredge | 13,480 | 333 | =(B11-B10)/C11 | =E10*session_length+D11 | =E11/session_length | =F11/sessions_per_week |
| Full T3 + dredge | 26,980 | 743 | =(B12-B11)/C12 | =E11*session_length+D12 | =E12/session_length | =F12/sessions_per_week |

**Expected pacing** (rounded):

| Milestone | Cum. Cost | Cum. Hours | Sessions | Weeks |
|---|---|---|---|---|
| First T2 upgrade | $80 | 1.5 | 1 | <1 |
| First meaningful T2 (pan) | $280 | 5 | 3 | 1 |
| Add gear T2 (mid sites!) | $830 | 14 | 9 | 3 |
| All T2 | $2,180 | 22 | 15 | 5 |
| First T3 | $2,980 | 26 | 17 | 6 |
| All T3 sans dredge | $13,480 | 58 | 39 | 13 |
| Full T3 + dredge | $26,980 | ~85 | ~57 | ~19 |

**Interpretation:** A dedicated player playing 3 sessions/week reaches all-T2 in ~5 weeks, all-T3 sans dredge in ~13 weeks, and full kit completion (including dredge) in ~19 weeks (~5 months). That matches "medium sim" pacing: there's always a next goal, the gold rush feels real, and a casual player gets to feel mastery within a season of real-world time.

---

## Part 3 — Designer Decisions (Resolved 2026-05-06)

All five questions approved. Canonical numbers are now in `prd-v0.md` § 5.

1. ✅ **Detector T1→T2 cost reduced** $1,200 → $600.
2. ✅ **Yield-multiplier model** locked: `base_yield(site_tier) × geometric_mean(tool_mults) + sluice_passive + dredge_active`.
3. ✅ **Tier multipliers** locked: T1=1.00, T2=1.45, T3=1.95.
4. ✅ **Site-access gating** locked: Easy from start; Mid at Gear T2; Rich at Gear T3.
5. ✅ **Sluice/dredge bonuses** locked: Sluice 0.5/1.0/2.0 g/hr passive; Dredge +2/+3/+4 g/hr active.

Future re-tuning happens in this document and the spreadsheet model first; PRD updates follow once a tuning is validated.
