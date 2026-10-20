"""D1-D3: parent dashboard numbers with explanations."""

import random

from nagmon.learning.engine import LearningEngine
from nagmon.learning.learner import LearnerState
from nagmon.learning.model import Question
from nagmon.learning.srs import DAY


def engine(library, clock):
    learner = LearnerState(learner_id="d", grade=3, age=9)
    learner.settings["worked_examples"] = False
    return LearningEngine(library, learner, rng=random.Random(2), clock=clock)


def answer(eng, sid, ok, elapsed=10.0):
    q = eng.next_question(skill_id=sid)
    given = q.answer if ok else None
    return q, eng.submit(q, given, elapsed_s=elapsed)


def test_d1_accuracy_and_time(library, clock):
    eng = engine(library, clock)
    # 20 days ago: 4 math answers, all wrong.
    for _ in range(4):
        answer(eng, "math.add.within_100", False)
    clock.advance(20 * DAY)
    # Now: 3 correct + 1 wrong math, 2 correct geometry.
    for ok in (True, True, True, False):
        answer(eng, "math.add.within_100", ok, elapsed=15)
    for _ in range(2):
        answer(eng, "geometry.shapes.identify", True, elapsed=30)
    d = eng.dashboard()
    m = d.subjects["math"]
    assert m.accuracy_7d.value == 0.75
    assert "3" in m.accuracy_7d.explanation_he
    assert "4" in m.accuracy_7d.explanation_he
    assert m.answered_7d.value == 4
    assert m.accuracy_30d.value == 3 / 8
    assert m.time_7d_s.value == 60
    assert d.time_7d_s.value == 120
    assert d.subjects["geometry"].accuracy_7d.value == 1.0
    for s in d.subjects.values():
        for stat in (
            s.accuracy_7d,
            s.accuracy_30d,
            s.answered_7d,
            s.time_7d_s,
            s.mastered,
            s.stars,
        ):
            assert stat.explanation_he
    assert d.time_30d_s.explanation_he


def test_d2_struggling(library, clock):
    eng = engine(library, clock)
    sid = "math.sub.within_100"
    tagged = 0
    for i in range(10):
        q = eng.next_question(skill_id=sid)
        if q.misconceptions and tagged < 3:
            key = next(k for k, v in q.misconceptions.items())
            eng.submit(q, key, elapsed_s=8)
            tagged += 1
        else:
            eng.submit(q, q.answer if i % 4 == 0 else None, elapsed_s=8)
    d = eng.dashboard()
    names = [s.skill_id for s in d.struggling]
    assert sid in names
    s = next(s for s in d.struggling if s.skill_id == sid)
    assert s.accuracy.value < 0.6 and s.accuracy.explanation_he
    if tagged:
        assert s.misconceptions and s.misconceptions[0].count >= 1
        assert s.misconceptions[0].text_he


def test_d3_english_words(library, clock):
    eng = engine(library, clock)
    q = Question(
        item_id="english.vocab:dog",
        skill_id="english.vocab.animals",
        subject="english",
        kind="number",
        prompt_he="?",
        prompt_en=None,
        answer="1",
        explanation_he="x",
        meta={"word": "dog"},
    )
    eng.submit(q, "1", elapsed_s=2)
    d = eng.dashboard()
    assert "dog" in d.new_english_words.value
    assert d.new_english_words.explanation_he


def test_mastered_list(library, clock):
    eng = engine(library, clock)
    eng.learner.mastered["math.add.within_10"] = clock.now
    d = eng.dashboard()
    assert [m.skill_id for m in d.mastered_skills] == ["math.add.within_10"]
    assert d.mastered_skills[0].title_he
