"""Append-only log of a child's conversations with the owl (AI helper),
for the parent dashboard: ``profiles/<id>/owl_log.jsonl``.

Only the last :data:`MAX_ENTRIES` entries are kept. There is no API to
edit or delete entries; deleting the whole profile is the only way out.
"""

from __future__ import annotations

import json
import os
import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

MAX_ENTRIES = 500
ROLES = ("child", "owl", "system")
Role = Literal["child", "owl", "system"]
_PID_RE = re.compile(r"[A-Za-z0-9_]{1,32}")


@dataclass(frozen=True)
class OwlEntry:
    ts: float
    role: Role
    text: str
    meta: dict[str, Any] = field(default_factory=dict)


class OwlLog:
    def __init__(
        self, root: Path, *, clock: Callable[[], float] = time.time
    ) -> None:
        self.root = Path(root)
        self._clock = clock

    def _path(self, pid: str) -> Path:
        if not isinstance(pid, str) or not _PID_RE.fullmatch(pid):
            raise KeyError(pid)
        pdir = self.root / "profiles" / pid
        if not pdir.is_dir():
            raise KeyError(pid)
        return pdir / "owl_log.jsonl"

    def append(
        self,
        pid: str,
        role: Role,
        text: str,
        *,
        meta: dict[str, Any] | None = None,
    ) -> OwlEntry:
        if role not in ROLES:
            raise ValueError(f"role must be one of {ROLES}")
        path = self._path(pid)
        entry = OwlEntry(self._clock(), role, str(text), dict(meta or {}))
        line = json.dumps(entry.__dict__, ensure_ascii=False)
        with path.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
        lines = path.read_text("utf-8").splitlines()
        if len(lines) > MAX_ENTRIES:
            tmp = path.with_name(path.name + ".tmp")
            tmp.write_text("\n".join(lines[-MAX_ENTRIES:]) + "\n", "utf-8")
            os.replace(tmp, path)
        return entry

    def read(self, pid: str, *, limit: int | None = None) -> list[OwlEntry]:
        """Entries oldest-first (at most the last ``limit``)."""
        try:
            path = self._path(pid)
        except KeyError:
            return []
        if not path.exists():
            return []
        out: list[OwlEntry] = []
        for line in path.read_text("utf-8").splitlines():
            try:
                d = json.loads(line)
                if d.get("role") not in ROLES:
                    continue
                out.append(
                    OwlEntry(
                        float(d["ts"]),
                        d["role"],
                        str(d["text"]),
                        dict(d.get("meta") or {}),
                    )
                )
            except (ValueError, KeyError, TypeError, AttributeError):
                continue
        out = out[-MAX_ENTRIES:]
        return out[-limit:] if limit else out
