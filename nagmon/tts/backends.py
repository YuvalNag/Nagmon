# SPDX-License-Identifier: GPL-3.0
"""Speech engines (SDD_TTS §2.5).

Every engine is imported lazily: a missing library or OS voice only makes
that engine "not available", it never stops the game.
"""

from __future__ import annotations

import importlib.util
import logging
import os
import re
import threading
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from nagmon.tts.settings import Lang, TTSSettings

logger = logging.getLogger(__name__)

_RATE_RE = re.compile(r"^([+-]?)(\d{1,3})%$")


class TTSBackendError(RuntimeError):
    """A backend could not produce audio."""


class Backend(Protocol):
    id: str
    online: bool
    extension: str

    def configure(self, settings: TTSSettings) -> None: ...

    def available(self, lang: Lang) -> bool: ...

    def voice_for(self, lang: Lang) -> str: ...

    def rate_for(self, lang: Lang) -> str: ...

    def synthesize(self, text: str, lang: Lang, out_path: Path) -> bool:
        """Write audio for ``text`` to ``out_path``; False means silent."""
        ...


def parse_rate(rate: str) -> int:
    """``"-10%"`` -> ``-10``. Anything unparsable is ``0``."""
    match = _RATE_RE.match(rate.strip()) if isinstance(rate, str) else None
    if not match:
        return 0
    value = int(match.group(2))
    return -value if match.group(1) == "-" else value


# --- online: Microsoft Edge neural voices ------------------------------------


def _edge_communicate(text: str, voice: str, rate: str) -> Any:
    import edge_tts

    return edge_tts.Communicate(
        text, voice, rate=rate, connect_timeout=5, receive_timeout=30
    )


class EdgeTTSBackend:
    """Neural voices from the Edge read-aloud service (needs internet)."""

    id = "edge"
    online = True
    extension = ".mp3"
    silent = False

    def __init__(
        self,
        settings: TTSSettings | None = None,
        *,
        communicate_factory: Callable[[str, str, str], Any] | None = None,
    ):
        self._factory = communicate_factory
        self._importable: bool | None = None
        self.configure(settings or TTSSettings())

    def configure(self, settings: TTSSettings) -> None:
        self._settings = settings

    def voice_for(self, lang: Lang) -> str:
        return self._settings.voice(lang)

    def rate_for(self, lang: Lang) -> str:
        return self._settings.rate(lang)

    def available(self, lang: Lang) -> bool:
        try:
            if not self.voice_for(lang):
                return False
            if self._factory is not None:
                return True
            if self._importable is None:
                spec = importlib.util.find_spec("edge_tts")
                self._importable = spec is not None
            return self._importable
        except Exception as exc:
            logger.debug("edge-tts not available: %s", exc)
            self._importable = False
            return False

    def synthesize(self, text: str, lang: Lang, out_path: Path) -> bool:
        factory = self._factory or _edge_communicate
        communicate = factory(text, self.voice_for(lang), self.rate_for(lang))
        communicate.save_sync(str(out_path))
        return True


# --- offline: operating-system voices ------------------------------------------

_LANG_TOKENS: dict[str, frozenset[str]] = {
    "he": frozenset({"he", "heb", "hebrew", "iw", "asaf"}),
    "en": frozenset({"en", "eng", "english"}),
}
_TOKEN_SPLIT_RE = re.compile(r"[^a-z0-9]+")


@dataclass(frozen=True)
class VoiceInfo:
    id: str
    name: str
    lang: str | None


def _tokens(value: Any) -> set[str]:
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="ignore")
    text = "".join(ch for ch in str(value) if ch.isprintable()).lower()
    return {t for t in _TOKEN_SPLIT_RE.split(text) if t}


def _voice_lang(voice: Any) -> str | None:
    languages: set[str] = set()
    for item in getattr(voice, "languages", None) or ():
        languages |= _tokens(item)
    names = _tokens(getattr(voice, "id", "")) | _tokens(
        getattr(voice, "name", "")
    )
    for pool in (languages, names):
        for lang, wanted in _LANG_TOKENS.items():
            if pool & wanted:
                return lang
    return None


