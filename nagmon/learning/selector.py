"""Next-question selection (SDD_LEARNING section 6).

70% frontier, 20% review, 10% stretch, plus parent focus, interleaving
in battle, balanced boss tests and a worked example on a skill's first
appearance.
"""

from __future__ import annotations

import math
import random
import time
from collections import Counter, deque
from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace

from nagmon.learning.content import ContentLibrary, Skill
from nagmon.learning.generators.common import GenContext
from nagmon.learning.learner import LearnerState
from nagmon.learning.model import Question
from nagmon.learning.rating import initial_theta, p_correct, question_guess
from nagmon.learning.srs import DAY

FRONTIER = "frontier"
REVIEW = "review"
STRETCH = "stretch"
INTERLEAVE = "interleave"
FOCUS = "focus"
BOSS = "boss"
FORCED = "forced"
ANY = "any"


@dataclass
class SelectorConfig:
    frontier: float = 0.70
    review: float = 0.20
    stretch: float = 0.10
    interleave_in_battle: float = 0.30
    focus_share: float = 0.60
    focus_weight: float = 4.0
    candidates: int = 8
    recent_n: int = 8
    stale_days: float = 14.0
    target_jitter: float = 0.025
    struggling_min_n: int = 5
    struggling_acc: float = 0.5
    remedial_min_n: int = 4
    closeness_floor: float = 0.05


