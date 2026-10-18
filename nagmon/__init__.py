# SPDX-License-Identifier: GPL-3.0
"""Nagmon: a family learning game built on Tuxemon.

learning, family, ai and tts are pure Python (no pygame, no tuxemon
imports) so they can be tested quickly and in isolation; nagmon.ui draws
with pygame, and mods/nagmon wires everything into the game.
"""

from __future__ import annotations

from pathlib import Path


def mod_dir(anchor: Path | str | None = None) -> Path:
    """
    The ``mods/nagmon`` folder with Nagmon's data (content, emoji...).

    In a source checkout it sits next to this package; in a frozen build
    (cx_Freeze puts packages in ``<build>/lib``) it sits next to ``lib``,
    the same place Tuxemon looks for its mods.
    """
    package = Path(anchor or __file__).resolve().parent
    candidates = (
        package.parent / "mods" / "nagmon",
        package.parent.parent / "mods" / "nagmon",
    )
    for candidate in candidates:
        if candidate.is_dir():
            return candidate
    return candidates[0]
