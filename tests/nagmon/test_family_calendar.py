"""Calendar tests.

Reference times (Jerusalem, 40 min candle lighting, havdalah at 8.5 deg):
- Fri 2026-05-22 (Shavuot + Shabbat): candle lighting 18:53, Shabbat ends
  Sat 20:15 (published by the Jerusalem Post holiday listing, which uses
  the hebcal.com algorithm).
- Fri 2026-12-04 (first night of Hanukkah): candle lighting 15:54
  (universaltimedate.com Hanukkah 2026 table).
hebcal.com itself was not reachable from the build sandbox, so the values
above are copied from pages that quote it. Tolerance is +-3 minutes.
"""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from nagmon.family.calendar import Location, ShabbatCalendar

TZ = ZoneInfo("Asia/Jerusalem")
JLM = ShabbatCalendar(Location.preset("jerusalem"))
TLV = ShabbatCalendar(Location.preset("tel_aviv"))

PUBLISHED = [
    # (kind, date, "HH:MM")
    ("candles", date(2026, 5, 22), "18:53"),
    ("havdalah", date(2026, 5, 23), "20:15"),
    ("candles", date(2026, 12, 4), "15:54"),
]


def at(y, mo, d, h=12, mi=0, fold=0):
    return datetime(y, mo, d, h, mi, tzinfo=TZ, fold=fold)


def minutes_between(a: datetime, b: datetime) -> float:
    return abs(a.timestamp() - b.timestamp()) / 60


@pytest.mark.parametrize("kind,day,hhmm", PUBLISHED)
def test_jerusalem_matches_published_times(kind, day, hhmm):
    h, m = map(int, hhmm.split(":"))
    expected = datetime(day.year, day.month, day.day, h, m, tzinfo=TZ)
    got = JLM.candle_lighting(day) if kind == "candles" else JLM.tzeit(day)
    assert minutes_between(got, expected) <= 3


def test_candle_lighting_is_sunset_minus_minutes():
    d = date(2026, 10, 23)
    assert JLM.sunset(d) - JLM.candle_lighting(d) == timedelta(minutes=40)
    assert TLV.sunset(d) - TLV.candle_lighting(d) == timedelta(minutes=18)


def test_times_are_local_aware():
    c = JLM.candle_lighting(date(2026, 10, 23))
    assert c.tzinfo is not None
    assert c.utcoffset() == timedelta(hours=3)  # still summer time
    c = JLM.candle_lighting(date(2026, 10, 30))
    assert c.utcoffset() == timedelta(hours=2)


def test_fixed_tzeit_mode():
    loc = Location.preset("jerusalem").with_(tzeit_fixed_minutes=40)
    cal = ShabbatCalendar(loc)
    d = date(2026, 10, 24)
    assert cal.tzeit(d) - cal.sunset(d) == timedelta(minutes=40)


def test_degree_tzeit_is_after_sunset():
    d = date(2026, 10, 24)
    delta = JLM.tzeit(d) - JLM.sunset(d)
    assert timedelta(minutes=25) < delta < timedelta(minutes=50)


def test_regular_shabbat_window():
    fri = date(2026, 10, 23)
    sat = date(2026, 10, 24)
    candle = JLM.candle_lighting(fri)
    tzeit = JLM.tzeit(sat)
    assert not JLM.is_restricted(at(2026, 10, 23, 12))
    assert not JLM.is_restricted(candle - timedelta(minutes=1))
    assert JLM.is_restricted(candle + timedelta(minutes=1))
    assert JLM.is_restricted(at(2026, 10, 24, 12))
    assert JLM.is_restricted(tzeit - timedelta(minutes=1))
    assert not JLM.is_restricted(tzeit + timedelta(minutes=1))
    r = JLM.restriction_at(at(2026, 10, 24, 12))
    assert r.kind == "shabbat"
    assert r.days == (sat,)
    assert r.start == candle
    assert r.end == tzeit
    assert r.name_he == "שבת"


def test_shabbat_disabled():
    assert not JLM.is_restricted(at(2026, 10, 24, 12), shabbat=False)


def test_naive_datetime_rejected():
    with pytest.raises(ValueError):
        JLM.is_restricted(datetime(2026, 10, 24, 12))


def test_other_timezone_input_is_converted():
    utc_noon = datetime(2026, 10, 24, 9, 0, tzinfo=ZoneInfo("UTC"))
    assert JLM.is_restricted(utc_noon)


