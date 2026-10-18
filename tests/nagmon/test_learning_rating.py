"""R1-R7: Elo in logit scale."""

import math
import random

import pytest

from nagmon.learning.rating import (
    elo_update,
    guess_rate,
    initial_theta,
    k_factor,
    p_correct,
    sigmoid,
)


def test_r1_p_correct_with_guess():
    assert p_correct(0.0, 0.0, 0.25) == pytest.approx(0.625)
    assert p_correct(1.0, 0.0) == pytest.approx(sigmoid(1.0))
    assert guess_rate("choice", 4) == pytest.approx(0.25)
    assert guess_rate("true_false", 2) == pytest.approx(0.5)
    assert guess_rate("number", 0) == 0.0
    assert guess_rate("order", 3) == pytest.approx(1 / 6)


def test_r2_k_factor_decreasing():
    ks = [k_factor(n, 0.6, 0.12, 12) for n in range(0, 300, 10)]
    assert all(a > b for a, b in zip(ks, ks[1:]))
    assert ks[0] == pytest.approx(0.6)
    assert min(ks) >= 0.12


def test_r3_direction():
    up = elo_update(0.0, 0.0, True)
    down = elo_update(0.0, 0.0, False)
    assert up.theta > 0 > down.theta
    assert up.b < 0 < down.b
    assert up.theta == pytest.approx(-down.theta)


def test_r4_speed_only_bonus_when_timer_on():
    fast = elo_update(0, 0, True, elapsed_s=1, deadline_s=20, timer=True)
    slow = elo_update(0, 0, True, elapsed_s=19, deadline_s=20, timer=True)
    assert fast.theta > slow.theta > 0
    fast_w = elo_update(0, 0, False, elapsed_s=1, deadline_s=20, timer=True)
    slow_w = elo_update(0, 0, False, elapsed_s=19, deadline_s=20, timer=True)
    assert fast_w.theta == pytest.approx(slow_w.theta)
    off_fast = elo_update(0, 0, True, elapsed_s=1, deadline_s=20)
    off_slow = elo_update(0, 0, True, elapsed_s=19, deadline_s=20)
    assert off_fast.theta == pytest.approx(off_slow.theta)
    # Very slow correct never lowers the rating.
    very_slow = elo_update(
        2.0, 0.0, True, elapsed_s=999, deadline_s=20, timer=True
    )
    assert very_slow.theta >= 2.0


def test_r5_half_weight():
    full = elo_update(0, 0, False)
    half = elo_update(0, 0, False, weight=0.5)
    assert half.theta == pytest.approx(full.theta / 2)


def simulate(true_theta: float, seed: int, n: int = 300) -> float:
    rng = random.Random(seed)
    theta = 0.0
    offsets: dict[int, float] = {}
    for i in range(n):
        item = rng.randrange(400)
        b_true = rng.uniform(-2, 2)
        b = b_true + offsets.get(item, 0.0)
        guess = 0.25 if i % 2 else 0.0
        correct = rng.random() < p_correct(true_theta, b_true, guess)
        upd = elo_update(theta, b, correct, guess=guess, n_learner=i)
        theta = upd.theta
        offsets[item] = upd.b - b_true
    return theta


@pytest.mark.parametrize("true_theta", [-1.0, 0.0, 1.5])
def test_r6_convergence(true_theta):
    est = sum(simulate(true_theta, s) for s in range(5)) / 5
    assert abs(est - true_theta) < 0.6


def test_r7_initial_theta():
    assert initial_theta(3, 3) == 0.0
    assert initial_theta(5, 3) == pytest.approx(1.6)
    assert initial_theta(0, 9) == pytest.approx(-2.4)
    assert initial_theta(9, 0) == pytest.approx(2.4)
    assert math.isfinite(initial_theta(None, 2))
