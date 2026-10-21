"""The battle's three sounds: our own, small, and the same on every run."""

import io
import wave

from tools import sfx_battle

NAMES = {"nagmon_hit.wav", "nagmon_oops.wav", "nagmon_win.wav"}


def test_three_small_wav_files_of_a_second_or_less():
    files = sfx_battle.build()
    assert set(files) == NAMES
    for name, data in files.items():
        assert len(data) < 31_000, name
        with wave.open(io.BytesIO(data)) as w:
            assert (w.getnchannels(), w.getsampwidth(), w.getframerate()) == (1, 2, 16_000)
            assert 0.2 < w.getnframes() / w.getframerate() <= 1.0, name


def test_the_same_bytes_every_run_and_the_same_as_the_shipped_files():
    first = sfx_battle.build()
    assert first == sfx_battle.build()
    for name, data in first.items():
        assert (sfx_battle.OUT / name).read_bytes() == data, name


def test_no_click_at_the_ends():
    for name, data in sfx_battle.build().items():
        with wave.open(io.BytesIO(data)) as w:
            frames = w.readframes(w.getnframes())
        last = int.from_bytes(frames[-2:], "little", signed=True)
        first = int.from_bytes(frames[:2], "little", signed=True)
        assert abs(last) < 400 and abs(first) < 400, name
