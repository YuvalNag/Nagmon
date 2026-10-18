# SPDX-License-Identifier: GPL-3.0
"""WP6: the active-child runtime (docs/kids/SDD_PROFILES_UI.md §2.1)."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest

from nagmon import runtime as runtime_mod
from nagmon.runtime import NagmonRuntime, age_from_profile


@dataclass
class FakeLearner:
    grade: int = 0
    age: int | None = None
    name: str = ""
    learner_id: str = ""
    settings: dict[str, Any] = field(default_factory=dict)
    words: dict[str, float] = field(default_factory=dict)
    answers_total: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "grade": self.grade,
            "age": self.age,
            "words": dict(self.words),
            "answers_total": self.answers_total,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> FakeLearner:
        return cls(
            grade=d.get("grade", 0),
            age=d.get("age"),
            words=dict(d.get("words", {})),
            answers_total=d.get("answers_total", 0),
        )


class FakeEngine:
    def __init__(self, content: Any, learner: FakeLearner) -> None:
        self.content = content
        self.learner = learner


class Hooks:
    def __init__(self) -> None:
        self.events: list[tuple[str, Any]] = []

    def on_activate(self, rt: NagmonRuntime) -> None:
        assert rt.active is not None
        self.events.append(("activate", rt.store.save_dir(rt.active.id)))

    def on_deactivate(self, rt: NagmonRuntime) -> None:
        self.events.append(("deactivate", None))


# Tuesday 21 Nov 2023, 16:30 in Jerusalem: inside the default play window.
TUESDAY_AFTERNOON = 1_700_577_000.0


@pytest.fixture
def hooks() -> Hooks:
    return Hooks()


@pytest.fixture
def rt(tmp_path: Path, hooks: Hooks) -> NagmonRuntime:
    return NagmonRuntime(
        tmp_path,
        content_loader=lambda: "CONTENT",
        learner_from_dict=FakeLearner.from_dict,
        learner_new=FakeLearner,
        engine_factory=FakeEngine,
        on_activate=hooks.on_activate,
        on_deactivate=hooks.on_deactivate,
        clock=lambda: 1_700_000_000.0,
        words_he={"cat": "חתול", "dog": "כלב"},
    )


def test_activate_creates_engine_and_syncs_learner(rt, hooks, tmp_path):
    p = rt.store.create(name="נועה", avatar="adventurer", grade=3)
    rt.activate(p.id)
    assert rt.active is not None and rt.active.id == p.id
    assert isinstance(rt.engine, FakeEngine)
    assert rt.engine.content == "CONTENT"
    assert rt.learner.grade == 3
    assert rt.learner.age == age_from_profile(p, now=1_700_000_000.0)
    assert hooks.events == [("activate", rt.store.save_dir(p.id))]


def test_deactivate_persists_and_calls_hook(rt, hooks):
    p = rt.store.create(name="Ori", avatar="adventurer", grade=5)
    rt.activate(p.id)
    rt.learner.answers_total = 7
    rt.deactivate()
    assert rt.active is None and rt.engine is None
    assert hooks.events[-1] == ("deactivate", None)
    assert rt.store.load_learner_dict(p.id)["answers_total"] == 7


def test_children_have_separate_learners_and_save_dirs(rt):
    a = rt.store.create(name="Tamar", avatar="adventurer", grade=1)
    b = rt.store.create(name="Yonatan", avatar="adventurer", grade=6)
    rt.activate(a.id)
    rt.learner.answers_total = 3
    rt.activate(b.id)  # switching persists the previous child
    assert rt.learner.answers_total == 0
    assert rt.store.load_learner_dict(a.id)["answers_total"] == 3
    assert rt.store.save_dir(a.id) != rt.store.save_dir(b.id)


def test_persist_writes_learning_json(rt):
    p = rt.store.create(name="Maya", avatar="adventurer")
    rt.activate(p.id)
    rt.learner.answers_total = 11
    rt.persist()
    assert rt.store.load_learner_dict(p.id)["answers_total"] == 11


def test_persist_without_active_child_is_noop(rt):
    rt.persist()
    assert rt.active is None


def test_content_is_loaded_once(tmp_path):
    calls: list[int] = []
    rt = NagmonRuntime(
        tmp_path,
        content_loader=lambda: calls.append(1) or "C",
        learner_from_dict=FakeLearner.from_dict,
        learner_new=FakeLearner,
        engine_factory=FakeEngine,
    )
    a = rt.store.create(name="A", avatar="x")
    b = rt.store.create(name="B", avatar="x")
    rt.activate(a.id)
    rt.activate(b.id)
    assert calls == [1]


def test_ladder_uses_profile_level_and_learned_words(rt):
    p = rt.store.create(name="Noa", avatar="x", language_level=2)
    rt.activate(p.id)
    rt.learner.words = {"cat": 1.0, "zebra": 2.0}
    level, known = rt.ladder()
    assert level == 2
    assert known == {"חתול": "cat"}


def test_ladder_without_child_is_level_zero(rt):
    assert rt.ladder() == (0, {})


@pytest.mark.parametrize(
    ("birth_year", "grade", "expected"),
    [
        pytest.param(2016, 0, 7, id="birth-year"),
        pytest.param(None, 3, 9, id="grade-plus-six"),
        pytest.param(None, 0, 5, id="kindergarten"),
    ],
)
def test_age_from_profile(rt, birth_year, grade, expected):
    p = rt.store.create(
        name="Kid", avatar="x", birth_year=birth_year, grade=grade
    )
    # 1_700_000_000 is in November 2023.
    assert age_from_profile(p, now=1_700_000_000.0) == expected


def test_module_singleton_roundtrip(rt):
    runtime_mod.set_runtime(rt)
    try:
        assert runtime_mod.get_runtime() is rt
    finally:
        runtime_mod.set_runtime(None)
    assert runtime_mod.get_runtime() is None


def test_active_engine_helper(rt):
    runtime_mod.set_runtime(rt)
    try:
        assert runtime_mod.active_engine() is None
        p = rt.store.create(name="Gil", avatar="x")
        rt.activate(p.id)
        assert runtime_mod.active_engine() is rt.engine
    finally:
        runtime_mod.set_runtime(None)


def test_start_play_activates_and_tracks(rt):
    rt.clock = lambda: TUESDAY_AFTERNOON
    p = rt.store.create(name="Avi", avatar="x")
    decision = rt.start_play(p.id)
    assert decision.action.name != "MUST_STOP"
    assert rt.active is not None and rt.tracker.active_profile == p.id
    rt.stop_play()
    assert rt.active is None and rt.tracker.active_profile is None


def test_start_play_refused_when_limit_used(tmp_path):
    from nagmon.family.screentime import Action, Reason, ScreenLimits

    rt = NagmonRuntime(
        tmp_path,
        learner_from_dict=FakeLearner.from_dict,
        learner_new=FakeLearner,
        clock=lambda: TUESDAY_AFTERNOON,
    )
    rt.parent.settings.default_limits = ScreenLimits(daily_max_minutes=0)
    p = rt.store.create(name="Dan", avatar="x")
    decision = rt.start_play(p.id)
    assert decision.action is Action.MUST_STOP
    assert decision.reason is Reason.DAILY_LIMIT
    assert decision.message_he
    assert rt.active is None


def test_start_play_refused_on_shabbat(tmp_path):
    from nagmon.family.screentime import Action, Reason

    rt = NagmonRuntime(
        tmp_path,
        learner_from_dict=FakeLearner.from_dict,
        learner_new=FakeLearner,
        # Saturday 25 Nov 2023, 12:00 in Jerusalem (10:00 UTC).
        clock=lambda: 1_700_906_400.0,
    )
    p = rt.store.create(name="Lea", avatar="x")
    decision = rt.start_play(p.id)
    assert decision.action is Action.MUST_STOP
    assert decision.reason is Reason.SHABBAT


def test_on_answer_records_practice_day(rt):
    rt.clock = lambda: TUESDAY_AFTERNOON
    p = rt.store.create(name="Shira", avatar="x")
    rt.activate(p.id)
    rt.on_answer()
    status = rt.practice.weekly_status(p.id, rt.now(), target_days=3)
    assert status.practised_days == 1


def test_saturday_is_a_rest_day(rt):
    from datetime import date

    assert rt.is_rest_day(date(2023, 11, 25))  # Saturday
    assert not rt.is_rest_day(date(2023, 11, 21))  # Tuesday
