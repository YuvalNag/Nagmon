"""Map-script actions and conditions of Nagmon (SDD_QUIZ_GAMEPLAY §2.5)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from mods.nagmon.event.actions.ask_quiz import AskQuizAction, result_word
from mods.nagmon.event.actions.nagmon_apply_profile import (
    NagmonApplyProfileAction,
)
from mods.nagmon.event.conditions.nagmon_conditions import (
    LanguageLevelAtLeastCondition,
    NagmonPlayingCondition,
    ProfileGradeAtLeastCondition,
    SkillMasteredCondition,
    StarsAtLeastCondition,
)
from nagmon import runtime as runtime_mod


class Vars(dict):
    def set(self, key, value):
        self[key] = value


def _session():
    player = SimpleNamespace(game_variables=Vars(), name="")
    client = MagicMock()
    client.active_state_names = []
    return SimpleNamespace(player=player, client=client)


@pytest.fixture
def rt():
    fake = SimpleNamespace(
        engine=object(),
        active=SimpleNamespace(
            name="נועה", avatar="girl_light", grade=3, settings={}
        ),
        learner=SimpleNamespace(
            stars={"math": 2, "english": 1}, mastered={"math.add.within_10": 1}
        ),
        ladder=lambda: (2, {}),
    )
    runtime_mod.set_runtime(fake)  # type: ignore[arg-type]
    yield fake
    runtime_mod.set_runtime(None)


@pytest.mark.parametrize(
    ("outcome", "word"),
    [
        pytest.param(None, "skip", id="skip"),
        pytest.param(
            SimpleNamespace(quality="super", correct=True), "super", id="super"
        ),
        pytest.param(
            SimpleNamespace(quality="correct", correct=True),
            "correct",
            id="correct",
        ),
        pytest.param(
            SimpleNamespace(quality="wrong", correct=False),
            "wrong",
            id="wrong",
        ),
    ],
)
def test_result_word(outcome, word):
    assert result_word(outcome) == word


def test_ask_quiz_without_child_skips():
    session = _session()
    action = AskQuizAction("math", "q1")
    action.start(session)
    assert session.player.game_variables["q1"] == "skip"
    session.client.push_state.assert_not_called()


def test_ask_quiz_by_subject_sets_variable(rt):
    session = _session()
    AskQuizAction("science", "q1").start(session)
    name = session.client.push_state.call_args.args[0]
    kwargs = session.client.push_state.call_args.kwargs
    assert name == "QuizState" and kwargs["subject"] == "science"
    assert kwargs["allow_skip"] is False
    kwargs["on_result"](SimpleNamespace(quality="correct", correct=True))
    assert session.player.game_variables["q1"] == "correct"


def test_ask_quiz_by_skill(rt):
    session = _session()
    AskQuizAction("math.money.change", "q", "shop").start(session)
    kwargs = session.client.push_state.call_args.kwargs
    assert kwargs["skill_id"] == "math.money.change"
    assert kwargs["context"] == "shop"


def test_apply_profile_sets_name_template_gender(rt):
    session = _session()
    NagmonApplyProfileAction().start(session)
    assert session.player.name == "נועה"
    calls = session.client.event_engine.execute_action.call_args_list
    assert calls[0].args == ("set_template", ["player", "heroine", "heroine"])
    assert calls[1].args == (
        "set_char_attribute",
        ["player", "gender", "female"],
    )


def test_conditions(rt):
    s = _session()
    assert StarsAtLeastCondition("math", 2).test(s)
    assert not StarsAtLeastCondition("math", 3).test(s)
    assert StarsAtLeastCondition("all", 3).test(s)
    assert SkillMasteredCondition("math.add.within_10").test(s)
    assert not SkillMasteredCondition("geometry.x").test(s)
    assert LanguageLevelAtLeastCondition(2).test(s)
    assert not LanguageLevelAtLeastCondition(3).test(s)
    assert ProfileGradeAtLeastCondition(3).test(s)
    assert NagmonPlayingCondition().test(s)


def test_conditions_without_child_are_false():
    s = _session()
    assert not StarsAtLeastCondition("all", 0).test(s)
    assert not NagmonPlayingCondition().test(s)
    assert not ProfileGradeAtLeastCondition(0).test(s)


def test_game_loads_nagmon_script_plugins():
    from tuxemon.event.eventaction import ActionManager
    from tuxemon.event.eventcondition import ConditionManager

    actions = ActionManager().actions
    conditions = ConditionManager().conditions
    assert actions["ask_quiz"] is AskQuizAction
    assert actions["nagmon_apply_profile"] is NagmonApplyProfileAction
    for name in (
        "stars_at_least",
        "skill_mastered",
        "language_level_at_least",
        "profile_grade_at_least",
        "nagmon_playing",
    ):
        assert conditions[name].__module__.startswith("mods.nagmon")
