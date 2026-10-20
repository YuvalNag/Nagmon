"""E1-E11: LearningEngine.submit / hint / progress."""

import random
import time

from nagmon.learning.engine import LearningEngine, super_threshold_s
from nagmon.learning.generators.misconceptions import MISCONCEPTIONS
from nagmon.learning.learner import LearnerState
from nagmon.learning.model import (
    Choice,
    Question,
    check_answer,
    display_answer,
)
from nagmon.learning.srs import DAY


def make_engine(library, clock, *, age=10, grade=5, seed=1, **settings):
    learner = LearnerState(learner_id="t", name="ת", grade=grade, age=age)
    learner.settings["worked_examples"] = False
    learner.settings.update(settings)
    return LearningEngine(
        library, learner, rng=random.Random(seed), clock=clock
    )


def wrong_given(q):
    if q.kind == "number":
        return "999999"
    return next(c.id for c in q.choices if c.id != q.answer)


def test_e1_quality_with_timer(library, clock):
    eng = make_engine(library, clock, age=10)
    q = eng.next_question(skill_id="math.add.within_20")
    out = eng.submit(q, q.answer, elapsed_s=1.0)
    assert (out.quality, out.power_multiplier) == ("super", 2.0)
    assert out.correct and out.coins > 0
    q = eng.next_question(skill_id="math.add.within_20")
    out = eng.submit(q, q.answer, elapsed_s=120.0)
    assert (out.quality, out.power_multiplier) == ("correct", 1.5)
    q = eng.next_question(skill_id="math.add.within_20")
    out = eng.submit(q, wrong_given(q), elapsed_s=2.0)
    assert (out.quality, out.power_multiplier) == ("wrong", 1.0)
    assert out.coins == 0 and not out.correct
    assert out.correct_answer == display_answer(q)
    assert out.explanation_he


def test_e1b_no_super_under_nine(library, clock):
    eng = make_engine(library, clock, age=6, grade=1)
    for _ in range(5):
        q = eng.next_question(skill_id="math.add.within_10")
        out = eng.submit(q, q.answer, elapsed_s=0.5)
        assert out.quality == "correct" and out.power_multiplier == 1.5


def test_e1c_timer_setting_overrides(library, clock):
    eng = make_engine(library, clock, age=10, timer=False)
    q = eng.next_question(skill_id="math.add.within_20")
    assert eng.submit(q, q.answer, elapsed_s=0.5).quality == "correct"


def test_e2_super_threshold_by_age():
    assert super_threshold_s("choice", 9) > super_threshold_s("choice", 11)
    assert super_threshold_s("number", 11) > super_threshold_s("choice", 11)


def test_e3_hint(library, clock):
    eng = make_engine(library, clock, age=10, max_choices=None)
    q = eng.next_question(skill_id="math.add.within_100", max_choices=4)
    assert q.kind == "choice"
    h = eng.hint(q)
    assert len(h.eliminate) == 1 and h.eliminate[0] != q.answer
    assert h.eliminate[0] in {c.id for c in q.choices}
    assert h.text_he
    base = make_engine(library, clock, age=10)
    plain = base.submit(q, q.answer, elapsed_s=30)
    eng.submit(q, q.answer, elapsed_s=30)  # streak 1
    out = eng.submit(q, q.answer, elapsed_s=1, hint_used=True)
    assert out.correct and out.quality == "correct"
    assert 1 <= out.coins < plain.coins or plain.coins == 1
    assert out.streak == 2
    nq = eng.next_question(skill_id="math.add.within_100", max_choices=None)
    if nq.kind != "choice":
        assert eng.hint(nq).text_he


def test_e3b_dont_know(library, clock):
    eng = make_engine(library, clock)
    q = eng.next_question(skill_id="math.add.within_100")
    eng.submit(q, q.answer, elapsed_s=3)
    theta_before = eng.learner.skills[q.skill_id].theta
    q = eng.next_question(skill_id="math.add.within_100")
    out = eng.submit(q, None, elapsed_s=5)
    assert not out.correct and out.quality == "wrong"
    assert out.misconception is None
    assert out.coins == 0 and out.streak == 0
    assert out.explanation_he == q.explanation_he
    assert out.correct_answer == display_answer(q)
    drop_dk = theta_before - eng.learner.skills[q.skill_id].theta
    eng2 = make_engine(library, clock)
    q2 = eng2.next_question(skill_id="math.add.within_100")
    eng2.submit(q2, q2.answer, elapsed_s=3)
    before2 = eng2.learner.skills[q2.skill_id].theta
    eng2.submit(q, wrong_given(q), elapsed_s=5)
    drop_wrong = before2 - eng2.learner.skills[q.skill_id].theta
    assert 0 < drop_dk < drop_wrong
    out2 = eng.submit(q, "x", elapsed_s=1, dont_know=True)
    assert out2.quality == "wrong" and out2.misconception is None


def custom_q(skill_id, subject, difficulty, item):
    return Question(
        item_id=f"test:{item}",
        skill_id=skill_id,
        subject=subject,
        kind="number",
        prompt_he="כמה זה 2 ועוד 2?",
        prompt_en=None,
        answer="4",
        explanation_he="2 ועוד 2 זה 4.",
        difficulty=difficulty,
    )


