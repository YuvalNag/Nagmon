# SPDX-License-Identifier: GPL-3.0
"""WP12: parent voice-test CLI, players and factory (T34-T36)."""

from __future__ import annotations

import importlib
import wave

import pytest

from nagmon.tts import cli
from nagmon.tts.backends import EdgeTTSBackend, NullBackend, Pyttsx3Backend
from nagmon.tts.factory import build_backends, default_cache_dir
from nagmon.tts.fakes import FakeBackend, FakePlayer
from nagmon.tts.settings import TTSSettings


def _factory(online, offline):
    return lambda settings: [online, offline, NullBackend()]


def test_cli_speaks_offline_by_default(tmp_path, capsys):
    online = FakeBackend("edge", online=True)
    offline = FakeBackend("os")
    player = FakePlayer()
    code = cli.main(
        ["שלום", "--lang", "he", "--cache-dir", str(tmp_path)],
        backends_factory=_factory(online, offline),
        player=player,
    )
    out = capsys.readouterr().out
    assert code == 0
    assert online.calls == []
    assert offline.calls == [("שלום", "he")]
    assert "os" in out
    assert str(tmp_path) in out
    assert player.texts == ["os:he:שלום"]


def test_cli_online_flag_allows_online(tmp_path, capsys):
    online = FakeBackend("edge", online=True)
    offline = FakeBackend("os")
    code = cli.main(
        ["hello", "--lang", "en", "--online", "--cache-dir", str(tmp_path)],
        backends_factory=_factory(online, offline),
        player=FakePlayer(),
    )
    assert code == 0
    assert online.calls == [("hello", "en")]


def test_cli_reports_hebrew_hint_when_no_voice(tmp_path, capsys):
    offline = FakeBackend("os", langs=("en",))
    code = cli.main(
        ["שלום", "--cache-dir", str(tmp_path)],
        backends_factory=lambda s: [offline, NullBackend()],
        player=FakePlayer(),
    )
    out = capsys.readouterr().out
    assert code == 1
    assert "אין קול עברי במחשב" in out


def test_cli_is_runnable_as_module():
    assert importlib.util.find_spec("nagmon.tts.cli") is not None
    assert callable(cli.main)


def test_build_backends_order():
    backends = build_backends(TTSSettings())
    assert [type(b) for b in backends] == [
        EdgeTTSBackend,
        Pyttsx3Backend,
        NullBackend,
    ]


def test_default_cache_dir_windows(tmp_path):
    env = {"LOCALAPPDATA": str(tmp_path)}
    assert (
        default_cache_dir(windows=True, env=env)
        == tmp_path / "Nagmon" / "tts_cache"
    )


def test_default_cache_dir_linux(tmp_path):
    env = {"XDG_CACHE_HOME": str(tmp_path)}
    assert (
        default_cache_dir(windows=False, env=env)
        == tmp_path / "nagmon" / "tts"
    )


# T36: pygame player smoke test (dummy audio driver) -------------------------


def _write_wav(path):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(22050)
        w.writeframes(b"\x00\x00" * 22050)


def test_pygame_player_plays_and_stops(tmp_path):
    pygame = pytest.importorskip("pygame")
    from nagmon.tts.pygame_player import PygamePlayer

    try:
        player = PygamePlayer()
    except pygame.error as exc:  # pragma: no cover - depends on SDL build
        pytest.skip(f"no mixer: {exc}")
    path = tmp_path / "a.wav"
    _write_wav(path)
    player.play(path)
    player.stop()
    assert player.busy() is False


def test_pygame_player_survives_bad_file(tmp_path):
    pygame = pytest.importorskip("pygame")
    from nagmon.tts.pygame_player import PygamePlayer

    try:
        player = PygamePlayer()
    except pygame.error as exc:  # pragma: no cover
        pytest.skip(f"no mixer: {exc}")
    bad = tmp_path / "bad.wav"
    bad.write_bytes(b"not audio")
    with pytest.raises(Exception):
        player.play(bad)
    assert player.busy() is False
