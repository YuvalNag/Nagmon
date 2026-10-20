"""Elo in logit scale (SDD_LEARNING section 4).

``P(correct) = g + (1 - g) * sigmoid(theta - b)`` where ``g`` is the
guessing rate. Response time only adds a bonus weight to *correct*
answers when the learner's timer is on; slowness is never penalized.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from nagmon.learning.model import Question

LEARNER_K = (0.6, 0.12, 12.0)  # k_max, k_min, n_half
ITEM_K = (0.4, 0.05, 20.0)
THETA_INIT_PER_GRADE = 0.8
THETA_INIT_CLIP = 2.4
SPEED_BONUS = 0.5

# Deadlines (seconds) for an 11-year-old; used only for the speed bonus.
BASE_DEADLINE_S = {
    "choice": 20.0,
    "true_false": 12.0,
    "number": 25.0,
    "order": 30.0,
    "letters": 30.0,
    "tap_figure": 15.0,
}


def sigmoid(x: float) -> float:
    if x >= 0:
        return 1.0 / (1.0 + math.exp(-x))
    e = math.exp(x)
    return e / (1.0 + e)


def logit(p: float) -> float:
    p = min(max(p, 1e-9), 1 - 1e-9)
    return math.log(p / (1 - p))


def guess_rate(kind: str, n_choices: int) -> float:
    """Chance of answering correctly by guessing."""
    if kind == "true_false":
        return 0.5
    if kind in ("choice", "tap_figure") and n_choices >= 2:
        return 1.0 / n_choices
    if kind == "order" and n_choices >= 2:
        return 1.0 / math.factorial(n_choices)
    return 0.0


def question_guess(q: Question) -> float:
    return guess_rate(q.kind, len(q.choices))


def p_correct(theta: float, b: float, guess: float = 0.0) -> float:
    return guess + (1.0 - guess) * sigmoid(theta - b)


def k_factor(n: int, k_max: float, k_min: float, n_half: float) -> float:
    """Dynamic K: high while the estimate is new, lower as data accrues."""
    return k_min + (k_max - k_min) / (1.0 + max(n, 0) / n_half)


def age_factor(age: int | None) -> float:
    if age is None:
        return 1.3
    return min(2.0, max(1.0, 1.0 + 0.15 * (11 - age)))


def deadline_s(kind: str, age: int | None) -> float:
    return BASE_DEADLINE_S.get(kind, 20.0) * age_factor(age)


def initial_theta(learner_grade: int | None, skill_grade: int) -> float:
    if learner_grade is None:
        return 0.0
    raw = THETA_INIT_PER_GRADE * (learner_grade - skill_grade)
    return max(-THETA_INIT_CLIP, min(THETA_INIT_CLIP, raw))


@dataclass(frozen=True)
class RatingUpdate:
    theta: float
    b: float
    expected: float
    weight: float


def elo_update(
    theta: float,
    b: float,
    correct: bool,
    *,
    guess: float = 0.0,
    n_learner: int = 0,
    n_item: int = 0,
    elapsed_s: float | None = None,
    deadline_s: float | None = None,
    timer: bool = False,
    weight: float = 1.0,
) -> RatingUpdate:
    """One Elo step for learner ``theta`` and item ``b``.

    ``weight`` is 0.5 for "I don't know" and for correct-with-hint.
    With ``timer`` on, a fast *correct* answer moves up to 1.5x more.
    """
    expected = p_correct(theta, b, guess)
    score = 1.0 if correct else 0.0
    w = weight
    if (
        timer
        and correct
        and elapsed_s is not None
        and deadline_s
        and deadline_s > 0
    ):
        w *= 1.0 + SPEED_BONUS * max(0.0, 1.0 - elapsed_s / deadline_s)
    k_theta = k_factor(n_learner, *LEARNER_K) * w
    k_b = k_factor(n_item, *ITEM_K) * w
    delta = score - expected
    return RatingUpdate(
        theta=theta + k_theta * delta,
        b=b - k_b * delta,
        expected=expected,
        weight=w,
    )
