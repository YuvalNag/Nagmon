import json
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import pytest

from nagmon.family.calendar import Location, ShabbatCalendar
from nagmon.family.screentime import (
    Action,
    Reason,
    ScreenLimits,
    ScreenTimePolicy,
    SessionTracker,
    TimeWindow,
)

TZ = ZoneInfo("Asia/Jerusalem")
JLM = ShabbatCalendar(Location.preset("jerusalem"))


def at(y, mo, d, h=12, mi=0, s=0, fold=0):
    return datetime(y, mo, d, h, mi, s, tzinfo=TZ, fold=fold)


# 2026-10-19 is a Monday, 2026-10-23 a Friday.
MON = (2026, 10, 19)
FRI = (2026, 10, 23)


def free_limits(**kw):
    """No windows, no bedtime, generous limit: only what the test sets."""
    base = dict(
        daily_max_minutes=None,
        weekday_windows=None,
        weekend_windows=None,
        bedtime=None,
        break_every_minutes=None,
    )
    base.update(kw)
    return ScreenLimits(**base)


@dataclass
class FakeRestriction:
    start: datetime
    end: datetime
    kind: str
    name_he: str


class FakeCalendar:
    def __init__(self, windows):
        self.windows = windows
        self.calls = []

    def next_restriction(self, now, *, shabbat=True, yom_tov=True):
        self.calls.append((shabbat, yom_tov))
        for w in self.windows:
            if w.kind == "shabbat" and not shabbat:
                continue
            if w.kind == "holiday" and not yom_tov:
                continue
            if now < w.end:
                return w
        return None


# ---------------------------------------------------------------- windows


def test_time_window_parse_and_str():
    w = TimeWindow.parse("16:00-19:30")
    assert (w.start, w.end) == (time(16), time(19, 30))
    assert str(w) == "16:00-19:30"
    assert w.contains(time(16))
    assert not w.contains(time(19, 30))
    with pytest.raises(ValueError):
        TimeWindow.parse("19:30-16:00")
    with pytest.raises(ValueError):
        TimeWindow.parse("nonsense")


def test_limits_round_trip():
    lim = ScreenLimits(daily_max_minutes=45, weekday_windows=("15:00-18:00",))
    assert ScreenLimits.from_dict(lim.to_dict()) == lim
    assert ScreenLimits.from_dict(free_limits().to_dict()) == free_limits()


def test_limits_defaults():
    lim = ScreenLimits()
    assert lim.warn_minutes == 5
    assert lim.grace_minutes == 3
    assert lim.break_every_minutes == 20
    assert lim.weekend_days == (4, 5)


def test_limits_from_bad_dict_uses_defaults():
    lim = ScreenLimits.from_dict(
        {"daily_max_minutes": "x", "weekday_windows": ["bad"], "bedtime": 5}
    )
    assert lim == ScreenLimits()


# ----------------------------------------------------------------- policy


def test_allow_warn_and_daily_limit():
    pol = ScreenTimePolicy(ScreenLimits(daily_max_minutes=60))
    d = pol.evaluate(at(*MON, 17), used_today_s=0)
    assert d.action is Action.ALLOW
    assert d.minutes_left == 60
    assert d.message_he == ""
    d = pol.evaluate(at(*MON, 17), used_today_s=56 * 60)
    assert d.action is Action.WARN_SOON
    assert d.minutes_left == 4
    assert "4" in d.message_he
    d = pol.evaluate(at(*MON, 17), used_today_s=60 * 60)
    assert d.action is Action.MUST_STOP
    assert d.reason is Reason.DAILY_LIMIT
    assert d.minutes_left == 0
    assert d.resume_at == at(2026, 10, 20, 16)
    assert d.message_he


def test_warn_exactly_five_minutes_before():
    pol = ScreenTimePolicy(free_limits(daily_max_minutes=30))
    assert pol.evaluate(at(*MON), 24 * 60).action is Action.ALLOW
    assert pol.evaluate(at(*MON), 25 * 60).action is Action.WARN_SOON


