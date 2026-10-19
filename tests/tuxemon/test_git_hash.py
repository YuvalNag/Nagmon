# SPDX-License-Identifier: GPL-3.0
"""get_git_hash never stops the game (a phone may refuse to run git)."""

import subprocess

import pytest

from tuxemon import log


@pytest.mark.parametrize(
    "error",
    [
        pytest.param(FileNotFoundError("git"), id="missing"),
        pytest.param(
            PermissionError(13, "Permission denied: 'git'"), id="refused"
        ),
        pytest.param(OSError(8, "Exec format error"), id="not-runnable"),
        pytest.param(subprocess.CalledProcessError(128, ["git"]), id="failed"),
        pytest.param(subprocess.TimeoutExpired(["git"], 5), id="stuck"),
    ],
)
def test_no_git_hash_when_git_cannot_run(monkeypatch, error):
    def refuse(*args, **kwargs):
        raise error

    monkeypatch.setattr(log.subprocess, "check_output", refuse)
    assert log.get_git_hash() == "N/A"


def test_git_hash_when_git_runs(monkeypatch):
    calls = []

    def describe(cmd, **kwargs):
        calls.append(kwargs)
        return b"abc1234\n"

    monkeypatch.setattr(log.subprocess, "check_output", describe)
    assert log.get_git_hash() == "Git Hash: abc1234"
    assert calls[0].get("timeout")  # a stuck git never holds up the start
