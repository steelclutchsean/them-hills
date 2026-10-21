#!/usr/bin/env python3
"""Render the original CC0 beds and stingers, and encode the licensed sources.

Licensed sources are read from /tmp/audio-src (downloaded once, not committed).
Outputs land in public/audio/. Re-running is safe.

Original material in this file (stingers, owl hoots, town murmur, pan slosh,
dirt crunch) was written for Them Hills and is dedicated to CC0.
"""

from __future__ import annotations

import shutil
import subprocess
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SRC = Path("/tmp/audio-src")
OUT = ROOT / "public" / "audio"
SR = 44100


def write_wav(path: Path, data: np.ndarray, sr: int = SR) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    clipped = np.clip(data, -1, 1)
    if clipped.ndim == 1:
        pcm = (clipped * 32767).astype(np.int16)
        channels = 1
        frames = pcm.tobytes()
    else:
        pcm = (clipped * 32767).astype(np.int16)
        channels = pcm.shape[1]
        frames = pcm.reshape(-1).tobytes()
    with wave.open(str(path), "w") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(2)
        handle.setframerate(sr)
        handle.writeframes(frames)


def read_wav(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "r") as handle:
        sr = handle.getframerate()
        channels = handle.getnchannels()
        frames = handle.readframes(handle.getnframes())
    data = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    if channels > 1:
        data = data.reshape(-1, channels)
    return data, sr


