# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
from __future__ import annotations

import logging
import time
from collections.abc import Callable


class FrameLimiter:
    """
    Sleeps away the rest of each frame so the main loop does not spin a
    CPU core at 100%.

    Parameters:
        target_fps: Frames per second to aim for. Zero or less disables it.
        clock: Monotonic clock in seconds.
        sleep: Function that sleeps for the given number of seconds.
    """

    def __init__(
        self,
        target_fps: float,
        clock: Callable[[], float] = time.perf_counter,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.frame_length = 1.0 / target_fps if target_fps > 0 else 0.0
        self._clock = clock
        self._sleep = sleep
        self._frame_start = clock()

    def start_frame(self) -> None:
        self._frame_start = self._clock()

    def end_frame(self) -> None:
        if self.frame_length <= 0:
            return
        remaining = self.frame_length - (self._clock() - self._frame_start)
        if remaining > 0:
            self._sleep(remaining)


logger = logging.getLogger(__name__)


class FrameStats:
    """
    Writes the frame rate and the slowest frame to the log once per
    ``period`` seconds, so a phone's log shows whether the game is smooth
    there (docs/kids/SDD_ANDROID.md §2.3). Call ``frame`` once per drawn
    frame. The line is also printed: on a phone, print goes to logcat,
    which the emulator check reads.
    """

    #: A longer gap is a pause (the app was in the background, where SDL
    #: stops the loop), not a slow frame: the count starts again.
    PAUSE = 2.0

    def __init__(
        self,
        period: float = 60.0,
        echo: Callable[[str], object] | None = print,
    ) -> None:
        self.period = period
        self._echo = echo
        self._start: float | None = None
        self._last = 0.0
        self._frames = 0
        self._slowest = 0.0

    def frame(self, now: float) -> None:
        if self._start is None or now - self._last > self.PAUSE:
            self._start = self._last = now
            self._frames = 0
            self._slowest = 0.0
            return
        self._frames += 1
        self._slowest = max(self._slowest, now - self._last)
        self._last = now
        elapsed = now - self._start
        if elapsed + 1e-9 < self.period:
            return
        line = (
            f"frame rate: {round(self._frames / elapsed)} fps,"
            f" slowest frame {round(self._slowest * 1000)} ms"
        )
        logger.info(line)
        if self._echo is not None:
            self._echo(line)
        self._start = now
        self._frames = 0
        self._slowest = 0.0
