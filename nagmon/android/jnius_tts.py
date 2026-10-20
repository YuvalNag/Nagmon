# SPDX-License-Identifier: GPL-3.0
"""
The Java side of Android speech (SDD_ANDROID §2.1 principle 2).

Loaded only on the phone: it needs pyjnius and the app's activity. Kept
small on purpose; the logic that can be tested lives in ``tts.py``.
"""

from __future__ import annotations

import threading
import time
from pathlib import Path

from jnius import PythonJavaClass, autoclass, java_method  # type: ignore

PythonActivity = autoclass("org.kivy.android.PythonActivity")
TextToSpeech = autoclass("android.speech.tts.TextToSpeech")
Locale = autoclass("java.util.Locale")
File = autoclass("java.io.File")
Bundle = autoclass("android.os.Bundle")

SUCCESS = 0
POLL_SECONDS = 0.05


class _InitListener(PythonJavaClass):
    __javainterfaces__ = ["android/speech/tts/TextToSpeech$OnInitListener"]
    __javacontext__ = "app"

    def __init__(self, done: threading.Event, result: dict[str, int]):
        super().__init__()
        self._done = done
        self._result = result

    @java_method("(I)V")
    def onInit(self, status: int) -> None:
        self._result["status"] = status
        self._done.set()


class _CompletedListener(PythonJavaClass):
    # Deprecated but still present; Android calls it on done and on error,
    # so the caller checks the file it asked for.
    __javainterfaces__ = [
        "android/speech/tts/TextToSpeech$OnUtteranceCompletedListener"
    ]
    __javacontext__ = "app"

    def __init__(self) -> None:
        super().__init__()
        self.finished: set[str] = set()
        self.changed = threading.Condition()

    @java_method("(Ljava/lang/String;)V")
    def onUtteranceCompleted(self, utterance_id: str) -> None:
        with self.changed:
            self.finished.add(str(utterance_id))
            self.changed.notify_all()


class JniusSpeechEngine:
    """One ``TextToSpeech`` for the whole game, used one clip at a time."""

    def __init__(self) -> None:
        self._init_done = threading.Event()
        self._init: dict[str, int] = {}
        self._listener = _InitListener(self._init_done, self._init)
        self._completed = _CompletedListener()
        self._tts = TextToSpeech(PythonActivity.mActivity, self._listener)
        self._lock = threading.Lock()
        self._count = 0
        self._listening = False

    def ready(self, timeout: float) -> bool:
        if not self._init_done.wait(timeout):
            return False
        if self._init.get("status") != SUCCESS:
            return False
        if not self._listening:
            self._tts.setOnUtteranceCompletedListener(self._completed)
            self._listening = True
        return True

    def has_language(self, tag: str) -> bool:
        return (
            int(self._tts.isLanguageAvailable(Locale.forLanguageTag(tag))) >= 0
        )

    def synthesize_to_file(
        self, text: str, tag: str, rate: float, path: Path, timeout: float
    ) -> bool:
        with self._lock:
            self._count += 1
            utterance = f"nagmon-{self._count}"
            self._tts.setLanguage(Locale.forLanguageTag(tag))
            self._tts.setSpeechRate(float(rate))
            started = self._tts.synthesizeToFile(
                text, Bundle(), File(str(path)), utterance
            )
            if int(started) != SUCCESS:
                return False
            return self._wait(utterance, Path(path), timeout)

    def _wait(self, utterance: str, path: Path, timeout: float) -> bool:
        deadline = time.monotonic() + timeout
        with self._completed.changed:
            while utterance not in self._completed.finished:
                left = deadline - time.monotonic()
                if left <= 0:
                    return False
                self._completed.changed.wait(min(left, POLL_SECONDS * 10))
            self._completed.finished.discard(utterance)
        return path.is_file() and path.stat().st_size > 0
