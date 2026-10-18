"""LearningEngine: the contract from SDD_ARCHITECTURE section 4."""

from __future__ import annotations

import random
import re
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Literal

from nagmon.learning.content import ContentLibrary, Skill
from nagmon.learning.dashboard import DashboardData, build_dashboard
from nagmon.learning.generators.misconceptions import MISCONCEPTIONS
from nagmon.learning.learner import ITEMS_MAX, LearnerState, LogEntry
from nagmon.learning.model import (
    CheckResult,
    Question,
    check_answer,
    display_answer,
)
from nagmon.learning.rating import (
    age_factor,
    deadline_s,
    elo_update,
    logit,
    p_correct,
    question_guess,
)
from nagmon.learning.selector import QuestionSelector, SelectorConfig

Quality = Literal["super", "correct", "wrong"]
MULTIPLIER = {"super": 2.0, "correct": 1.5, "wrong": 1.0}
WEAK_SUBJECT_BONUS = 2
SUPER_BONUS = 1

# Seconds for an 11-year-old; scaled by age (x1 .. x2).
BASE_SUPER_S = {
    "choice": 6.0,
    "true_false": 4.0,
    "number": 8.0,
    "order": 12.0,
    "letters": 12.0,
    "tap_figure": 6.0,
}


def super_threshold_s(kind: str, age: int | None) -> float:
    return BASE_SUPER_S.get(kind, 6.0) * age_factor(age)


@dataclass(frozen=True)
class AnswerOutcome:
    correct: bool
    quality: Quality
    misconception: str | None
    explanation_he: str
    coins: int
    newly_mastered: tuple[str, ...]
    streak: int
    power_multiplier: float
    # Extensions (SDD_LEARNING section 7):
    correct_answer: str = ""
    expected: float = 0.0
    worked_example: bool = False


@dataclass(frozen=True)
class SubjectProgress:
    subject: str
    mastery: float  # mastered / skills up to the learner's grade, 0..1
    stars: int
    frontier_skills: tuple[str, ...]
    mastered_skills: tuple[str, ...]
    skills_total: int


@dataclass(frozen=True)
class Hint:
    text_he: str
    eliminate: tuple[str, ...] = ()  # choice ids the UI may grey out


_FIRST_STEP = re.compile(r"^(.*?)(?::|\.\s)")