def _pyttsx3_engine() -> Any:
    if os.name == "nt":  # SAPI5 needs COM on the calling thread
        try:
            import comtypes

            comtypes.CoInitialize()
        except Exception:
            pass
    import pyttsx3

    return pyttsx3.init()


class Pyttsx3Backend:
    """Voices installed on the PC: SAPI5 (Windows), espeak-ng (Linux)."""

    id = "pyttsx3"
    online = False
    extension = ".wav"
    silent = False

    def __init__(
        self,
        settings: TTSSettings | None = None,
        *,
        engine_factory: Callable[[], Any] | None = None,
    ):
        self._factory = engine_factory
        self._voices: list[VoiceInfo] | None = None
        self._base_rate = 200
        self._lock = threading.Lock()
        self.error: str | None = None
        self.configure(settings or TTSSettings())

    def configure(self, settings: TTSSettings) -> None:
        self._settings = settings

    def _make_engine(self) -> Any:
        return (self._factory or _pyttsx3_engine)()

    def _probe(self) -> list[VoiceInfo]:
        if self._voices is not None:
            return self._voices
        with self._lock:
            if self._voices is not None:
                return self._voices
            voices: list[VoiceInfo] = []
            try:
                if (
                    self._factory is None
                    and importlib.util.find_spec("pyttsx3") is None
                ):
                    raise TTSBackendError("pyttsx3 is not installed")
                engine = self._make_engine()
                rate = engine.getProperty("rate")
                if isinstance(rate, (int, float)) and rate > 0:
                    self._base_rate = int(rate)
                for v in engine.getProperty("voices") or ():
                    voices.append(
                        VoiceInfo(
                            id=str(getattr(v, "id", "")),
                            name=str(getattr(v, "name", "") or ""),
                            lang=_voice_lang(v),
                        )
                    )
                del engine
            except Exception as exc:
                logger.info("offline voices not available: %s", exc)
                self.error = str(exc)
                voices = []
            self._voices = voices
        return voices

    def list_voices(self) -> list[dict[str, str | None]]:
        return [
            {"id": v.id, "name": v.name, "lang": v.lang} for v in self._probe()
        ]

    def _voice(self, lang: Lang) -> VoiceInfo | None:
        matching = [v for v in self._probe() if v.lang == lang]
        if not matching:
            return None
        wanted = (self._settings.offline_voice(lang) or "").casefold()
        if wanted:
            for v in matching:
                if wanted in v.name.casefold() or wanted in v.id.casefold():
                    return v
        return matching[0]

    def voice_for(self, lang: Lang) -> str:
        voice = self._voice(lang)
        return voice.id if voice else ""

    def rate_for(self, lang: Lang) -> str:
        return self._settings.rate(lang)

    def available(self, lang: Lang) -> bool:
        try:
            return self._voice(lang) is not None
        except Exception as exc:
            logger.debug("pyttsx3 availability check failed: %s", exc)
            return False

    def synthesize(self, text: str, lang: Lang, out_path: Path) -> bool:
        voice = self.voice_for(lang)
        if not voice:
            raise TTSBackendError(f"no offline voice for {lang}")
        factor = 1 + parse_rate(self.rate_for(lang)) / 100
        engine = self._make_engine()
        engine.setProperty("voice", voice)
        engine.setProperty("rate", max(60, round(self._base_rate * factor)))
        engine.save_to_file(text, str(out_path))
        engine.runAndWait()
        return True


# --- silence -----------------------------------------------------------------


class NullBackend:
    """Always available, never makes a sound. Keep it last in the list."""

    id = "null"
    online = False
    extension = ".wav"
    silent = True

    def configure(self, settings: TTSSettings) -> None:
        pass

    def available(self, lang: Lang) -> bool:
        return True

    def voice_for(self, lang: Lang) -> str:
        return ""

    def rate_for(self, lang: Lang) -> str:
        return ""

    def synthesize(self, text: str, lang: Lang, out_path: Path) -> bool:
        return False
