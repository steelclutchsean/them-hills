# Audio credits

Them Hills loads these clips after the first click or keypress. They are not
part of the boot bundle. Formats are Ogg Vorbis. Paths are under `public/audio/`.

Anything listed as edited was loudness-matched and re-encoded. A few beds
were also trimmed and given a short loop crossfade so they can repeat.
The game does not ship the untouched source files.

Freesound does not hand the original wav to a logged-out download. Rows
that name a Freesound preview were transcoded from that site's HQ MP3.
The take is the contributor's; the file is a generation more compressed
than their archive master. BigSoundBank rows are the FLAC (or, for one
short snort, the high-bitrate MP3) the site serves without an account.

## The score

One arrangement, not four songs. Every stem is the same 16 bars, D major,
84 BPM, so a context change is a bar-aligned crossfade of layers and cannot
clash in key or tempo.

The tune is "Oh! Susanna" (Stephen Foster, 1848), public domain. The
performance is not a recorded band and it is not the earlier synthesis.
`tools/audio/render_sampled.py` plays the same chart with CC0
multisamples, humanized timing and velocity, then bakes one light room
onto every stem. That room is generated (early taps around 9–58 ms and a
noise tail of about 0.4 s). It is not a recording of a cabin. The tail is
wrapped so each stem stays exactly 16 bars.

No public-domain multitrack of a period band was available to drop in as
these stems. A finished mix could not drive the layer crossfades.

| File | What is playing |
| --- | --- |
| `music/stem-guitar.ogg` | Fingerpicked bed, every cue. Spanish classical nylon guitar, FreePats, recorded by Roberto (roberto@zenvoid.org), 2019-06-18. [FreePats](http://freepats.zenvoid.org/Guitar/acoustic-guitar.html). CC0. Nylon, not a steel-string parlor guitar |
| `music/stem-banjo.ogg` | Rolls for town and prospecting. SX 6-string banjo recorded by itsclipping, [ganjo](https://github.com/sfzinstruments/ganjo). CC0. Not a 5-string clawhammer. The samples top out around C5, so an E that sits above that drops an octave |
| `music/stem-fiddle.ogg` | The melody. Prospecting, lighter while walking. Solo violin, arco with vibrato, VSCO 2 Community Edition, Sam Gossner and Simon Dalzell. [VSCO-2-CE](https://github.com/sgossner/VSCO-2-CE). CC0. Samples are a minor third apart; other notes move at most two semitones. The chorus is an octave down |
| `music/stem-harmonica.ogg` | The chorus, in town. Hohner Super 64 chromatic harmonica, Versilian Community Sample Library. [VCSL](https://github.com/sgossner/VCSL). CC0. The files that speak in this register measure at C5 (523 Hz), E5 (659 Hz), G5 (784 Hz), and C6 (1046 Hz); the names on disk are an octave lower. Other chorus notes move at most three semitones |
| `music/stem-pad.ogg` | One soft violin note per bar. Night, and inside a mine. Same VSCO violin, not a reed |
| `music/stem-percussion.ogg` | Muted frame drum and shaker, VCSL, CC0. Prospecting and town. Not a boot heel |
| `music/stinger-flake.ogg` | Short D-major tag for the first flake, same samples and room |
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
| `ambience/town.ogg` | Street loop, 18 s. Crowd: "Crowd of 50-60 People #1" by Joseph Sardin, [BigSoundBank 3515](https://bigsoundbank.com/crowd-of-50-60-people-1-s3515.html), 48 kHz 24-bit, low-passed and doubled with a short delay so individual words do not come through. The page does not name a language. Hammer: VCSL anvil hits. Horse: "Breath of a horse #2", a snort, by Denis Chardonnet, [BigSoundBank 286](https://bigsoundbank.com/breath-of-a-horse-2-s0286.html) (their MP3; the FLAC path is not published), and "Breath Horse #4" by Joseph Sardin, [BigSoundBank 1543](https://bigsoundbank.com/breath-horse-4-s1543.html), FLAC. Wheels: "Squeaky wheelbarrow #2" by Joseph Sardin, [BigSoundBank 2517](https://bigsoundbank.com/squeaky-wheelbarrow-2-s2517.html), a wooden wheel outdoors, not a freight wagon, with "Horse Walking on a Path" by Joseph Sardin, [BigSoundBank 1854](https://bigsoundbank.com/horse-walking-on-a-path-s1854.html), under it. Piano: VSCO 2 CE upright, soft layer, a short D-major fragment low-passed as if it were inside the inn, not locked to the score | CC0 |
| `ambience/owl-a.ogg`, `ambience/owl-b.ogg` | "Great Horned Owls Hooting, Crickets" by CHallSmith, [Freesound 870593](https://freesound.org/people/CHallSmith/sounds/870593/), HQ preview. Two excerpts of a field recording. The wav master is behind a login | CC0 |
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
| `sfx/dig-0.ogg` … `dig-3.ogg`, `sfx/dirt-crunch.ogg` | "Dig With a Shovel" by Joseph Sardin, [BigSoundBank 1305](https://bigsoundbank.com/dig-with-a-shovel-s1305.html). Outdoor shovel in the ground, 48 kHz 24-bit FLAC. Sliced; the crunch is a high-passed grain of the same take | CC0 |
| `sfx/slosh.ogg`, `slosh-1.ogg`, `slosh-2.ogg` | "Water Pour Small Pan" by Rudmer_Rotteveel, [Freesound 699581](https://freesound.org/people/Rudmer_Rotteveel/sounds/699581/), HQ preview, water in a steel pan, mixed with high-passed gravel from the earlier guyburns shovel preview. No full-quality pan pour was available without an account, so this composite was left as it was | CC0 |

## What is still weak

The band is sampled, not a session. The guitar is nylon, the banjo is a
6-string, the harmonica is four measured notes repitched by up to three
semitones, and the violin steps in minor thirds. The cabin on the stems is
generated. Percussion is a frame drum and a shaker, not a boot.

Birdsong is a real backyard and a real camera recording, not identified
Sierra species. The cricket bed is a separate night recording from the
owls, so the two do not share a space. Town is a modern crowd of about
fifty, a wooden wheelbarrow rather than a freight wagon, an anvil, and a
sampled upright behind a low-pass. It is not a camp of forty-niners. The
pan swirl is still two recordings, and the water half is a Freesound
preview. The great-horned-owl excerpts are the same kind of preview; a
full-quality owl, shovel-into-gravel, or pan master was not available
without signing in, and the full-quality owls on offer were the wrong
species. Cave reverb is a railway tunnel in Edinburgh, not a Sierra adit.