class LearningEngine:
    def __init__(
        self,
        content: ContentLibrary,
        learner: LearnerState,
        rng: random.Random | None = None,
        clock: Callable[[], float] = time.time,
        config: SelectorConfig | None = None,
    ) -> None:
        self.content = content
        self.learner = learner
        self.rng = rng or random.Random()
        self.clock = clock
        learner.srs.clock = clock
        self.selector = QuestionSelector(
            content, learner, self.rng, clock, config
        )
        self.streak = 0  # in-session combo, never persisted

    # -- questions -----------------------------------------------------------
    def next_question(
        self,
        *,
        subject: str | None = None,
        skill_id: str | None = None,
        skill_ids: Sequence[str] | None = None,
        context: str = "battle",
        max_choices: int | None = None,
        difficulty_bias: float = 0.0,
    ) -> Question:
        return self.selector.select(
            subject=subject,
            skill_id=skill_id,
            skill_ids=skill_ids,
            context=context,
            max_choices=max_choices,
            difficulty_bias=difficulty_bias,
        )

    def expected_success(self, q: Question) -> float:
        return self.selector.expected(q)

    def hint(self, q: Question) -> Hint:
        """A first step: drop one wrong choice, or the first worked step."""
        if q.kind in ("choice", "tap_figure") and len(q.choices) > 2:
            wrong = [c for c in q.choices if c.id != q.answer]
            plain = [c for c in wrong if c.id not in q.misconceptions] or wrong
            drop = self.rng.choice(plain)
            return Hint(f'אפשר לפסול את התשובה "{drop.text_he}".', (drop.id,))
        text = q.meta.get("hint_he")
        if not text:
            m = _FIRST_STEP.match(q.explanation_he or "")
            step = m.group(1).strip() if m else ""
            answer = display_answer(q)
            if step and answer not in step:
                text = f"רמז: {step}."
            else:
                text = "רמז: קראו שוב את השאלה, ונסו צעד אחד בכל פעם."
        return Hint(text)

    # -- answers -------------------------------------------------------------
    def submit(
        self,
        q: Question,
        given: object,
        *,
        elapsed_s: float,
        context: str = "battle",
        hint_used: bool = False,
        dont_know: bool = False,
    ) -> AnswerOutcome:
        now = self.clock()
        learner = self.learner
        dk = dont_know or given is None
        res = CheckResult(False, None, None) if dk else check_answer(q, given)
        correct = res.correct
        mis = None if dk else res.misconception
        skill = self.content.get(q.skill_id)
        worked = bool(q.meta.get("worked_example"))
        st = learner.skill(q.skill_id, skill.grade if skill else None)
        it = learner.item(q.item_id)
        b_eff = q.difficulty + it.b_offset
        guess = question_guess(q)
        expected = p_correct(st.theta, b_eff, guess)
        timer = learner.timer_on

        newly: tuple[str, ...] = ()
        if not worked:
            weight = 0.5 if dk or (hint_used and correct) else 1.0
            upd = elo_update(
                st.theta,
                b_eff,
                correct,
                guess=guess,
                n_learner=st.n,
                n_item=it.n,
                elapsed_s=elapsed_s,
                deadline_s=deadline_s(q.kind, learner.age),
                timer=timer and not hint_used,
                weight=weight,
            )
            st.theta = upd.theta
            it.b_offset = upd.b - q.difficulty
            it.n += 1
            it.last = now
            st.n += 1
            st.correct += int(correct)
            st.push(correct)
            st.last = now
            if mis:
                st.misconceptions[mis] = st.misconceptions.get(mis, 0) + 1
            if (skill is not None and skill.srs) or q.source == "bank":
                learner.srs.review(
                    q.item_id,
                    q.skill_id,
                    q.meta.get("seed"),
                    correct,
                    hinted=hint_used,
                    now=now,
                )
            if len(learner.items) > ITEMS_MAX + 200:
                learner.prune_items()
            if skill is not None and self._mastered_now(skill):
                learner.mastered[skill.id] = now
                learner.stars[skill.subject] = (
                    learner.stars.get(skill.subject, 0) + 1
                )
                newly = (skill.id,)

        if correct:
            fast = elapsed_s <= super_threshold_s(q.kind, learner.age)
            quality: Quality = (
                "super"
                if timer and fast and not hint_used and not worked
                else "correct"
            )
        else:
            quality = "wrong"
        coins = self._coins(q, correct, quality, expected, hint_used, worked)
        self.streak = self.streak + 1 if correct else 0

        word = q.meta.get("word")
        if correct and word and word not in learner.words:
            learner.words[str(word)] = now
        learner.log_answer(
            LogEntry(
                ts=now,
                skill=q.skill_id,
                item=q.item_id,
                subject=q.subject,
                correct=correct,
                quality=quality,
                elapsed=float(elapsed_s),
                context=context,
                mis=mis,
                hint=hint_used,
                dk=dk,
                worked=worked,
            )
        )
        learner.answers_total += 1
        learner.correct_total += int(correct)
        learner.coins_total += coins
        learner.time_total_s += float(elapsed_s)

        explanation = q.explanation_he
        if mis and mis in MISCONCEPTIONS:
            explanation = (
                f"{MISCONCEPTIONS[mis].hint_he} {explanation}".strip()
            )
        return AnswerOutcome(
            correct=correct,
            quality=quality,
            misconception=mis,
            explanation_he=explanation,
            coins=coins,
            newly_mastered=newly,
            streak=self.streak,
            power_multiplier=MULTIPLIER[quality],
            correct_answer=display_answer(q),
            expected=round(expected, 4),
            worked_example=worked,
        )

    def _mastered_now(self, skill: Skill) -> bool:
        if skill.id in self.learner.mastered:
            return False
        st = self.learner.skills[skill.id]
        rule = skill.mastery
        acc = st.recent_accuracy(10)
        return (
            st.n >= rule.min_attempts
            and st.theta >= logit(rule.threshold)
            and acc is not None
            and acc >= rule.threshold
        )

    def _coins(
        self,
        q: Question,
        correct: bool,
        quality: Quality,
        expected: float,
        hint_used: bool,
        worked: bool,
    ) -> int:
        if not correct:
            return 0
        if worked:
            return 1
        coins = 1 + round(3 * (1 - expected))
        if q.subject in self.weak_subjects():
            coins += WEAK_SUBJECT_BONUS
        if quality == "super":
            coins += SUPER_BONUS
        if hint_used:
            coins = max(1, coins // 2)
        return coins

    # -- progress ------------------------------------------------------------
    def _relevant(self, subject: str) -> list[Skill]:
        skills = self.content.by_subject(subject)
        rel = [s for s in skills if s.grade <= self.learner.grade]
        return rel or [
            s
            for s in skills
            if s.grade == min((x.grade for x in skills), default=0)
        ]

    def mastery_fraction(self, subject: str) -> float:
        rel = self._relevant(subject)
        if not rel:
            return 0.0
        done = sum(1 for s in rel if s.id in self.learner.mastered)
        return done / len(rel)

    def weak_subjects(self) -> tuple[str, ...]:
        subjects = self.learner.enabled_subjects or tuple(
            self.content.subjects()
        )
        subjects = tuple(s for s in subjects if self.content.by_subject(s))
        if len(subjects) < 2:
            return ()
        fr = {s: self.mastery_fraction(s) for s in subjects}
        lo, hi = min(fr.values()), max(fr.values())
        if hi - lo < 0.05:
            return ()
        return tuple(s for s, v in fr.items() if v <= lo + 0.02)

    def subject_progress(self, subject: str) -> SubjectProgress:
        skills = self.content.by_subject(subject)
        mastered = tuple(s.id for s in skills if s.id in self.learner.mastered)
        return SubjectProgress(
            subject=subject,
            mastery=round(self.mastery_fraction(subject), 4),
            stars=self.learner.stars.get(subject, 0),
            frontier_skills=tuple(self.selector.frontier_skills(subject)),
            mastered_skills=mastered,
            skills_total=len(skills),
        )

    def dashboard(self) -> DashboardData:
        return build_dashboard(self.learner, self.content, self.clock())
