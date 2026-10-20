# SPDX-License-Identifier: GPL-3.0
"""
The app's own log (docs/kids/SDD_FIELD_DATA.md §2.2).

On the phone Tuxemon logs only errors, and only to logcat. ``RingLog``
keeps the last 400 lines in memory (Nagmon's INFO and everyone's
warnings), hides keys as each line is written, and is saved to
``<data>/app_log.txt`` when the app goes to the background, at exit and
before sending, so the parent can send it after the game opens again.
"""

from __future__ import annotations

import json
import logging
import os
import platform
import re
import threading
import time
import traceback
from collections import deque
from collections.abc import Callable, Iterable, Mapping
from datetime import datetime, timezone
from pathlib import Path

from nagmon.crash_report import redact_secrets

MAX_LINES = 400
LOG_FILE = "app_log.txt"
#: Loggers whose INFO lines are kept; the rest from WARNING up. The
#: frame rate (tuxemon.frame_limiter) shows how smooth a phone is.
OWN_LOGGERS = ("nagmon", "mods.nagmon", "tuxemon.frame_limiter")
START_MARK = "=== Nagmon start"
SAVED_MARK = "--- saved: "
#: How a saved log ended, as the next start line says it.
ENDINGS = {"exit": "normal", "background": "normal", "crash": "crash"}
SECRETS_TTL = 30.0

APP_ROOT = Path(__file__).resolve().parents[2]

Clock = Callable[[], datetime]


def _own(name: str) -> bool:
    return any(
        name == own or name.startswith(own + ".") for own in OWN_LOGGERS
    )


class RingLog(logging.Handler):
    """
    The last ``max_lines`` lines: ``HH:MM:SS LEVEL logger: message`` (UTC)
    and, for an exception, its traceback.

    ``secrets`` gives the saved keys to hide (read at most every 30 s);
    keys of a known shape are hidden either way.
    """

    def __init__(
        self,
        max_lines: int = MAX_LINES,
        *,
        secrets: Callable[[], Iterable[str]] = tuple,
        clock: Clock | None = None,
    ) -> None:
        super().__init__(logging.INFO)
        self._lines: deque[str] = deque(maxlen=max_lines)
        self._secrets = secrets
        self._clock = clock
        self._known: list[str] = []
        self._known_at = -SECRETS_TTL
        self._guard = threading.Lock()

    def __repr__(self) -> str:
        return f"RingLog(lines={len(self._lines)})"

    # ------------------------------------------------------------ writing

    def filter(self, record: logging.LogRecord) -> bool:
        wanted = logging.INFO if _own(record.name) else logging.WARNING
        return record.levelno >= wanted and bool(super().filter(record))

    def _secret_values(self) -> list[str]:
        now = time.monotonic()
        if now - self._known_at >= SECRETS_TTL:
            try:
                self._known = [s for s in self._secrets() if s]
            except Exception:  # a broken secrets file must not stop logging
                self._known = []
            self._known_at = now
        return self._known

    def _when(self, record: logging.LogRecord) -> datetime:
        if self._clock is not None:
            return self._clock().astimezone(timezone.utc)
        return datetime.fromtimestamp(record.created, tz=timezone.utc)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            text = (
                f"{self._when(record):%H:%M:%S} {record.levelname} "
                f"{record.name}: {record.getMessage()}"
            )
            if record.exc_info and record.exc_info[0] is not None:
                text += "\n" + "".join(
                    traceback.format_exception(*record.exc_info)
                ).rstrip("\n")
            if record.stack_info:
                text += "\n" + record.stack_info
            self.add(text)
        except Exception:
            self.handleError(record)

    def add(self, text: str) -> None:
        """Adds lines as they are (after hiding keys), not through logging."""
        clean = redact_secrets(text, self._secret_values())
        with self._guard:
            self._lines.extend(clean.splitlines() or [""])

    # ------------------------------------------------------------ reading

    def lines(self) -> list[str]:
        with self._guard:
            return list(self._lines)

    def text(self) -> str:
        lines = self.lines()
        return "\n".join(lines) + "\n" if lines else ""

    def tail(self, n: int) -> str:
        lines = self.lines()[-n:]
        return "\n".join(lines) + "\n" if lines else ""

    # ------------------------------------------------------------ the file

    def save(self, path: Path, *, ending: str | None = None) -> None:
        """Writes the lines (and how the session ended) atomically."""
        text = self.text()
        if ending:
            text += f"{SAVED_MARK}{ending}\n"
        text = redact_secrets(text, self._secret_values())
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + ".tmp")
        # A lone surrogate (a path read with surrogateescape) becomes "?".
        tmp.write_text(text, encoding="utf-8", errors="replace")
        os.replace(tmp, path)

    def load(self, path: Path) -> str | None:
        """
        Puts the saved lines before the current ones. Returns how that
        session ended ("exit", "background", "crash" or "unknown"), or
        None if there was no saved log.
        """
        try:
            saved = Path(path).read_text(encoding="utf-8", errors="replace")
        except OSError:
            return None
        old = saved.splitlines()
        with self._guard:
            current = list(self._lines)
            self._lines.clear()
            self._lines.extend(old + current)
        if old and old[-1].startswith(SAVED_MARK):
            return old[-1][len(SAVED_MARK) :].strip() or "unknown"
        return "unknown"


