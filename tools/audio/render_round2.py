#!/usr/bin/env python3
"""Render the frontier score and the round-2 field-recording edits.

The score is one arrangement of "Oh! Susanna" (Stephen Foster, 1848, public
domain) in D major at 84 BPM. Every stem is the same 16 bars, so the game
can bring layers in on a bar line without a key or tempo change. The
performance itself was written for Them Hills and is dedicated to CC0.

Field recordings are read from /tmp/audio-src/round2 (downloaded once, not
committed). Re-running needs those files. Outputs land in public/audio/.
"""

from __future__ import annotations

import subprocess
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SRC = Path("/tmp/audio-src/round2")
OUT = ROOT / "public" / "audio"
SR = 44100
BPM = 84
BEAT = SR * 60 // BPM  # 31500 samples, exact
BARS = 16
LOOP = BARS * 4 * BEAT  # 2_016_000

RNG = np.random.default_rng(1849)


def write_wav(path: Path, data: np.ndarray, sr: int = SR) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    clipped = np.clip(data, -1, 1)
    pcm = (clipped * 32767).astype(np.int16)
    with wave.open(str(path), "w") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sr)
        handle.writeframes(pcm.tobytes())


def ffmpeg(*args: str) -> None:
    subprocess.check_call(["ffmpeg", "-y", *args], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def decode(src: Path, dst: Path, sr: int = SR, start: float | None = None, duration: float | None = None) -> None:
    cmd = ["-i", str(src)]
    if start is not None:
        cmd = ["-ss", f"{start}", *cmd]
    if duration is not None:
        cmd += ["-t", f"{duration}"]
    cmd += ["-ac", "1", "-ar", str(sr), str(dst)]
    ffmpeg(*cmd)


def read_wav(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "r") as handle:
        sr = handle.getframerate()
        frames = handle.readframes(handle.getnframes())
        channels = handle.getnchannels()
    data = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)
    return data, sr


def encode_ogg(wav_path: Path, ogg_path: Path, quality: int = 4) -> None:
    ogg_path.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg("-i", str(wav_path), "-c:a", "libvorbis", "-q:a", str(quality), str(ogg_path))


def load_audio(src: Path, sr: int = SR, start: float | None = None, duration: float | None = None) -> np.ndarray:
    tmp = SRC / "_decode.wav"
    decode(src, tmp, sr, start, duration)
    data, _ = read_wav(tmp)
    return data


def norm_peak(data: np.ndarray, peak: float) -> np.ndarray:
    max_abs = float(np.max(np.abs(data))) if data.size else 0.0
    if max_abs < 1e-6:
        return data
    return data * (peak / max_abs)


