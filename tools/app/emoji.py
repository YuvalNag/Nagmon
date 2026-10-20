# SPDX-License-Identifier: GPL-3.0
"""Twemoji subset: only the pictures the content and generators use.

Codes come from the content (``emoji:`` fields and ``emoji:<code>``
values) and from the generators' source (``nagmon/learning``: quoted
codes such as ``"1f34e"`` and emoji characters). Each code is resolved
to a file the way the old game does (``nagmon.ui.emoji.candidates``:
as given, without U+FE0F, with U+FE0F). One format is shipped: the SVG
(``emoji/<stem>.svg``; the app shows them as ``<img>``, sharp at any
size), or the 72 px PNG when a picture has no SVG.
"""

from __future__ import annotations

import re
from typing import Any

from tools.app import content
from tools.app.common import NAG, REPO, Output

EMOJI_DIR = NAG / "gfx" / "emoji"
GENERATORS = REPO / "nagmon" / "learning"
#: Pictures the UI uses by code (the wise owl, ...).
UI_CODES = ("1f989",)
_QUOTED_CODE = re.compile(r"[\"']((?:[0-9a-f]{4,5})(?:-[0-9a-f]{4,5})*)[\"']")
_EMOJI_CHARS = re.compile(
    "[\U0001f000-\U0001faff☀-➿⬀-⯿]"
    "(?:[️‍\U0001f3fb-\U0001f3ff]"
    "[\U0001f000-\U0001faff☀-➿⬀-⯿]?)*"
)


def generator_codes() -> set[str]:
    codes: set[str] = set()
    for path in sorted(GENERATORS.rglob("*.py")):
        text = path.read_text(encoding="utf-8")
        codes |= set(_QUOTED_CODE.findall(text))
        codes |= set(_EMOJI_CHARS.findall(text))
    return codes


def resolve(code: str) -> str | None:
    """The file stem of ``code`` in the Twemoji folder, or ``None``."""
    from nagmon.ui.emoji import candidates

    for stem in candidates(code):
        if (EMOJI_DIR / f"{stem}.png").is_file():
            return stem
    return None


def build(out: Output) -> dict[str, Any]:
    from_content = content.emoji_codes()
    from_generators = generator_codes()
    stems: dict[str, str] = {}
    unresolved = []
    for code in sorted(from_content):
        stem = resolve(code)
        if stem is None:
            unresolved.append(code)
        else:
            stems[code] = stem
    # Generator literals are only codes when such a picture exists
    # (``"1f34e"`` is, a colour like ``"ffd166"`` is not).
    for code in sorted(from_generators | set(UI_CODES)):
        stem = resolve(code)
        if stem is not None:
            stems[code] = stem
    stems_used = sorted(set(stems.values()))
    files = []
    pngs = 0
    for stem in stems_used:
        svg = EMOJI_DIR / "svg" / f"{stem}.svg"
        if svg.is_file():
            out.add_copy(f"emoji/{stem}.svg", svg, "emoji")
            files.append(f"{stem}.svg")
        else:
            out.add_copy(
                f"emoji/{stem}.png", EMOJI_DIR / f"{stem}.png", "emoji"
            )
            files.append(f"{stem}.png")
            pngs += 1
    out.add_json(
        "emoji/index.json",
        {
            "codes": {
                code: next(f for f in files if f.startswith(f"{stem}."))
                for code, stem in sorted(stems.items())
            },
            "files": files,
        },
    )
    if unresolved:
        out.notes.append(f"content emoji without a picture: {unresolved}")
    return {
        "content_codes": len(from_content),
        "pictures": len(files),
        "png_fallbacks": pngs,
        "unresolved": unresolved,
    }