def test_e4_coins(library, clock):
    eng = make_engine(library, clock, timer=False)
    eng.learner.skill("math.add.within_100", skill_grade=2).theta = 0.0
    easy = eng.submit(
        custom_q("math.add.within_100", "math", -3.0, "e"), "4", elapsed_s=5
    )
    eng.learner.skill("math.add.within_100").theta = 0.0
    hard = eng.submit(
        custom_q("math.add.within_100", "math", 2.5, "h"), "4", elapsed_s=5
    )
    assert hard.coins > easy.coins
    # Weak subject: geometry far behind math.
    eng = make_engine(
        library, clock, timer=False, subjects=["math", "geometry"]
    )
    math_skills = [s.id for s in library.by_subject("math") if s.grade <= 5][
        :20
    ]
    for sid in math_skills:
        eng.learner.mastered[sid] = clock.now
    g = library.by_subject("geometry")[0]
    m = library.by_subject("math")[-1]
    eng.learner.skill(g.id, skill_grade=g.grade).theta = 0.0
    eng.learner.skill(m.id, skill_grade=m.grade).theta = 0.0
    gq = eng.submit(custom_q(g.id, "geometry", 0.0, "g"), "4", elapsed_s=5)
    mq = eng.submit(custom_q(m.id, "math", 0.0, "m"), "4", elapsed_s=5)
    assert gq.coins == mq.coins + 2


def test_e5_session_streak(library, clock):
    eng = make_engine(library, clock)
    streaks = []
    for i in range(5):
        q = eng.next_question(skill_id="math.add.within_20")
        given = q.answer if i != 3 else wrong_given(q)
        streaks.append(eng.submit(q, given, elapsed_s=4).streak)
    assert streaks == [1, 2, 3, 0, 1]
    assert "streak" not in eng.learner.to_dict()


def test_e6_mastery_and_stars(library, clock):
    eng = make_engine(library, clock, age=6, grade=1)
    sid = "math.add.within_10"
    mastered_at = None
    newly = []
    for i in range(60):
        q = eng.next_question(skill_id=sid)
        out = eng.submit(q, q.answer, elapsed_s=4)
        newly.extend(out.newly_mastered)
        if out.newly_mastered and mastered_at is None:
            mastered_at = i + 1
        clock.advance(30)
    rule = library.skill(sid).mastery
    assert mastered_at is not None and mastered_at >= rule.min_attempts
    assert newly == [sid]
    assert eng.learner.stars["math"] == 1
    assert sid in eng.learner.mastered


def test_e7_misconception(library, clock):
    eng = make_engine(library, clock)
    for seed in range(50):
        q = eng.next_question(skill_id="math.sub.within_100")
        if q.misconceptions:
            break
    key, tag = next(iter(q.misconceptions.items()))
    out = eng.submit(q, key, elapsed_s=5)
    assert out.misconception == tag
    assert MISCONCEPTIONS[tag].hint_he in out.explanation_he
    assert eng.learner.skills[q.skill_id].misconceptions[tag] == 1
    assert eng.learner.log[-1].mis == tag


def test_e9_subject_progress(library, clock):
    eng = make_engine(library, clock, age=6, grade=0)
    p0 = eng.subject_progress("math")
    assert p0.stars == 0 and p0.mastery == 0.0
    assert p0.frontier_skills
    sid = p0.frontier_skills[0]
    eng.learner.mastered[sid] = clock.now
    eng.learner.stars["math"] = 1
    p1 = eng.subject_progress("math")
    assert p1.mastery > 0 and p1.stars == 1
    assert sid in p1.mastered_skills and sid not in p1.frontier_skills


def test_e10_performance(library, clock):
    eng = make_engine(library, clock, age=9, grade=4)
    rng = random.Random(5)
    total = 0.0
    n = 300
    for _ in range(n):
        t0 = time.perf_counter()
        q = eng.next_question()
        total += time.perf_counter() - t0
        eng.submit(q, q.answer if rng.random() < 0.8 else None, elapsed_s=5)
    assert total / n < 0.005, total / n


def test_e11_leitner_card(library, clock):
    eng = make_engine(library, clock, age=9, grade=3)
    q = eng.next_question(skill_id="math.mul.facts_all")
    eng.submit(q, q.answer, elapsed_s=4)
    card = eng.learner.srs.get(q.item_id)
    assert card is not None and card.box == 2
    regen = library.generate(card.skill_id, random.Random(card.seed))
    assert regen.item_id == q.item_id
    clock.advance(4 * DAY)
    seen = set()
    for _ in range(80):
        nq = eng.next_question(subject="math")
        if nq.meta.get("bucket") == "review":
            seen.add(nq.item_id)
    assert q.item_id in seen


def test_unknown_skill_question(library, clock):
    eng = make_engine(library, clock)
    q = Question(
        item_id="ai:1",
        skill_id="english.vocab.animals",
        subject="english",
        kind="choice",
        prompt_he="מה זה dog?",
        prompt_en="What is a dog?",
        answer="a",
        choices=(Choice("a", "כלב", "dog"), Choice("b", "חתול", "cat")),
        explanation_he="dog זה כלב.",
        source="ai",
        meta={"word": "dog"},
    )
    out = eng.submit(q, "a", elapsed_s=3)
    assert out.correct and "dog" in eng.learner.words
    assert check_answer(q, "a").correct
