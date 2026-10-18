# SPDX-License-Identifier: GPL-3.0
"""On-disk cache of synthesized speech (SDD_TTS §2.6)."""

from __future__ import annotations

import hashlib
import logging
import os
import re
import uuid
from collections.abc import Iterable
from pathlib import Path

logger = logging.getLogger(__name__)

_PARTIAL_RE = re.compile(r"^[0-9a-f]{64}\.part")


class AudioCache:
    """Audio files named by ``sha256(backend|voice|rate|text)``.

    Files are written to a temporary name and moved into place, so a crash
    never leaves a half-written clip. When the folder grows over
    ``max_bytes`` the least recently used files (by mtime) are deleted.
    """

    def __init__(self, root: Path, max_bytes: int = 200 * 1024 * 1024):
        self.root = Path(root)
        self.max_bytes = max_bytes
        self.root.mkdir(parents=True, exist_ok=True)
        self._remove_partials()

    @staticmethod
    def key(backend_id: str, voice: str, rate: str, text: str) -> str:
        raw = f"{backend_id}|{voice}|{rate}|{text}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def path_for(self, key: str, ext: str) -> Path:
        return self.root / f"{key}{ext}"

    def tmp_path(self, key: str, ext: str) -> Path:
        return self.root / f"{key}.part{uuid.uuid4().hex[:8]}{ext}"

    def lookup(self, key: str, ext: str) -> Path | None:
        path = self.path_for(key, ext)
        try:
            if path.stat().st_size <= 0:
                return None
            os.utime(path)
        except OSError:
            return None
        return path

    def store(
        self, key: str, ext: str, tmp: Path, protect: Iterable[Path] = ()
    ) -> Path:
        """Move a finished ``tmp`` file into the cache and return its path."""
        try:
            size = tmp.stat().st_size
        except OSError:
            size = 0
        if size <= 0:
            tmp.unlink(missing_ok=True)
            raise ValueError("synthesized audio file is empty")
        path = self.path_for(key, ext)
        os.replace(tmp, path)
        os.utime(path)
        self.evict(protect={path, *protect})
        return path

    def _files(self) -> list[tuple[float, int, Path]]:
        found = []
        try:
            entries = list(os.scandir(self.root))
        except OSError:
            return []
        for entry in entries:
            if not entry.is_file() or _PARTIAL_RE.match(entry.name):
                continue
            try:
                st = entry.stat()
            except OSError:
                continue
            found.append((st.st_mtime, st.st_size, Path(entry.path)))
        return found

    def total_bytes(self) -> int:
        return sum(size for _, size, _ in self._files())

    def evict(self, protect: Iterable[Path] = ()) -> int:
        """Delete oldest files until the cache fits. Returns files removed."""
        files = sorted(self._files())
        total = sum(size for _, size, _ in files)
        keep = {Path(p) for p in protect}
        removed = 0
        for _, size, path in files:
            if total <= self.max_bytes:
                break
            if path in keep:
                continue
            try:
                path.unlink()
            except OSError as exc:
                logger.debug("could not evict %s: %s", path, exc)
                continue
            total -= size
            removed += 1
        return removed

    def clear(self) -> None:
        for _, _, path in self._files():
            path.unlink(missing_ok=True)

    def _remove_partials(self) -> None:
        try:
            entries = list(os.scandir(self.root))
        except OSError:
            return
        for entry in entries:
            if entry.is_file() and _PARTIAL_RE.match(entry.name):
                Path(entry.path).unlink(missing_ok=True)