def test_hanukkah_2026():
    days = [
        h
        for h in JLM.upcoming_holidays(date(2026, 11, 25), days=30)
        if h.key == "hanukkah"
    ]
    assert [h.date for h in days] == [
        date(2026, 12, 5) + timedelta(days=i) for i in range(8)
    ]
    assert [h.day for h in days] == list(range(1, 9))
    assert all(h.name_he == "חנוכה" for h in days)
    assert not any(h.is_yom_tov for h in days)
    # Hanukkah is not a restricted day
    assert not JLM.is_restricted(at(2026, 12, 7, 12))


def test_pesach_2027():
    pesach = [
        h
        for h in JLM.upcoming_holidays(date(2027, 4, 1), days=40)
        if h.key == "pesach"
    ]
    assert pesach[0].date == date(2027, 4, 22)
    assert len(pesach) == 7
    assert [h.is_yom_tov for h in pesach] == [
        True,
        False,
        False,
        False,
        False,
        False,
        True,
    ]
    assert [h.category for h in pesach[1:6]] == ["chol_hamoed"] * 5
    assert JLM.is_yom_tov(date(2027, 4, 22))
    assert not JLM.is_yom_tov(date(2027, 4, 23))
    assert JLM.is_restricted(at(2027, 4, 22, 12))
    assert not JLM.is_restricted(at(2027, 4, 25, 12))
    assert JLM.is_restricted(at(2027, 4, 28, 12))
    r = JLM.restriction_at(at(2027, 4, 22, 12))
    assert r.kind == "holiday"
    assert r.name_he == "פסח"
    assert r.start == JLM.candle_lighting(date(2027, 4, 21))
    assert r.end == JLM.tzeit(date(2027, 4, 22))


def test_holiday_mode_off_ignores_yom_tov_but_not_shabbat():
    assert not JLM.is_restricted(at(2027, 4, 22, 12), yom_tov=False)
    assert JLM.is_restricted(at(2026, 10, 24, 12), yom_tov=False)


def test_rosh_hashana_two_days_one_window():
    r = JLM.restriction_at(at(2027, 10, 3, 12))
    assert r.days == (date(2027, 10, 2), date(2027, 10, 3))
    assert r.start == JLM.candle_lighting(date(2027, 10, 1))
    assert r.end == JLM.tzeit(date(2027, 10, 3))
    assert r.kind == "holiday"
    assert r.name_he == "ראש השנה"


def test_sukkot_chol_hamoed_is_open_and_shmini_atzeret_closed():
    assert JLM.is_restricted(at(2026, 9, 26, 12))  # Sukkot day 1 (Sat)
    assert not JLM.is_restricted(at(2026, 9, 28, 12))  # chol hamoed
    assert JLM.is_yom_tov(date(2026, 10, 3))  # Shmini Atzeret
    names = [h.key for h in JLM.holidays_on(date(2026, 10, 3))]
    assert "simchat_torah" in names


def test_yom_kippur_weekday():
    assert JLM.is_yom_tov(date(2027, 10, 11))
    r = JLM.restriction_at(at(2027, 10, 11, 10))
    assert r.name_he == "יום כיפור"
    hk = JLM.holidays_on(date(2027, 10, 11))[0]
    assert hk.is_fast and hk.is_yom_tov


def test_yom_tov_joined_to_shabbat_is_one_window():
    # Shavuot 2026 falls on Friday, followed by Shabbat.
    r = JLM.restriction_at(at(2026, 5, 22, 12))
    assert r.days == (date(2026, 5, 22), date(2026, 5, 23))
    assert r.start == JLM.candle_lighting(date(2026, 5, 21))
    assert r.end == JLM.tzeit(date(2026, 5, 23))
    assert r.kind == "holiday"
    assert r.name_he == "שבועות"
    r2 = JLM.restriction_at(at(2026, 5, 23, 12))
    assert r2.kind == "shabbat"
    assert (r2.start, r2.end) == (r.start, r.end)
    # Friday evening, after sunset: already the Shabbat part.
    evening = JLM.sunset(date(2026, 5, 22)) + timedelta(minutes=5)
    assert JLM.restriction_at(evening).kind == "shabbat"


def test_shavuot_only_when_shabbat_mode_off():
    r = JLM.restriction_at(at(2026, 5, 22, 12), shabbat=False)
    assert r.days == (date(2026, 5, 22),)
    assert not JLM.is_restricted(at(2026, 5, 23, 12), shabbat=False)


