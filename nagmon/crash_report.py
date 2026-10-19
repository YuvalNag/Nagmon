# SPDX-License-Identifier: GPL-3.0
"""
Crash reports from the phone (docs/kids/SDD_ANDROID.md §2.6).

The report says what broke and on which build and phone, hides every
key, is kept on the phone, and leaves it only through ``offer`` (the
Android dialog, where the parent taps "send"). Nothing here needs
Android; ``nagmon/android/crash_dialog.py`` is the phone's side.
"""

from __future__ import annotations

import faulthandler
import logging
import re
import traceback
from collections.abc import Callable, Iterable, Mapping
from datetime import datetime, timezone
from pathlib import Path
from typing import IO

logger = logging.getLogger(__name__)

#: Fits in a WhatsApp or e-mail message.
MAX_CHARS = 20_000
#: The app's last log lines (SDD_FIELD_DATA §2.5) follow this line; at
#: most LOG_CHARS of them, so the error always has room.
LOG_MARKER = "--- app log (last lines) ---"
LOG_CHARS = 8_000

#: Keys by their shape: Groq, Gemini/Google, GitHub, OpenAI, HTTP auth.
_KEY_PATTERNS = (
    re.compile(r"gsk_[A-Za-z0-9]{20,}"),
    re.compile(r"AIza[0-9A-Za-z_\-]{30,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"sk-[A-Za-z0-9_\-]{20,}"),
    re.compile(r"(?i)(bearer\s+)\S+"),
)


def redact_secrets(text: str, secrets: Iterable[str] = ()) -> str:
    """``text`` without keys: known shapes, plus every saved key."""
    for secret in secrets:
        if secret and len(secret) >= 8:
            text = text.replace(secret, "***")
    for pattern in _KEY_PATTERNS:
        text = pattern.sub(
            lambda m: (m.group(1) if m.groups() else "") + "***", text
        )
    return text


#: What a child's name becomes in a log or a report.
NAME_MARK = "<child>"


def hide_names(text: str, names: Iterable[str] = ()) -> str:
    """
    ``text`` without the children's names (the game names the player
    after the child, and Tuxemon's warnings name the player). A Latin
    name is matched as a whole word, in any case; a Hebrew one also
    after a prefix letter (לנועה). One-letter names are left alone.
    """
    wanted = {n.strip() for n in names if isinstance(n, str)}
    for name in sorted(
        (n for n in wanted if len(n) >= 2), key=len, reverse=True
    ):
        pattern = re.compile(
            r"(?<![A-Za-z])" + re.escape(name) + r"(?![A-Za-z])",
            re.IGNORECASE,
        )
        text = pattern.sub(NAME_MARK, text)
    return text


def build_report(
    error: str, info: Mapping[str, str], *, now: datetime, log: str = ""
) -> str:
    """
    A header (build, phone, time), the error and the app's last log
    lines. A long error or log keeps its end, where the traceback names
    what went wrong.
    """
    header = ["Nagmon crash report"]
    header += [f"{key}: {value}" for key, value in info.items()]
    header.append(f"time: {now.astimezone(timezone.utc):%Y-%m-%d %H:%M} UTC")
    head = "\n".join(header) + "\n\n"
    tail = ""
    log = log.strip()
    if log:
        if len(log) > LOG_CHARS:
            log = "...\n" + log[-(LOG_CHARS - 4) :]
        tail = f"\n\n{LOG_MARKER}\n{log}"
    room = MAX_CHARS - len(head) - len(tail) - 1  # the final newline
    body = error.strip()
    if len(body) > room:
        body = "...\n" + body[-(room - 4) :]
    return head + body + tail + "\n"


class CrashReports:
    """The last report and the native-crash file, in ``root``."""

    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.last_file = self.root / "last_crash.txt"
        self.native_file = self.root / "native_crash.txt"
        self._native: IO[str] | None = None

    def save(self, text: str) -> Path:
        self.root.mkdir(parents=True, exist_ok=True)
        self.last_file.write_text(text, encoding="utf-8")
        return self.last_file

    def last(self) -> str | None:
        try:
            return self.last_file.read_text(encoding="utf-8")
        except OSError:
            return None

    def take_native(self) -> str | None:
        """What faulthandler wrote when the game last died, once."""
        try:
            text = self.native_file.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return None
        self.native_file.write_text("", encoding="utf-8")
        return text if text.strip() else None

    def watch_native(self) -> None:
        """
        From now on a crash in compiled code (SIGSEGV, SIGILL, ...) writes
        the Python stack to ``native_file``. Call ``take_native`` first:
        this starts the file afresh.
        """
        self.root.mkdir(parents=True, exist_ok=True)
        self._native = open(self.native_file, "w", encoding="utf-8")
        faulthandler.enable(file=self._native, all_threads=True)


class CrashGuard:
    """
    Runs the game; when it breaks, saves a report and offers it.

    ``info`` gives the build and phone details, ``offer`` shows the report
    to the parent (and shares it only on their tap), ``secrets`` gives the
    saved keys to hide, ``log`` the app's last log lines, ``names`` the
    children's names to hide. ``on_crash`` runs first when this session
    broke (not for last time's native crash), e.g. to note it in the log.
    """

    def __init__(
        self,
        reports: CrashReports,
        *,
        info: Callable[[], Mapping[str, str]],
        offer: Callable[[str], None],
        secrets: Callable[[], Iterable[str]] = tuple,
        log: Callable[[], str] = str,
        names: Callable[[], Iterable[str]] = tuple,
        on_crash: Callable[[], object] = lambda: None,
        clock: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    ) -> None:
        self.reports = reports
        self._info = info
        self._offer = offer
        self._secrets = secrets
        self._log = log
        self._names = names
        self._on_crash = on_crash
        self._clock = clock

    def report(self, error: str, *, previous: bool = False) -> str:
        """
        Saves and offers a report for ``error`` (a traceback); ``previous``
        when it is about an earlier session.
        """
        if not previous:
            try:
                self._on_crash()
            except Exception as exc:
                logger.error("Could not note the crash: %s", exc)
        try:
            info = dict(self._info())
        except Exception as exc:
            info = {"details": f"unavailable ({exc})"}
        try:
            secrets = list(self._secrets())
        except Exception:
            secrets = []
        try:
            log = self._log()
        except Exception as exc:
            log = f"(log unavailable: {exc})"
        try:
            names = list(self._names())
        except Exception:
            names = []
        text = hide_names(
            redact_secrets(
                build_report(error, info, now=self._clock(), log=log), secrets
            ),
            names,
        )
        try:
            self.reports.save(text)
        except OSError as exc:
            logger.error("Could not save the crash report: %s", exc)
        try:
            self._offer(text)
        except Exception as exc:
            logger.error("Could not show the crash report: %s", exc)
        return text

    def run(self, start: Callable[[], object]) -> None:
        native = self.reports.take_native()
        if native:
            self.report(
                "The game stopped last time (native crash):\n" + native,
                previous=True,
            )
        self.reports.watch_native()
        try:
            start()
        except SystemExit:
            raise  # a clean exit, or handle_fatal_error already reported
        except BaseException:
            self.report(traceback.format_exc())
            raise SystemExit(1)
