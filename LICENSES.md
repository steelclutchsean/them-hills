# Licenses

Tracks the license of every third-party asset and dependency used in *Them Hills*. Audited at every milestone; final audit at M5 before public launch.

## Project license

To be decided by the project owner (Sean). Common candidates:
- **MIT** — permissive, allows commercial use and forks
- **Apache 2.0** — permissive with explicit patent grant
- **Proprietary / All rights reserved** — for commercial release

This decision should be made before M3 (first external testers).

---

## Code dependencies

All current dependencies are MIT-licensed unless noted. Audit on every `npm install` via `npm ls`.

| Package | License | Notes |
|---|---|---|
| three | MIT | Renderer |
| zustand | MIT | State store |
| idb-keyval | Apache-2.0 | Save persistence |
| vite | MIT | Build tool |
| typescript | Apache-2.0 | Compiler |
| eslint, prettier | MIT | Tooling |

---

## 3D models

*Format: `path/to/asset` — License — Source — Author/Attribution*

### Quaternius Stylized Nature MegaKit (Standard / free) — `public/assets/megakit/`
- **License:** [CC0 1.0 Universal (Public Domain Dedication)](https://creativecommons.org/publicdomain/zero/1.0/)
- **Source:** https://quaternius.com (Standard free version: 68 of 116 models)
- **Author:** [@quaternius](https://www.patreon.com/quaternius)
- **Attribution:** Not legally required under CC0; included here as good practice and to credit the artist.
- **Models in use:** trees (Common, Pine, Twisted, Dead × 5 each), rocks (Medium × 3, Pebble_Round × 5, Pebble_Square × 6), vegetation (grass, bushes, ferns, plants, flowers, clovers, mushrooms).
- **Texture sharing:** glTFs in this folder reference shared `Bark_*` and `Leaves_*` PNGs by relative URI. Don't move individual files out of the folder.

---

## Textures

(none yet)

---

## Audio (SFX)

(none yet)

---

## Audio (music)

(none yet — fingerpicked guitar tracks commissioned during M3, delivered for M4)

---

## Fonts

(none custom yet — using system font stack in CSS)

---

## Fictional analog disclaimer

*Them Hills* is set in a **fictional** analog of California gold country. Place names, towns, NPCs, and geography are invented. Any resemblance to real-world specific locations is for atmospheric authenticity only and is not intended to reference, depict, or endorse real establishments or persons.

---

## How to add an entry

When adding any new asset:

1. Verify the license is compatible (CC0, CC-BY with attribution, MIT-style permissive, or specifically licensed for game use).
2. Add a row to the appropriate section above with:
   - File path in repo
   - License (with link if non-standard)
   - Source URL
   - Author name and attribution requirements
3. If the license requires attribution in-game, also add it to the in-game credits screen (added during M5).
