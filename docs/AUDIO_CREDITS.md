# Audio credits

Them Hills loads these clips after the first click or keypress. They are not
part of the boot bundle. Formats are Ogg Vorbis. Paths are under `public/audio/`.

Anything listed as edited was loudness-matched and re-encoded. A few music
beds were also trimmed and given a short loop crossfade so they can repeat.
The game does not ship the untouched source files.

## Original, dedicated to CC0

Written for this project (`tools/audio/render_originals.py`). No attribution
required.

| File | What it is |
| --- | --- |
| `music/stinger-flake.ogg` | First-gold flourish: plucked strings, a fiddle line, a harmonica note |
| `music/stinger-nugget.ogg` | Larger strike: low string, banjo roll, fiddle, harmonica |
| `music/stinger-sale.ogg` | Sale flourish: strummed chord and a rising harmonica line |
| `ambience/owl-a.ogg`, `ambience/owl-b.ogg` | Two synthesized hoots |
| `ambience/town.ogg` | Muffled murmur built from filtered noise, not a crowd recording |
| `sfx/slosh.ogg` | Pan slosh |
| `sfx/dirt-crunch.ogg` | Dirt layer under the dig impact |

## Music beds

These are four separate pieces. The game crossfades them (about three
seconds, with the outgoing bed low-passed). They are not stems of one score.

| File | Cue | Source | License |
| --- | --- | --- | --- |
| `music/exploration.ogg` | Walking the hills | "Steady Rhythm" by Justin Dalessandro (ColdOneK). [OpenGameArt](https://opengameart.org/content/steady-rhythm-relaxing-acoustic-loop) | CC-BY 4.0. Attribution required |
| `music/prospecting.ogg` | Digging and panning | "Celtic Loop" by stereoscopic. [OpenGameArt](https://opengameart.org/content/celtic-loop) | CC0 |
| `music/town.ogg` | Near camp and the buyers | "Faraway" by obscure music (Gichco). [OpenGameArt](https://opengameart.org/content/faraway). Excerpt, looped | CC0 |
| `music/night.ogg` | Night, and inside a mine | "Dark Forest Theme" by cynicmusic (The Cynic Project). [OpenGameArt](https://opengameart.org/content/dark-forest-theme). Excerpt, looped. Optional credit: The Cynic Project / cynicmusic.com / pixelsphere.org | CC0 |

## Ambience recordings

| File | Source | License |
| --- | --- | --- |
| `ambience/creek.ogg` | "Running Water - background noise" by HippoDevelopment. [OpenGameArt](https://opengameart.org/content/running-water-background-noise) | CC-BY 3.0. Attribution required |
| `ambience/creek-close.ogg` | `water_flowing.ogg` from "30 CC0 SFX loops" by rubberduck. [OpenGameArt](https://opengameart.org/content/30-cc0-sfx-loops) | CC0 |
| `ambience/wind.ogg` | Wind recorded by Jonathan Shaw (InspectorJ), [Freesound 376415](https://freesound.org/people/InspectorJ/sounds/376415/), looped by AntumDeluge. [OpenGameArt](https://opengameart.org/content/wind-loop) | CC-BY 3.0. Attribution required |
| `ambience/rain.ogg` | `rain.ogg` from rubberduck's "30 CC0 SFX loops" | CC0 |
| `ambience/crickets.ogg` | `cricket2.wav` by Aj_, made in as3sfxr. [OpenGameArt](https://opengameart.org/content/birdcricketfrog-and-mosquito-sounds) | CC0 |
| `ambience/bird-a.ogg`, `ambience/bird-b.ogg` | `bird.wav` and `bird2.wav` by Aj_, as3sfxr, same page | CC0 |

Cave reverb is not a recording. It is a short noise impulse with a few early
taps, generated when the audio context starts.

## Foley and UI

Kenney (www.kenney.nl), CC0. Attribution is not required. Packs used:
Interface Sounds, Impact Sounds, RPG Audio.

| Files | Kenney source |
| --- | --- |
| `sfx/ui-click.ogg`, `ui-hover.ogg`, `ui-open.ogg`, `ui-close.ogg`, `ui-confirm.ogg`, `ui-pluck.ogg` | Interface Sounds |
| `sfx/foot-grass-0.ogg` … `foot-grass-3.ogg`, `foot-wood-0.ogg` … `foot-wood-3.ogg` | Impact Sounds footsteps |
| `sfx/dig-0.ogg` … `dig-3.ogg` | Impact Sounds `impactMining` |
| `sfx/jump.ogg`, `sfx/land.ogg` | Impact Sounds `impactSoft` |
| `sfx/gold-0.ogg`, `gold-1.ogg`, `gold-2.ogg` | Impact Sounds metal and tin hits |
| `sfx/gold-3.ogg`, `sfx/coins.ogg`, `sfx/coins-b.ogg` | RPG Audio `metalClick`, `handleCoins`, `handleCoins2` |

Other footsteps:

| Files | Source | License |
| --- | --- | --- |
| `sfx/foot-grass-4.ogg` … `foot-grass-7.ogg` | swuing, [Freesound 38874](https://freesound.org/people/swuing/sounds/38874/), edited in "Footsteps on different surfaces" by congusbongus. [OpenGameArt](https://opengameart.org/content/footsteps-on-different-surfaces) | CC-BY 3.0. Attribution required |
| `sfx/foot-water-0.ogg` … `foot-water-3.ogg` | EminYILDIRIM, [Freesound 608663](https://freesound.org/people/EminYILDIRIM/sounds/608663/), and swuing, [Freesound 38873](https://freesound.org/people/swuing/sounds/38873/), same pack | CC-BY 3.0. Attribution required |
| `sfx/foot-gravel-0.ogg` … `foot-gravel-3.ogg` | Ali_6868, [Freesound pack 21608](https://freesound.org/people/Ali_6868/packs/21608/), same pack (that folder is marked CC0) | CC0 |
| `sfx/foot-dirt-0.ogg` … `foot-dirt-2.ogg` | TinyWorlds, from pdsounds.org recordings (mud and leaves). [OpenGameArt](https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud) | CC0 |

## What this does not include

There is no recorded shovel-in-soil take, no field recording of birds or a
night chorus, and no recorded mine. The dig is a mining impact plus the
original crunch. Birds and crickets are the as3sfxr clips above. The town
bed is synthesized. The score changes by crossfading whole tracks, so a
transition can disagree in key for a moment.