def test_outside_window_and_resume_time():
    pol = ScreenTimePolicy(ScreenLimits())
    d = pol.evaluate(at(*MON, 15), 0)
    assert d.action is Action.MUST_STOP
    assert d.reason is Reason.OUTSIDE_WINDOW
    assert d.resume_at == at(*MON, 16)
    assert "16:00" in d.message_he


def test_window_end_drives_warning():
    pol = ScreenTimePolicy(ScreenLimits(daily_max_minutes=None))
    d = pol.evaluate(at(*MON, 19, 25), 0)
    assert d.action is Action.WARN_SOON
    assert d.minutes_left == 5


def test_bedtime():
    pol = ScreenTimePolicy(ScreenLimits(weekday_windows=None))
    assert pol.evaluate(at(*MON, 20, 30), 0).reason is Reason.BEDTIME
    assert pol.evaluate(at(*MON, 5), 0).reason is Reason.BEDTIME
    assert pol.evaluate(at(*MON, 19, 0), 0).action is Action.ALLOW
    d = pol.evaluate(at(*MON, 20, 30), 0)
    assert d.resume_at == at(2026, 10, 20, 6)


def test_weekend_windows():
    pol = ScreenTimePolicy(ScreenLimits())
    assert pol.evaluate(at(*FRI, 10), 0).action is Action.ALLOW
    assert pol.evaluate(at(*MON, 10), 0).reason is Reason.OUTSIDE_WINDOW


def test_empty_windows_means_no_play():
    pol = ScreenTimePolicy(free_limits(weekday_windows=()))
    d = pol.evaluate(at(*MON, 17), 0)
    assert d.reason is Reason.OUTSIDE_WINDOW


def test_unlimited():
    pol = ScreenTimePolicy(free_limits())
    d = pol.evaluate(at(*MON, 3), 10 * 3600)
    assert d.action is Action.ALLOW
    assert d.minutes_left is None


def test_break_suggested():
    pol = ScreenTimePolicy(free_limits(break_every_minutes=20))
    assert pol.evaluate(at(*MON), 0, 19 * 60).action is Action.ALLOW
    d = pol.evaluate(at(*MON), 0, 20 * 60)
    assert d.action is Action.BREAK_SUGGESTED
    assert "5" in d.message_he


def test_priority_shabbat_over_everything():
    start = at(*FRI, 17)
    cal = FakeCalendar(
        [FakeRestriction(start, start + timedelta(hours=25), "shabbat", "שבת")]
    )
    pol = ScreenTimePolicy(ScreenLimits(daily_max_minutes=10), calendar=cal)
    d = pol.evaluate(at(2026, 10, 24, 12), 3600)
    assert d.reason is Reason.SHABBAT
    assert d.resume_at == start + timedelta(hours=25)


def test_restriction_lead_minutes_and_warning():
    start = at(*FRI, 17, 18)
    cal = FakeCalendar(
        [FakeRestriction(start, start + timedelta(hours=25), "shabbat", "שבת")]
    )
    pol = ScreenTimePolicy(free_limits(), calendar=cal, stop_before_minutes=10)
    assert pol.evaluate(at(*FRI, 16, 50), 0).action is Action.ALLOW
    d = pol.evaluate(at(*FRI, 17, 3), 0)
    assert d.action is Action.WARN_SOON
    assert d.minutes_left == 5
    d = pol.evaluate(at(*FRI, 17, 8), 0)
    assert d.action is Action.MUST_STOP
    assert d.reason is Reason.SHABBAT


def test_shabbat_mode_off_passes_flag():
    cal = FakeCalendar([])
    pol = ScreenTimePolicy(free_limits(), calendar=cal, shabbat=False)
    pol.evaluate(at(*FRI, 17), 0)
    assert cal.calls == [(False, True)]
    pol = ScreenTimePolicy(
        free_limits(), calendar=cal, shabbat=False, holidays=False
    )
    cal.calls.clear()
    pol.evaluate(at(*FRI, 17), 0)
    assert cal.calls == []


