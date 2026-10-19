# SPDX-License-Identifier: GPL-3.0
"""
Android's own text-to-speech engine as a Nagmon speech backend
(SDD_ANDROID §2.3, SDD_TTS §2.5). Every phone has Google's Hebrew voice,
and it works without the internet.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from pathlib import Path
from typing import Protocol

from nagmon.tts.backends import TTSBackendError, parse_rate
from nagmon.tts.settings import Lang, TTSSettings

logger = logging.getLogger(__name__)

LANGUAGE_TAGS: dict[str, str] = {"he": "he-IL", "en": "en-US"}
READY_TIMEOUT = 5.0
SYNTH_TIMEOUT = 20.0


class SpeechEngine(Protocol):
    def ready(self, timeout: float) -> bool: ...

    def has_language(self, tag: str) -> bool: ...

    def synthesize_to_file(
        self, text: str, tag: str, rate: float, path: Path, timeout: float
    ) -> bool: ...


def _jnius_engine() -> SpeechEngine:
    from nagmon.android.jnius_tts import JniusSpeechEngine

    return JniusSpeechEngine()


class AndroidTTSBackend:
    """Speaks through ``android.speech.tts.TextToSpeech``."""

    id = "android"
    online = False
    extension = ".wav"
    silent = False

    def __init__(
        self,
        engine: SpeechEngine | None = None,
        settings: TTSSettings | None = None,
        *,
        engine_factory: Callable[[], SpeechEngine] = _jnius_engine,
    ) -> None:
        self._engine = engine
        self._factory = engine_factory
        self._lock = threading.Lock()
        self.error: str | None = None
        self.configure(settings or TTSSettings())

    def configure(self, settings: TTSSettings) -> None:
        self._settings = settings

    def _ready_engine(self) -> SpeechEngine | None:
        with self._lock:
            try:
                if self._engine is None:
                    self._engine = self._factory()
                if self._engine.ready(READY_TIMEOUT):
                    return self._engine
                self.error = "TextToSpeech is not ready"
            except Exception as exc:
                logger.info("Android speech not available: %s", exc)
                self.error = str(exc)
        return None

    def voice_for(self, lang: Lang) -> str:
        return LANGUAGE_TAGS.get(lang, "")

    def rate_for(self, lang: Lang) -> str:
        return self._settings.rate(lang)

    def available(self, lang: Lang) -> bool:
        engine = self._ready_engine()
        if engine is None:
            return False
        try:
            return engine.has_language(self.voice_for(lang))
        except Exception as exc:
            logger.debug("Android language check failed: %s", exc)
            return False

    def synthesize(self, text: str, lang: Lang, out_path: Path) -> bool:
        engine = self._ready_engine()
        if engine is None:
            raise TTSBackendError(self.error or "no Android speech engine")
        rate = 1 + parse_rate(self.rate_for(lang)) / 100
        out_path = Path(out_path)
        ok = engine.synthesize_to_file(
            text, self.voice_for(lang), rate, out_path, SYNTH_TIMEOUT
        )
        if ok and out_path.is_file() and out_path.stat().st_size > 0:
            return True
        out_path.unlink(missing_ok=True)
        raise TTSBackendError(f"Android speech failed for {lang}")
