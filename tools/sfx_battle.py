# SPDX-License-Identifier: GPL-3.0
"""The battle's three little sounds, made from nothing but sine waves.

Our own work: no sample, no recording and nothing from another game or
library goes in. Run it to write the WAV files the app build ships
(``tools/app/audio.py`` copies them; ``tools/app/credits.py`` credits them
as our own):

    python tools/sfx_battle.py

- ``nagmon_hit.wav``: a short rising chime for a right answer (0.3 s).
- ``nagmon_oops.wav``: a soft, funny "boing" for a wrong one; never a buzzer.
- ``nagmon_win.wav``: a small jingle for a calm creature and a new friend.

16-bit mono at 16 kHz, a few KB each. The output is the same bytes on every
run (no randomness), so a test can compare it with the committed files.
"""

from __future__ import annotations

import io
import math
import struct
import wave
from pathlib import Path

RATE = 16_000
OUT = (
    Path(__file__).resolve().parents[1]
    / "mods"
    / "nagmon"
    / "sounds"
    / "battle"
)
#: Equal-tempered notes (Hz) the sounds are made of.
C5, E5, G5, C6, E6, G6 = 523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98


def _tone(
    freq: float, seconds: float, decay: float, *, gain: float = 1.0
) -> list[float]:
    """A sine note with a 4 ms attack and an exponential decay."""
    n = int(RATE * seconds)
    out = []
    for i in range(n):
        t = i / RATE
        attack = min(1.0, t / 0.004)
        env = attack * math.exp(-decay * t)
        # a little second harmonic keeps it soft and bell-like
        s = math.sin(2 * math.pi * freq * t) + 0.25 * math.sin(
            4 * math.pi * freq * t
        )
        out.append(gain * env * s)
    return out


def _mix(parts: list[tuple[float, list[float]]]) -> list[float]:
    """Notes placed at their start times (seconds), added together."""
    total = max(int(RATE * start) + len(p) for start, p in parts)
    out = [0.0] * total
    for start, p in parts:
        base = int(RATE * start)
        for i, v in enumerate(p):
            out[base + i] += v
    return out


def hit() -> list[float]:
    return _mix(
        [
            (0.0, _tone(C6, 0.2, 14)),
            (0.07, _tone(E6, 0.2, 14)),
            (0.14, _tone(G6, 0.18, 12)),
        ]
    )


def oops() -> list[float]:
    """A gentle boing: a sine that slides down and wobbles back up."""
    n = int(RATE * 0.38)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / RATE
        freq = (
            420
            - 190 * min(1.0, t / 0.16)
            + 60 * math.sin(2 * math.pi * 11 * t) * min(1.0, t / 0.1)
        )
        phase += 2 * math.pi * freq / RATE
        env = min(1.0, t / 0.01) * math.exp(-6 * t)
        out.append(env * math.sin(phase))
    return out


def win() -> list[float]:
    notes = [(0.0, C5), (0.14, E5), (0.28, G5), (0.48, C6)]
    parts = [
        (start, _tone(f, 0.3 if start < 0.48 else 0.45, 8))
        for start, f in notes
    ]
    parts.append((0.48, _tone(E6, 0.45, 9, gain=0.5)))
    return _mix(parts)


SOUNDS = {"nagmon_hit": hit, "nagmon_oops": oops, "nagmon_win": win}


def wav_bytes(samples: list[float]) -> bytes:
    """16-bit mono PCM, peak at 0.8, with a 6 ms fade at the end (no click)."""
    peak = max(abs(s) for s in samples) or 1.0
    fade = int(RATE * 0.006)
    n = len(samples)
    pcm = bytearray()
    for i, s in enumerate(samples):
        k = min(1.0, (n - i) / fade) if fade else 1.0
        pcm += struct.pack("<h", int(round(0.8 * 32767 * k * s / peak)))
        buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(pcm))
    return buf.getvalue()


def build() -> dict[str, bytes]:
    return {f"{name}.wav": wav_bytes(make()) for name, make in SOUNDS.items()}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, data in build().items():
        (OUT / name).write_bytes(data)
        print(f"{OUT / name}: {len(data)} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