def test_holiday_reason_and_name_with_real_calendar():
    pol = ScreenTimePolicy(free_limits(), calendar=JLM)
    d = pol.evaluate(at(2027, 4, 22, 12), 0)
    assert d.reason is Reason.HOLIDAY
    assert "פסח" in d.message_he
    d = pol.evaluate(at(2026, 10, 24, 12), 0)
    assert d.reason is Reason.SHABBAT
    assert "שבת" in d.message_he


def test_naive_now_rejected():
    pol = ScreenTimePolicy(free_limits())
    with pytest.raises(ValueError):
        pol.evaluate(datetime(2026, 10, 19, 12), 0)


# ---------------------------------------------------------------- tracker


def make_tracker(tmp_path, limits, **kw):
    cal = kw.pop("calendar", None)
    lead = kw.pop("stop_before_minutes", 0)
    pol = ScreenTimePolicy(limits, calendar=cal, stop_before_minutes=lead)
    return SessionTracker(tmp_path, lambda pid: pol, tz=TZ, **kw)


def run(tracker, start, minutes, step_s=60, **tick_kw):
    """Tick once per step for `minutes`; return list of decisions."""
    out = []
    t = start
    end = start + timedelta(minutes=minutes)
    while t < end:
        t = t + timedelta(seconds=step_s)
        out.append(tracker.tick(t, **tick_kw))
    return out


def test_tracker_counts_usage(tmp_path):
    tr = make_tracker(tmp_path, free_limits())
    assert tr.start("p1", at(*MON, 17)).action is Action.ALLOW
    assert tr.active_profile == "p1"
    run(tr, at(*MON, 17), 10)
    tr.stop(at(*MON, 17, 10))
    assert tr.active_profile is None
    assert tr.used_seconds("p1", date(*MON)) == pytest.approx(600)


def test_tick_without_session_raises(tmp_path):
    tr = make_tracker(tmp_path, free_limits())
    with pytest.raises(RuntimeError):
        tr.tick(at(*MON))


def test_daily_limit_mid_session_with_grace(tmp_path):
    tr = make_tracker(tmp_path, free_limits(daily_max_minutes=30))
    tr.start("p1", at(*MON, 17))
    ds = run(tr, at(*MON, 17), 30)
    assert ds[24].action is Action.WARN_SOON  # 25 minutes used
    last = ds[-1]
    assert last.action is Action.MUST_STOP
    assert last.reason is Reason.DAILY_LIMIT
    assert last.grace_seconds == 180
    d = tr.tick(at(*MON, 17, 31))
    assert d.grace_seconds == 120
    d = tr.tick(at(*MON, 17, 33))
    assert d.grace_seconds == 0


def test_natural_break_ends_grace(tmp_path):
    tr = make_tracker(tmp_path, free_limits(daily_max_minutes=30))
    tr.start("p1", at(*MON, 17))
    run(tr, at(*MON, 17), 30)
    d = tr.tick(at(*MON, 17, 31), at_natural_break=True)
    assert d.action is Action.MUST_STOP
    assert d.grace_seconds == 0


def test_natural_break_before_limit_changes_nothing(tmp_path):
    tr = make_tracker(tmp_path, free_limits(daily_max_minutes=30))
    tr.start("p1", at(*MON, 17))
    d = tr.tick(at(*MON, 17, 1), at_natural_break=True)
    assert d.action is Action.ALLOW


def test_start_when_not_allowed_has_no_grace(tmp_path):
    tr = make_tracker(tmp_path, ScreenLimits())
    d = tr.start("p1", at(*MON, 21))
    assert d.action is Action.MUST_STOP
    assert d.reason is Reason.BEDTIME
    assert d.grace_seconds == 0


