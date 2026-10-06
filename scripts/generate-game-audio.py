#!/usr/bin/env python3
"""Generate the lightweight procedural sound pack used by game-v1."""

from __future__ import annotations

import math
import wave
from pathlib import Path

import numpy as np


SAMPLE_RATE = 22_050
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "public" / "audio" / "game-v1"


def time_axis(duration: float) -> np.ndarray:
    return np.arange(round(duration * SAMPLE_RATE), dtype=np.float64) / SAMPLE_RATE


def low_pass(signal: np.ndarray, smoothing: float) -> np.ndarray:
    output = np.empty_like(signal)
    output[0] = signal[0]
    for index in range(1, len(signal)):
        output[index] = smoothing * output[index - 1] + (1 - smoothing) * signal[index]
    return output


def add_tone(
    target: np.ndarray,
    start: float,
    duration: float,
    frequency_start: float,
    frequency_end: float | None = None,
    gain: float = 1,
    decay: float = 4,
    attack: float = 0.01,
) -> None:
    begin = round(start * SAMPLE_RATE)
    length = min(round(duration * SAMPLE_RATE), len(target) - begin)
    if length <= 0:
        return
    local_time = np.arange(length, dtype=np.float64) / SAMPLE_RATE
    end_frequency = frequency_start if frequency_end is None else frequency_end
    frequency = np.linspace(frequency_start, end_frequency, length)
    phase = 2 * np.pi * np.cumsum(frequency) / SAMPLE_RATE
    envelope = np.exp(-decay * local_time)
    envelope *= np.minimum(1, local_time / max(attack, 1 / SAMPLE_RATE))
    target[begin : begin + length] += np.sin(phase) * envelope * gain


def add_noise_burst(
    target: np.ndarray,
    rng: np.random.Generator,
    start: float,
    duration: float,
    gain: float,
    smoothing: float,
    decay: float,
) -> None:
    begin = round(start * SAMPLE_RATE)
    length = min(round(duration * SAMPLE_RATE), len(target) - begin)
    if length <= 0:
        return
    local_time = np.arange(length, dtype=np.float64) / SAMPLE_RATE
    noise = low_pass(rng.normal(0, 1, length), smoothing)
    noise /= max(np.max(np.abs(noise)), 1e-6)
    target[begin : begin + length] += noise * np.exp(-decay * local_time) * gain


