# SPDX-License-Identifier: GPL-3.0
"""The text-to-speech service the game talks to (SDD_TTS §2.7).

``speak()`` only puts work on a queue. One worker thread cleans the text,
picks a backend, synthesizes (or reuses a cached clip) and plays it, so the
game loop never waits for speech. Nothing in here raises into the game:
problems are logged and kept in ``last_error`` for the parents' screen.
"""

from __future__ import annotations

import itertools
import logging
import queue
import threading
import time
from collections import deque
from collections.abc import Callable, Iterable, Iterator, Sequence
from dataclasses import dataclass
from pathlib import Path

from nagmon.tts.backends import Backend
from nagmon.tts.cache import AudioCache
from nagmon.tts.player import Player
from nagmon.tts.settings import LANGS, Lang, TTSSettings
from nagmon.tts.text import (
    Segment,
    chunk_text,
    clean_for_speech,
    split_by_language,
)

logger = logging.getLogger(__name__)

MESSAGES_HE: dict[tuple[str, str | None], str] = {
    ("no_voice", "he"): (
        "אין קול עברי במחשב — אפשר להתקין חבילת שפה עברית ב-Windows "
        "או להפעיל קול מהאינטרנט באזור ההורים"
    ),
    ("no_voice", "en"): (
        "אין קול אנגלי במחשב — אפשר להתקין קול אנגלי ב-Windows "
        "או להפעיל קול מהאינטרנט באזור ההורים"
    ),
    ("no_voice_online", "he"): (
        "אין חיבור לקול מהאינטרנט ואין קול עברי במחשב — אפשר לבדוק את "
        "החיבור לאינטרנט או להתקין חבילת שפה עברית ב-Windows"
    ),
    ("no_voice_online", "en"): (
        "אין חיבור לקול מהאינטרנט ואין קול אנגלי במחשב — אפשר לבדוק את "
        "החיבור לאינטרנט או להתקין קול אנגלי ב-Windows"
    ),
    ("online_failed", None): (
        "הקול מהאינטרנט לא זמין כרגע (אין חיבור?) — משתמשים בקול של המחשב"
    ),
    ("backend_error", None): "מנוע ההקראה נכשל — משתמשים במנוע אחר",
    ("player_error", None): (
        "לא הצלחנו להשמיע את הקול — כדאי לבדוק שהרמקולים מחוברים"
    ),
}

_SPEECH, _PREFETCH, _SHUTDOWN = 0, 1, -1
_POLL_S = 0.01


@dataclass(frozen=True)
class TTSIssue:
    code: str  # no_voice | online_failed | backend_error | player_error
    lang: str | None
    message_he: str
    detail: str = ""


@dataclass(frozen=True)
class SpokenClip:
    backend_id: str
    lang: str
    text: str
    path: Path


@dataclass
class _Job:
    job_id: int
    segments: Sequence[Segment]
    play: bool
    generation: int = 0


def _message(code: str, lang: str | None) -> str:
    return MESSAGES_HE.get((code, lang)) or MESSAGES_HE[(code, None)]


def _norm_lang(lang: object) -> Lang:
    if lang in LANGS:
        return lang  # type: ignore[return-value]
    value = str(lang).lower()
    if value.startswith(("he", "iw")):
        return "he"
    if value.startswith("en"):
        return "en"
    logger.warning("unknown speech language %r, using Hebrew", lang)
    return "he"


