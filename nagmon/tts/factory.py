# SPDX-License-Identifier: GPL-3.0
"""Build a ready-to-use TTSService with the default backends."""

from __future__ import annotations

import logging
import os
from collections.abc import Mapping, Sequence
from pathlib import Path

from nagmon.tts.backends import (
    Backend,
    EdgeTTSBackend,
    NullBackend,
    Pyttsx3Backend,
)
from nagmon.tts.player import NullPlayer, Player
from nagmon.tts.service import TTSService
from nagmon.tts.settings import TTSSettings

logger = logging.getLogger(__name__)


def default_cache_dir(
    *, windows: bool | None = None, env: Mapping[str, str] | None = None
) -> Path:
    """Where synthesized clips live, per user (not per child)."""
    env = os.environ if env is None else env
    windows = os.name == "nt" if windows is None else windows
    if windows:
        base = env.get("LOCALAPPDATA") or str(Path.home() / "AppData/Local")
        return Path(base) / "Nagmon" / "tts_cache"
    base = env.get("XDG_CACHE_HOME") or str(Path.home() / ".cache")
    return Path(base) / "nagmon" / "tts"


def build_backends(
    settings: TTSSettings, *, android: bool | None = None
) -> list[Backend]:
    """
    Online neural voices first (used only with consent), then OS voices.
    On a phone: Android's own voices (SDD_ANDROID §2.3).
    """
    if android is None:
        from nagmon.android import is_android

        android = is_android()
    if android:
        from nagmon.android.tts import AndroidTTSBackend

        return [AndroidTTSBackend(settings=settings), NullBackend()]
    return [
        EdgeTTSBackend(settings),
        Pyttsx3Backend(settings),
        NullBackend(),
    ]


def default_player(settings: TTSSettings) -> Player:
    try:
        from nagmon.tts.pygame_player import PygamePlayer

        return PygamePlayer(volume=settings.volume)
    except Exception as exc:
        logger.warning("no audio player, speech is silent: %s", exc)
        return NullPlayer()


def create_service(
    settings: TTSSettings | None = None,
    *,
    cache_dir: Path | None = None,
    player: Player | None = None,
    backends: Sequence[Backend] | None = None,
) -> TTSService:
    settings = settings or TTSSettings()
    return TTSService(
        list(backends) if backends is not None else build_backends(settings),
        cache_dir or default_cache_dir(),
        player if player is not None else default_player(settings),
        settings=settings,
    )
