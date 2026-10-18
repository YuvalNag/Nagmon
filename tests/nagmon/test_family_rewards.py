import json
from datetime import date

import pytest
from nagmon.family.goals import FamilyWeekStatus
from nagmon.family.rewards import (
    VISIBLE_GOALS_WARNING_HE,
    MilestoneKind,
    ProgressStats,
    RewardsBoard,
    RewardsError,
    RewardsMode,
)


class Clock:
    def __init__(self) -> None:
        self.t = 1_000.0

    def __call__(self) -> float:
        self.t += 1
        return self.t


@pytest.fixture
def board(tmp_path):
    return RewardsBoard(tmp_path, clock=Clock())


def stats(**kw):
    return ProgressStats(**kw)


def test_default_mode_is_surprise(board):
    assert board.mode is RewardsMode.SURPRISE
    assert VISIBLE_GOALS_WARNING_HE
    assert "מוטיבציה" in VISIBLE_GOALS_WARNING_HE


def test_add_celebration_validation(board):
    c = board.add_celebration(
        title_he="גלידה עם אבא",
        milestone=MilestoneKind.PRACTICE_DAYS,
        threshold=10,
    )
    assert c.id
    assert board.celebrations() == [c]
    with pytest.raises(RewardsError):
        board.add_celebration(title_he="", milestone="practice_days")
    with pytest.raises(RewardsError):
        board.add_celebration(
            title_he="x", milestone="practice_days", threshold=0
        )
    with pytest.raises(RewardsError):
        board.add_celebration(title_he="x", milestone="skill")  # no target
    with pytest.raises(RewardsError):
        board.add_celebration(title_he="x", milestone="screen_minutes")


def test_screen_time_can_never_be_a_reward():
    assert not any("screen" in k.value for k in MilestoneKind)


def test_milestone_suggests_to_parent_once(board):
    c = board.add_celebration(
        title_he="ערב משחק", milestone="practice_days", threshold=5
    )
    assert board.evaluate("p1", stats(practice_days=4)) == []
    new = board.evaluate("p1", stats(practice_days=5))
    assert len(new) == 1
    s = new[0]
    assert s.profile_id == "p1"
    assert s.celebration_id == c.id
    assert s.status == "pending"
    assert "5" in s.message_he
    assert board.pending() == [s]
    # evaluating again does not duplicate
    assert board.evaluate("p1", stats(practice_days=7)) == []
    assert len(board.pending()) == 1


def test_skill_milestone_message_is_informational(board):
    board.add_celebration(
        title_he="פיצה",
        milestone="skill",
        target_id="math.fractions.basic",
    )
    new = board.evaluate(
        "p1",
        stats(
            skills_mastered=frozenset({"math.fractions.basic"}),
            titles={"math.fractions.basic": "שברים"},
        ),
    )
    assert len(new) == 1
    assert "עבדת קשה על שברים" in new[0].message_he
    assert "פיצה" not in new[0].message_he  # the prize is the parent's


def test_repeatable_milestone(board):
    board.add_celebration(
        title_he="הפתעה",
        milestone="weekly_goals",
        threshold=4,
        repeatable=True,
    )
    assert len(board.evaluate("p1", stats(weekly_goals_met=4))) == 1
    assert board.evaluate("p1", stats(weekly_goals_met=7)) == []
    assert len(board.evaluate("p1", stats(weekly_goals_met=8))) == 1
    # jumping two levels at once suggests once (not a flood)
    assert len(board.evaluate("p1", stats(weekly_goals_met=16))) == 1


def test_per_profile_celebrations(board):
    board.add_celebration(
        title_he="x", milestone="academy", target_id="a1", profile_id="p2"
    )
    st = stats(academies=frozenset({"a1"}))
    assert board.evaluate("p1", st) == []
    assert len(board.evaluate("p2", st)) == 1


def test_never_revoked_when_stats_drop(board):
    board.add_celebration(title_he="x", milestone="stars", threshold=10)
    [s] = board.evaluate("p1", stats(stars=10))
    board.mark_celebrated(s.id)
    board.evaluate("p1", stats(stars=0))
    assert board.history("p1")[0].status == "celebrated"


