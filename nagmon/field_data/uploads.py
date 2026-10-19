# SPDX-License-Identifier: GPL-3.0
"""
What the parent sends, and where it lands in the data repo
(docs/kids/SDD_FIELD_DATA.md §2.1, §2.4, §2.5):

    devices/<install-id>/logs/<UTC>.txt
    devices/<install-id>/crashes/<UTC>.txt
    devices/<install-id>/progress/<UTC>.json

``FieldData`` does one upload per call and blocks; the screens run it in
a background thread. Every text is cleaned of keys once more right
before it leaves.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import secrets
import time
from collections.abc import Callable, Mapping
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

from nagmon.ai.config import load_keys
from nagmon.ai.providers import Transport
from nagmon.crash_report import CrashReports, redact_secrets
from nagmon.family._jsonio import atomic_write_json, load_json
from nagmon.field_data.github import (
    DEFAULT_REPO,
    Check,
    Code,
    GitHubAccess,
    GitHubClient,
    Upload,
    forget_access,
    load_access,
    save_access,
)

logger = logging.getLogger(__name__)

DEVICE_FILE = "device.json"
KINDS = {"logs": ".txt", "crashes": ".txt", "progress": ".json"}
_ID = re.compile(r"[0-9a-f]{8}")


def _new_id() -> str:
    return secrets.token_hex(4)


def _device(root: Path) -> dict[str, Any]:
    return load_json(Path(root) / DEVICE_FILE).data or {}


def _save_device(root: Path, data: dict[str, Any]) -> None:
    atomic_write_json(Path(root) / DEVICE_FILE, data)


def install_id(root: Path, *, make: Callable[[], str] = _new_id) -> str:
    """
    8 random hex digits, made once per install and kept in Nagmon's data.
    Not the phone's id: it only tells two installs' uploads apart.
    """
    data = _device(root)
    current = data.get("install_id")
    if isinstance(current, str) and _ID.fullmatch(current):
        return current
    data = {"schema_version": 1, **data, "install_id": make()}
    _save_device(root, data)
    return str(data["install_id"])


def upload_path(device: str, kind: str, now: datetime) -> str:
    if kind not in KINDS:
        raise ValueError(f"unknown upload kind {kind!r}")
    stamp = now.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"devices/{device}/{kind}/{stamp}{KINDS[kind]}"


def default_crash_dir(root: Path) -> Path:
    """Where ``buildconfig/android/main.py`` keeps the last crash report."""
    private = os.environ.get("ANDROID_PRIVATE")
    return Path(private) / "crash" if private else Path(root) / "crash"


def _fingerprint(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


class FieldData:
    """
    The parent area's side of the data repo: connect, status, uploads.

    Parameters:
        root: Nagmon's data folder (``secrets.json``, ``device.json``).
        crash_dir: Where ``last_crash.txt`` is.
        transport: HTTP transport (a fake in tests).
        clock: Seconds since the epoch.
    """

    def __init__(
        self,
        root: Path,
        *,
        crash_dir: Path | None = None,
        transport: Transport | None = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.root = Path(root)
        self.crashes = CrashReports(crash_dir or default_crash_dir(root))
        self._transport = transport
        self._clock = clock

    def __repr__(self) -> str:
        return f"FieldData(root={str(self.root)!r})"

    # -------------------------------------------------------- connection

    @property
    def access(self) -> GitHubAccess | None:
        return load_access(self.root)

    @property
    def connected(self) -> bool:
        return self.access is not None

    @property
    def repo(self) -> str:
        access = self.access
        return access.repo if access is not None else DEFAULT_REPO

    def _client(self, access: GitHubAccess) -> GitHubClient:
        return GitHubClient(
            access, transport=self._transport, clock=self._clock
        )

    def connect(self, token: str, repo: str = DEFAULT_REPO) -> Check:
        """
        Checks the token and keeps it if it works. A public repo keeps it
        too (the parent only has to make the repo private); uploads stay
        refused until then.
        """
        access = GitHubAccess(token.strip(), repo.strip())
        check = self._client(access).check(fresh=True)
        if check.code in (Code.OK, Code.PUBLIC):
            save_access(self.root, access)
        return check

    def disconnect(self) -> None:
        forget_access(self.root)

    def cached_status(self) -> Check | None:
        """The status without asking GitHub (None: ask it)."""
        access = self.access
        if access is None:
            return Check(Code.NOT_CONNECTED, DEFAULT_REPO)
        return self._client(access).cached()

    def status(self, *, fresh: bool = False) -> Check:
        access = self.access
        if access is None:
            return Check(Code.NOT_CONNECTED, DEFAULT_REPO)
        return self._client(access).check(fresh=fresh)

    def secrets(self) -> list[str]:
        """Every saved key and the token, to hide in what is sent."""
        values = list(load_keys(self.root).values())
        access = self.access
        if access is not None:
            values.append(access.token)
        return values

    # ----------------------------------------------------------- uploads

    def _send(self, kind: str, text: str) -> Upload:
        access = self.access
        if access is None:
            return Upload(Code.NOT_CONNECTED)
        clean = redact_secrets(text, self.secrets())
        now = datetime.fromtimestamp(self._clock(), tz=timezone.utc)
        path = upload_path(install_id(self.root), kind, now)
        result = self._client(access).put(
            path, clean.encode("utf-8"), f"Field data: {kind}"
        )
        logger.info("Upload of %s: %s", kind, result.code.value)
        return result

    def send_log(self, text: str) -> Upload:
        return self._send("logs", text)

    def send_progress(self, snapshot: Mapping[str, Any]) -> Upload:
        text = json.dumps(snapshot, ensure_ascii=False, indent=1)
        return self._send("progress", text + "\n")

    def pending_crash(self) -> str | None:
        """The last crash report, unless it was already sent."""
        text = self.crashes.last()
        if not text or not text.strip():
            return None
        if _device(self.root).get("crash_sent") == _fingerprint(text):
            return None
        return text

    def send_crash(self, text: str | None = None) -> Upload:
        text = self.pending_crash() if text is None else text
        if not text:
            return Upload(Code.FAILED)
        result = self._send("crashes", text)
        if result.ok:
            data = _device(self.root)
            data["crash_sent"] = _fingerprint(text)
            _save_device(self.root, data)
        return result


class CrashSender(Protocol):
    connected: bool

    def send_crash(self, text: str) -> Upload: ...


def send_crash_or_share(
    text: str, field: CrashSender | None, share: Callable[[str], None]
) -> str:
    """
    The crash window's "send": to the data repo when connected; otherwise,
    or when that fails, Android's share sheet as before. Returns which.
    """
    if field is not None and field.connected:
        try:
            if field.send_crash(text).ok:
                return "github"
        except Exception:
            logger.exception("Could not send the crash report to GitHub")
    share(text)
    return "share"
