# SPDX-License-Identifier: GPL-3.0
"""WP12: settings and real backends with mocked engines (T31-T33)."""

from __future__ import annotations

from pathlib import Path

import pytest

from nagmon.tts import backends as backends_mod
from nagmon.tts.backends import (
    EdgeTTSBackend,
    NullBackend,
    Pyttsx3Backend,
    parse_rate,
)
from nagmon.tts.settings import TTSSettings

# T31: settings ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("age", "auto"),
    [
        pytest.param(5, True, id="age5"),
        pytest.param(7, True, id="age7"),
        pytest.param(8, False, id="age8"),
        pytest.param(11, False, id="age11"),
        pytest.param(None, True, id="unknown-age"),
    ],
)
def test_for_age_auto_read(age, auto):
    assert TTSSettings.for_age(age).auto_read_questions is auto


def test_defaults_are_safe():
    s = TTSSettings()
    assert s.enabled is True
    assert s.allow_online is False
    assert s.rate_he == "-10%" and s.rate_en == "-10%"
    assert s.voice_he == "he-IL-HilaNeural"
    assert s.voice_en == "en-US-AnaNeural"
    assert s.read_english_with_english_voice is True


def test_settings_roundtrip():
    s = TTSSettings(allow_online=True, rate_he="-20%", offline_voice_he="Asaf")
    assert TTSSettings.from_dict(s.to_dict()) == s


def test_from_dict_rejects_bad_values():
    s = TTSSettings.from_dict(
        {
            "rate_he": "fast",
            "allow_online": "yes",
            "enabled": False,
            "volume": 7,
            "voice_en": "",
            "unknown": 1,
        }
    )
    assert s.rate_he == "-10%"
    assert s.allow_online is False
    assert s.enabled is False
    assert s.volume == 1.0
    assert s.voice_en == "en-US-AnaNeural"


def test_from_dict_handles_garbage():
    assert TTSSettings.from_dict(None) == TTSSettings()
    assert TTSSettings.from_dict("x") == TTSSettings()


@pytest.mark.parametrize(
    ("text", "value"),
    [
        pytest.param("-10%", -10, id="minus"),
        pytest.param("+25%", 25, id="plus"),
        pytest.param("0%", 0, id="zero"),
        pytest.param("bad", 0, id="bad"),
    ],
)
def test_parse_rate(text, value):
    assert parse_rate(text) == value


# T32: edge -----------------------------------------------------------------


class FakeCommunicate:
    made: list[tuple[str, str, str]] = []

    def __init__(self, text, voice, rate):
        FakeCommunicate.made.append((text, voice, rate))

    def save_sync(self, path):
        Path(path).write_bytes(b"ID3fake")


def test_edge_synthesizes_with_voice_and_rate(tmp_path):
    FakeCommunicate.made = []
    backend = EdgeTTSBackend(
        TTSSettings(), communicate_factory=FakeCommunicate
    )
    assert backend.online is True
    assert backend.extension == ".mp3"
    assert backend.available("he") and backend.available("en")
    out = tmp_path / "a.mp3"
    assert backend.synthesize("שלום", "he", out) is True
    assert out.read_bytes() == b"ID3fake"
    backend.synthesize("hello", "en", tmp_path / "b.mp3")
    assert FakeCommunicate.made == [
        ("שלום", "he-IL-HilaNeural", "-10%"),
        ("hello", "en-US-AnaNeural", "-10%"),
    ]


def test_edge_configure_changes_voice():
    backend = EdgeTTSBackend(
        TTSSettings(), communicate_factory=FakeCommunicate
    )
    backend.configure(TTSSettings(voice_he="he-IL-AvriNeural", rate_he="-5%"))
    assert backend.voice_for("he") == "he-IL-AvriNeural"
    assert backend.rate_for("he") == "-5%"


def test_edge_unavailable_when_library_missing(monkeypatch):
    monkeypatch.setattr(
        backends_mod.importlib.util, "find_spec", lambda name: None
    )
    backend = EdgeTTSBackend(TTSSettings())
    assert backend.available("he") is False


def test_edge_available_never_raises(monkeypatch):
    def boom(name):
        raise ImportError("broken install")

    monkeypatch.setattr(backends_mod.importlib.util, "find_spec", boom)
    assert EdgeTTSBackend(TTSSettings()).available("he") is False


# T33: pyttsx3 ---------------------------------------------------------------


class FakeVoice:
    def __init__(self, id, name, languages=()):
        self.id = id
        self.name = name
        self.languages = list(languages)


