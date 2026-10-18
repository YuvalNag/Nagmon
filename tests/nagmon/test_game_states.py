# SPDX-License-Identifier: GPL-3.0
"""Robustness of Nagmon's game screens (states built without a display)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from mods.nagmon.states.nagmon_quiz import QuizState
from nagmon import runtime as runtime_mod


@pytest.fixture
def no_runtime():
    runtime_mod.set_runtime(None)
    yield
    runtime_mod.set_runtime(None)


def _quiz(engine) -> QuizState:
    quiz = QuizState.__new__(QuizState)
    quiz.engine = engine
    return quiz


def test_unknown_skill_in_a_map_script_shows_no_question(no_runtime):
    engine = MagicMock()
    engine.next_question.side_effect = KeyError("math.no.such.skill")
    quiz = _quiz(engine)
    assert (
        quiz._next_question(None, "math.no.such.skill", None, "quest") is None
    )


def test_saving_errors_after_an_answer_do_not_break_the_quiz(no_runtime):
    rt = MagicMock()
    rt.on_answer.side_effect = OSError("disk full")
    runtime_mod.set_runtime(rt)
    quiz = _quiz(MagicMock())
    quiz._reward(SimpleNamespace(coins=0))  # must not raise
    rt.on_answer.assert_called_once()