def test_celebrate_and_dismiss(board):
    board.add_celebration(title_he="x", milestone="skills_mastered")
    [s] = board.evaluate("p1", stats(skills_mastered=frozenset({"a"})))
    done = board.mark_celebrated(s.id)
    assert done.status == "celebrated"
    assert done.decided_at is not None
    assert board.pending() == []
    board.add_celebration(title_he="y", milestone="practice_days")
    [s2] = board.evaluate("p1", stats(practice_days=1))
    board.dismiss(s2.id)
    assert board.pending() == []
    assert board.evaluate("p1", stats(practice_days=2)) == []
    with pytest.raises(KeyError):
        board.mark_celebrated("nope")
    with pytest.raises(RewardsError):
        board.mark_celebrated(s.id)  # already decided


def test_kid_view_hidden_in_surprise_mode(board):
    board.add_celebration(title_he="x", milestone="practice_days", threshold=9)
    assert board.kid_view("p1", stats(practice_days=3)) == []


def test_kid_view_in_visible_mode(board):
    board.set_mode(RewardsMode.VISIBLE_GOALS)
    c = board.add_celebration(
        title_he="יציאה לפארק", milestone="practice_days", threshold=10
    )
    board.add_celebration(
        title_he="סוד", milestone="practice_days", threshold=3, secret=True
    )
    [g] = board.kid_view("p1", stats(practice_days=4))
    assert g.celebration_id == c.id
    assert g.title_he == "יציאה לפארק"
    assert (g.progress, g.target) == (4, 10)
    assert not g.reached


def test_kid_request_only_in_visible_mode_and_when_reached(board):
    c = board.add_celebration(
        title_he="x", milestone="practice_days", threshold=3
    )
    with pytest.raises(RewardsError):
        board.request("p1", c.id, stats(practice_days=3))
    board.set_mode("visible_goals")
    with pytest.raises(RewardsError):
        board.request("p1", c.id, stats(practice_days=2))
    req = board.request("p1", c.id, stats(practice_days=3))
    assert req.status == "pending"
    assert req.source == "kid_request"
    # same request again returns the pending one
    assert board.request("p1", c.id, stats(practice_days=3)).id == req.id
    # milestone evaluation does not add a duplicate
    assert board.evaluate("p1", stats(practice_days=3)) == []
    with pytest.raises(KeyError):
        board.request("p1", "nope", stats(practice_days=3))


def test_inactive_celebration_is_ignored(board):
    c = board.add_celebration(title_he="x", milestone="practice_days")
    board.remove_celebration(c.id)
    assert board.evaluate("p1", stats(practice_days=5)) == []
    assert board.celebrations() == []
    assert board.celebrations(include_inactive=True)[0].id == c.id


def test_family_goal_suggestion_once_per_week(board):
    assert (
        board.evaluate_family(
            FamilyWeekStatus(date(2026, 10, 18), True, ("p1",), 1)
        )
        is None
    )  # no family goal set
    board.set_family_goal("ערב פיצה")
    not_met = FamilyWeekStatus(date(2026, 10, 18), False, ("p1",), 2)
    assert board.evaluate_family(not_met) is None
    met = FamilyWeekStatus(date(2026, 10, 18), True, ("p1", "p2"), 2)
    s = board.evaluate_family(met)
    assert s.profile_id is None
    assert s.source == "family_goal"
    assert "ערב פיצה" in board.family_goal.title_he
    assert board.evaluate_family(met) is None
    nxt = FamilyWeekStatus(date(2026, 10, 25), True, ("p1", "p2"), 2)
    assert board.evaluate_family(nxt) is not None


def test_round_trip_and_corruption(tmp_path):
    a = RewardsBoard(tmp_path, clock=Clock())
    a.set_mode("visible_goals")
    a.set_family_goal("ערב פיצה")
    c = a.add_celebration(title_he="x", milestone="practice_days")
    a.evaluate("p1", stats(practice_days=1))
    b = RewardsBoard(tmp_path, clock=Clock())
    assert b.mode is RewardsMode.VISIBLE_GOALS
    assert b.celebrations()[0].id == c.id
    assert len(b.pending()) == 1
    assert b.family_goal.title_he == "ערב פיצה"
    data = json.loads((tmp_path / "rewards.json").read_text("utf-8"))
    assert data["schema_version"] == 1
    (tmp_path / "rewards.json").write_text("garbage", "utf-8")
    (tmp_path / "rewards.json.bak").unlink(missing_ok=True)
    r = RewardsBoard(tmp_path, clock=Clock())
    assert r.recovered
    assert r.mode is RewardsMode.SURPRISE
    assert r.celebrations() == []
