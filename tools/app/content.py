# SPDX-License-Identifier: GPL-3.0
"""Learning content: ``mods/nagmon/learning/**/*.yaml`` as JSON.

The content is first loaded by the old game's loader
(``nagmon.learning.content.ContentLibrary.load``), so the build stops on
the same problems the game would have refused. Each YAML file then
becomes one JSON file with the same structure, at the same relative
path (``skills/math.yaml`` -> ``content/skills/math.json``).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from tools.app.common import NAG, Output

LEARNING = NAG / "learning"
_LOADER = getattr(yaml, "CSafeLoader", yaml.SafeLoader)


def read_yaml(path: Path) -> Any:
    return yaml.load(path.read_text(encoding="utf-8"), Loader=_LOADER)


def content_files() -> list[Path]:
    return sorted(LEARNING.rglob("*.yaml"))


def validate() -> dict[str, int]:
    """Load the content as the game does; raise on any error."""
    from nagmon.learning.content import ContentLibrary

    library = ContentLibrary.load(LEARNING)
    return {
        "skills": len(library.skills),
        "bank_items": sum(len(v) for v in library.banks.values()),
        "words": len(library.words),
    }


def build(out: Output) -> dict[str, Any]:
    counts = validate()
    index: list[dict[str, str]] = []
    for path in content_files():
        rel = path.relative_to(LEARNING).with_suffix(".json").as_posix()
        out.add_json(f"content/{rel}", read_yaml(path), compact=True)
        index.append({"file": rel, "source": path.relative_to(NAG).as_posix()})
    out.add_json("content/index.json", {"files": index, "counts": counts})
    return counts


def emoji_codes() -> set[str]:
    """Twemoji codes the content refers to (``emoji:`` fields/values)."""
    codes: set[str] = set()
    for path in content_files():
        _collect_emoji(read_yaml(path), codes)
    return codes


def _collect_emoji(node: Any, codes: set[str]) -> None:
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "emoji" and isinstance(value, str) and value:
                codes.add(value)
            else:
                _collect_emoji(value, codes)
    elif isinstance(node, list):
        for value in node:
            _collect_emoji(value, codes)
    elif isinstance(node, str) and node.startswith("emoji:"):
        codes.add(node[6:])