def test_shabbat_starts_during_session(tmp_path):
    limits = ScreenLimits(daily_max_minutes=120)
    tr = make_tracker(tmp_path, limits, calendar=JLM, stop_before_minutes=10)
    fri = date(*FRI)
    stop_at = JLM.candle_lighting(fri) - timedelta(minutes=10)
    start = stop_at - timedelta(minutes=30)
    assert tr.start("p1", start).action is Action.ALLOW
    ds = run(tr, start, 30)
    assert ds[24].action is Action.WARN_SOON
    assert ds[-1].action is Action.MUST_STOP
    assert ds[-1].reason is Reason.SHABBAT
    assert ds[-1].grace_seconds == 180
    assert ds[-1].resume_at == JLM.tzeit(date(2026, 10, 24))
    d = tr.tick(stop_at + timedelta(minutes=3))
    assert d.grace_seconds == 0
    # the stop (including grace) is still before candle lighting
    assert stop_at + timedelta(minutes=3) < JLM.candle_lighting(fri)
    tr.stop(stop_at + timedelta(minutes=3))
    again = tr.start("p1", stop_at + timedelta(minutes=5))
    assert again.action is Action.MUST_STOP
    assert again.grace_seconds == 0


def test_break_suggested_once_and_ack(tmp_path):
    tr = make_tracker(tmp_path, free_limits(break_every_minutes=20))
    tr.start("p1", at(*MON, 16))
    ds = run(tr, at(*MON, 16), 21)
    actions = [d.action for d in ds]
    assert actions.count(Action.BREAK_SUGGESTED) == 1
    assert ds[19].action is Action.BREAK_SUGGESTED
    assert ds[20].action is Action.ALLOW
    run(tr, at(*MON, 16, 21), 10)
    tr.ack_break(at(*MON, 16, 31))
    ds = run(tr, at(*MON, 16, 31), 19)
    assert Action.BREAK_SUGGESTED not in [d.action for d in ds]


def test_real_break_resets_break_counter(tmp_path):
    tr = make_tracker(tmp_path, free_limits(break_every_minutes=20))
    tr.start("p1", at(*MON, 16))
    run(tr, at(*MON, 16), 15)
    tr.stop(at(*MON, 16, 15))
    tr.start("p1", at(*MON, 16, 21))  # 6 minute break >= 5
    ds = run(tr, at(*MON, 16, 21), 15)
    assert Action.BREAK_SUGGESTED not in [d.action for d in ds]


def test_short_pause_does_not_reset_break_counter(tmp_path):
    tr = make_tracker(tmp_path, free_limits(break_every_minutes=20))
    tr.start("p1", at(*MON, 16))
    run(tr, at(*MON, 16), 15)
    tr.stop(at(*MON, 16, 15))
    tr.start("p1", at(*MON, 16, 17))
    ds = run(tr, at(*MON, 16, 17), 6)
    assert Action.BREAK_SUGGESTED in [d.action for d in ds]


def test_midnight_rollover_splits_usage(tmp_path):
    tr = make_tracker(tmp_path, free_limits(), max_tick_gap_s=3600)
    tr.start("p1", at(*MON, 23, 50))
    tr.tick(at(2026, 10, 20, 0, 10))
    assert tr.used_seconds("p1", date(*MON)) == pytest.approx(600)
    assert tr.used_seconds("p1", date(2026, 10, 20)) == pytest.approx(600)


def test_daily_limit_resets_after_midnight(tmp_path):
    tr = make_tracker(tmp_path, free_limits(daily_max_minutes=30))
    tr.start("p1", at(*MON, 23, 0))
    ds = run(tr, at(*MON, 23, 0), 30)
    assert ds[-1].action is Action.MUST_STOP
    tr.stop(at(*MON, 23, 33))
    d = tr.start("p1", at(2026, 10, 20, 0, 1))
    assert d.action is Action.ALLOW