def finish(signal: np.ndarray, peak: float = 0.92, fade_ms: float = 8) -> np.ndarray:
    fade_samples = min(round(fade_ms * SAMPLE_RATE / 1000), len(signal) // 3)
    if fade_samples:
        fade = np.linspace(0, 1, fade_samples)
        if signal.ndim == 2:
            fade = fade[:, None]
        signal[:fade_samples] *= fade
        signal[-fade_samples:] *= fade[::-1]
    maximum = max(float(np.max(np.abs(signal))), 1e-6)
    return np.clip(signal * (peak / maximum), -1, 1)


def write_wave(filename: str, signal: np.ndarray) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    pcm = (np.clip(signal, -1, 1) * 32767).astype("<i2")
    channels = 1 if pcm.ndim == 1 else pcm.shape[1]
    with wave.open(str(OUTPUT_DIR / filename), "wb") as output:
        output.setnchannels(channels)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(pcm.tobytes())


def robot_step(running: bool) -> np.ndarray:
    duration = 0.34 if running else 0.48
    rng = np.random.default_rng(211 if running else 107)
    t = time_axis(duration)
    signal = np.zeros_like(t)

    impact_gain = 0.76 if running else 0.58
    add_noise_burst(signal, rng, 0.012, 0.17, impact_gain, 0.82, 24)
    add_tone(signal, 0.01, 0.28, 76 if running else 91, 48 if running else 64, 0.74, 12, 0.003)
    add_tone(signal, 0.025, 0.3, 510 if running else 620, 390, 0.34, 9, 0.002)
    add_tone(signal, 0.034, 0.27, 1_120, 760, 0.2, 12, 0.002)
    add_noise_burst(signal, rng, 0.105, 0.22, 0.22, 0.94, 13)
    add_tone(
        signal,
        0.105,
        0.23,
        230 if running else 180,
        420 if running else 310,
        0.22,
        10,
        0.012,
    )
    signal += np.sin(2 * np.pi * (34 if running else 29) * t) * np.exp(-18 * t) * 0.18
    return finish(signal)


def monster_attack() -> np.ndarray:
    duration = 1.22
    rng = np.random.default_rng(404)
    t = time_axis(duration)
    frequency = 54 + 11 * np.sin(2 * np.pi * 8.5 * t) + 22 * t
    phase = 2 * np.pi * np.cumsum(frequency) / SAMPLE_RATE
    growl_envelope = np.minimum(1, t / 0.08) * np.exp(-1.65 * t)
    growl = (np.sin(phase) + 0.46 * np.sin(phase * 2.03) + 0.2 * np.sin(phase * 3.91))
    signal = growl * growl_envelope * 0.52
    raw_noise = rng.normal(0, 1, len(t))
    body_noise = low_pass(raw_noise, 0.88)
    body_noise /= max(np.max(np.abs(body_noise)), 1e-6)
    signal += body_noise * growl_envelope * 0.32
    add_noise_burst(signal, rng, 0.42, 0.48, 0.55, 0.65, 5.8)
    add_tone(signal, 0.38, 0.5, 330, 72, 0.34, 4.2, 0.006)
    add_noise_burst(signal, rng, 0.68, 0.18, 0.56, 0.8, 18)
    return finish(signal, 0.95, 12)


def reactor_overload() -> np.ndarray:
    rng = np.random.default_rng(7318)
    signal = np.zeros_like(time_axis(1.2))
    add_noise_burst(signal, rng, 0.0, 0.8, 0.78, 0.68, 6)
    add_noise_burst(signal, rng, 0.04, 1.1, 0.40, 0.95, 5)
    add_tone(signal, 0.0, 1.05, 95, 32, 0.9, 6, 0.002)
    for frequency, gain in ((310, 0.18), (790, 0.13), (1430, 0.07)):
        add_tone(signal, 0.03, 0.72, frequency, frequency * 0.7, gain, 8, 0.001)
    return finish(signal, 0.94, 16)


def energy_harvest() -> np.ndarray:
    duration = 1.45
    rng = np.random.default_rng(808)
    signal = np.zeros_like(time_axis(duration))
    notes = [(0.0, 392), (0.11, 523.25), (0.24, 659.25), (0.39, 987.77)]
    for index, (start, frequency) in enumerate(notes):
        add_tone(signal, start, 1.0, frequency, frequency * 1.008, 0.46 - index * 0.035, 3.5, 0.004)
        add_tone(signal, start, 0.82, frequency * 2.01, frequency * 2.03, 0.13, 5.2, 0.002)
    add_tone(signal, 0.04, 1.2, 190, 620, 0.22, 2.9, 0.02)
    add_noise_burst(signal, rng, 0.0, 0.72, 0.17, 0.45, 5.5)
    return finish(signal, 0.9, 18)


def transformer_sequence() -> np.ndarray:
    duration = 4.25
    rng = np.random.default_rng(1608)
    t = time_axis(duration)
    signal = np.zeros_like(t)

    base_frequency = np.linspace(38, 104, len(t)) + 6 * np.sin(2 * np.pi * 2.2 * t)
    base_phase = 2 * np.pi * np.cumsum(base_frequency) / SAMPLE_RATE
    power_envelope = np.minimum(1, t / 0.35) * np.minimum(1, (duration - t) / 0.48)
    signal += (np.sin(base_phase) + 0.33 * np.sin(base_phase * 2.01)) * power_envelope * 0.24

    for index, start in enumerate((0.22, 0.86, 1.46, 2.05, 2.56)):
        add_noise_burst(signal, rng, start, 0.28, 0.5, 0.8, 15)
        add_tone(signal, start, 0.58, 92 + index * 12, 54 + index * 8, 0.42, 8, 0.002)
        add_tone(signal, start + 0.035, 0.42, 720 + index * 90, 390, 0.2, 9, 0.002)

    add_noise_burst(signal, rng, 0.0, 3.35, 0.13, 0.985, 0.45)
    add_tone(signal, 0.4, 3.0, 110, 890, 0.27, 0.34, 0.08)
    add_tone(signal, 1.25, 2.15, 220, 1_420, 0.16, 0.42, 0.06)
    for frequency, gain in ((164.81, 0.34), (246.94, 0.27), (329.63, 0.22), (493.88, 0.15)):
        add_tone(signal, 2.68, 1.48, frequency, frequency * 1.012, gain, 1.9, 0.018)
    add_noise_burst(signal, rng, 2.67, 0.62, 0.64, 0.73, 7.5)
    return finish(signal, 0.96, 22)


def forest_ambience() -> np.ndarray:
    duration = 20.0
    rng = np.random.default_rng(1984)
    t = time_axis(duration)
    channel_count = 2
    signal = np.zeros((len(t), channel_count), dtype=np.float64)

    for channel in range(channel_count):
        raw = rng.normal(0, 1, len(t))
        wind = low_pass(raw, 0.9965)
        wind /= max(np.max(np.abs(wind)), 1e-6)
        breeze = 0.58 + 0.18 * np.sin(2 * np.pi * (2 * t / duration) + channel * 1.7)
        breeze += 0.1 * np.sin(2 * np.pi * (5 * t / duration) + channel * 0.8)
        leaves = raw - low_pass(raw, 0.91)
        leaves /= max(np.max(np.abs(leaves)), 1e-6)
        leaf_gate = np.maximum(0, np.sin(2 * np.pi * (3 * t / duration) + channel * 2.2)) ** 3
        signal[:, channel] = wind * breeze * 0.36 + leaves * (0.045 + leaf_gate * 0.055)
        signal[:, channel] += np.sin(2 * np.pi * (46 + channel * 1.7) * t) * 0.012

    bird_events = [(2.4, 1_340, -0.72), (5.9, 1_090, 0.64), (10.7, 1_520, -0.36), (15.4, 1_230, 0.78)]
    for start, frequency, pan in bird_events:
        begin = round(start * SAMPLE_RATE)
        length = round(0.58 * SAMPLE_RATE)
        local_time = np.arange(length, dtype=np.float64) / SAMPLE_RATE
        chirp_frequency = frequency + 390 * np.sin(2 * np.pi * 4.4 * local_time) + 180 * local_time
        chirp_phase = 2 * np.pi * np.cumsum(chirp_frequency) / SAMPLE_RATE
        chirp_envelope = np.sin(np.pi * np.minimum(1, local_time / 0.58)) ** 2
        chirp_envelope *= 0.12 * (0.64 + 0.36 * np.sin(2 * np.pi * 9 * local_time) ** 2)
        chirp = np.sin(chirp_phase) * chirp_envelope
        signal[begin : begin + length, 0] += chirp * math.sqrt((1 - pan) / 2)
        signal[begin : begin + length, 1] += chirp * math.sqrt((1 + pan) / 2)

    crossfade_length = round(1.5 * SAMPLE_RATE)
    blend = np.linspace(0, 1, crossfade_length)[:, None]
    signal[-crossfade_length:] = signal[-crossfade_length:] * (1 - blend) + signal[:crossfade_length] * blend
    return finish(signal, 0.72, 0)


def main() -> None:
    assets = {
        "robot-walk.wav": robot_step(False),
        "robot-run.wav": robot_step(True),
        "forest-ambience.wav": forest_ambience(),
        "monster-attack.wav": monster_attack(),
        "energy-harvest.wav": energy_harvest(),
        "transformer.wav": transformer_sequence(),
        "robot-overload.wav": reactor_overload(),
    }
    for filename, signal in assets.items():
        write_wave(filename, signal)
        seconds = len(signal) / SAMPLE_RATE
        print(f"{filename}: {seconds:.2f}s, {signal.shape[-1] if signal.ndim == 2 else 1}ch")


if __name__ == "__main__":
    main()
