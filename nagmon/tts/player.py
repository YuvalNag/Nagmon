# SPDX-License-Identifier: GPL-3.0
"""Audio player contract (SDD_TTS §2.3)."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol


class Player(Protocol):
    def play(self, path: Path) -> None:
        """Start playing ``path`` without blocking."""
        ...

    def stop(self) -> None: ...

    def busy(self) -> bool: ...


class NullPlayer:
    """Plays nothing. Used when the PC has no audio device."""

    def play(self, path: Path) -> None:
        pass

    def stop(self) -> None:
        pass

    def busy(self) -> bool:
        return False