class QuestionSelector:
    def __init__(
        self,
        content: ContentLibrary,
        learner: LearnerState,
        rng: random.Random,
        clock: Callable[[], float] = time.time,
        config: SelectorConfig | None = None,
    ) -> None:
        self.content = content
        self.learner = learner
        self.rng = rng
        self.clock = clock
        self.config = config or SelectorConfig()
        n = int(learner.settings.get("recent_n", self.config.recent_n))
        self.recent: deque[str] = deque(
            (e.item for e in list(learner.log)[-n:]), maxlen=n
        )
        self._boss_key: tuple[str, ...] = ()
        self._boss_counts: Counter[str] = Counter()

    # -- skill status --------------------------------------------------------
    def attempted(self, skill_id: str) -> bool:
        st = self.learner.skills.get(skill_id)
        return st is not None and st.n > 0

    def mastered(self, skill_id: str) -> bool:
        return skill_id in self.learner.mastered

    def struggling(self, skill_id: str) -> bool:
        st = self.learner.skills.get(skill_id)
        if st is None or st.n < self.config.struggling_min_n:
            return False
        acc = st.recent_accuracy(10)
        return acc is not None and acc < self.config.struggling_acc

    def assumed(self, skill: Skill) -> bool:
        """Below the learner's grade and no sign of difficulty."""
        return skill.grade < self.learner.grade and not self.struggling(
            skill.id
        )

    def ok(self, skill_id: str) -> bool:
        if self.mastered(skill_id):
            return True
        skill = self.content.get(skill_id)
        return skill is not None and self.assumed(skill)

    def unlocked(self, skill: Skill) -> bool:
        return all(self.ok(p) for p in skill.prereq)

    def is_frontier(self, skill: Skill) -> bool:
        return (
            self.unlocked(skill)
            and not self.mastered(skill.id)
            and not self.assumed(skill)
            and (skill.grade <= self.learner.grade or self.attempted(skill.id))
        )

    def is_new(self, skill: Skill) -> bool:
        return (
            self.unlocked(skill)
            and not self.mastered(skill.id)
            and not self.assumed(skill)
            and not self.attempted(skill.id)
            and skill.grade > self.learner.grade
        )

    def eligible(
        self,
        subject: str | None = None,
        skill_ids: Sequence[str] | None = None,
    ) -> list[Skill]:
        enabled = self.learner.enabled_subjects
        if skill_ids:
            return [
                self.content.skills[s]
                for s in skill_ids
                if s in self.content.skills
            ]
        out = []
        for s in self.content.skills.values():
            if subject is not None and s.subject != subject:
                continue
            if subject is None and enabled and s.subject not in enabled:
                continue
            out.append(s)
        return out

    def frontier_skills(self, subject: str) -> list[str]:
        return [
            s.id
            for s in self.content.by_subject(subject)
            if self.is_frontier(s)
        ]

    # -- targets -----------------------------------------------------------
    def theta_of(self, skill_id: str) -> float:
        """Current theta without creating stats for an unseen skill."""
        st = self.learner.skills.get(skill_id)
        if st is not None:
            return st.theta
        skill = self.content.get(skill_id)
        grade = skill.grade if skill else self.learner.grade
        return initial_theta(self.learner.grade, grade)

    def theta(self, skill: Skill) -> float:
        return self.theta_of(skill.id)

    def _jitter(self, target: float) -> float:
        j = self.config.target_jitter
        return min(0.98, max(0.3, target + self.rng.uniform(-j, j)))

    def _closeness(self, skill: Skill, target: float) -> float:
        p0 = 1.0 / (1.0 + math.exp(-self.theta(skill)))
        st = self.learner.skills.get(skill.id)
        mis = sum(st.misconceptions.values()) if st else 0
        w = self.config.closeness_floor + math.exp(
            -(((p0 - target) / 0.15) ** 2)
        )
        return w * (1.0 + 0.5 * min(mis, 4))

    def _is_focus(self, skill: Skill) -> bool:
        return any(skill.id.startswith(f) for f in self.learner.focus)

    def _weighted(self, skills: list[Skill], weights: list[float]) -> Skill:
        return self.rng.choices(skills, weights=weights, k=1)[0]

    # -- item choice -------------------------------------------------------
    def _ctx(self, skill: Skill, max_choices: int | None) -> GenContext:
        return GenContext(
            skill_id=skill.id,
            subject=skill.subject,
            grade=self.learner.grade,
            age=self.learner.age,
            max_choices=max_choices,
            prefer_kind=self.learner.settings.get("answer_mode"),
        )

    def expected(self, q: Question, bias: float = 0.0) -> float:
        it = self.learner.items.get(q.item_id)
        b = q.difficulty + (it.b_offset if it else 0.0)
        return p_correct(
            self.theta_of(q.skill_id), b + bias, question_guess(q)
        )

    def best_item(
        self,
        skill: Skill,
        target: float,
        max_choices: int | None,
        bias: float,
    ) -> Question:
        ctx = self._ctx(skill, max_choices)
        best: tuple[float, Question] | None = None
        fallback: tuple[float, Question] | None = None
        tries = self.config.candidates
        i = 0
        while i < tries or (best is None and i < tries * 4):
            seed = self.rng.getrandbits(32)
            q = self.content.generate(skill.id, random.Random(seed), ctx)
            q = replace(q, meta={**q.meta, "seed": seed})
            gap = abs(self.expected(q, bias) - target)
            if q.item_id in self.recent:
                if fallback is None or gap < fallback[0]:
                    fallback = (gap, q)
            elif best is None or gap < best[0]:
                best = (gap, q)
                if gap < 0.015:
                    break
            i += 1
        chosen = best or fallback
        assert chosen is not None
        return chosen[1]

    # -- buckets -----------------------------------------------------------
    def too_hard(self, skill: Skill, target: float) -> bool:
        """Evidence that a frontier skill is out of reach for now."""
        st = self.learner.skills.get(skill.id)
        if st is None or st.n < self.config.remedial_min_n:
            return False
        acc = st.recent_accuracy(8) or 0.0
        p0 = 1.0 / (1.0 + math.exp(-st.theta))
        return acc < target - 0.2 or p0 < target - 0.3

    def _pick_frontier(self, pool: list[Skill], target: float) -> Skill | None:
        cands = [s for s in pool if self.is_frontier(s)]
        if not cands:
            return None
        # Step back: prerequisites of a skill that is too hard right now.
        names = {s.id for s in cands}
        for s in list(cands):
            if not self.too_hard(s, target):
                continue
            for pid in s.prereq:
                pre = self.content.get(pid)
                if (
                    pre is not None
                    and pid not in names
                    and not self.mastered(pid)
                ):
                    cands.append(pre)
                    names.add(pid)
        weights = [
            self._closeness(s, target)
            * (self.config.focus_weight if self._is_focus(s) else 1.0)
            for s in cands
        ]
        return self._weighted(cands, weights)

    def _pick_interleave(
        self, pool: list[Skill], target: float
    ) -> Skill | None:
        now = self.clock()
        cands = [s for s in pool if self.attempted(s.id)]
        if len(cands) < 2:
            return None
        weights = []
        for s in cands:
            days = (now - self.learner.skills[s.id].last) / DAY
            weights.append(
                (1.0 + min(max(days, 0.0), 14.0)) * self._closeness(s, target)
            )
        return self._weighted(cands, weights)

    def _pick_stretch(self, pool: list[Skill]) -> Skill | None:
        cands = [s for s in pool if self.is_new(s)]
        if not cands:
            return None
        low = min(s.grade for s in cands)
        cands = [s for s in cands if s.grade == low]
        return self.rng.choice(cands)

    def _pick_review(
        self, pool: list[Skill], max_choices: int | None
    ) -> Question | None:
        ids = {s.id for s in pool}
        for card in self.learner.srs.due(
            now=self.clock(), skill_filter=ids.__contains__
        ):
            if card.item_id in self.recent:
                continue
            skill = self.content.skills[card.skill_id]
            ctx = self._ctx(skill, max_choices)
            if card.seed is None:
                return self.best_item(
                    skill, self.learner.target_review, max_choices, 0.0
                )
            q = self.content.generate(skill.id, random.Random(card.seed), ctx)
            return replace(q, meta={**q.meta, "seed": card.seed})
        now = self.clock()
        stale = [
            s
            for s in pool
            if self.mastered(s.id)
            and now - self.learner.skills.get(s.id, _NO_STATS).last
            > self.config.stale_days * DAY
        ]
        if stale:
            skill = self.rng.choice(stale)
            return self.best_item(
                skill, self.learner.target_review, max_choices, 0.0
            )
        return None

    # -- main entry ----------------------------------------------------------
    def select(
        self,
        *,
        subject: str | None = None,
        skill_id: str | None = None,
        skill_ids: Sequence[str] | None = None,
        context: str = "battle",
        max_choices: int | None = None,
        difficulty_bias: float = 0.0,
    ) -> Question:
        target_f = self.learner.target_frontier
        bias = difficulty_bias
        q: Question | None = None
        bucket = ANY
        worked_ok = True

        if skill_id is not None:
            skill = self.content.skills[skill_id]
            q = self.best_item(
                skill, self._jitter(target_f), max_choices, bias
            )
            bucket = FORCED
        elif context == "boss" and skill_ids:
            key = tuple(skill_ids)
            if key != self._boss_key:
                self._boss_key = key
                self._boss_counts = Counter()
            valid = [s for s in skill_ids if s in self.content.skills]
            low = min(self._boss_counts[s] for s in valid)
            sid = self.rng.choice(
                [s for s in valid if self._boss_counts[s] == low]
            )
            self._boss_counts[sid] += 1
            q = self.best_item(
                self.content.skills[sid],
                self._jitter(target_f),
                max_choices,
                bias,
            )
            bucket = BOSS
            worked_ok = False
        else:
            pool = self.eligible(subject, skill_ids)
            if not pool:
                pool = self.eligible(None, None)
            focus = [s for s in pool if self._is_focus(s)]
            if focus and self.rng.random() < self.config.focus_share:
                weights = [self._closeness(s, target_f) for s in focus]
                skill = self._weighted(focus, weights)
                q = self.best_item(
                    skill, self._jitter(target_f), max_choices, bias
                )
                bucket = FOCUS
            else:
                q, bucket = self._bucketed(
                    pool, context, target_f, max_choices, bias
                )
                worked_ok = bucket != REVIEW
        q = self._finish(q, bucket, bias, worked_ok)
        return q

    def _bucketed(
        self,
        pool: list[Skill],
        context: str,
        target_f: float,
        max_choices: int | None,
        bias: float,
    ) -> tuple[Question, str]:
        c = self.config
        r = self.rng.random()
        if r < c.frontier:
            order = [FRONTIER, REVIEW, STRETCH]
        elif r < c.frontier + c.review:
            order = [REVIEW, FRONTIER, STRETCH]
        else:
            order = [STRETCH, FRONTIER, REVIEW]
        for bucket in order:
            if bucket == FRONTIER:
                if (
                    context == "battle"
                    and self.rng.random() < c.interleave_in_battle
                ):
                    skill = self._pick_interleave(pool, target_f)
                    if skill is not None:
                        return (
                            self.best_item(
                                skill,
                                self._jitter(target_f),
                                max_choices,
                                bias,
                            ),
                            INTERLEAVE,
                        )
                skill = self._pick_frontier(pool, target_f)
                if skill is not None:
                    return (
                        self.best_item(
                            skill, self._jitter(target_f), max_choices, bias
                        ),
                        FRONTIER,
                    )
            elif bucket == REVIEW:
                q = self._pick_review(pool, max_choices)
                if q is not None:
                    return q, REVIEW
            else:
                skill = self._pick_stretch(pool)
                if skill is not None:
                    return (
                        self.best_item(
                            skill, self._jitter(target_f), max_choices, bias
                        ),
                        STRETCH,
                    )
        open_ = [
            s for s in pool if self.unlocked(s) and not self.mastered(s.id)
        ] or pool
        low = min(s.grade for s in open_)
        near = [s for s in open_ if s.grade <= max(low, self.learner.grade)]
        skill = self.rng.choice(near or open_)
        return (
            self.best_item(skill, self._jitter(target_f), max_choices, bias),
            ANY,
        )

    def _finish(
        self, q: Question, bucket: str, bias: float, worked_ok: bool
    ) -> Question:
        meta = {
            **q.meta,
            "bucket": bucket,
            "expected": round(self.expected(q), 6),
        }
        learner = self.learner
        if (
            worked_ok
            and learner.worked_examples_on
            and q.skill_id not in learner.worked_examples
            and not self.attempted(q.skill_id)
            and q.explanation_he
        ):
            meta["worked_example"] = True
            learner.worked_examples.add(q.skill_id)
        self.recent.append(q.item_id)
        return replace(q, meta=meta)


class _NoStats:
    last = 0.0


_NO_STATS = _NoStats()