# ------------------------------------------------------------ build info


def build_info(app_root: Path = APP_ROOT) -> dict[str, str]:
    """Version and build: ``build_info.json`` on the phone, else local."""
    try:
        data = json.loads((app_root / "build_info.json").read_text("utf-8"))
        if isinstance(data, dict) and data.get("version"):
            return {k: str(v) for k, v in data.items()}
    except (OSError, ValueError):
        pass
    version = "0.0.0"
    try:
        config = (app_root / "buildconfig" / "build_config.yaml").read_text(
            "utf-8"
        )
        found = re.search(r"^version:\s*['\"]?([^'\"\s]+)", config, re.M)
        if found:
            version = found.group(1)
    except OSError:
        pass
    return {"version": version, "build": "local"}


# ------------------------------------------------------- the app's log

_current: RingLog | None = None
_root: Path | None = None
_crashed = False
_old_levels: dict[str, int] = {}


def _saved_secrets(root: Path) -> list[str]:
    from nagmon.ai.config import load_keys
    from nagmon.field_data.github import load_access

    values = list(load_keys(root).values())
    access = load_access(root)
    if access is not None:
        values.append(access.token)
    return values


def _apply_levels() -> None:
    """
    Nagmon's INFO and everyone's WARNING reach the handlers. Tuxemon's
    own handlers keep their levels (ERROR on the phone), so its console
    and logcat do not get louder.
    """
    for name in (*OWN_LOGGERS, ""):
        lg = logging.getLogger(name)
        wanted = logging.INFO if name else logging.WARNING
        if lg.level == logging.NOTSET and name:
            _old_levels.setdefault(name, lg.level)
            lg.setLevel(wanted)
        elif lg.level > wanted:
            _old_levels.setdefault(name, lg.level)
            lg.setLevel(wanted)


def install(
    root: Path,
    *,
    details: Mapping[str, str] | None = None,
    secrets: Callable[[], Iterable[str]] | None = None,
    clock: Clock | None = None,
) -> RingLog:
    """
    Starts the app's log once (later calls only re-apply the levels,
    which Tuxemon's logging setup resets): loads the last session's lines
    and writes a start line with the build, the phone and how the last
    session ended.
    """
    global _current, _root, _crashed
    if _current is not None:
        _apply_levels()
        return _current
    root = Path(root)
    ring = RingLog(
        secrets=secrets or (lambda: _saved_secrets(root)), clock=clock
    )
    previous = ring.load(root / LOG_FILE)
    info = dict(details) if details is not None else build_info()
    info.setdefault("device", platform.platform())
    now = (clock or (lambda: datetime.now(timezone.utc)))()
    ended = (
        "none (first run)"
        if previous is None
        else ENDINGS.get(previous, "unknown")
    )
    ring.add(
        f"{START_MARK} {now.astimezone(timezone.utc):%Y-%m-%d %H:%M} UTC"
        f" · version {info.get('version', '?')}"
        f" · build {info.get('build', '?')}"
        f" · device {info.get('device', '?')}"
        f" · previous exit: {ended}"
    )
    logging.getLogger().addHandler(ring)
    _apply_levels()
    _current, _root, _crashed = ring, root, False
    return ring


def uninstall() -> None:
    """Stops the log and gives the loggers their levels back (tests)."""
    global _current, _root, _crashed
    if _current is not None:
        logging.getLogger().removeHandler(_current)
    for name, level in _old_levels.items():
        logging.getLogger(name).setLevel(level)
    _old_levels.clear()
    _current, _root, _crashed = None, None, False


def current() -> RingLog | None:
    return _current


def note_crash() -> None:
    """The game broke: the saved log will say so at the next start."""
    global _crashed
    _crashed = True


def save(*, ending: str | None = None) -> None:
    """Saves the log to ``<data>/app_log.txt``; never raises."""
    if _current is None or _root is None:
        return
    if ending is None or _crashed:
        ending = "crash" if _crashed else (ending or "exit")
    try:
        _current.save(_root / LOG_FILE, ending=ending)
    except Exception as exc:  # runs on the game's thread and at exit
        logging.getLogger(__name__).warning("Could not save the log: %s", exc)


def text() -> str:
    return _current.text() if _current is not None else ""


def tail(n: int) -> str:
    return _current.tail(n) if _current is not None else ""
