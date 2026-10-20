# SPDX-License-Identifier: GPL-3.0
"""Lessons: ``mods/nagmon/lessons/*.yaml`` as ``game/lessons/<id>.json``.

A lesson teaches one skill of the question bank in 2-4 picture cards and a
tiny practice. The shape is documented in ``app/src/core/game/lessons.ts``.
With no lesson files nothing is written, and the tutor offers nothing.
"""

from __future__ import annotations

from typing import Any

from tools.app.common import NAG, Output
from tools.app.content import read_yaml

LESSONS = NAG / "lessons"


def documents() -> dict[str, Any]:
    """Every lesson file, by id (the file's name)."""
    found: dict[str, Any] = {}
    for path in sorted(LESSONS.glob("*.yaml")) if LESSONS.is_dir() else []:
        doc = read_yaml(path)
        if (
            not isinstance(doc, dict)
            or not isinstance(doc.get("skill"), str)
            or not isinstance(doc.get("cards"), list)
        ):
            raise ValueError(f"{path.name}: a lesson needs a skill and cards")
        found[path.stem] = doc
    return found


def emoji_codes() -> set[str]:
    """Picture codes the lessons use (cards and notes)."""
    codes: set[str] = set()
    for doc in documents().values():
        pics = [*doc["cards"], doc.get("notes")]
        for pic in pics:
            if isinstance(pic, dict) and isinstance(pic.get("emoji"), str):
                codes.add(pic["emoji"])
    return codes


def build(out: Output) -> dict[str, Any]:
    names = []
    for name, doc in documents().items():
        out.add_json(f"lessons/{name}.json", doc, compact=True)
        names.append(name)
    return {"lessons": names}