def ffmpeg(*args: str) -> None:
    subprocess.check_call(["ffmpeg", "-y", *args], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def encode_ogg(wav_path: Path, ogg_path: Path, quality: int = 4) -> None:
    ogg_path.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg("-i", str(wav_path), "-c:a", "libvorbis", "-q:a", str(quality), str(ogg_path))


def decode(src: Path, dst: Path, sr: int = SR, channels: int = 2, start: float | None = None, duration: float | None = None) -> None:
    cmd = ["-i", str(src)]
    if start is not None:
        cmd = ["-ss", f"{start}", *cmd]
    if duration is not None:
        cmd += ["-t", f"{duration}"]
    cmd += ["-ac", str(channels), "-ar", str(sr), str(dst)]
    ffmpeg(*cmd)


def normalize_peak(data: np.ndarray, peak: float = 0.9) -> np.ndarray:
    max_abs = float(np.max(np.abs(data)))
    if max_abs < 1e-6:
        return data
    return data * (peak / max_abs)


def loopify(data: np.ndarray, sr: int, fade_sec: float = 1.6) -> np.ndarray:
    fade = int(fade_sec * sr)
    if data.shape[0] <= fade * 2:
        return data
    fade_in = np.linspace(0, 1, fade, dtype=np.float32)
    fade_out = 1 - fade_in
    if data.ndim == 1:
        mixed = data.copy()
        mixed[:fade] = data[:fade] * fade_in + data[-fade:] * fade_out
        return mixed[:-fade]
    mixed = data.copy()
    mixed[:fade] = data[:fade] * fade_in[:, None] + data[-fade:] * fade_out[:, None]
    return mixed[:-fade]


def karplus(freq: float, duration: float, decay: float, brightness: float, sr: int = SR) -> np.ndarray:
    samples = max(2, int(round(sr / freq)))
    buffer = np.random.uniform(-1, 1, samples).astype(np.float64)
    for i in range(1, samples):
        buffer[i] = brightness * buffer[i] + (1 - brightness) * buffer[i - 1]
    out = np.empty(int(sr * duration), dtype=np.float64)
    index = 0
    previous = 0.0
    for i in range(out.shape[0]):
        current = buffer[index]
        out[i] = current
        previous, buffer[index] = current, decay * (0.5 * current + 0.5 * previous)
        index += 1
        if index >= samples:
            index = 0
    peak = np.max(np.abs(out)) + 1e-9
    return (out / peak).astype(np.float32)


def lowpass(data: np.ndarray, cutoff: float, sr: int = SR) -> np.ndarray:
    coefficient = (1 / sr) / ((1 / (2 * np.pi * cutoff)) + (1 / sr))
    out = np.empty_like(data)
    acc = 0.0
    for i, sample in enumerate(data):
        acc += coefficient * (float(sample) - acc)
        out[i] = acc
    return out


def env_adsr(n: int, sr: int, attack: float, release: float) -> np.ndarray:
    t = np.arange(n) / sr
    dur = n / sr
    attack_env = np.clip(t / max(attack, 1e-4), 0, 1)
    release_env = np.clip((dur - t) / max(release, 1e-4), 0, 1)
    return (attack_env * release_env).astype(np.float32)


def fiddle(freq: float, duration: float, sr: int = SR) -> np.ndarray:
    n = int(sr * duration)
    t = np.arange(n) / sr
    vibrato = np.sin(2 * np.pi * 5.1 * t) * freq * 0.012
    phase = 2 * np.pi * np.cumsum(freq + vibrato) / sr
    tone = np.zeros(n, dtype=np.float32)
    for harmonic, amp in ((1, 1.0), (2, 0.55), (3, 0.3), (4, 0.16), (5, 0.09), (6, 0.05)):
        tone += (amp * np.sin(harmonic * phase)).astype(np.float32)
    breath = lowpass(np.random.uniform(-1, 1, n).astype(np.float32), 1800, sr) * 0.08
    shaped = (tone + breath) * env_adsr(n, sr, 0.06, 0.14)
    return normalize_peak(shaped, 0.9)


def harmonica(freq: float, duration: float, sr: int = SR) -> np.ndarray:
    n = int(sr * duration)
    t = np.arange(n) / sr
    tremolo = 0.78 + 0.22 * np.sin(2 * np.pi * 5.4 * t)
    tone = np.sign(np.sin(2 * np.pi * freq * t)) + 0.55 * np.sign(np.sin(2 * np.pi * freq * 1.007 * t))
    tone = lowpass(tone.astype(np.float32), 1400, sr)
    breath = lowpass(np.random.uniform(-1, 1, n).astype(np.float32), 900, sr) * 0.12
    shaped = (tone + breath) * tremolo.astype(np.float32) * env_adsr(n, sr, 0.05, 0.18)
    return normalize_peak(shaped, 0.85)


def place(track: np.ndarray, start: float, note: np.ndarray, gain: float, sr: int = SR) -> None:
    i0 = int(start * sr)
    i1 = min(track.shape[0], i0 + note.shape[0])
    if i0 >= track.shape[0] or i1 <= i0:
        return
    track[i0:i1] += note[: i1 - i0] * gain


def echo(data: np.ndarray, sr: int = SR) -> np.ndarray:
    out = data.astype(np.float32).copy()
    for delay, gain in ((0.037, 0.22), (0.081, 0.14), (0.15, 0.08)):
        shift = int(delay * sr)
        out[shift:] += data[:-shift] * gain
    return out


def render_stingers(tmp: Path) -> None:
    rng_state = np.random.seed(7)
    del rng_state
    specs = {
        "stinger-flake": 2.6,
        "stinger-nugget": 3.8,
        "stinger-sale": 3.2,
    }
    tracks = {name: np.zeros(int(SR * dur), dtype=np.float32) for name, dur in specs.items()}

    def gtr(freq: float, dur: float = 1.1) -> np.ndarray:
        return karplus(freq, dur, 0.996, 0.42)

    def banjo(freq: float, dur: float = 0.45) -> np.ndarray:
        return karplus(freq, dur, 0.972, 0.82)

    flake = tracks["stinger-flake"]
    for time, freq, gain in ((0.0, 392.0, 0.55), (0.12, 493.88, 0.5), (0.24, 587.33, 0.48), (0.38, 783.99, 0.62)):
        place(flake, time, gtr(freq, 1.4), gain)
    place(flake, 0.42, fiddle(587.33, 1.5), 0.28)
    place(flake, 0.55, harmonica(392.0, 1.3), 0.16)

    nugget = tracks["stinger-nugget"]
    place(nugget, 0.0, gtr(196.0, 2.2), 0.7)
    roll = [392.0, 493.88, 587.33, 783.99, 987.77, 783.99, 587.33, 493.88]
    for i, freq in enumerate(roll):
        place(nugget, 0.06 + i * 0.09, banjo(freq, 0.55), 0.34)
    place(nugget, 0.2, fiddle(783.99, 1.6), 0.34)
    place(nugget, 0.55, fiddle(987.77, 1.5), 0.3)
    place(nugget, 0.85, harmonica(587.33, 1.8), 0.28)
    place(nugget, 1.15, gtr(293.66, 1.6), 0.4)

    sale = tracks["stinger-sale"]
    for i, freq in enumerate((196.0, 246.94, 293.66, 392.0)):
        place(sale, 0.01 * i, gtr(freq, 1.8), 0.48)
    for time, freq in ((0.28, 392.0), (0.46, 440.0), (0.64, 493.88), (0.86, 587.33)):
        place(sale, time, harmonica(freq, 1.1), 0.26)
    place(sale, 0.9, fiddle(783.99, 1.5), 0.32)

    out_dir = OUT / "music"
    for name, track in tracks.items():
        rendered = echo(normalize_peak(track, 0.89))
        wav_path = tmp / f"{name}.wav"
        write_wav(wav_path, rendered)
        encode_ogg(wav_path, out_dir / f"{name}.ogg", 5)


def render_owls(tmp: Path) -> None:
    def hoot(fundamental: float) -> np.ndarray:
        parts: list[np.ndarray] = []
        for index, freq in enumerate((fundamental, fundamental * 0.9)):
            n = int(SR * 0.48)
            t = np.arange(n) / SR
            vibrato = 1 + 0.015 * np.sin(2 * np.pi * 3.2 * t)
            tone = np.sin(2 * np.pi * freq * vibrato * t)
            tone += 0.28 * np.sin(2 * np.pi * freq * 2 * vibrato * t)
            breath = lowpass(np.random.uniform(-1, 1, n).astype(np.float32), 700)
            shaped = (tone.astype(np.float32) + 0.18 * breath) * env_adsr(n, SR, 0.09, 0.16)
            parts.append(normalize_peak(shaped, 0.8))
            if index == 0:
                parts.append(np.zeros(int(SR * 0.28), dtype=np.float32))
        return np.concatenate(parts)

    for name, freq in (("owl-a", 348.0), ("owl-b", 312.0)):
        wav_path = tmp / f"{name}.wav"
        write_wav(wav_path, hoot(freq))
        encode_ogg(wav_path, OUT / "ambience" / f"{name}.ogg", 3)


def render_town(tmp: Path) -> None:
    sr = 22050
    dur = 16.0
    n = int(sr * dur)
    rng = np.random.default_rng(11)
    white = rng.normal(0, 1, n).astype(np.float32)
    spectrum = np.fft.rfft(white)
    freqs = np.fft.rfftfreq(n, 1 / sr)
    mixed = np.zeros(n, dtype=np.float32)
    for center, width, amp in ((420, 90, 0.45), (780, 140, 0.55), (1250, 180, 0.4), (2100, 220, 0.18)):
        band = spectrum.copy()
        band[(freqs < center - width) | (freqs > center + width)] = 0
        voice = np.fft.irfft(band, n=n).astype(np.float32)
        envelope = np.zeros(n, dtype=np.float32)
        cursor = 0.0
        while cursor < dur - 0.15:
            length = float(rng.uniform(0.07, 0.24))
            i0 = int(cursor * sr)
            i1 = min(n, int((cursor + length) * sr))
            if i1 - i0 > 8:
                envelope[i0:i1] += np.hanning(i1 - i0).astype(np.float32) * float(rng.uniform(0.25, 1))
            cursor += length + float(rng.uniform(0.04, 0.22))
        mixed += voice * envelope * amp
    # Keep it muffled, like a room full of people behind a wall.
    keep = (freqs > 160) & (freqs < 1900)
    spec = np.fft.rfft(mixed)
    spec[~keep] *= 0.15
    mixed = np.fft.irfft(spec, n=n).astype(np.float32)
    mixed = loopify(normalize_peak(mixed, 0.7), sr, 0.5)
    wav_path = tmp / "town.wav"
    write_wav(wav_path, mixed, sr)
    encode_ogg(wav_path, OUT / "ambience" / "town.ogg", 2)


def render_slosh_and_dirt(tmp: Path) -> None:
    rng = np.random.default_rng(3)
    n = int(SR * 0.42)
    t = np.arange(n) / SR
    noise = rng.normal(0, 1, n).astype(np.float32)
    sweep = 380 + 520 * np.sin(np.pi * np.clip(t / 0.42, 0, 1))
    # Time-varying band via two fixed bands crossfaded.
    low = lowpass(noise, 700)
    high = noise - lowpass(noise, 500)
    blend = np.clip((sweep - 400) / 500, 0, 1).astype(np.float32)
    slosh = (low * (1 - blend) + high * blend) * env_adsr(n, SR, 0.03, 0.12)
    wav_path = tmp / "slosh.wav"
    write_wav(wav_path, normalize_peak(slosh, 0.8))
    encode_ogg(wav_path, OUT / "sfx" / "slosh.ogg", 3)

    n = int(SR * 0.28)
    burst = rng.normal(0, 1, n).astype(np.float32)
    burst = lowpass(burst, 900) * env_adsr(n, SR, 0.008, 0.1)
    thump = np.sin(2 * np.pi * 70 * np.arange(n) / SR).astype(np.float32) * env_adsr(n, SR, 0.004, 0.08)
    dirt = normalize_peak(burst * 0.8 + thump * 0.45, 0.85)
    wav_path = tmp / "dirt.wav"
    write_wav(wav_path, dirt)
    encode_ogg(wav_path, OUT / "sfx" / "dirt-crunch.ogg", 3)


def encode_music(tmp: Path) -> None:
    jobs = [
        (SRC / "steady.mp3", OUT / "music" / "exploration.ogg", None, None, False),
        (SRC / "celtic.mp3", OUT / "music" / "prospecting.ogg", None, None, False),
        (SRC / "faraway.mp3", OUT / "music" / "town.ogg", 12.0, 52.0, True),
        (SRC / "forest.mp3", OUT / "music" / "night.ogg", 6.0, 50.0, True),
    ]
    for src, dest, start, duration, loop in jobs:
        raw = tmp / (dest.stem + "-raw.wav")
        decode(src, raw, start=start, duration=duration, channels=2)
        data, sr = read_wav(raw)
        if loop:
            data = loopify(data, sr, 2.0)
            looped = tmp / (dest.stem + "-loop.wav")
            write_wav(looped, data, sr)
            raw = looped
        ffmpeg(
            "-i",
            str(raw),
            "-af",
            "loudnorm=I=-16:TP=-1.5:LRA=11",
            "-c:a",
            "libvorbis",
            "-q:a",
            "4",
            str(dest),
        )


def encode_ambience(tmp: Path) -> None:
    creek_raw = tmp / "creek.wav"
    decode(SRC / "water_running.wav", creek_raw, channels=1)
    creek, sr = read_wav(creek_raw)
    creek = loopify(normalize_peak(creek, 0.75), sr, 0.35)
    creek_loop = tmp / "creek-loop.wav"
    write_wav(creek_loop, creek, sr)
    encode_ogg(creek_loop, OUT / "ambience" / "creek.ogg", 3)

    close_raw = tmp / "creek-close.wav"
    decode(SRC / "unpack" / "sfx" / "water_flowing.ogg", close_raw, channels=1)
    encode_ogg(close_raw, OUT / "ambience" / "creek-close.ogg", 2)

    wind_raw = tmp / "wind.wav"
    decode(SRC / "wind01.ogg", wind_raw, channels=2)
    wind, sr = read_wav(wind_raw)
    wind = loopify(normalize_peak(wind, 0.55), sr, 0.8)
    wind_loop = tmp / "wind-loop.wav"
    write_wav(wind_loop, wind, sr)
    encode_ogg(wind_loop, OUT / "ambience" / "wind.ogg", 3)

    rain_raw = tmp / "rain.wav"
    decode(SRC / "unpack" / "sfx" / "rain.ogg", rain_raw, channels=1)
    encode_ogg(rain_raw, OUT / "ambience" / "rain.ogg", 2)

    cricket_raw = tmp / "crickets.wav"
    decode(SRC / "unpack" / "birds" / "birdsCrickets" / "cricket2.wav", cricket_raw, channels=1, sr=22050)
    encode_ogg(cricket_raw, OUT / "ambience" / "crickets.ogg", 2)

    for src_name, dest_name in (("bird.wav", "bird-a.ogg"), ("bird2.wav", "bird-b.ogg")):
        raw = tmp / dest_name.replace(".ogg", ".wav")
        decode(SRC / "unpack" / "birds" / "birdsCrickets" / src_name, raw, channels=1, sr=22050)
        encode_ogg(raw, OUT / "ambience" / dest_name, 2)


def copy_sfx() -> None:
    sfx = OUT / "sfx"
    sfx.mkdir(parents=True, exist_ok=True)
    kenney_impact = SRC / "unpack" / "impact" / "Audio"
    kenney_ui = SRC / "unpack" / "ui" / "Audio"
    kenney_rpg = SRC / "unpack" / "rpg" / "Audio"
    pairs: list[tuple[Path, str]] = []
    for i in range(4):
        pairs.append((kenney_impact / f"footstep_grass_00{i}.ogg", f"foot-grass-{i}.ogg"))
        pairs.append((kenney_impact / f"footstep_wood_00{i}.ogg", f"foot-wood-{i}.ogg"))
        pairs.append((kenney_impact / f"impactMining_00{i}.ogg", f"dig-{i}.ogg"))
    pairs += [
        (kenney_impact / "impactSoft_heavy_000.ogg", "land.ogg"),
        (kenney_impact / "impactSoft_medium_001.ogg", "jump.ogg"),
        (kenney_impact / "impactMetal_light_000.ogg", "gold-0.ogg"),
        (kenney_impact / "impactMetal_light_002.ogg", "gold-1.ogg"),
        (kenney_impact / "impactTin_medium_001.ogg", "gold-2.ogg"),
        (kenney_ui / "click_001.ogg", "ui-click.ogg"),
        (kenney_ui / "tick_002.ogg", "ui-hover.ogg"),
        (kenney_ui / "open_001.ogg", "ui-open.ogg"),
        (kenney_ui / "close_001.ogg", "ui-close.ogg"),
        (kenney_ui / "confirmation_001.ogg", "ui-confirm.ogg"),
        (kenney_ui / "pluck_001.ogg", "ui-pluck.ogg"),
        (kenney_rpg / "handleCoins.ogg", "coins.ogg"),
        (kenney_rpg / "handleCoins2.ogg", "coins-b.ogg"),
        (kenney_rpg / "metalClick.ogg", "gold-3.ogg"),
        (SRC / "unpack" / "tiny" / "mud02.ogg", "foot-dirt-0.ogg"),
        (SRC / "unpack" / "tiny" / "leaves01.ogg", "foot-dirt-1.ogg"),
        (SRC / "unpack" / "tiny" / "leaves02.ogg", "foot-dirt-2.ogg"),
    ]
    gravel = SRC / "unpack" / "steps" / "footsteps" / "gravel"
    water = SRC / "unpack" / "steps" / "footsteps" / "water"
    grass = SRC / "unpack" / "steps" / "footsteps" / "grass"
    for i in range(4):
        pairs.append((gravel / f"{i}.ogg", f"foot-gravel-{i}.ogg"))
        pairs.append((water / f"{i}.ogg", f"foot-water-{i}.ogg"))
        pairs.append((grass / f"{i}.ogg", f"foot-grass-{i + 4}.ogg"))
    for src, name in pairs:
        if not src.exists():
            raise SystemExit(f"missing source {src}")
        shutil.copyfile(src, sfx / name)


def main() -> None:
    # The Celtic, forest, and synthesized placeholder renders used to live
    # here. Running them again would replace the single-key score and the
    # field recordings. Round 2 is tools/audio/render_round2.py.
    raise SystemExit("This renderer is retired. Run tools/audio/render_round2.py")


if __name__ == "__main__":
    main()