class FakeEngine:
    def __init__(self, voices):
        self.voices = voices
        self.props = {"rate": 200}
        self.saved = []
        self.ran = 0

    def getProperty(self, name):
        if name == "voices":
            return self.voices
        return self.props[name]

    def setProperty(self, name, value):
        self.props[name] = value

    def save_to_file(self, text, path):
        self.saved.append((text, path))

    def runAndWait(self):
        self.ran += 1
        for text, path in self.saved:
            Path(path).write_bytes(b"RIFF" + text.encode())

    def stop(self):
        pass


SAPI_VOICES = [
    FakeVoice(
        r"HKEY\Voices\Tokens\TTS_MS_EN-US_ZIRA_11.0",
        "Microsoft Zira Desktop - English (United States)",
    ),
    FakeVoice(
        r"HKEY\Voices\Tokens\TTS_MS_HE-IL_ASAF_11.0",
        "Microsoft Asaf - Hebrew (Israel)",
    ),
]
ESPEAK_VOICES = [
    FakeVoice("gmw/en-US", "English (America)", [b"\x05en-us"]),
    FakeVoice("sem/he", "Hebrew", [b"\x05he"]),
    FakeVoice("roa/fr", "French", [b"\x05fr"]),
]


@pytest.mark.parametrize(
    "voices",
    [
        pytest.param(SAPI_VOICES, id="sapi5"),
        pytest.param(ESPEAK_VOICES, id="espeak"),
    ],
)
def test_pyttsx3_detects_hebrew_and_english(voices):
    engine = FakeEngine(voices)
    backend = Pyttsx3Backend(TTSSettings(), engine_factory=lambda: engine)
    assert backend.online is False
    assert backend.available("he") is True
    assert backend.available("en") is True
    assert "he" in backend.voice_for("he").lower()


def test_pyttsx3_english_only_machine():
    engine = FakeEngine(SAPI_VOICES[:1])
    backend = Pyttsx3Backend(TTSSettings(), engine_factory=lambda: engine)
    assert backend.available("he") is False
    assert backend.available("en") is True


def test_pyttsx3_french_voice_is_not_english():
    engine = FakeEngine([ESPEAK_VOICES[2]])
    backend = Pyttsx3Backend(TTSSettings(), engine_factory=lambda: engine)
    assert backend.available("en") is False


def test_pyttsx3_prefers_named_voice():
    voices = [
        FakeVoice("he-1", "Hebrew Robot", ["he"]),
        FakeVoice("he-2", "Microsoft Asaf - Hebrew (Israel)", ["he-IL"]),
    ]
    engine = FakeEngine(voices)
    backend = Pyttsx3Backend(
        TTSSettings(offline_voice_he="asaf"), engine_factory=lambda: engine
    )
    assert backend.voice_for("he") == "he-2"


def test_pyttsx3_synthesizes_to_wav(tmp_path):
    engine = FakeEngine(SAPI_VOICES)
    backend = Pyttsx3Backend(TTSSettings(), engine_factory=lambda: engine)
    out = tmp_path / "a.wav"
    assert backend.extension == ".wav"
    assert backend.synthesize("שלום", "he", out) is True
    assert out.read_bytes().startswith(b"RIFF")
    assert engine.props["voice"] == SAPI_VOICES[1].id
    assert engine.props["rate"] == 180
    assert engine.saved == [("שלום", str(out))]
    assert engine.ran == 1


def test_pyttsx3_engine_failure_is_unavailable():
    calls = []

    def factory():
        calls.append(1)
        raise RuntimeError("eSpeak not installed")

    backend = Pyttsx3Backend(TTSSettings(), engine_factory=factory)
    assert backend.available("he") is False
    assert backend.available("en") is False
    assert len(calls) == 1  # cached: cheap to ask again


def test_pyttsx3_unavailable_when_library_missing(monkeypatch):
    monkeypatch.setattr(
        backends_mod.importlib.util, "find_spec", lambda name: None
    )
    assert Pyttsx3Backend(TTSSettings()).available("he") is False


def test_pyttsx3_lists_voices():
    engine = FakeEngine(SAPI_VOICES)
    backend = Pyttsx3Backend(TTSSettings(), engine_factory=lambda: engine)
    listed = backend.list_voices()
    assert [v["lang"] for v in listed] == ["en", "he"]


def test_null_backend_is_always_available_and_silent(tmp_path):
    backend = NullBackend()
    assert backend.available("he") and backend.available("en")
    out = tmp_path / "x.wav"
    assert backend.synthesize("שלום", "he", out) is False
    assert not out.exists()
