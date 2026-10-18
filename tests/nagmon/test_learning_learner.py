"""L1-L3 and E8: learner state, serialization and migration."""

import json
import math
from pathlib import Path

import pytest

from nagmon.learning.learner import (
    LOG_MAX,
    SCHEMA_VERSION,
    LearnerState,
    LogEntry,
    migrate,
)

FIXTURES = Path(__file__).parent / "fixtures"


def make_state(clock) -> LearnerState:
    s = LearnerState(learner_id="p1", name="אורי", grade=4, age=9)
    st = s.skill("math.mul.facts_all", skill_grade=3)
    st.theta = 0.7
    st.n = 3
    st.correct = 2
    st.recent.extend([1, 0, 1])
    st.misconceptions["table_neighbor"] = 1
    s.item("arithmetic.mul_facts:7x8").b_offset = -0.2
    s.srs.review("arithmetic.mul_facts:7x8", "math.mul.facts_all", 42, True)
    s.mastered["math.add.within_20"] = clock.now
    s.stars["math"] = 1
    s.words["dog"] = clock.now
    s.worked_examples.add("math.mul.facts_all")
    s.log_answer(
        LogEntry(
            ts=clock.now,
            skill="math.mul.facts_all",
            item="arithmetic.mul_facts:7x8",
            subject="math",
            correct=True,
            quality="correct",
            elapsed=3.5,
            context="battle",
        )
    )
    s.settings["focus"] = ["math.mul"]
    return s


def test_l1_roundtrip(clock):
    s = make_state(clock)
    d = s.to_dict()
    assert d["schema_version"] == SCHEMA_VERSION
    text = json.dumps(d, ensure_ascii=False)
    again = LearnerState.from_dict(json.loads(text))
    assert again.to_dict() == d
    assert again.skills["math.mul.facts_all"].theta == pytest.approx(0.7)
    assert again.log[-1].item == "arithmetic.mul_facts:7x8"


def test_l2_migration_from_v0():
    raw = json.loads((FIXTURES / "learner_v0.json").read_text("utf-8"))
    migrated = migrate(raw)
    assert migrated["schema_version"] == SCHEMA_VERSION
    s = LearnerState.from_dict(raw)
    assert s.name == "נועה"
    assert s.grade == 3
    theta = s.skills["math.add.within_20"].theta
    assert theta == pytest.approx(200 * math.log(10) / 400)
    assert s.skills["math.mul.facts_all"].theta < 0
    card = s.srs.get("arithmetic.mul_facts:7x8")
    assert card is not None and card.box == 3
    assert card.skill_id == "math.mul.facts_all"
    assert s.stars == {"math": 2}
    assert s.coins_total == 57
    assert len(s.log) == 2
    assert s.log[0].correct is True and s.log[1].context == "shop"
    assert s.answers_total == 2 and s.correct_total == 1
    assert s.settings["subjects"] == ["math", "geometry"]


def test_l3_future_version():
    with pytest.raises(ValueError):
        LearnerState.from_dict({"schema_version": SCHEMA_VERSION + 1})


def test_e8_log_ring_buffer(clock):
    s = LearnerState()
    for i in range(LOG_MAX + 50):
        s.log_answer(
            LogEntry(
                ts=float(i),
                skill="math.x",
                item=f"i{i}",
                subject="math",
                correct=True,
                quality="correct",
                elapsed=1.0,
            )
        )
    assert LOG_MAX == 5000
    assert len(s.log) == LOG_MAX
    assert s.log[0].item == "i50"


def test_settings_defaults_by_age():
    young = LearnerState(age=6, grade=1)
    old = LearnerState(age=10, grade=5)
    assert not young.timer_on
    assert old.timer_on
    assert young.target_frontier == pytest.approx(0.875)
    assert old.target_frontier == pytest.approx(0.80)
    assert young.target_review == pytest.approx(0.90)
    old.settings["timer"] = False
    old.settings["target_frontier"] = 0.7
    assert not old.timer_on
    assert old.target_frontier == pytest.approx(0.7)


def test_item_store_bounded():
    s = LearnerState()
    for i in range(4100):
        s.item(f"x:{i}").last = float(i)
    s.prune_items()
    assert len(s.items) <= 4000
    assert "x:4099" in s.items and "x:0" not in s.items