def test_dst_autumn_counts_real_time(tmp_path):
    # 2026-10-25 02:00 IDT -> 01:00 IST: 01:30 happens twice.
    tr = make_tracker(tmp_path, free_limits(), max_tick_gap_s=7200)
    first = at(2026, 10, 25, 1, 30, fold=0)
    second = at(2026, 10, 25, 1, 30, fold=1)
    tr.start("p1", first)
    tr.tick(second)
    assert tr.used_seconds("p1", date(2026, 10, 25)) == pytest.approx(3600)


def test_dst_spring_counts_real_time(tmp_path):
    # 2027-03-26 02:00 IST -> 03:00 IDT
    tr = make_tracker(tmp_path, free_limits(), max_tick_gap_s=7200)
    tr.start("p1", at(2027, 3, 26, 1, 50))
    tr.tick(at(2027, 3, 26, 3, 10))
    assert tr.used_seconds("p1", date(2027, 3, 26)) == pytest.approx(1200)


def test_clock_moved_back_counts_zero(tmp_path):
    tr = make_tracker(tmp_path, free_limits())
    tr.start("p1", at(*MON, 17))
    tr.tick(at(*MON, 17, 1))
    tr.tick(at(*MON, 16, 50))  # clock set back
    tr.tick(at(*MON, 16, 51))
    assert tr.used_seconds("p1", date(*MON)) == pytest.approx(120)


def test_clock_jump_forward_is_capped(tmp_path):
    tr = make_tracker(tmp_path, free_limits(), max_tick_gap_s=120)
    tr.start("p1", at(*MON, 17))
    tr.tick(at(*MON, 22))
    assert tr.used_seconds("p1", date(*MON)) == pytest.approx(120)


def test_usage_persists(tmp_path):
    tr = make_tracker(tmp_path, free_limits())
    tr.start("p1", at(*MON, 17))
    run(tr, at(*MON, 17), 5)
    tr.stop(at(*MON, 17, 5))
    tr2 = make_tracker(tmp_path, free_limits())
    assert tr2.used_seconds("p1", date(*MON)) == pytest.approx(300)
    data = json.loads((tmp_path / "usage.json").read_text("utf-8"))
    assert data["schema_version"] == 1


def test_usage_corrupt_file_recovers(tmp_path):
    (tmp_path / "usage.json").write_text("{{{", "utf-8")
    tr = make_tracker(tmp_path, free_limits())
    assert tr.used_seconds("p1", date(*MON)) == 0
    assert list(tmp_path.glob("usage.json.corrupt-*"))


def test_old_days_are_pruned(tmp_path):
    tr = make_tracker(tmp_path, free_limits())
    tr.start("p1", at(2026, 8, 1, 17))
    tr.tick(at(2026, 8, 1, 17, 1))
    tr.stop(at(2026, 8, 1, 17, 1))
    tr.start("p1", at(*MON, 17))
    tr.tick(at(*MON, 17, 1))
    tr.stop(at(*MON, 17, 1))
    assert tr.used_seconds("p1", date(2026, 8, 1)) == 0
    assert tr.used_seconds("p1", date(*MON)) == pytest.approx(60)


def test_week_minutes(tmp_path):
    tr = make_tracker(tmp_path, free_limits())
    # Sunday 18th and Monday 19th count; Saturday 17th is last week
    for day in (17, 18, 19):
        tr.start("p1", at(2026, 10, day, 17))
        run(tr, at(2026, 10, day, 17), 10)
        tr.stop(at(2026, 10, day, 17, 10))
    assert tr.week_minutes("p1", at(*MON, 20)) == 20


def test_switching_profiles_stops_previous(tmp_path):
    tr = make_tracker(tmp_path, free_limits(), max_tick_gap_s=600)
    tr.start("p1", at(*MON, 17))
    tr.tick(at(*MON, 17, 5))
    tr.start("p2", at(*MON, 17, 6))
    tr.tick(at(*MON, 17, 8))
    assert tr.used_seconds("p1", date(*MON)) == pytest.approx(360)
    assert tr.used_seconds("p2", date(*MON)) == pytest.approx(120)