def fade(data: np.ndarray, sr: int, ms: float = 12) -> np.ndarray:
    n = min(len(data) // 4, int(sr * ms / 1000))
    if n < 2:
        return data
    out = data.copy()
    out[:n] *= np.linspace(0, 1, n, dtype=np.float32)
    out[-n:] *= np.linspace(1, 0, n, dtype=np.float32)
    return out


def loop_blend(data: np.ndarray, sr: int, ms: float = 80) -> np.ndarray:
    """Keep the length. Fold a short tail onto the head so the loop joins."""
    n = min(len(data) // 4, int(sr * ms / 1000))
    out = data.copy()
    head = np.linspace(0, 1, n, dtype=np.float32)
    tail = np.linspace(1, 0, n, dtype=np.float32)
    out[:n] = out[:n] * head + out[-n:] * tail
    out[-n:] *= tail
    return out


def mix_at(buf: np.ndarray, start: int, clip: np.ndarray) -> None:
    if start >= len(buf) or clip.size == 0:
        return
    if start < 0:
        clip = clip[-start:]
        start = 0
    end = min(len(buf), start + len(clip))
    buf[start:end] += clip[: end - start]


def adsr(n: int, sr: int, attack: float, release: float, sustain: float = 0.85) -> np.ndarray:
    env = np.full(n, sustain, dtype=np.float32)
    a = min(n // 3, max(1, int(attack * sr)))
    r = min(n // 3, max(1, int(release * sr)))
    env[:a] = np.linspace(0, 1, a, dtype=np.float32)
    if a < n - r:
        env[a : n - r] = np.linspace(1, sustain, n - r - a, dtype=np.float32)
    env[-r:] = np.linspace(env[max(0, n - r - 1)], 0, r, dtype=np.float32)
    return env


def pluck(freq: float, seconds: float, decay: float, brightness: float, vel: float) -> np.ndarray:
    n = max(1, int(seconds * SR))
    if freq < 40:
        return np.zeros(n, dtype=np.float32)
    period = max(2, int(SR / freq))
    excite = RNG.normal(0, 1, period).astype(np.float32)
    coeff = 0.15 + 0.75 * brightness
    for i in range(1, period):
        excite[i] = coeff * excite[i] + (1 - coeff) * excite[i - 1]
    peak = float(np.max(np.abs(excite))) or 1.0
    buf = excite * (vel / peak)
    out = np.empty(n, dtype=np.float32)
    idx = 0
    for i in range(n):
        sample = buf[idx]
        out[i] = sample
        nxt = buf[(idx + 1) % period]
        buf[idx] = decay * 0.5 * (sample + nxt)
        idx += 1
        if idx == period:
            idx = 0
    click = int(0.004 * SR)
    out[:click] += vel * 0.08 * RNG.normal(0, 1, click).astype(np.float32)
    out *= adsr(n, SR, 0.004, 0.05, 1.0)
    return out


def bow(freq: float, seconds: float, vel: float) -> np.ndarray:
    n = max(1, int(seconds * SR))
    t = np.arange(n, dtype=np.float64) / SR
    vibrato = 2 ** ((np.sin(2 * np.pi * 5.4 * t) * np.minimum(1, t / 0.18) * 8) / 1200)
    phase = 2 * np.pi * freq * np.cumsum(vibrato) / SR
    tone = np.zeros(n, dtype=np.float64)
    for k in range(1, 10):
        tone += (vel / k) * np.sin(k * phase)
    breath = RNG.normal(0, 1, n) * vel * 0.04
    env = adsr(n, SR, 0.07, 0.14, 0.8)
    return ((tone + breath) * env).astype(np.float32)


def harmonica(freq: float, seconds: float, vel: float) -> np.ndarray:
    n = max(1, int(seconds * SR))
    t = np.arange(n, dtype=np.float64) / SR
    scoop = 2 ** ((-35 * np.exp(-t / 0.04)) / 1200)
    trem = 1 + 0.06 * np.sin(2 * np.pi * 5.8 * t)
    phase = 2 * np.pi * freq * np.cumsum(scoop) / SR
    tone = np.zeros(n, dtype=np.float64)
    for k in range(1, 22, 2):
        partial = freq * k
        formant = np.exp(-0.5 * ((partial - 880) / 380) ** 2) + 0.55 * np.exp(-0.5 * ((partial - 1760) / 520) ** 2)
        tone += vel * formant * np.sin(k * phase) / (k ** 0.35)
    breath = RNG.normal(0, 1, n) * vel * 0.12
    # A cheap high-pass so the breath isn't a rumble.
    breath = np.convolve(breath, [1, -0.97], mode="same")
    env = adsr(n, SR, 0.045, 0.1, 0.75)
    return ((tone * trem + breath) * env).astype(np.float32)


def thump(vel: float) -> np.ndarray:
    n = int(0.16 * SR)
    t = np.arange(n, dtype=np.float32) / SR
    body = np.sin(2 * np.pi * 68 * t) * np.exp(-t * 28)
    click = RNG.normal(0, 1, n).astype(np.float32) * np.exp(-t * 80)
    return vel * (0.8 * body + 0.25 * click)


def brush(vel: float) -> np.ndarray:
    n = int(0.09 * SR)
    t = np.arange(n, dtype=np.float32) / SR
    noise = RNG.normal(0, 1, n).astype(np.float32)
    noise = np.convolve(noise, [0.2, 0.6, 0.2], mode="same")
    return vel * noise * np.exp(-t * 36) * 0.45


def beat_sample(beat: float) -> int:
    return int(round(beat * BEAT))


def place_note(buf: np.ndarray, beat: float, clip: np.ndarray, jitter: float = 0.012) -> None:
    slip = int(RNG.normal(0, jitter * SR))
    mix_at(buf, beat_sample(beat) + slip, clip)


CHORD_EIGHTHS = {
    "D": [38, 57, 54, 62, 45, 66, 57, 62],
    "G": [43, 62, 59, 67, 50, 71, 62, 67],
    "A": [45, 64, 61, 69, 52, 73, 64, 69],
}
BANJO_EIGHTHS = {
    "D": [62, 69, 66, 74, 69, 66, 62, 69],
    "G": [67, 74, 71, 79, 74, 71, 67, 74],
    "A": [69, 76, 73, 81, 76, 73, 69, 76],
}
BAR_CHORDS = ["D", "D", "A", "D", "D", "D", "A", "D", "D", "G", "D", "A", "D", "G", "A", "D"]

# (start beat, midi, duration in beats, velocity). Beats are quarter notes.
VERSE = [
    (0.0, 74, 0.5, 0.7),
    (0.5, 74, 0.5, 0.62),
    (1.0, 76, 0.5, 0.66),
    (1.5, 78, 0.5, 0.7),
    (2.0, 81, 0.75, 0.78),
    (2.75, 81, 0.25, 0.5),
    (3.0, 79, 0.5, 0.64),
    (3.5, 78, 0.5, 0.6),
    (4.0, 76, 0.5, 0.62),
    (4.5, 76, 0.5, 0.55),
    (5.0, 78, 0.5, 0.64),
    (5.5, 79, 0.5, 0.66),
    (6.0, 76, 1.0, 0.7),
    (7.0, 74, 1.0, 0.72),
    (8.0, 74, 0.5, 0.68),
    (8.5, 74, 0.5, 0.6),
    (9.0, 76, 0.5, 0.64),
    (9.5, 78, 0.5, 0.68),
    (10.0, 81, 0.75, 0.76),
    (10.75, 81, 0.25, 0.48),
    (11.0, 79, 0.5, 0.62),
    (11.5, 78, 0.5, 0.58),
    (12.0, 76, 0.5, 0.6),
    (12.5, 78, 0.5, 0.64),
    (13.0, 79, 0.5, 0.66),
    (13.5, 81, 0.5, 0.7),
    (14.0, 78, 1.0, 0.72),
    (15.0, 74, 1.0, 0.74),
    (16.0, 78, 0.5, 0.66),
    (16.5, 81, 0.5, 0.7),
    (17.0, 81, 0.5, 0.64),
    (17.5, 78, 0.5, 0.58),
    (18.0, 79, 1.0, 0.7),
    (19.0, 78, 1.0, 0.66),
    (20.0, 76, 0.5, 0.6),
    (20.5, 78, 0.5, 0.62),
    (21.0, 79, 0.5, 0.66),
    (21.5, 81, 0.5, 0.7),
    (22.0, 78, 1.0, 0.68),
    (23.0, 74, 1.0, 0.7),
    (24.0, 74, 0.5, 0.64),
    (24.5, 76, 0.5, 0.6),
    (25.0, 78, 0.5, 0.66),
    (25.5, 81, 0.5, 0.72),
    (26.0, 83, 0.75, 0.76),
    (26.75, 81, 0.25, 0.5),
    (27.0, 79, 0.5, 0.62),
    (27.5, 78, 0.5, 0.58),
    (28.0, 76, 0.5, 0.6),
    (28.5, 78, 0.5, 0.64),
    (29.0, 79, 0.5, 0.66),
    (29.5, 76, 0.5, 0.6),
    (30.0, 74, 1.0, 0.72),
    (31.0, 74, 1.0, 0.7),
]
CHORUS = [
    (32.0, 81, 0.5, 0.82),
    (32.5, 78, 0.5, 0.7),
    (33.0, 74, 1.0, 0.78),
    (34.0, 74, 0.75, 0.66),
    (35.0, 71, 0.5, 0.64),
    (35.5, 79, 0.5, 0.74),
    (36.0, 76, 0.5, 0.68),
    (36.5, 76, 0.5, 0.6),
    (37.0, 78, 1.0, 0.76),
    (38.0, 74, 1.5, 0.8),
    (40.0, 74, 0.5, 0.66),
    (40.5, 76, 0.5, 0.64),
    (41.0, 78, 0.5, 0.7),
    (41.5, 81, 0.5, 0.78),
    (42.0, 81, 0.5, 0.7),
    (42.5, 79, 0.5, 0.64),
    (43.0, 78, 0.5, 0.62),
    (43.5, 76, 0.5, 0.6),
    (44.0, 78, 0.5, 0.68),
    (44.5, 79, 0.5, 0.7),
    (45.0, 81, 0.5, 0.76),
    (45.5, 78, 0.5, 0.66),
    (46.0, 74, 1.5, 0.8),
    (48.0, 69, 0.5, 0.6),
    (48.5, 74, 0.5, 0.66),
    (49.0, 78, 0.5, 0.72),
    (49.5, 81, 0.5, 0.8),
    (50.0, 78, 1.0, 0.74),
    (51.0, 74, 2.0, 0.82),
]
PAD = [74, 78, 76, 78, 74, 81, 76, 74, 78, 79, 78, 76, 74, 79, 73, 74]


def midi_freq(midi: float) -> float:
    return 440.0 * (2 ** ((midi - 69) / 12))


def render_guitar() -> np.ndarray:
    buf = np.zeros(LOOP, dtype=np.float32)
    for bar, chord in enumerate(BAR_CHORDS):
        notes = CHORD_EIGHTHS[chord]
        for eighth, midi in enumerate(notes):
            beat = bar * 4 + eighth * 0.5
            dur = 1.05 if eighth in (0, 4) else 0.62
            vel = 0.86 if eighth in (0, 4) else 0.42 + 0.08 * (eighth % 2)
            clip = pluck(midi_freq(midi), dur, 0.996, 0.42, vel)
            place_note(buf, beat, clip, 0.008)
    return buf


def render_banjo() -> np.ndarray:
    buf = np.zeros(LOOP, dtype=np.float32)
    for bar, chord in enumerate(BAR_CHORDS):
        notes = BANJO_EIGHTHS[chord]
        loud = 1.0 if bar % 2 == 0 else 0.72
        for eighth in (0, 1, 2, 4, 5, 7):
            beat = bar * 4 + eighth * 0.5
            vel = (0.7 if eighth % 2 == 0 else 0.48) * loud
            clip = pluck(midi_freq(notes[eighth]), 0.26, 0.972, 0.85, vel)
            place_note(buf, beat, clip, 0.006)
    return buf


def render_fiddle() -> np.ndarray:
    buf = np.zeros(LOOP, dtype=np.float32)
    for beat, midi, dur, vel in VERSE:
        place_note(buf, beat, bow(midi_freq(midi), dur * 60 / BPM, vel))
    for beat, midi, dur, vel in CHORUS:
        place_note(buf, beat, bow(midi_freq(midi - 12), dur * 60 / BPM, vel * 0.9))
    return buf


def render_harmonica() -> np.ndarray:
    buf = np.zeros(LOOP, dtype=np.float32)
    for beat, midi, dur, vel in CHORUS:
        place_note(buf, beat, harmonica(midi_freq(midi), dur * 60 / BPM, vel))
    return buf


def render_pad() -> np.ndarray:
    buf = np.zeros(LOOP, dtype=np.float32)
    for bar, midi in enumerate(PAD):
        clip = harmonica(midi_freq(midi - 12), 3.4 * 60 / BPM, 0.42)
        place_note(buf, bar * 4, clip, 0.01)
    return buf


def render_percussion() -> np.ndarray:
    buf = np.zeros(LOOP, dtype=np.float32)
    for bar in range(BARS):
        accent = 1.15 if bar % 4 == 0 else 0.85
        for beat in (0, 2):
            place_note(buf, bar * 4 + beat, thump(0.8 * accent), 0.01)
        for beat in (1, 3):
            place_note(buf, bar * 4 + beat, brush(0.7 * accent), 0.008)
    return buf


def render_stinger(kind: str) -> np.ndarray:
    if kind == "flake":
        seconds = 2.4
        notes = [(0.05, 62, "g"), (0.28, 66, "g"), (0.5, 69, "g"), (0.78, 74, "g"), (1.05, 81, "h"), (1.45, 78, "h"), (1.85, 74, "h")]
    elif kind == "nugget":
        seconds = 3.5
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
        seconds = 2.9
        notes = [(0.02, 57, "g"), (0.02, 64, "b"), (0.35, 69, "h"), (0.7, 73, "h"), (1.15, 74, "f"), (1.15, 62, "g"), (1.7, 69, "b"), (2.05, 74, "h")]
    buf = np.zeros(int(seconds * SR), dtype=np.float32)
    for when, midi, voice in notes:
        freq = midi_freq(midi)
        if voice == "g":
            clip = pluck(freq, 1.1, 0.996, 0.4, 0.75)
        elif voice == "b":
            clip = pluck(freq, 0.34, 0.97, 0.9, 0.7)
        elif voice == "f":
            clip = bow(freq, 1.3, 0.72)
        else:
            clip = harmonica(freq, 0.7, 0.8)
        mix_at(buf, int(when * SR), clip)
    return fade(norm_peak(buf, 0.8), SR, 20)


def finish_stem(buf: np.ndarray) -> np.ndarray:
    if len(buf) != LOOP:
        raise SystemExit(f"stem length {len(buf)} != {LOOP}")
    return loop_blend(norm_peak(buf, 0.68), SR, 90)


def render_score(tmp: Path) -> None:
    stems = {
        "stem-guitar.ogg": render_guitar(),
        "stem-banjo.ogg": render_banjo(),
        "stem-fiddle.ogg": render_fiddle(),
        "stem-harmonica.ogg": render_harmonica(),
        "stem-pad.ogg": render_pad(),
        "stem-percussion.ogg": render_percussion(),
    }
    music = OUT / "music"
    for name, audio in stems.items():
        wav = tmp / name.replace(".ogg", ".wav")
        write_wav(wav, finish_stem(audio))
        encode_ogg(wav, music / name, 4)
        print("stem", name, music.joinpath(name).stat().st_size)
    for kind in ("flake", "nugget", "sale"):
        wav = tmp / f"stinger-{kind}.wav"
        write_wav(wav, render_stinger(kind))
        encode_ogg(wav, music / f"stinger-{kind}.ogg", 5)
    for retired in ("exploration.ogg", "prospecting.ogg", "town.ogg", "night.ogg"):
        path = music / retired
        if path.exists():
            path.unlink()
            print("removed", retired)


def slice_peaks(data: np.ndarray, sr: int, count: int, pre: float, post: float, gap: float) -> list[np.ndarray]:
    win = max(1, int(0.02 * sr))
    env = np.sqrt(np.convolve(data * data, np.ones(win) / win, mode="same"))
    hop = max(1, int(0.01 * sr))
    env_d = env[::hop]
    threshold = float(np.percentile(env_d, 88))
    min_gap = int(gap * sr / hop)
    picks: list[int] = []
    for i in range(1, len(env_d) - 1):
        if env_d[i] < threshold or env_d[i] < env_d[i - 1] or env_d[i] < env_d[i + 1]:
            continue
        if picks and i - picks[-1] < min_gap:
            if env_d[i] > env_d[picks[-1]]:
                picks[-1] = i
            continue
        picks.append(i)
    picks.sort(key=lambda i: env_d[i], reverse=True)
    clips = []
    for i in picks[:count]:
        center = i * hop
        a = max(0, center - int(pre * sr))
        b = min(len(data), center + int(post * sr))
        clips.append(fade(norm_peak(data[a:b], 0.8), sr, 10))
    return clips


def render_field(tmp: Path) -> None:
    required = [
        "gho.mp3",
        "murmur.mp3",
        "shovel.mp3",
        "pan.mp3",
        "birds.ogg",
        "birdchirp.wav",
        "crickets.mp3",
        "tunnel.wav",
    ]
    missing = [name for name in required if not (SRC / name).exists()]
    if missing:
        raise SystemExit(f"missing field sources in {SRC}: {', '.join(missing)}")

    # Night crickets are their own recording. The owl take is owl-heavy, so
    # high-passing it mostly raises hiss. This loop is the cricket bed.
    bed = load_audio(SRC / "crickets.mp3", SR)
    bed = loop_blend(norm_peak(bed, 0.5), SR, 120)
    write_wav(tmp / "crickets.wav", bed)
    encode_ogg(tmp / "crickets.wav", OUT / "ambience" / "crickets.ogg", 3)

    owl_at = [7.55, 15.35]
    for index, at in enumerate(owl_at):
        clip = fade(norm_peak(load_audio(SRC / "gho.mp3", SR, at, 2.3), 0.85), SR, 25)
        name = "owl-a" if index == 0 else "owl-b"
        write_wav(tmp / f"{name}.wav", clip)
        encode_ogg(tmp / f"{name}.wav", OUT / "ambience" / f"{name}.ogg", 5)

    # Distant speech, low-passed so the words stay a murmur.
    murmur = load_audio(SRC / "murmur.mp3", SR, 8, 16)
    murmur = np.convolve(murmur, np.ones(18) / 18, mode="same").astype(np.float32)
    murmur = loop_blend(norm_peak(murmur, 0.32), SR, 220)
    write_wav(tmp / "town.wav", murmur)
    encode_ogg(tmp / "town.wav", OUT / "ambience" / "town.ogg", 3)

    birds = load_audio(SRC / "birds.ogg", SR)
    chirps = slice_peaks(birds, SR, 3, 0.08, 0.55, 0.7)
    extra = fade(norm_peak(load_audio(SRC / "birdchirp.wav", SR), 0.75), SR, 15)
    chirps.append(extra)
    while len(chirps) < 4:
        chirps.append(chirps[-1])
    for index, clip in enumerate(chirps[:4]):
        name = f"bird-{chr(ord('a') + index)}"
        write_wav(tmp / f"{name}.wav", clip)
        encode_ogg(tmp / f"{name}.wav", OUT / "ambience" / f"{name}.ogg", 5)

    shovel = load_audio(SRC / "shovel.mp3", SR)
    scoops = slice_peaks(shovel, SR, 4, 0.04, 0.62, 0.45)
    while len(scoops) < 4:
        scoops.append(scoops[-1] if scoops else shovel[: int(0.5 * SR)])
    for index, clip in enumerate(scoops[:4]):
        write_wav(tmp / f"dig-{index}.wav", clip)
        encode_ogg(tmp / f"dig-{index}.wav", OUT / "sfx" / f"dig-{index}.ogg", 5)
    crunch = slice_peaks(shovel, SR, 1, 0.02, 0.28, 0.3)
    crunch_clip = crunch[0] if crunch else shovel[: int(0.3 * SR)]
    # Keep the grit and ease off the lowest thump so it sits under the scoop.
    crunch_clip = np.convolve(crunch_clip, [1, -0.92], mode="same").astype(np.float32)
    write_wav(tmp / "dirt-crunch.wav", fade(norm_peak(crunch_clip, 0.7), SR, 8))
    encode_ogg(tmp / "dirt-crunch.wav", OUT / "sfx" / "dirt-crunch.ogg", 4)

    pan = load_audio(SRC / "pan.mp3", SR)
    gravel = np.convolve(shovel, [1, -0.85], mode="same").astype(np.float32)
    for index, at in enumerate((1.2, 2.6, 4.1)):
        water = pan[int(at * SR) : int((at + 0.85) * SR)]
        grit = gravel[int((0.4 + index * 0.7) * SR) : int((0.4 + index * 0.7 + 0.85) * SR)]
        n = min(len(water), len(grit))
        swirl = water[:n] * 0.85 + grit[:n] * 0.28
        swirl = fade(norm_peak(swirl, 0.78), SR, 18)
        name = "slosh" if index == 0 else f"slosh-{index}"
        write_wav(tmp / f"{name}.wav", swirl)
        encode_ogg(tmp / f"{name}.wav", OUT / "sfx" / f"{name}.ogg", 5)

    # Gill Heads Mine's measured tail is very short. The Innocent Railway
    # Tunnel response (same library, same license) is a real stone tunnel
    # with a decay long enough to read as a mine.
    print("tunnel impulse")
    raw = subprocess.check_output(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(SRC / "tunnel.wav"),
            "-ac",
            "1",
            "-ar",
            str(SR),
            "-f",
            "f32le",
            "-",
        ]
    )
    ir = np.frombuffer(raw, dtype=np.float32).copy()
    peak_at = int(np.argmax(np.abs(ir)))
    begin = max(0, peak_at - int(0.012 * SR))
    end = min(len(ir), begin + int(2.15 * SR))
    impulse = ir[begin:end]
    tail = int(0.35 * SR)
    if len(impulse) > tail:
        impulse[-tail:] *= np.linspace(1, 0, tail, dtype=np.float32)
    impulse = norm_peak(impulse, 0.7)
    ir_dir = OUT / "ir"
    ir_dir.mkdir(parents=True, exist_ok=True)
    write_wav(tmp / "mine.wav", impulse)
    encode_ogg(tmp / "mine.wav", ir_dir / "mine.ogg", 8)


def main() -> None:
    tmp = SRC / "rendered"
    tmp.mkdir(parents=True, exist_ok=True)
    for sub in ("music", "ambience", "sfx", "ir"):
        (OUT / sub).mkdir(parents=True, exist_ok=True)
    render_score(tmp)
    render_field(tmp)
    total = 0
    for path in sorted(OUT.rglob("*")):
        if path.is_file():
            total += path.stat().st_size
    print(f"public/audio {total / 1024:.0f} KiB")


if __name__ == "__main__":
    main()