def test_next_restriction():
    r = JLM.next_restriction(at(2026, 10, 20, 9))
    assert r.days == (date(2026, 10, 24),)
    assert r.start == JLM.candle_lighting(date(2026, 10, 23))
    # inside a window: returns the current one
    cur = JLM.next_restriction(at(2026, 10, 24, 9))
    assert cur.days == (date(2026, 10, 24),)
    # right after havdalah: the next week
    after = JLM.tzeit(date(2026, 10, 24)) + timedelta(minutes=1)
    assert JLM.next_restriction(after).days == (date(2026, 10, 31),)


def test_next_restriction_none_when_everything_disabled():
    assert (
        JLM.next_restriction(at(2026, 10, 20), shabbat=False, yom_tov=False)
        is None
    )


@pytest.mark.parametrize(
    "year,atzmaut",
    [
        (2022, date(2022, 5, 5)),  # 5 Iyar on Friday -> Thursday
        (2024, date(2024, 5, 14)),  # Monday -> Tuesday
        (2025, date(2025, 5, 1)),  # Shabbat -> Thursday
        (2026, date(2026, 4, 22)),  # Wednesday, no change
    ],
)
def test_yom_haatzmaut_and_zikaron(year, atzmaut):
    hols = JLM.upcoming_holidays(date(year, 4, 1), days=60)
    by_key = {h.key: h for h in hols}
    assert by_key["yom_haatzmaut"].date == atzmaut
    assert by_key["yom_hazikaron"].date == atzmaut - timedelta(days=1)
    assert by_key["yom_hazikaron"].solemn
    assert by_key["yom_haatzmaut"].name_he == "יום העצמאות"
    assert not by_key["yom_haatzmaut"].solemn


def test_yom_hashoah_2025_moved_from_friday():
    hols = JLM.upcoming_holidays(date(2025, 4, 1), days=40)
    shoah = [h for h in hols if h.key == "yom_hashoah"]
    assert [h.date for h in shoah] == [date(2025, 4, 24)]


def test_yom_yerushalayim_2026():
    hols = JLM.holidays_on(date(2026, 5, 15))
    assert "yom_yerushalayim" in [h.key for h in hols]


def test_upcoming_holidays_year_overview():
    hols = JLM.upcoming_holidays(date(2026, 9, 1), days=365)
    first = {}
    for h in hols:
        first.setdefault(h.key, h)
    expected = {
        "rosh_hashana": date(2026, 9, 12),
        "tzom_gedalia": date(2026, 9, 14),
        "yom_kippur": date(2026, 9, 21),
        "sukkot": date(2026, 9, 26),
        "simchat_torah": date(2026, 10, 3),
        "hanukkah": date(2026, 12, 5),
        "asara_btevet": date(2026, 12, 20),
        "tu_bishvat": date(2027, 1, 23),
        "taanit_esther": date(2027, 3, 22),
        "purim": date(2027, 3, 23),
        "shushan_purim": date(2027, 3, 24),
        "pesach": date(2027, 4, 22),
        "yom_haatzmaut": date(2027, 5, 12),
        "lag_baomer": date(2027, 5, 25),
        "shavuot": date(2027, 6, 11),
        "shiva_asar_btamuz": date(2027, 7, 22),
        "tisha_bav": date(2027, 8, 12),
    }
    for key, d in expected.items():
        assert first[key].date == d, key
    assert all(h.name_he for h in hols)
    assert all(not h.name_he.isascii() for h in hols)
    tb = first["tisha_bav"]
    assert tb.is_tisha_bav and tb.is_fast and tb.solemn
    assert first["tzom_gedalia"].is_fast
    assert first["tzom_gedalia"].category == "fast"
    assert first["purim"].category == "minor"
    assert first["yom_haatzmaut"].category == "modern"
    assert not any(h.key == "purim_katan" for h in hols)
    dates = [h.date for h in hols]
    assert dates == sorted(dates)


def test_diaspora_second_day():
    loc = Location(
        lat=40.7128,
        lon=-74.006,
        tz="America/New_York",
        city_he="ניו יורק",
        candle_minutes=18,
    )
    cal = ShabbatCalendar(loc, israel=False)
    assert cal.is_yom_tov(date(2027, 4, 23))
    assert not JLM.is_yom_tov(date(2027, 4, 23))


def test_location_round_trip_and_validation():
    loc = Location.preset("haifa")
    assert Location.from_dict(loc.to_dict()) == loc
    with pytest.raises(ValueError):
        Location(lat=100, lon=0, tz="Asia/Jerusalem", city_he="x")
    with pytest.raises(ValueError):
        Location(lat=0, lon=0, tz="Not/AZone", city_he="x")
