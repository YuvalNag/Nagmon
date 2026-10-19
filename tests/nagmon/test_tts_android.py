"""WP13: Android's built-in speech engine (docs/kids/SDD_ANDROID.md §2.3)."""

from __future__ import annotations

from pathlib import Path

import pytest

from nagmon.android.tts import AndroidTTSBackend
from nagmon.tts.backends import TTSBackendError
from nagmon.tts.factory import build_backends
from nagmon.tts.settings import TTSSettings


class FakeEngine:
    def __init__(
        self,
        *,
        ready: bool = True,
        languages: tuple[str, ...] = ("he-IL", "en-US"),
        write: bytes | None = b"RIFF....WAVEfmt ",
        result: bool = True,
    ) -> None:
        self._ready = ready
        self.languages = languages
        self.write = write
        self.result = result
        self.calls: list[tuple] = []

    def ready(self, timeout: float) -> bool:
        return self._ready

    def has_language(self, tag: str) -> bool:
        return tag in self.languages

    def synthesize_to_file(self, text, tag, rate, path, timeout) -> bool:
        self.calls.append((text, tag, rate, Path(path)))
        if self.write is not None:
            Path(path).write_bytes(self.write)
        return self.result


def test_backend_identity():
    backend = AndroidTTSBackend(FakeEngine())
    assert backend.id == "android"
    assert backend.online is False
    assert backend.extension == ".wav"


@pytest.mark.parametrize(
    ("languages", "lang", "expected"),
    [
        pytest.param(("he-IL", "en-US"), "he", True, id="hebrew"),
        pytest.param(("he-IL", "en-US"), "en", True, id="english"),
        pytest.param(("en-US",), "he", False, id="no-hebrew-voice"),
    ],
)
def test_available_by_language(languages, lang, expected):
    backend = AndroidTTSBackend(FakeEngine(languages=languages))
    assert backend.available(lang) is expected


def test_not_available_until_engine_is_ready():
    assert AndroidTTSBackend(FakeEngine(ready=False)).available("he") is False


def test_engine_that_crashes_is_not_available():
    class Broken(FakeEngine):
        def ready(self, timeout):
            raise RuntimeError("no TextToSpeech")

    backend = AndroidTTSBackend(Broken())
    assert backend.available("he") is False
    assert "TextToSpeech" in (backend.error or "")


def test_engine_is_created_lazily_and_once():
    made = []

    def factory():
        made.append(1)
        return FakeEngine()

    backend = AndroidTTSBackend(engine_factory=factory)
    assert made == []
    assert backend.available("he") and backend.available("en")
    assert made == [1]


def test_synthesize_uses_language_tag_and_rate(tmp_path):
    engine = FakeEngine()
    backend = AndroidTTSBackend(engine, TTSSettings(rate_he="-10%"))
    out = tmp_path / "clip.wav"
    assert backend.synthesize("שלום", "he", out) is True
    text, tag, rate, path = engine.calls[0]
    assert (text, tag, path) == ("שלום", "he-IL", out)
    assert rate == pytest.approx(0.9)
    assert out.read_bytes().startswith(b"RIFF")


def test_rate_follows_settings_changes(tmp_path):
    engine = FakeEngine()
    backend = AndroidTTSBackend(engine)
    backend.configure(TTSSettings(rate_en="+20%"))
    backend.synthesize("cat", "en", tmp_path / "a.wav")
    assert engine.calls[0][1:3] == ("en-US", pytest.approx(1.2))


@pytest.mark.parametrize(
    ("write", "result"),
    [
        pytest.param(b"partial", False, id="engine-reports-failure"),
        pytest.param(b"", True, id="empty-file"),
        pytest.param(None, True, id="no-file"),
    ],
)
def test_failed_synthesis_leaves_no_file(tmp_path, write, result):
    backend = AndroidTTSBackend(FakeEngine(write=write, result=result))
    out = tmp_path / "clip.wav"
    with pytest.raises(TTSBackendError):
        backend.synthesize("שלום", "he", out)
    assert not out.exists()


def test_build_backends_on_android_uses_the_phone_voice():
    ids = [b.id for b in build_backends(TTSSettings(), android=True)]
    assert ids == ["android", "null"]


def test_build_backends_on_desktop_is_unchanged():
    ids = [b.id for b in build_backends(TTSSettings(), android=False)]
    assert ids == ["edge", "pyttsx3", "null"]
