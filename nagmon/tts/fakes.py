# SPDX-License-Identifier: GPL-3.0
"""Fake backend and player for tests: no network and no sound."""

from __future__ import annotations

import threading
from pathlib import Path

from nagmon.tts.settings import Lang, TTSSettings


class FakeBackend:
    """Writes ``"<id>:<lang>:<text>"`` as the "audio" and records calls."""

    silent = False

    def __init__(
        self,
        id: str = "fake",
        *,
        online: bool = False,
        langs: tuple[str, ...] = ("he", "en"),
        extension: str = ".wav",
        fail: BaseException | None = None,
        available_error: BaseException | None = None,
        gate: threading.Event | None = None,
        write: bool = True,
    ):
        self.id = id
        self.online = online
        self.langs = langs
        self.extension = extension
        self.fail = fail
        self.available_error = available_error
        self.gate = gate
        self.write = write
        self.calls: list[tuple[str, str]] = []
        self.settings: TTSSettings | None = None

    def configure(self, settings: TTSSettings) -> None:
        self.settings = settings

    def available(self, lang: Lang) -> bool:
        if self.available_error is not None:
            raise self.available_error
        return lang in self.langs

    def voice_for(self, lang: Lang) -> str:
        return f"{self.id}-{lang}"

    def rate_for(self, lang: Lang) -> str:
        return "+0%"

    def synthesize(self, text: str, lang: Lang, out_path: Path) -> bool:
        self.calls.append((text, lang))
        if self.gate is not None:
            self.gate.wait(5.0)
        if self.fail is not None:
            raise self.fail
        if self.write:
            Path(out_path).write_bytes(f"{self.id}:{lang}:{text}".encode())
        return True


class FakePlayer:
    """Records what was played. ``auto_finish=False`` stays busy until
    ``finish()`` or ``stop()``, like a long clip."""

    def __init__(
        self, *, auto_finish: bool = True, fail: BaseException | None = None
    ):
        self.auto_finish = auto_finish
        self.fail = fail
        self.played: list[Path] = []
        self.texts: list[str] = []
        self.stops = 0
        self._busy = False

    def play(self, path: Path) -> None:
        if self.fail is not None:
            raise self.fail
        path = Path(path)
        self.texts.append(path.read_bytes().decode("utf-8", "replace"))
        self.played.append(path)
        self._busy = not self.auto_finish

    def stop(self) -> None:
        self.stops += 1
        self._busy = False

    def busy(self) -> bool:
        return self._busy

    def finish(self) -> None:
        self._busy = False
