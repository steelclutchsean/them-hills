#!/usr/bin/env python3
"""Render the frontier score from CC0 instrument samples, and the town bed.

Same arrangement as render_round2.py: "Oh! Susanna" in D major, 84 BPM,
16 bars, six stems. The notes are played with recorded samples instead of
Karplus-Strong and waveforms. A short generated cabin is mixed into every
stem and wrapped so the loop stays exactly 16 bars.

Sources live under /tmp/audio-src/round3 (downloaded once, not committed).
Outputs overwrite public/audio/music/stem-*.ogg, the stingers, town.ogg,
and the shovel one-shots.
"""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from render_round2 import (
    BANJO_EIGHTHS,
    BAR_CHORDS,
    BARS,
    BPM,
    CHORD_EIGHTHS,
    CHORUS,
    LOOP,
    PAD,
    SR,
    VERSE,
    fade,
    finish_stem,
    loop_blend,
    mix_at,
    norm_peak,
    place_note,
    slice_peaks,
)

ROOT = Path(__file__).resolve().parents[2]
ROUND3 = Path("/tmp/audio-src/round3")
OUT = ROOT / "public" / "audio"
PICK = np.random.default_rng(1851)

GUITAR_SFZ = ROUND3 / "guitar" / "SpanishClassicalGuitar-SFZ-20190618" / "SpanishClassicalGuitar-20190618.sfz"
GANJO_SFZ = ROUND3 / "ganjo" / "ganjo" / "ganjo.sfz"
VSCO = ROUND3 / "vsco"
VCSL = ROUND3 / "vcsl"
PIANO = ROUND3 / "piano"
TOWN = ROUND3 / "town"
FOLEY = ROUND3 / "foley"

# Hohner Super 64 files are named an octave below the pitch they actually
# speak. These centers are the measured fundamentals (Hz shown in credits).
HARM_FILES = {
    72: "harm_C4.wav",  # 523 Hz, C5
    76: "harm_E4.wav",  # 659 Hz, E5
    79: "harm_G4.wav",  # 784 Hz, G5
    84: "harm_C5.wav",  # 1046 Hz, C6
}
VIOLIN_NOTES = {
    "G3": 55,
    "A3": 57,
    "C4": 60,
    "E4": 64,
    "G4": 67,
    "A4": 69,
    "C5": 72,
    "E5": 76,
    "G5": 79,
    "A5": 81,
}
# VSCO upright, soft layer, measured fundamentals.
PIANO_FILES = {
    49: "dyn1_014.wav",
    53: "dyn1_016.wav",
    57: "dyn1_018.wav",
    61: "dyn1_020.wav",
    65: "dyn1_022.wav",
    69: "dyn1_024.wav",
}


@dataclass
class Region:
    lo: int
    hi: int
    center: int
    path: Path
    layer: str = ""


