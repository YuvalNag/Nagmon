# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
from __future__ import annotations

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
