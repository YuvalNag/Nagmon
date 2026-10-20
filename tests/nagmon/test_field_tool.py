# SPDX-License-Identifier: GPL-3.0
"""
tools/field/latest.py (docs/kids/SDD_FIELD_DATA.md §2.6): the newest
uploads in a local clone of the data repo, per device and kind, with a
one-line summary each.
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

from nagmon import crash_report

REPO = Path(__file__).resolve().parents[2]
TOOL = REPO / "tools" / "field" / "latest.py"


def _load():
    spec = importlib.util.spec_from_file_location("field_latest", TOOL)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


latest = _load()

LOG = """\
=== Nagmon start 2026-10-19 14:30 UTC · version 0.4.35 · build 11 · device Xiaomi M2012K11G · previous exit: crash
14:30:01 INFO nagmon.runtime: Active child: p1a2b3
14:31:00 WARNING tuxemon.map: slow map
14:32:00 ERROR nagmon.owl_service: Owl failed
Traceback (most recent call last):
  File "x.py", line 1, in <module>
TimeoutError: slow
--- saved: background
"""

CRASH = crash_report.build_report(
    "Traceback (most recent call last):\n  File 'a.py'\nKeyError: 'missing_map'",
    {"version": "0.4.35", "build": "11", "device": "Xiaomi"},
    now=datetime(2026, 10, 19, tzinfo=timezone.utc),
    log="14:00:00 ERROR nagmon.x: ValueError: not this one\n",
)

PROGRESS = {
    "schema_version": 1,
    "app": {"version": "0.4.35", "build": "11"},
    "children": [
        {
            "child": "child-1",
            "minutes_14d_total": 30,
            "subjects": {"math": {"attempts": 40}, "hebrew": {"attempts": 2}},
        },
        {
            "child": "child-2",
            "minutes_14d_total": 15,
            "subjects": {"math": {"attempts": 8}},
        },
    ],
}


@pytest.fixture
def clone(tmp_path) -> Path:
    root = tmp_path / "nagmon-data"
    (root / ".git").mkdir(parents=True)
    (root / ".git" / "HEAD").write_text("ref: refs/heads/main")
    (root / "README.md").write_text("data")
    a = root / "devices" / "ab12cd34"
    for kind in ("logs", "crashes", "progress"):
        (a / kind).mkdir(parents=True)
    (a / "logs" / "20261017T080000Z.txt").write_text("old log\n")
    (a / "logs" / "20261019T143005Z.txt").write_text(LOG)
    (a / "logs" / "notes.md").write_text("ignored")
    (a / "crashes" / "20261019T143100Z.txt").write_text(CRASH)
    (a / "progress" / "20261019T143200Z.json").write_text(json.dumps(PROGRESS))
    b = root / "devices" / "ff00ff00" / "progress"
    b.mkdir(parents=True)
    (b / "20261018T100000Z.json").write_text("{broken")
    return root


def test_the_crash_report_marker_matches():
    assert latest.LOG_MARKER == crash_report.LOG_MARKER


def test_newest_first_per_device_and_kind(clone):
    found = latest.scan(clone)
    assert sorted(found) == [
        ("ab12cd34", "crashes"),
        ("ab12cd34", "logs"),
        ("ab12cd34", "progress"),
        ("ff00ff00", "progress"),
    ]
    assert [p.name for p in found[("ab12cd34", "logs")]] == [
        "20261019T143005Z.txt",
        "20261017T080000Z.txt",
    ]


def test_a_log_summary():
    line = latest.summarize("logs", LOG)
    assert "build 11" in line
    assert "1 ERROR" in line and "1 WARNING" in line
    assert "previous exit: crash" in line
    assert "Owl failed" in line
    assert "\n" not in line


def test_a_crash_summary_names_the_error_not_the_log():
    line = latest.summarize("crashes", CRASH)
    assert "KeyError: 'missing_map'" in line
    assert "build 11" in line
    assert "not this one" not in line


def test_a_progress_summary():
    line = latest.summarize("progress", json.dumps(PROGRESS))
    assert "2 children" in line and "50 answers" in line
    assert "45 min" in line and "build 11" in line


def test_a_broken_file_is_named_not_fatal():
    assert "unreadable" in latest.summarize("progress", "{broken")


def test_main_prints_the_newest(clone, capsys):
    assert latest.main([str(clone), "--per", "1"]) == 0
    out = capsys.readouterr().out
    assert "ab12cd34" in out and "ff00ff00" in out
    assert "20261019T143005Z.txt" in out
    assert "20261017T080000Z.txt" not in out
    assert "unreadable" in out
    assert "KeyError: 'missing_map'" in out


def test_main_shows_more_when_asked(clone, capsys):
    latest.main([str(clone), "--per", "5"])
    assert "20261017T080000Z.txt" in capsys.readouterr().out


def test_a_folder_without_uploads(tmp_path, capsys):
    assert latest.main([str(tmp_path)]) == 1
    assert "no uploads" in capsys.readouterr().out.lower()


def test_runs_as_a_script(clone):
    done = subprocess.run(
        [sys.executable, str(TOOL), str(clone)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
    )
    assert done.returncode == 0, done.stderr
    assert "ab12cd34" in done.stdout
