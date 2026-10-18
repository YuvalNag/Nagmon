"""Small JSON persistence helpers shared by the family module.

* :func:`atomic_write_json` writes ``<name>.tmp``, fsyncs it and then
  ``os.replace``-s it over the target. The previous good file is copied to
  ``<name>.bak`` first.
* :func:`load_json` never raises on bad content. A corrupt file is moved
  aside to ``<name>.corrupt-<stamp>`` and the backup (or nothing) is used.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

logger = logging.getLogger(__name__)

LoadStatus = Literal["ok", "missing", "backup", "reset"]


@dataclass(frozen=True)
class LoadResult:
    data: dict[str, Any] | None
    status: LoadStatus

    @property
    def recovered(self) -> bool:
        return self.status in ("backup", "reset")


def _bak(path: Path) -> Path:
    return path.with_name(path.name + ".bak")


def atomic_write_json(
    path: Path,
    data: Any,
    *,
    mode: int | None = None,
    backup: bool = True,
) -> None:
    """Write ``data`` as JSON to ``path`` atomically.

    ``mode`` (e.g. ``0o600``) is applied to the new file where the
    platform supports POSIX permissions.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    payload = json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    fd = os.open(tmp, flags, 0o600 if mode is None else mode)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(payload)
            f.flush()
            os.fsync(f.fileno())
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    if mode is not None:
        _chmod(tmp, mode)
    if backup and path.exists():
        try:
            shutil.copyfile(path, _bak(path))
            if mode is not None:
                _chmod(_bak(path), mode)
        except OSError:  # pragma: no cover - best effort
            logger.warning("could not back up %s", path.name)
    os.replace(tmp, path)


def _chmod(path: Path, mode: int) -> None:
    try:
        os.chmod(path, mode)
    except OSError:  # pragma: no cover - e.g. some Windows filesystems
        pass


def _read_object(path: Path) -> dict[str, Any] | None:
    try:
        text = path.read_text("utf-8")
        data = json.loads(text)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def _move_aside(path: Path) -> Path:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    n = 0
    while True:
        suffix = f".corrupt-{stamp}" + (f"-{n}" if n else "")
        target = path.with_name(path.name + suffix)
        if not target.exists():
            break
        n += 1
    os.replace(path, target)
    logger.warning("corrupt file %s moved to %s", path.name, target.name)
    return target


def load_json(path: Path) -> LoadResult:
    """Load a JSON object from ``path``, recovering from corruption."""
    path = Path(path)
    if not path.exists():
        return LoadResult(None, "missing")
    data = _read_object(path)
    if data is not None:
        return LoadResult(data, "ok")
    _move_aside(path)
    bak = _bak(path)
    if bak.exists():
        data = _read_object(bak)
        if data is not None:
            return LoadResult(data, "backup")
    return LoadResult(None, "reset")


def as_int(value: Any, default: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        return default
    return value


def as_bool(value: Any, default: bool) -> bool:
    return value if isinstance(value, bool) else default


def as_float(value: Any, default: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return default
    return float(value)


def as_str(value: Any, default: str) -> str:
    return value if isinstance(value, str) else default
