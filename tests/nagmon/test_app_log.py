# SPDX-License-Identifier: GPL-3.0
"""
The app's own log (docs/kids/SDD_FIELD_DATA.md §2.2): the last 400
lines, keys hidden when written, Nagmon's INFO and everyone's warnings,
kept on disk so it can be sent after the game opens again.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

import pytest

from nagmon.field_data import app_log
from nagmon.field_data.app_log import MAX_LINES, RingLog

TOKEN = "github_pat_" + "11ABCDEFG0" * 6
SAVED = "plainsecret123456"
NOW = datetime(2026, 10, 19, 14, 30, 5, tzinfo=timezone.utc)


def _record(name, level, msg, *args, exc_info=None):
    return logging.LogRecord(name, level, __file__, 1, msg, args, exc_info)


@pytest.fixture
def ring():
    return RingLog(secrets=lambda: [SAVED], clock=lambda: NOW)


def test_a_line_has_time_level_logger_and_message(ring):
    ring.handle(
        _record("nagmon.runtime", logging.INFO, "Active child: %s", "p1a2b3")
    )
    assert ring.lines() == [
        "14:30:05 INFO nagmon.runtime: Active child: p1a2b3"
    ]


def test_errors_carry_their_traceback(ring):
    try:
        raise ValueError("bad value")
    except ValueError:
        import sys

        ring.handle(
            _record(
                "nagmon.x", logging.ERROR, "failed", exc_info=sys.exc_info()
            )
        )
    text = ring.text()
    assert "14:30:05 ERROR nagmon.x: failed" in text
    assert "Traceback (most recent call last):" in text
    assert text.rstrip().endswith("ValueError: bad value")


def test_no_more_than_400_lines(ring):
    for i in range(1000):
        ring.handle(_record("nagmon.x", logging.INFO, "line %d", i))
    lines = ring.lines()
    assert len(lines) == MAX_LINES == 400
    assert lines[-1].endswith("line 999") and lines[0].endswith("line 600")


def test_a_multiline_message_still_fits(ring):
    ring.handle(_record("nagmon.x", logging.WARNING, "\n".join(["x"] * 900)))
    assert len(ring.lines()) == 400


def test_keys_are_hidden_when_written(ring):
    ring.handle(
        _record("nagmon.x", logging.WARNING, "token %s and %s", TOKEN, SAVED)
    )
    ring.handle(
        _record("nagmon.x", logging.WARNING, "Authorization: Bearer abc.def")
    )
    text = ring.text()
    assert TOKEN not in text and SAVED not in text and "abc.def" not in text
    assert "token ***" in text


def test_a_failing_secrets_source_does_not_break_logging():
    def boom():
        raise OSError("disk")

    ring = RingLog(secrets=boom, clock=lambda: NOW)
    ring.handle(_record("nagmon.x", logging.WARNING, "hi %s", TOKEN))
    assert ring.lines() == ["14:30:05 WARNING nagmon.x: hi ***"]


@pytest.mark.parametrize(
    ("name", "level", "kept"),
    [
        ("nagmon.runtime", logging.INFO, True),
        ("mods.nagmon.states.profiles", logging.INFO, True),
        ("nagmon", logging.INFO, True),
        ("nagmon.runtime", logging.DEBUG, False),
        ("tuxemon.client", logging.INFO, False),
        ("tuxemon.client", logging.WARNING, True),
        ("nagmonish", logging.INFO, False),
        ("root", logging.ERROR, True),
    ],
)
def test_levels(ring, name, level, kept):
    ring.handle(_record(name, level, "msg"))
    assert bool(ring.lines()) is kept


def test_tail(ring):
    for i in range(150):
        ring.handle(_record("nagmon.x", logging.INFO, "line %d", i))
    tail = ring.tail(100).splitlines()
    assert len(tail) == 100 and tail[-1].endswith("line 149")


def test_saved_and_loaded_with_the_way_it_ended(tmp_path, ring):
    ring.handle(_record("nagmon.x", logging.INFO, "before %s", TOKEN))
    path = tmp_path / "nagmon" / "app_log.txt"
    ring.save(path, ending="crash")
    assert TOKEN not in path.read_text("utf-8")
    again = RingLog(clock=lambda: NOW)
    assert again.load(path) == "crash"
    assert any(line.endswith("before ***") for line in again.lines())


def test_loading_keeps_the_newest_lines(tmp_path, ring):
    path = tmp_path / "app_log.txt"
    path.write_text("\n".join(f"old {i}" for i in range(500)) + "\n", "utf-8")
    again = RingLog(clock=lambda: NOW)
    assert again.load(path) == "unknown"
    assert len(again.lines()) == 400 and again.lines()[-1] == "old 499"


def test_a_missing_log_file_is_fine(tmp_path):
    assert RingLog().load(tmp_path / "none.txt") is None


def test_install_writes_a_start_line_and_reads_the_last_session(tmp_path):
    root = tmp_path / "nagmon"
    root.mkdir()
    old = RingLog(clock=lambda: NOW)
    old.handle(_record("nagmon.x", logging.INFO, "last session"))
    old.save(root / app_log.LOG_FILE, ending="exit")
    logger = logging.getLogger("nagmon.test_app_log")
    try:
        ring = app_log.install(
            root,
            details={
                "version": "0.4.35",
                "build": "11",
                "device": "Xiaomi M2012K11G",
            },
            secrets=lambda: [SAVED],
            clock=lambda: NOW,
        )
        assert app_log.install(root) is ring  # once only
        assert ring in logging.getLogger().handlers
        logger.info("now %s", SAVED)
        lines = ring.lines()
        assert any(line.endswith("last session") for line in lines)
        start = next(line for line in lines if line.startswith("=== Nagmon"))
        assert "0.4.35" in start and "build 11" in start
        assert "Xiaomi M2012K11G" in start and "previous exit: normal" in start
        assert "2026-10-19 14:30 UTC" in start
        assert lines[-1].endswith("now ***")
        app_log.save(ending="background")
        assert (
            (root / app_log.LOG_FILE)
            .read_text("utf-8")
            .rstrip()
            .endswith("--- saved: background")
        )
    finally:
        app_log.uninstall()
    assert ring not in logging.getLogger().handlers
    assert app_log.current() is None


def test_after_a_crash_the_start_line_says_so(tmp_path):
    root = tmp_path
    RingLog(clock=lambda: NOW).save(root / app_log.LOG_FILE, ending="crash")
    try:
        ring = app_log.install(root, clock=lambda: NOW)
        start = next(
            line for line in ring.lines() if line.startswith("=== Nagmon")
        )
        assert "previous exit: crash" in start
    finally:
        app_log.uninstall()


def test_a_noted_crash_is_saved_as_a_crash(tmp_path):
    try:
        app_log.install(tmp_path, clock=lambda: NOW)
        app_log.note_crash()
        app_log.save()
    finally:
        app_log.uninstall()
    text = (tmp_path / app_log.LOG_FILE).read_text("utf-8")
    assert text.rstrip().endswith("--- saved: crash")


def test_without_install_the_helpers_do_nothing(tmp_path):
    app_log.uninstall()
    app_log.save()
    assert app_log.tail(100) == ""
    assert app_log.text() == ""


def test_build_info_names_a_version():
    info = app_log.build_info()
    assert re.fullmatch(r"\d+\.\d+\.\d+.*", info["version"])
    assert info["build"]


def test_the_game_starts_and_saves_the_log(monkeypatch, tmp_path):
    """rules.apply starts it; switching apps and closing the game save it."""
    from unittest.mock import MagicMock

    from mods.nagmon import rules
    from nagmon import runtime as runtime_mod
    from tuxemon.platform import mobile

    root = tmp_path / "nagmon"
    monkeypatch.setattr(rules.atexit, "register", lambda f: None)
    monkeypatch.setattr(rules, "data_root", lambda: root)
    monkeypatch.setattr(rules, "build_runtime", lambda: MagicMock())
    monkeypatch.setattr(rules, "switch_to_hebrew", lambda: None)
    monkeypatch.setattr(mobile, "_switch_listeners", [])
    try:
        rules.NagmonStartupRule(MagicMock(), MagicMock()).apply()
        assert app_log.current() is not None
        logging.getLogger("mods.nagmon.rules").info("hello from the game")
        mobile.app_switched(to_background=True)
        saved = (root / app_log.LOG_FILE).read_text("utf-8")
        assert "hello from the game" in saved
        assert saved.rstrip().endswith("--- saved: background")
        rules.stop_play_at_exit()
        saved = (root / app_log.LOG_FILE).read_text("utf-8")
        assert saved.rstrip().endswith("--- saved: exit")
    finally:
        runtime_mod.set_runtime(None)
        app_log.uninstall()
