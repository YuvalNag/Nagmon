"""SEL1-SEL10: next-question selection."""

import random
from collections import Counter

import pytest

from nagmon.learning.engine import LearningEngine
from nagmon.learning.learner import LearnerState
from nagmon.learning.rating import p_correct, question_guess
from nagmon.learning.srs import DAY


def engine(library, clock, *, age=9, grade=3, seed=3, worked=False, **st):
    learner = LearnerState(learner_id="s", grade=grade, age=age)
    learner.settings["worked_examples"] = worked
    learner.settings.update(st)
    return LearningEngine(library, learner, rng=random.Random(seed),
                          clock=clock)


def seed_due_cards(eng, library, clock, n=300):
    skill = library.skill("math.mul.facts_all")
    rng = random.Random(9)
    for _ in range(n):
        s = rng.getrandbits(32)
        q = library.generate(skill.id, random.Random(s))
        eng.learner.srs.review(q.item_id, skill.id, s, True,
                               now=clock.now - 10 * DAY)


def test_sel1_distribution(library, clock):
    eng = engine(library, clock)
    seed_due_cards(eng, library, clock)
    counts = Counter()
    n = 3000
    for _ in range(n):
        q = eng.next_question(context="practice")
        counts[q.meta["bucket"]] += 1
    assert abs(counts["frontier"] / n - 0.70) < 0.05, counts
    assert abs(counts["review"] / n - 0.20) < 0.05, counts
    assert abs(counts["stretch"] / n - 0.10) < 0.05, counts


def test_sel2_subject_filters(library, clock):
    eng = engine(library, clock)
    for _ in range(100):
        assert eng.next_question(subject="geometry").subject == "geometry"
    eng = engine(library, clock, subjects=["logic"])
    for _ in range(100):
        assert eng.next_question().subject == "logic"


def test_sel3_focus(library, clock):
    eng = engine(library, clock, focus=["math.mul"])
    n = 500
    hits = sum(
        eng.next_question().skill_id.startswith("math.mul") for _ in range(n)
    )
    assert hits / n >= 0.55


def test_sel4_no_recent_repeat(library, clock):
    eng = engine(library, clock)
    items = [
        eng.next_question(skill_id="math.add.within_100").item_id
        for _ in range(200)
    ]
    for i in range(len(items)):
        assert items[i] not in items[max(0, i - 8):i]


@pytest.mark.parametrize(("age", "theta", "target"),
                         [(10, 1.0, 0.80), (10, 1.8, 0.80),
                          (6, 2.6, 0.875)])
def test_sel5_targets(library, clock, age, theta, target):
    eng = engine(library, clock, age=age, grade=3)
    assert eng.learner.target_frontier == pytest.approx(target)
    assert eng.learner.target_review == pytest.approx(0.90)
    sid = "math.add.within_1000"
    exp = []
    for _ in range(200):
        eng.learner.skill(sid, skill_grade=3).theta = theta
        q = eng.next_question(skill_id=sid)
        exp.append(q.meta["expected"])
        st = eng.learner.skills[sid]
        b = q.difficulty
        assert q.meta["expected"] == pytest.approx(
            p_correct(st.theta, b, question_guess(q)), abs=1e-6)
    mean = sum(exp) / len(exp)
    assert abs(mean - target) < 0.07, mean


def test_sel5_settings_override(library, clock):
    eng = engine(library, clock, target_frontier=0.7, target_review=0.95)
    assert eng.learner.target_frontier == pytest.approx(0.7)
    assert eng.learner.target_review == pytest.approx(0.95)


def test_sel6_locked_not_chosen(library, clock):
    eng = engine(library, clock, age=6, grade=1)
    grade0 = {s.id for s in library.skills.values() if s.grade == 0}
    for _ in range(500):
        q = eng.next_question()
        skill = library.skill(q.skill_id)
        assert set(skill.prereq) <= grade0 | set(eng.learner.mastered), (
            q.skill_id, q.meta["bucket"])


def test_sel7_simulated_success_rate(library, clock):
    eng = engine(library, clock, age=9, grade=3, seed=11)
    rng = random.Random(4)
    true_theta = {
        s.id: 1.0 * (3 - s.grade) + rng.uniform(-0.5, 0.5)
        for s in library.skills.values()
    }
    results = []
    for _ in range(600):
        q = eng.next_question()
        p = p_correct(true_theta[q.skill_id], q.difficulty,
                      question_guess(q))
        ok = rng.random() < p
        eng.submit(q, q.answer if ok else None, elapsed_s=6)
        results.append(ok)
        clock.advance(20)
    rate = sum(results[-300:]) / 300
    assert 0.70 <= rate <= 0.90, rate


def test_sel8_battle_interleave(library, clock):
    eng = engine(library, clock, grade=3)
    seen = [s.id for s in library.by_subject("math") if s.grade <= 2][:6]
    for sid in seen:
        st = eng.learner.skill(sid, skill_grade=library.skill(sid).grade)
        st.n = 5
        st.last = clock.now - 3 * DAY
    buckets = Counter()
    for _ in range(500):
        q = eng.next_question(context="battle", subject="math")
        buckets[q.meta["bucket"]] += 1
        if q.meta["bucket"] == "interleave":
            assert eng.learner.skills[q.skill_id].n > 0
    assert buckets["interleave"] / 500 >= 0.10, buckets


def test_sel9_boss(library, clock):
    eng = engine(library, clock, worked=True)
    ids = ["math.add.within_100", "math.sub.within_100", "math.mul.intro"]
    counts = Counter()
    for _ in range(9):
        q = eng.next_question(context="boss", skill_ids=ids)
        assert q.skill_id in ids
        assert not q.meta.get("worked_example")
        counts[q.skill_id] += 1
        assert max(counts.values()) - min(counts[i] for i in ids) <= 1
    assert set(counts.values()) == {3}


def test_sel10_worked_example_once(library, clock):
    eng = engine(library, clock, worked=True)
    sid = "math.mul.facts_all"
    q1 = eng.next_question(skill_id=sid)
    assert q1.meta.get("worked_example") is True
    out = eng.submit(q1, q1.answer, elapsed_s=3)
    assert out.correct
    assert eng.learner.skills.get(sid) is None or (
        eng.learner.skills[sid].n == 0)
    q2 = eng.next_question(skill_id=sid)
    assert not q2.meta.get("worked_example")
    assert sid in eng.learner.worked_examples
