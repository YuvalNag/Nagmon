# SPDX-License-Identifier: GPL-3.0
"""Play speech clips on a reserved pygame mixer channel."""

from __future__ import annotations

import threading
from pathlib import Path

import pygame


class PygamePlayer:
    """Plays one clip at a time on its own channel.

    The channel is reserved, so sound effects (``Sound.play()`` picks any
    free channel) never cut speech off. The mixer is touched only on the
    first ``play()``, after the game has set it up.
    """

    def __init__(self, channel_id: int = 0, volume: float = 1.0):
        self.channel_id = channel_id
        self.volume = volume
        self._channel: pygame.mixer.Channel | None = None
        self._sound: pygame.mixer.Sound | None = None
        self._lock = threading.Lock()

    def _ensure_channel(self) -> pygame.mixer.Channel:
        if self._channel is None:
            if not pygame.mixer.get_init():
                pygame.mixer.init()
            if pygame.mixer.get_num_channels() <= self.channel_id:
                pygame.mixer.set_num_channels(self.channel_id + 1)
            pygame.mixer.set_reserved(self.channel_id + 1)
            self._channel = pygame.mixer.Channel(self.channel_id)
        return self._channel

    def play(self, path: Path) -> None:
        with self._lock:
            channel = self._ensure_channel()
            sound = pygame.mixer.Sound(str(path))
            sound.set_volume(self.volume)
            self._sound = sound  # keep a reference while it plays
            channel.play(sound)

    def stop(self) -> None:
        with self._lock:
            if self._channel is not None:
                try:
                    self._channel.stop()
                except pygame.error:
                    pass

    def busy(self) -> bool:
        if self._channel is None:
            return False
        try:
            return bool(self._channel.get_busy())
        except pygame.error:
            return False
