"""
"Ask the wise owl" for the playing child (docs/kids/SDD_AI.md): the
parent's AI settings, and an Owl built from the family's keys. Without a
key (or offline) the owl answers from the ready-made questions only.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from nagmon.ai.canned import CannedAnswers
from nagmon.ai.config import AISettings, build_kid_router, load_keys
from nagmon.ai.owl import Owl, OwlLogAdapter
from nagmon.ai.safety import Safety
from nagmon.family._jsonio import atomic_write_json, load_json
from nagmon.family.owl_log import OwlLog

logger = logging.getLogger(__name__)

SETTINGS_FILE = "ai_settings.json"


def load_ai_settings(root: Path) -> AISettings:
    return AISettings.from_dict(load_json(Path(root) / SETTINGS_FILE).data)


def save_ai_settings(root: Path, settings: AISettings) -> None:
    atomic_write_json(Path(root) / SETTINGS_FILE, settings.to_dict())


def build_owl(
    root: Path,
    pid: str,
    *,
    settings: AISettings | None = None,
    keys: dict[str, str] | None = None,
    transport: Any = None,
) -> Owl:
    """The owl for one child. No keys → offline answers only."""
    settings = settings or load_ai_settings(root)
    keys = load_keys(root) if keys is None else keys
    router = None
    if keys:
        try:
            router = build_kid_router(
                keys, root, settings, transport=transport
            )
        except Exception:  # the owl must still answer offline
            logger.exception("Could not build the AI router")
    log = OwlLogAdapter(OwlLog(root), pid)
    return Owl(router, Safety(), log, CannedAnswers.load())


def owl_log_lines(root: Path, pid: str, limit: int = 40) -> list[str]:
    """The child's recent owl conversation, for the parent."""
    lines = []
    for e in OwlLog(root).read(pid, limit=limit):
        who = "ילד/ה" if e.role == "child" else "ינשוף"
        lines.append(f"{who}: {e.text}")
    return lines
