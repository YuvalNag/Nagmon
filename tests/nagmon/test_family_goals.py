import dataclasses
import json
from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest
from nagmon.family.calendar import Location, ShabbatCalendar
from nagmon.family.goals import (
    PracticeLog,
    age_on,
    default_weekly_days,
    family_week_status,
    week_start,
)

TZ = ZoneInfo("Asia/Jerusalem")
JLM = ShabbatCalendar(Location.preset("jerusalem"))


def rest_day(d: date) -> bool:
    return JLM.is_restricted_day(d)


def at(y, mo, d, h=17):
    return datetime(y, mo, d, h, tzinfo=TZ)


@pytest.fixture
def log(tmp_path):
    return PracticeLog(tmp_path, tz=TZ)


def test_week_starts_on_sunday():
    assert week_start(date(2026, 10, 18)) == date(2026, 10, 18)  # Sunday
    assert week_start(date(2026, 10, 24)) == date(2026, 10, 18)  # Saturday
    assert week_start(date(2026, 10, 25)) == date(2026, 10, 25)


@pytest.mark.parametrize(
    "age,days", [(5, 3), (6, 3), (7, 3), (8, 4), (11, 4), (None, 3)]
)
def test_default_weekly_days(age, days):
    assert default_weekly_days(age) == days


def test_age_on():
    today = date(2026, 10, 18)
    assert age_on(today, birth_year=2019, grade=None) == 7
    assert age_on(today, birth_year=None, grade=3) == 9
    assert age_on(today, birth_year=None, grade=0) == 5
    assert age_on(today, birth_year=None, grade=None) is None


def test_record_once_per_day(log):
    assert log.record("p1", at(2026, 10, 18, 9)) is True
    assert log.record("p1", at(2026, 10, 18, 19)) is False
    assert log.practised_on("p1", date(2026, 10, 18))
    assert log.total_days("p1") == 1


def test_record_uses_local_date(log):
    # 23:30 UTC on the 18th is already the 19th in Israel
    log.record("p1", datetime(2026, 10, 18, 23, 30, tzinfo=ZoneInfo("UTC")))
    assert log.practised_on("p1", date(2026, 10, 19))


def test_weekly_status_regular_week(log):
    for d in (18, 20, 21):
        log.record("p1", at(2026, 10, d))
    st = log.weekly_status(
        "p1", at(2026, 10, 21), target_days=4, is_rest_day=rest_day
    )
    assert st.week_start == date(2026, 10, 18)
    assert st.practised_days == 3
    assert st.available_days == 6  # Shabbat excluded
    assert st.target_days == 4
    assert not st.met
    assert st.message_he
    log.record("p1", at(2026, 10, 22))
    st = log.weekly_status(
        "p1", at(2026, 10, 22), target_days=4, is_rest_day=rest_day
    )
    assert st.met


def test_holidays_shrink_the_denominator(log):
    # Pesach 2027 week: Thursday 22 Apr is Yom Tov, Saturday is Shabbat.
    st = log.weekly_status(
        "p1", at(2027, 4, 19), target_days=6, is_rest_day=rest_day
    )
    assert st.available_days == 5
    assert st.target_days == 5


def test_custom_rest_days_cap_target(log):
    rest = {date(2026, 10, d) for d in (19, 20, 21, 24)}
    st = log.weekly_status(
        "p1", at(2026, 10, 18), target_days=4, is_rest_day=rest.__contains__
    )
    assert st.available_days == 3
    assert st.target_days == 3


def test_no_streak_anywhere(log):
    st = log.weekly_status("p1", at(2026, 10, 24), target_days=3)
    names = [f.name for f in dataclasses.fields(st)]
    assert not any("streak" in n for n in names)
    for practised in range(0, 4):
        log2_status = dataclasses.replace(st, practised_days=practised)
        assert "רצף" not in log2_status.message_he
    assert "רצף" not in st.message_he
    assert "פספס" not in st.message_he


def test_weeks_met_counts_completed_weeks_only(log):
    # week of 4 Oct: 3 days; week of 11 Oct: 1 day; week of 18 Oct: 3 days
    for d in (4, 5, 6, 12, 18, 19, 20):
        log.record("p1", at(2026, 10, d))
    n = log.weeks_met(
        "p1", at(2026, 10, 21), target_days=3, is_rest_day=rest_day
    )
    assert n == 1  # current week is not complete yet
    n = log.weeks_met(
        "p1", at(2026, 10, 25), target_days=3, is_rest_day=rest_day
    )
    assert n == 2


def test_persistence_and_corruption(tmp_path):
    a = PracticeLog(tmp_path, tz=TZ)
    a.record("p1", at(2026, 10, 18))
    b = PracticeLog(tmp_path, tz=TZ)
    assert b.total_days("p1") == 1
    data = json.loads((tmp_path / "practice.json").read_text("utf-8"))
    assert data["schema_version"] == 1
    (tmp_path / "practice.json").write_text("nope", "utf-8")
    (tmp_path / "practice.json.bak").unlink(missing_ok=True)
    c = PracticeLog(tmp_path, tz=TZ)
    assert c.total_days("p1") == 0
    assert c.recovered


def test_family_week_needs_every_child(log):
    for d in (18, 19, 20):
        log.record("p1", at(2026, 10, d))
        log.record("p2", at(2026, 10, d))
    log.record("p3", at(2026, 10, 18))
    now = at(2026, 10, 21)
    statuses = {
        pid: log.weekly_status(pid, now, target_days=3, is_rest_day=rest_day)
        for pid in ("p1", "p2", "p3")
    }
    fam = family_week_status(statuses)
    assert not fam.met
    assert fam.children_met == ("p1", "p2")
    assert fam.children_total == 3
    for d in (19, 20):
        log.record("p3", at(2026, 10, d))
    statuses["p3"] = log.weekly_status(
        "p3", now, target_days=3, is_rest_day=rest_day
    )
    fam = family_week_status(statuses)
    assert fam.met
    assert fam.week_start == date(2026, 10, 18)


def test_family_week_empty_is_not_met():
    assert not family_week_status({}).met


def test_target_must_be_positive(log):
    with pytest.raises(ValueError):
        log.weekly_status("p1", at(2026, 10, 18), target_days=0)
    with pytest.raises(ValueError):
        log.weekly_status("p1", at(2026, 10, 18), target_days=8)


def test_naive_now_rejected(log):
    with pytest.raises(ValueError):
        log.record("p1", datetime(2026, 10, 18, 12))
