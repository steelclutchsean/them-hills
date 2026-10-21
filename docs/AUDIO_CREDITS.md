# Audio credits

Them Hills loads these clips after the first click or keypress. They are not
part of the boot bundle. Formats are Ogg Vorbis. Paths are under `public/audio/`.

Anything listed as edited was loudness-matched and re-encoded. A few beds
were also trimmed and given a short loop crossfade so they can repeat.
The game does not ship the untouched source files.

Freesound does not hand the original wav to a logged-out download. The
Freesound clips below were transcoded from that site's HQ preview (MP3).
The take is the contributor's; the file is a generation more compressed
than their archive master.

## The score

One arrangement, not four songs. Every stem is the same 16 bars, D major,
84 BPM, so a context change is a bar-aligned crossfade of layers and cannot
clash in key or tempo.

The tune is "Oh! Susanna" (Stephen Foster, 1848), public domain. The
performance — guitar, banjo, fiddle, harmonica, a soft reed pad, boot and
brush, and the three stingers — was synthesized for this project
(`tools/audio/render_round2.py`) and is dedicated to CC0. No attribution
required. These are not recordings of those instruments.

| File | Layer |
| --- | --- |
| `music/stem-guitar.ogg` | Fingerpicked bed. Present in every cue |
| `music/stem-banjo.ogg` | Clawhammer rolls. Town and prospecting |
| `music/stem-fiddle.ogg` | The melody. Prospecting, lighter while walking |
| `music/stem-harmonica.ogg` | The chorus. Town |
| `music/stem-pad.ogg` | Long reed tones. Night, and inside a mine |
| `music/stem-percussion.ogg` | Heel and brush. Prospecting and town |
| `music/stinger-flake.ogg` | Short D-major tag for the first flake |
| `music/stinger-nugget.ogg` | Larger tag for a nugget |
| `music/stinger-sale.ogg` | Cadence for a sale at the assayer |

## Ambience