class TTSService:
    def __init__(
        self,
        backends: Sequence[Backend],
        cache_dir: Path,
        player: Player,
        *,
        settings: TTSSettings | None = None,
        clock: Callable[[], float] = time.monotonic,
        retry_after_s: float = 60.0,
        max_chunk: int = 200,
    ):
        self.settings = settings or TTSSettings()
        self.backends = list(backends)
        self.player = player
        self.cache = AudioCache(
            Path(cache_dir), self.settings.cache_max_mb * 1024 * 1024
        )
        self.last_error: TTSIssue | None = None
        self.history: deque[SpokenClip] = deque(maxlen=20)
        self._clock = clock
        self._retry_after_s = retry_after_s
        self._max_chunk = max_chunk
        self._failed_at: dict[str, float] = {}
        self._queue: queue.PriorityQueue = queue.PriorityQueue()
        self._seq = itertools.count()
        self._lock = threading.Lock()
        self._idle = threading.Condition(self._lock)
        self._generation = 0
        self._live: set[int] = set()  # speech jobs not stopped or finished
        self._pending = 0  # all queued jobs, speech and prefetch
        self._playing: Path | None = None
        self._thread: threading.Thread | None = None
        self._closed = False
        self._configure_backends()

    # --- public API ---------------------------------------------------------

    def speak(self, text: str, lang: Lang, *, interrupt: bool = True) -> bool:
        """Queue ``text`` to be read aloud. Returns False if nothing to say."""
        if not self.settings.enabled or self._closed:
            return False
        segments = self._segments(text, _norm_lang(lang))
        return self._submit(segments, interrupt)

    def speak_bilingual(
        self,
        he: str | None,
        en: str | None,
        *,
        interrupt: bool = True,
    ) -> bool:
        """Read the Hebrew text, then the English text."""
        if not self.settings.enabled or self._closed:
            return False
        segments = self._segments(he, "he") + self._segments(en, "en")
        return self._submit(segments, interrupt)

    def prefetch(self, texts: Iterable[str], lang: Lang = "he") -> int:
        """Synthesize ``texts`` into the cache in the background."""
        if not self.settings.enabled or self._closed:
            return 0
        lang = _norm_lang(lang)
        count = 0
        for text in texts:
            segments = self._segments(text, lang)
            if segments:
                self._enqueue(segments, play=False)
                count += 1
        return count

    def stop(self) -> None:
        """Silence speech now and drop queued speech (not prefetch)."""
        with self._lock:
            self._generation += 1
            self._live.clear()
        self._safe_player_stop()

    def is_speaking(self) -> bool:
        with self._lock:
            if self._live:
                return True
        return self._player_busy()

    def wait_idle(self, timeout: float = 5.0) -> bool:
        """Block until the queue is empty and playback ended (tests, CLI)."""
        deadline = time.monotonic() + timeout
        with self._idle:
            while self._pending:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return False
                self._idle.wait(remaining)
        while self._player_busy():
            if time.monotonic() >= deadline:
                return False
            time.sleep(_POLL_S)
        return True

    def apply_settings(self, settings: TTSSettings) -> None:
        self.settings = settings
        self.cache.max_bytes = settings.cache_max_mb * 1024 * 1024
        self._configure_backends()

    def voice_status(self) -> dict[Lang, str | None]:
        """Which backend would read each language now (None = silent)."""
        status: dict[Lang, str | None] = {}
        for lang in LANGS:
            backend = next(
                (b for b in self._eligible(lang) if not _silent(b)), None
            )
            status[lang] = backend.id if backend else None
        return status

    def clear_error(self) -> None:
        self.last_error = None

    def shutdown(self, timeout: float = 1.0) -> None:
        self._closed = True
        self.stop()
        thread = self._thread
        if thread is not None and thread.is_alive():
            self._queue.put((_SHUTDOWN, next(self._seq), None))
            thread.join(timeout)

    # --- queueing -------------------------------------------------------------

    def _segments(self, text: str | None, lang: Lang) -> list[Segment]:
        if not text:
            return []
        try:
            cleaned = clean_for_speech(str(text), lang)
            if not cleaned:
                return []
            if self.settings.read_english_with_english_voice:
                parts = split_by_language(cleaned, lang)
            else:
                parts = [Segment(lang, cleaned)]
            return [
                Segment(part.lang, chunk)
                for part in parts
                for chunk in chunk_text(part.text, self._max_chunk)
            ]
        except Exception as exc:  # never let odd text crash the game
            logger.warning("could not prepare text for speech: %s", exc)
            return []

    def _submit(self, segments: list[Segment], interrupt: bool) -> bool:
        if not segments:
            return False
        if interrupt:
            self.stop()
        self._enqueue(segments, play=True)
        return True

    def _enqueue(self, segments: Sequence[Segment], *, play: bool) -> None:
        with self._lock:
            job = _Job(next(self._seq), segments, play, self._generation)
            if play:
                self._live.add(job.job_id)
            self._pending += 1
            self._ensure_worker()
        priority = _SPEECH if play else _PREFETCH
        self._queue.put((priority, job.job_id, job))

    def _ensure_worker(self) -> None:
        if self._thread is None or not self._thread.is_alive():
            self._thread = threading.Thread(
                target=self._run, name="nagmon-tts", daemon=True
            )
            self._thread.start()

    # --- worker -----------------------------------------------------------------

    def _run(self) -> None:
        while True:
            _, _, job = self._queue.get()
            if job is None:
                return
            try:
                self._process(job)
            except Exception:  # pragma: no cover - last line of defence
                logger.exception("speech worker error")
            finally:
                with self._idle:
                    self._live.discard(job.job_id)
                    self._pending -= 1
                    self._idle.notify_all()

    def _current(self, job: _Job) -> bool:
        with self._lock:
            return (
                job.job_id in self._live and job.generation == self._generation
            )

    def _process(self, job: _Job) -> None:
        for segment in job.segments:
            if job.play and not self._current(job):
                return
            clip = self._render(segment)
            if clip is None or not job.play:
                continue
            if not self._wait_for_player(job):
                return
            backend_id, path = clip
            try:
                self.player.play(path)
            except Exception as exc:
                self._report("player_error", segment.lang, exc)
                return
            self._playing = path
            self.history.append(
                SpokenClip(backend_id, segment.lang, segment.text, path)
            )
            if not self._current(job):  # stop() raced with play()
                self._safe_player_stop()
                return

    def _wait_for_player(self, job: _Job) -> bool:
        while True:
            if not self._current(job):
                return False
            if not self._player_busy():
                return True
            time.sleep(_POLL_S)

    def _render(self, segment: Segment) -> tuple[str, Path] | None:
        """Find or make audio for one segment. None means silence."""
        lang = segment.lang
        for backend in self._eligible(lang):
            if _silent(backend):
                break
            try:
                path = self._render_with(backend, segment)
            except Exception as exc:
                self._failed_at[backend.id] = self._clock()
                code = "online_failed" if backend.online else "backend_error"
                self._report(code, lang, exc, backend.id)
                continue
            if path is not None:
                return backend.id, path
        self._report("no_voice", lang, None)
        return None

    def _render_with(self, backend: Backend, segment: Segment) -> Path | None:
        voice = backend.voice_for(segment.lang)
        rate = backend.rate_for(segment.lang)
        key = AudioCache.key(backend.id, voice, rate, segment.text)
        hit = self.cache.lookup(key, backend.extension)
        if hit is not None:
            return hit
        tmp = self.cache.tmp_path(key, backend.extension)
        try:
            if not backend.synthesize(segment.text, segment.lang, tmp):
                return None
            protect = [self._playing] if self._playing else []
            return self.cache.store(key, backend.extension, tmp, protect)
        finally:
            tmp.unlink(missing_ok=True)

    def _eligible(self, lang: Lang) -> Iterator[Backend]:
        now = self._clock()
        for backend in self.backends:
            if getattr(backend, "online", False) and not (
                self.settings.allow_online
            ):
                continue  # parent consent is required for online voices
            failed = self._failed_at.get(backend.id)
            if failed is not None and now - failed < self._retry_after_s:
                continue
            try:
                ok = bool(backend.available(lang))
            except Exception as exc:
                logger.debug("%s.available failed: %s", backend.id, exc)
                ok = False
            if ok:
                yield backend

    # --- helpers --------------------------------------------------------------

    def _configure_backends(self) -> None:
        for backend in self.backends:
            try:
                backend.configure(self.settings)
            except Exception as exc:
                logger.warning("could not configure %s: %s", backend, exc)

    def _player_busy(self) -> bool:
        try:
            return bool(self.player.busy())
        except Exception:
            return False

    def _safe_player_stop(self) -> None:
        try:
            self.player.stop()
        except Exception as exc:
            logger.debug("player.stop failed: %s", exc)

    def _report(
        self,
        code: str,
        lang: str | None,
        exc: BaseException | None,
        backend_id: str = "",
    ) -> None:
        detail = f"{backend_id}: {exc}" if exc is not None else ""
        logger.warning("tts %s (%s) %s", code, lang, detail)
        message_key = code
        if code == "no_voice" and self._online_allowed():
            message_key = "no_voice_online"
        message = _message(message_key, lang)
        self.last_error = TTSIssue(code, lang, message, detail)

    def _online_allowed(self) -> bool:
        return self.settings.allow_online and any(
            getattr(b, "online", False) for b in self.backends
        )


def _silent(backend: Backend) -> bool:
    return bool(getattr(backend, "silent", False))
