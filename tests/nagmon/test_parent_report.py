"""The parent's report for one child (SDD_PROFILES_UI.md §2.4)."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from nagmon.learning.content import ContentLibrary
from nagmon.learning.engine import LearningEngine
from nagmon.learning.learner import LearnerState
from nagmon.parent_report import child_report
from nagmon.runtime import NagmonRuntime

REPO = Path(__file__).resolve().parents[2]
# Tuesday 21 Nov 2023, 16:30 in Jerusalem.
TUESDAY = 1_700_577_000.0


@pytest.fixture
def math_only(tmp_path) -> Path:
    content = tmp_path / "content"
    (content / "skills").mkdir(parents=True)
    shutil.copy(
        REPO / "mods/nagmon/learning/skills/math.yaml",
        content / "skills/math.yaml",
    )
    return content


@pytest.fixture
def rt(tmp_path, math_only) -> NagmonRuntime:
    return NagmonRuntime(
        tmp_path / "data",
        content_loader=lambda: ContentLibrary.load(math_only),
        learner_from_dict=LearnerState.from_dict,
        learner_new=LearnerState,
        engine_factory=lambda c, lr: LearningEngine(
            c, lr, clock=lambda: TUESDAY
        ),
        clock=lambda: TUESDAY,
    )


def test_report_for_new_child_has_week_and_prompt(rt):
    p = rt.store.create(name="נועה", avatar="x", grade=2)
    lines = child_report(rt, p.id)
    assert lines[0].explanation  # every line is explained
    assert "נועה" in lines[-1].text or "נועה" in lines[-1].text.replace(
        "־", ""
    )


def test_report_after_answers_shows_subject_line(rt):
    p = rt.store.create(name="Ori", avatar="x", grade=3)
    rt.activate(p.id)
    for _ in range(6):
        q = rt.engine.next_question(subject="math")
        rt.engine.submit(q, q.answer, elapsed_s=5.0)
    rt.on_answer()
    lines = child_report(rt, p.id)
    texts = " | ".join(line.text for line in lines)
    assert "חשבון" in texts
    assert all(line.explanation for line in lines)
    week = lines[0]
    assert "1" in week.explanation


def test_report_for_inactive_child_loads_saved_learner(rt):
    a = rt.store.create(name="Tamar", avatar="x")
    b = rt.store.create(name="Gil", avatar="x")
    rt.activate(a.id)
    q = rt.engine.next_question(subject="math")
    rt.engine.submit(q, q.answer, elapsed_s=5.0)
    rt.activate(b.id)  # a is saved
    lines = child_report(rt, a.id)
    assert any("חשבון" in line.text for line in lines)


@pytest.mark.parametrize(
    ("seconds", "text"),
    [
        pytest.param(20, "פחות מדקה", id="seconds"),
        pytest.param(65, "דקה אחת", id="one"),
        pytest.param(600, "10 דקות", id="ten"),
    ],
)
def test_fmt_minutes(seconds, text):
    from nagmon.parent_report import fmt_minutes

    assert fmt_minutes(seconds) == text


def test_fmt_percent():
    from nagmon.parent_report import fmt_percent

    assert fmt_percent(1.0) == "100%"
    assert fmt_percent(0.756) == "76%"
    assert fmt_percent(None) == "-"


def test_report_has_no_raw_floats(rt):
    import re

    p = rt.store.create(name="Avi", avatar="x", grade=3)
    rt.activate(p.id)
    q = rt.engine.next_question(subject="math")
    rt.engine.submit(q, q.answer, elapsed_s=3.3)
    texts = " ".join(line.text for line in child_report(rt, p.id))
    assert not re.search(r"\d\.\d{3,}", texts)