class Sampler:
    def __init__(self, name: str, max_shift: int, fold: bool = False) -> None:
        self.name = name
        self.max_shift = max_shift
        self.fold = fold
        self.regions: list[Region] = []
        self.cache: dict[tuple[str, int], np.ndarray] = {}
        self.raw_cache: dict[str, np.ndarray] = {}
        self.shifts: list[int] = []

    def add(self, lo: int, hi: int, center: int, path: Path, layer: str = "") -> None:
        if not path.exists():
            raise SystemExit(f"{self.name} missing sample {path}")
        self.regions.append(Region(lo, hi, center, path, layer))

    def _hits(self, midi: int) -> list[Region]:
        hits = [region for region in self.regions if region.lo <= midi <= region.hi]
        if not hits:
            center = min({region.center for region in self.regions}, key=lambda note: abs(note - midi))
            hits = [region for region in self.regions if region.center == center]
        else:
            center = min({region.center for region in hits}, key=lambda note: (abs(note - midi), note))
            hits = [region for region in hits if region.center == center]
        return hits

    def fit(self, midi: int) -> int:
        note = int(round(midi))
        if not self.fold:
            return note
        floor = min(region.center for region in self.regions)
        for _ in range(4):
            center = self._hits(note)[0].center
            if abs(note - center) <= self.max_shift or note - 12 < floor:
                break
            note -= 12
        return note

    def play(self, midi: int, seconds: float, vel: float, mode: str) -> np.ndarray:
        note = self.fit(midi)
        hits = self._hits(note)
        layers = {region.layer for region in hits if region.layer}
        if layers:
            want = "f" if vel >= 0.68 else "p"
            if want not in layers:
                want = "f" if "f" in layers else "p"
            chosen = [region for region in hits if region.layer == want]
            if chosen:
                hits = chosen
        region = hits[int(PICK.integers(0, len(hits)))]
        shift = note - region.center
        if abs(shift) > self.max_shift:
            raise SystemExit(f"{self.name} midi {midi} landed on {note} via {region.path.name} shift {shift}")
        self.shifts.append(shift)
        clip = self.pitched(region.path, shift)
        spread = 0.12 if mode == "pluck" else 0.08
        gain = float(np.clip(vel * PICK.uniform(1 - spread, 1 + spread), 0.04, 1.25))
        if mode == "pluck":
            skip = int(PICK.integers(0, 40))
            clip = clip[skip:]
            seconds += 0.14
        elif mode == "hit":
            skip = int(PICK.integers(0, 12))
            clip = clip[skip:]
        length = max(1, int(seconds * SR))
        if mode == "hit":
            length = min(len(clip), length)
        out = np.zeros(length, dtype=np.float32)
        take = min(length, len(clip))
        out[:take] = clip[:take]
        release = int((0.03 if mode != "sustain" else 0.09) * SR)
        release = min(max(1, release), max(1, length // 3))
        out[-release:] *= np.linspace(1, 0, release, dtype=np.float32)
        attack = min(length // 4, int(0.004 * SR))
        if attack > 1:
            out[:attack] *= np.linspace(0, 1, attack, dtype=np.float32)
        return out * gain

    def pitched(self, path: Path, shift: int) -> np.ndarray:
        key = (str(path), shift)
        cached = self.cache.get(key)
        if cached is not None:
            return cached
        raw = self.raw_cache.get(str(path))
        if raw is None:
            raw = load_f32(path)
            raw = raw - float(np.mean(raw))
            self.raw_cache[str(path)] = raw
        if shift == 0:
            pitched = raw
        else:
            rate = 2 ** (shift / 12)
            count = max(1, int(round(len(raw) / rate)))
            pitched = np.interp(
                np.linspace(0, len(raw) - 1, count),
                np.arange(len(raw)),
                raw,
            ).astype(np.float32)
        self.cache[key] = pitched
        return pitched

    def report(self) -> None:
        if not self.shifts:
            print(f"  {self.name}: no notes")
            return
        shifts = np.array(self.shifts)
        print(f"  {self.name}: {len(shifts)} notes, shift {int(shifts.min())}..{int(shifts.max())}")


def load_f32(path: Path) -> np.ndarray:
    raw = subprocess.check_output(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
    )
    if not raw:
        raise SystemExit(f"empty decode {path}")
    return np.frombuffer(raw, dtype=np.float32).copy()


def encode_f32(data: np.ndarray, dest: Path, quality: int) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    clipped = np.clip(data, -1, 1).astype(np.float32)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "f32le",
            "-ar",
            str(SR),
            "-ac",
            "1",
            "-i",
            "pipe:0",
            "-c:a",
            "libvorbis",
            "-q:a",
            str(quality),
            str(dest),
        ],
        input=clipped.tobytes(),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=True,
    )


def fft_convolve(left: np.ndarray, right: np.ndarray) -> np.ndarray:
    count = len(left) + len(right) - 1
    size = 1 << (count - 1).bit_length()
    mixed = np.fft.irfft(np.fft.rfft(left, size) * np.fft.rfft(right, size), size)
    return mixed[:count].astype(np.float32)


def make_cabin() -> np.ndarray:
    """A small wooden room, about 0.4 s. Generated, not a recorded cabin."""
    count = int(0.42 * SR)
    impulse = np.zeros(count, dtype=np.float64)
    taps = (
        (0.009, 0.5),
        (0.013, -0.26),
        (0.018, 0.2),
        (0.027, 0.14),
        (0.039, -0.09),
        (0.058, 0.06),
    )
    for when, gain in taps:
        index = int(when * SR)
        impulse[index] += gain
        if index + 1 < count:
            impulse[index + 1] += gain * 0.35
    noise = np.random.default_rng(7).normal(0, 1, count)
    noise = np.convolve(noise, np.ones(72) / 72, mode="same")
    times = np.arange(count) / SR
    envelope = np.exp(-times / 0.065) * np.clip((times - 0.006) / 0.012, 0, 1)
    impulse += noise * envelope * 0.28
    impulse /= np.max(np.abs(impulse))
    return impulse.astype(np.float32)


def apply_room(dry: np.ndarray, impulse: np.ndarray, wet: float, wrap: bool) -> np.ndarray:
    reflected = fft_convolve(dry, impulse)
    if not wrap:
        out = np.zeros(len(reflected), dtype=np.float32)
        out[: len(dry)] += dry
        out += wet * reflected
        return out
    out = dry.astype(np.float32).copy()
    out += wet * reflected[: len(dry)]
    tail = reflected[len(dry) :]
    out[: len(tail)] += wet * tail
    return out


def lowpass(data: np.ndarray, taps: int) -> np.ndarray:
    return np.convolve(data, np.ones(taps) / taps, mode="same").astype(np.float32)


def parse_sfz(path: Path) -> list[tuple[int, int, int, Path]]:
    regions: list[tuple[int, int, int, Path]] = []
    current: dict[str, str] | None = None
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.split("//")[0].strip()
        if not line:
            continue
        if line.startswith("<"):
            if current and current.get("sample"):
                regions.append(region_from(path.parent, current))
            current = {} if line.lower().startswith("<region") else None
            continue
        if current is None or "=" not in line:
            continue
        for key, value in re.findall(r"([A-Za-z0-9_]+)=([^=]*?)(?=(?:\s+[A-Za-z0-9_]+=)|$)", line):
            current[key.lower()] = value.strip()
    if current and current.get("sample"):
        regions.append(region_from(path.parent, current))
    return regions


def region_from(root: Path, opcodes: dict[str, str]) -> tuple[int, int, int, Path]:
    sample = root / opcodes["sample"].replace("\\", "/")
    if "key" in opcodes:
        key = int(float(opcodes["key"]))
        return key, key, key, sample
    center = int(float(opcodes.get("pitch_keycenter", opcodes.get("lokey", "60"))))
    lo = int(float(opcodes.get("lokey", center)))
    hi = int(float(opcodes.get("hikey", center)))
    return lo, hi, center, sample


def build_instruments() -> dict[str, Sampler]:
    guitar = Sampler("guitar", max_shift=2)
    for lo, hi, center, sample in parse_sfz(GUITAR_SFZ):
        guitar.add(lo, hi, center, sample)
    banjo = Sampler("banjo", max_shift=3, fold=True)
    for lo, hi, center, sample in parse_sfz(GANJO_SFZ):
        banjo.add(lo, hi, center, sample)
    fiddle = Sampler("fiddle", max_shift=2)
    for name, midi in VIOLIN_NOTES.items():
        for layer in ("p", "f"):
            fiddle.add(midi, midi, midi, VSCO / f"vln_{name}_{layer}.wav", layer)
    harmonica = Sampler("harmonica", max_shift=3)
    for midi, name in HARM_FILES.items():
        harmonica.add(midi, midi, midi, VCSL / name)
    drum = Sampler("drum", max_shift=0)
    drum.add(60, 60, 60, VCSL / "drum.wav")
    drum.add(60, 60, 60, VCSL / "drum2.wav")
    shaker = Sampler("shaker", max_shift=0)
    shaker.add(60, 60, 60, VCSL / "shaker.wav")
    shaker.add(60, 60, 60, VCSL / "shaker2.wav")
    print(
        f"samples guitar {len(guitar.regions)} banjo {len(banjo.regions)} "
        f"violin {len(fiddle.regions)} harmonica {len(harmonica.regions)}"
    )
    return {
        "guitar": guitar,
        "banjo": banjo,
        "fiddle": fiddle,
        "harmonica": harmonica,
        "drum": drum,
        "shaker": shaker,
    }


def seconds(beats: float) -> float:
    return beats * 60 / BPM


def render_guitar(sampler: Sampler) -> np.ndarray:
    buf = np.zeros(LOOP, dtype=np.float32)
    for bar, chord in enumerate(BAR_CHORDS):
        for eighth, midi in enumerate(CHORD_EIGHTHS[chord]):
            beat = bar * 4 + eighth * 0.5
            dur = 1.05 if eighth in (0, 4) else 0.62
            vel = 0.86 if eighth in (0, 4) else 0.42 + 0.08 * (eighth % 2)
            swing = 0.012 if eighth % 2 else 0.0
            place_note(buf, beat + swing, sampler.play(midi, seconds(dur), vel, "pluck"), 0.009)
    return buf


def render_banjo(sampler: Sampler) -> np.ndarray:
    buf = np.zeros(LOOP, dtype=np.float32)
    for bar, chord in enumerate(BAR_CHORDS):
        notes = BANJO_EIGHTHS[chord]
        loud = 1.0 if bar % 2 == 0 else 0.72
        for eighth in (0, 1, 2, 4, 5, 7):
            beat = bar * 4 + eighth * 0.5
            vel = (0.7 if eighth % 2 == 0 else 0.48) * loud
            swing = 0.01 if eighth % 2 else 0.0
            place_note(buf, beat + swing, sampler.play(notes[eighth], 0.28, vel, "pluck"), 0.007)
    return buf


def render_fiddle(sampler: Sampler) -> np.ndarray:
    buf = np.zeros(LOOP, dtype=np.float32)
    for beat, midi, dur, vel in VERSE:
        place_note(buf, beat, sampler.play(midi, seconds(dur), vel, "sustain"), 0.016)
    for beat, midi, dur, vel in CHORUS:
        place_note(buf, beat, sampler.play(midi - 12, seconds(dur), vel * 0.9, "sustain"), 0.016)
    return buf


def render_harmonica(sampler: Sampler) -> np.ndarray:
    buf = np.zeros(LOOP, dtype=np.float32)
    for beat, midi, dur, vel in CHORUS:
        place_note(buf, beat, sampler.play(midi, seconds(dur), vel, "sustain"), 0.014)
    return buf


def render_pad(sampler: Sampler) -> np.ndarray:
    buf = np.zeros(LOOP, dtype=np.float32)
    for bar, midi in enumerate(PAD):
        clip = sampler.play(midi - 12, seconds(3.4), 0.4, "sustain")
        place_note(buf, bar * 4, clip, 0.012)
    return buf


def render_percussion(drum: Sampler, shaker: Sampler) -> np.ndarray:
    buf = np.zeros(LOOP, dtype=np.float32)
    for bar in range(BARS):
        accent = 1.12 if bar % 4 == 0 else 0.82
        for beat in (0, 2):
            place_note(buf, bar * 4 + beat, drum.play(60, 0.2, 0.8 * accent, "hit"), 0.01)
        for beat in (1, 3):
            place_note(buf, bar * 4 + beat, shaker.play(60, 0.11, 0.62 * accent, "hit"), 0.008)
    return buf


def render_stinger(kind: str, voices: dict[str, Sampler], impulse: np.ndarray) -> np.ndarray:
    if kind == "flake":
        length = 2.4
        notes = [(0.05, 62, "g"), (0.28, 66, "g"), (0.5, 69, "g"), (0.78, 74, "g"), (1.05, 81, "h"), (1.45, 78, "h"), (1.85, 74, "h")]
    elif kind == "nugget":
        length = 3.5
        notes = [
            (0.02, 50, "g"),
            (0.02, 62, "b"),
            (0.16, 66, "b"),
            (0.28, 69, "b"),
            (0.4, 74, "b"),
            (0.55, 74, "f"),
            (0.55, 81, "f"),
            (1.15, 78, "h"),
            (1.55, 81, "h"),
            (2.05, 86, "h"),
            (2.6, 74, "f"),
        ]
    else:
        length = 2.9
        notes = [(0.02, 57, "g"), (0.02, 64, "b"), (0.35, 69, "h"), (0.7, 73, "h"), (1.15, 74, "f"), (1.15, 62, "g"), (1.7, 69, "b"), (2.05, 74, "h")]
    buf = np.zeros(int(length * SR), dtype=np.float32)
    for when, midi, voice in notes:
        if voice == "g":
            clip = voices["guitar"].play(midi, 1.1, 0.75, "pluck")
        elif voice == "b":
            clip = voices["banjo"].play(midi, 0.32, 0.7, "pluck")
        elif voice == "f":
            clip = voices["fiddle"].play(midi, 1.3, 0.72, "sustain")
        else:
            clip = voices["harmonica"].play(midi, 0.7, 0.8, "sustain")
        slip = int(PICK.normal(0, 0.008 * SR))
        mix_at(buf, int(when * SR) + slip, clip)
    aired = apply_room(buf, impulse, 0.16, wrap=False)
    return fade(norm_peak(aired, 0.8), SR, 30)


def render_score(voices: dict[str, Sampler], impulse: np.ndarray) -> None:
    music = OUT / "music"
    stems = {
        "stem-guitar.ogg": render_guitar(voices["guitar"]),
        "stem-banjo.ogg": render_banjo(voices["banjo"]),
        "stem-fiddle.ogg": render_fiddle(voices["fiddle"]),
        "stem-harmonica.ogg": render_harmonica(voices["harmonica"]),
        "stem-pad.ogg": render_pad(voices["fiddle"]),
        "stem-percussion.ogg": render_percussion(voices["drum"], voices["shaker"]),
    }
    for name, dry in stems.items():
        aired = finish_stem(apply_room(dry, impulse, 0.16, wrap=True))
        if len(aired) != LOOP:
            raise SystemExit(f"{name} length {len(aired)}")
        dest = music / name
        encode_f32(aired, dest, 4)
        print("stem", name, dest.stat().st_size)
    for kind in ("flake", "nugget", "sale"):
        dest = music / f"stinger-{kind}.ogg"
        encode_f32(render_stinger(kind, voices, impulse), dest, 5)
        print("stinger", kind, dest.stat().st_size)
    for voice in voices.values():
        voice.report()


def steady_window(data: np.ndarray, seconds: float) -> tuple[np.ndarray, float]:
    length = int(seconds * SR)
    if len(data) <= length:
        return data, 0.0
    hop = int(0.5 * SR)
    ranked: list[tuple[float, int]] = []
    for start in range(0, len(data) - length, hop):
        segment = data[start : start + length]
        rms = float(np.sqrt(np.mean(segment * segment))) + 1e-9
        peak = float(np.max(np.abs(segment))) + 1e-9
        ranked.append((rms / peak, start))
    ranked.sort(reverse=True)
    _ratio, start = ranked[0]
    return data[start : start + length], start / SR


def best_energy(data: np.ndarray, seconds: float) -> np.ndarray:
    length = int(seconds * SR)
    if len(data) <= length:
        return data
    hop = int(0.1 * SR)
    energy = np.convolve(data * data, np.ones(int(0.2 * SR)) / int(0.2 * SR), mode="same")
    coarse = energy[::hop]
    span = max(1, length // hop)
    totals = np.cumsum(coarse)
    best_at = 0
    best = -1.0
    for index in range(0, len(coarse) - span):
        score = float(totals[index + span] - totals[index])
        if score > best:
            best = score
            best_at = index
    start = best_at * hop
    return data[start : start + length]


def render_town() -> None:
    crowd = load_f32(TOWN / "crowd.flac")
    walla, at = steady_window(crowd, 18)
    print(f"town walla from {at:.1f}s")
    walla = lowpass(walla, 18)
    delayed = np.zeros_like(walla)
    lag = int(0.27 * SR)
    delayed[lag:] = walla[:-lag]
    murmur = walla + 0.55 * delayed
    murmur = norm_peak(murmur, 0.2)

    bed = np.zeros(len(murmur), dtype=np.float32)
    bed += murmur

    anvil_a = fade(lowpass(load_f32(VCSL / "anvil1.wav"), 5), SR, 12)
    anvil_b = fade(lowpass(load_f32(VCSL / "anvil2.wav"), 5), SR, 12)
    for index, when in enumerate((1.15, 3.55, 7.05, 7.42, 11.6, 15.35)):
        hit = anvil_a if index % 2 == 0 else anvil_b
        hit = hit[: int(0.48 * SR)]
        distant = index in (2, 5)
        if distant:
            hit = lowpass(hit, 14)
        mix_at(bed, int(when * SR), norm_peak(hit, 0.16 if distant else 0.34))

    snort = fade(norm_peak(load_f32(TOWN / "snort.mp3"), 0.9), SR, 8)
    breath = fade(norm_peak(load_f32(TOWN / "horse-breath.flac"), 0.7), SR, 10)
    for when, clip, level in ((2.6, snort, 0.22), (9.15, breath, 0.16), (14.4, snort, 0.18)):
        mix_at(bed, int(when * SR), lowpass(clip, 8) * level)

    wheels = fade(lowpass(best_energy(load_f32(TOWN / "wheelbarrow.flac"), 6.5), 10), SR, 80)
    mix_at(bed, int(5.2 * SR), norm_peak(wheels, 0.2))
    hooves = fade(lowpass(best_energy(load_f32(TOWN / "hooves.flac"), 6.5), 16), SR, 90)
    mix_at(bed, int(5.35 * SR), norm_peak(hooves, 0.11))

    piano = Sampler("piano", max_shift=2)
    for midi, name in PIANO_FILES.items():
        piano.add(midi, midi, midi, PIANO / name)
    piano_bus = np.zeros(len(bed), dtype=np.float32)
    phrase = (
        (2.15, 50, 1.15),
        (3.35, 54, 1.05),
        (4.7, 57, 1.35),
        (7.15, 62, 1.2),
        (8.9, 57, 1.0),
        (12.55, 54, 0.9),
        (13.7, 57, 1.15),
        (15.15, 62, 1.25),
    )
    for when, midi, dur in phrase:
        slip = float(PICK.normal(0, 0.03))
        clip = piano.play(midi, dur, 0.34, "sustain")
        mix_at(piano_bus, int((when + slip) * SR), clip)
    piano.report()
    mix_at(bed, 0, norm_peak(lowpass(piano_bus, 30), 0.09))

    town = fade(norm_peak(bed, 0.36), SR, 40)
    town = loop_blend(town, SR, 160)
    dest = OUT / "ambience" / "town.ogg"
    encode_f32(town, dest, 4)
    print("town", dest.stat().st_size, "peak", float(np.max(np.abs(town))))


def render_shovel() -> None:
    shovel = load_f32(FOLEY / "shovel.flac")
    scoops = slice_peaks(shovel, SR, 4, 0.05, 0.7, 0.55)
    while len(scoops) < 4:
        scoops.append(scoops[-1])
    sfx = OUT / "sfx"
    for index, clip in enumerate(scoops[:4]):
        dest = sfx / f"dig-{index}.ogg"
        encode_f32(clip, dest, 5)
        print("dig", index, dest.stat().st_size, "samples", len(clip))
    crunch = slice_peaks(shovel, SR, 1, 0.02, 0.28, 0.3)
    grit = crunch[0] if crunch else shovel[: int(0.3 * SR)]
    grit = np.convolve(grit, [1, -0.92], mode="same").astype(np.float32)
    dest = sfx / "dirt-crunch.ogg"
    encode_f32(fade(norm_peak(grit, 0.7), SR, 8), dest, 4)
    print("crunch", dest.stat().st_size)


def main() -> None:
    for sub in ("music", "ambience", "sfx"):
        (OUT / sub).mkdir(parents=True, exist_ok=True)
    voices = build_instruments()
    impulse = make_cabin()
    render_score(voices, impulse)
    render_town()
    render_shovel()
    total = sum(path.stat().st_size for path in OUT.rglob("*") if path.is_file())
    print(f"public/audio {total / 1024:.0f} KiB")


if __name__ == "__main__":
    main()