| File | Source | License |
| --- | --- | --- |
| `ambience/creek.ogg` | "Running Water - background noise" by HippoDevelopment. [OpenGameArt](https://opengameart.org/content/running-water-background-noise) | CC-BY 3.0. Attribution required |
| `ambience/creek-close.ogg` | `water_flowing.ogg` from "30 CC0 SFX loops" by rubberduck. [OpenGameArt](https://opengameart.org/content/30-cc0-sfx-loops) | CC0 |
| `ambience/wind.ogg` | Wind recorded by Jonathan Shaw (InspectorJ), [Freesound 376415](https://freesound.org/people/InspectorJ/sounds/376415/), looped by AntumDeluge. [OpenGameArt](https://opengameart.org/content/wind-loop) | CC-BY 3.0. Attribution required |
| `ambience/rain.ogg` | `rain.ogg` from rubberduck's "30 CC0 SFX loops" | CC0 |
| `ambience/crickets.ogg` | "Crickets Ambient Noise" by Wolfgang_, credited to Ted Kerr. [OpenGameArt](https://opengameart.org/content/crickets-ambient-noise-loopable). Loop crossfaded | CC0 |
| `ambience/town.ogg` | "geroezemoes.wav" by gecop, [Freesound 640254](https://freesound.org/people/gecop/sounds/640254/). Distant Flemish chatter, words not intelligible. Low-passed and looped | CC0 |
| `ambience/owl-a.ogg`, `ambience/owl-b.ogg` | "Great Horned Owls Hooting, Crickets" by CHallSmith, [Freesound 870593](https://freesound.org/people/CHallSmith/sounds/870593/). Two excerpts of a field recording | CC0 |
| `ambience/bird-a.ogg`, `bird-b.ogg`, `bird-c.ogg` | "Ambient Bird Sounds" by isaiah658, a camera recording. [OpenGameArt](https://opengameart.org/content/ambient-bird-sounds). Sliced into calls | CC0 |
| `ambience/bird-d.ogg` | "Bird chirping sounds" by syncopika, recorded in a backyard. [OpenGameArt](https://opengameart.org/content/bird-chirping-sounds) | CC0 |

## Mine reverb

`ir/mine.ogg` is the mono impulse response `middle_tunnel_1way_mono.wav`
from the Innocent Railway Tunnel, Open Acoustic Impulse Response Library
(OpenAIR), Audiolab, University of York.
[Archived source page](https://web.archive.org/web/20250114000539/https://www.openair.hosted.york.ac.uk/?page_id=525).
License: [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Attribution: www.openairlib.net.

Edited here: trimmed to the direct sound and about two seconds of tail,
faded, resampled to 44.1 kHz. Gill Heads Mine is in the same library and
was measured, but its tail is only a few hundred milliseconds, so the
tunnel response is the one the mines use.

## Foley and UI

Kenney (www.kenney.nl), CC0. Attribution is not required. Packs used:
Interface Sounds, Impact Sounds, RPG Audio.

| Files | Kenney source |
| --- | --- |
| `sfx/ui-click.ogg`, `ui-hover.ogg`, `ui-open.ogg`, `ui-close.ogg`, `ui-confirm.ogg`, `ui-pluck.ogg` | Interface Sounds |
| `sfx/foot-grass-0.ogg` … `foot-grass-3.ogg`, `foot-wood-0.ogg` … `foot-wood-3.ogg` | Impact Sounds footsteps |
| `sfx/jump.ogg`, `sfx/land.ogg` | Impact Sounds `impactSoft` |
| `sfx/gold-0.ogg`, `gold-1.ogg`, `gold-2.ogg` | Impact Sounds metal and tin hits |
| `sfx/gold-3.ogg`, `sfx/coins.ogg`, `sfx/coins-b.ogg` | RPG Audio `metalClick`, `handleCoins`, `handleCoins2` |

Recorded footsteps and tools:

| Files | Source | License |
| --- | --- | --- |
| `sfx/foot-grass-4.ogg` … `foot-grass-7.ogg` | swuing, [Freesound 38874](https://freesound.org/people/swuing/sounds/38874/), edited in "Footsteps on different surfaces" by congusbongus. [OpenGameArt](https://opengameart.org/content/footsteps-on-different-surfaces) | CC-BY 3.0. Attribution required |
| `sfx/foot-water-0.ogg` … `foot-water-3.ogg` | EminYILDIRIM, [Freesound 608663](https://freesound.org/people/EminYILDIRIM/sounds/608663/), and swuing, [Freesound 38873](https://freesound.org/people/swuing/sounds/38873/), same pack | CC-BY 3.0. Attribution required |
| `sfx/foot-gravel-0.ogg` … `foot-gravel-3.ogg` | Ali_6868, [Freesound pack 21608](https://freesound.org/people/Ali_6868/packs/21608/), same pack (that folder is marked CC0) | CC0 |
| `sfx/foot-dirt-0.ogg` … `foot-dirt-2.ogg` | TinyWorlds, from pdsounds.org recordings (mud and leaves). [OpenGameArt](https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud) | CC0 |
| `sfx/dig-0.ogg` … `dig-3.ogg`, `sfx/dirt-crunch.ogg` | "Digging with shovel" by guyburns, [Freesound 558413](https://freesound.org/people/guyburns/sounds/558413/). Shovelling gravel and dirt. Sliced; the crunch is a high-passed grain of the same take | CC0 |
| `sfx/slosh.ogg`, `slosh-1.ogg`, `slosh-2.ogg` | "Water Pour Small Pan" by Rudmer_Rotteveel, [Freesound 699581](https://freesound.org/people/Rudmer_Rotteveel/sounds/699581/), water in a steel pan, mixed with high-passed gravel from the guyburns shovel take. There was no single public-domain gold-pan recording to ship | CC0 |

## What is still weak

The band is synthesized. Guitar, banjo, fiddle, and harmonica share a key
and a tempo, and they do not sound like a recorded session in a foothill
cabin. The heel-and-brush part is synthesized too.

Birdsong is a real backyard and a real camera recording, not identified
Sierra species. The cricket bed is a separate night recording from the
owls, so the two do not share a space. Town chatter is a real distant
conversation, in Flemish, not a camp of forty-niners. The pan swirl is two
recordings layered, not one pan of water and gravel. Cave reverb is a
railway tunnel in Edinburgh, not a Sierra adit. Freesound material here is
the site's preview encode, not the contributor's wav master.
