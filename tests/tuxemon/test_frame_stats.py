# SPDX-License-Identifier: GPL-3.0
"""The frame rate goes to the log, so a slow phone shows in its log."""

import logging

from tuxemon.frame_limiter import FrameStats


def test_reports_once_per_period(caplog):
    stats = FrameStats(period=10.0, echo=None)
    now = 100.0
    stats.frame(now)  # the first frame starts the clock
    with caplog.at_level(logging.INFO, logger="tuxemon.frame_limiter"):
        for _ in range(299):  # 300 frames of 1/30 s: 10 s
            now += 1 / 30
            stats.frame(now)
        assert not caplog.records
        now += 1 / 30
        stats.frame(now)
    assert len(caplog.records) == 1
    message = caplog.records[0].getMessage()
    assert "frame rate: 30 fps" in message
    assert "slowest frame 33 ms" in message


def test_reports_the_slowest_frame(caplog):
    stats = FrameStats(period=1.0, echo=None)
    now = 0.0
    stats.frame(now)
    with caplog.at_level(logging.INFO, logger="tuxemon.frame_limiter"):
        for step in (0.02, 0.25, 0.02, 0.02, 0.7):
            now += step
            stats.frame(now)
    message = caplog.records[-1].getMessage()
    assert "slowest frame 700 ms" in message
    assert "frame rate: 5 fps" in message  # 5 frames in 1.01 s


def test_a_new_period_starts_after_a_report(caplog):
    stats = FrameStats(period=1.0, echo=None)
    now = 0.0
    stats.frame(now)
    with caplog.at_level(logging.INFO, logger="tuxemon.frame_limiter"):
        for _ in range(4):
            now += 0.5
            stats.frame(now)
    assert len(caplog.records) == 2


def test_the_line_is_also_printed_for_logcat():
    lines: list[str] = []
    stats = FrameStats(period=1.0, echo=lines.append)
    stats.frame(0.0)
    stats.frame(1.0)
    assert lines == ["frame rate: 1 fps, slowest frame 1000 ms"]


def test_the_app_log_keeps_the_frame_rate():
    from nagmon.field_data.app_log import OWN_LOGGERS

    assert "tuxemon.frame_limiter" in OWN_LOGGERS


def test_a_pause_in_the_background_is_not_a_slow_frame(caplog):
    """After an app switch the next frame comes minutes later."""
    lines: list[str] = []
    stats = FrameStats(period=1.0, echo=lines.append)
    stats.frame(0.0)
    stats.frame(0.5)
    stats.frame(300.0)  # back from the background
    for i in range(1, 31):
        stats.frame(300.0 + i / 30)
    assert lines == ["frame rate: 30 fps, slowest frame 33 ms"]
