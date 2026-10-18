"""Shabbat, Yom Tov and the Hebrew/Israeli holiday calendar.

Uses ``pyluach`` (Hebrew dates, holidays, fast-day postponements) and
``astral`` (sunset and solar depression). Both are pure Python and work
offline. ``zoneinfo`` needs the ``tzdata`` package on Windows.

* Candle lighting = sea-level sunset - ``candle_minutes``.
* Tzeit (end of Shabbat / Yom Tov) = sun 8.5 degrees below the horizon,
  or ``tzeit_fixed_minutes`` after sunset when set.
* A run of consecutive restricted days (e.g. Yom Tov on Friday joined to
  Shabbat) is a single restriction window, from candle lighting on the
  eve of the first day to tzeit of the last day.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from functools import lru_cache
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from astral import Observer
from astral.sun import SunDirection, sunset, time_at_elevation
from pyluach import dates as hdates

HolidayCategory = Literal["yom_tov", "chol_hamoed", "minor", "fast", "modern"]
RestrictionKind = Literal["shabbat", "holiday"]


# ------------------------------------------------------------------ location


@dataclass(frozen=True)
class Location:
    lat: float
    lon: float
    tz: str
    city_he: str
    candle_minutes: int = 18
    tzeit_degrees: float = 8.5
    tzeit_fixed_minutes: int | None = None

    def __post_init__(self) -> None:
        if not -90 <= float(self.lat) <= 90:
            raise ValueError("lat out of range")
        if not -180 <= float(self.lon) <= 180:
            raise ValueError("lon out of range")
        try:
            ZoneInfo(self.tz)
        except (ZoneInfoNotFoundError, ValueError) as e:
            raise ValueError(f"unknown time zone {self.tz!r}") from e
        if not 0 <= int(self.candle_minutes) <= 90:
            raise ValueError("candle_minutes out of range")

    @property
    def zone(self) -> ZoneInfo:
        return ZoneInfo(self.tz)

    def with_(self, **changes: Any) -> Location:
        return dataclasses.replace(self, **changes)

    @classmethod
    def preset(cls, key: str) -> Location:
        return PRESETS[key]

    def to_dict(self) -> dict[str, Any]:
        return dataclasses.asdict(self)

    @classmethod
    def from_dict(cls, d: Any) -> Location:
        """Build from a dict; raise ``ValueError`` on bad data."""
        if not isinstance(d, dict):
            raise ValueError("location must be a dict")
        try:
            fixed = d.get("tzeit_fixed_minutes")
            return cls(
                lat=float(d["lat"]),
                lon=float(d["lon"]),
                tz=str(d["tz"]),
                city_he=str(d["city_he"]),
                candle_minutes=int(d.get("candle_minutes", 18)),
                tzeit_degrees=float(d.get("tzeit_degrees", 8.5)),
                tzeit_fixed_minutes=None if fixed is None else int(fixed),
            )
        except (KeyError, TypeError) as e:
            raise ValueError(f"bad location: {e}") from e


_IL = "Asia/Jerusalem"
PRESETS: dict[str, Location] = {
    # Coordinates as used by hebcal.com (GeoNames).
    "jerusalem": Location(31.76904, 35.21633, _IL, "ירושלים", 40),
    "haifa": Location(32.81841, 34.9885, _IL, "חיפה", 30),
    "petah_tikva": Location(32.08707, 34.88747, _IL, "פתח תקווה", 20),
    "tel_aviv": Location(32.08088, 34.78057, _IL, "תל אביב", 18),
    "bnei_brak": Location(32.08074, 34.8338, _IL, "בני ברק", 18),
    "beer_sheva": Location(31.25181, 34.7913, _IL, "באר שבע", 18),
    "modiin": Location(31.89385, 35.01504, _IL, "מודיעין", 18),
    "beit_shemesh": Location(31.73072, 34.99293, _IL, "בית שמש", 18),
    "ashdod": Location(31.79213, 34.64966, _IL, "אשדוד", 18),
    "netanya": Location(32.33291, 34.85992, _IL, "נתניה", 18),
}


# ------------------------------------------------------------------ holidays


@dataclass(frozen=True)
class Holiday:
    date: date
    key: str
    name_he: str
    name_en: str
    category: HolidayCategory
    day: int | None = None
    is_yom_tov: bool = False
    is_fast: bool = False
    is_tisha_bav: bool = False
    solemn: bool = False


# pyluach English name -> (key, name_he, name_en, category)
_PYLUACH: dict[str, tuple[str, str, str, HolidayCategory]] = {
    "Rosh Hashana": ("rosh_hashana", "ראש השנה", "Rosh Hashana", "yom_tov"),
    "Yom Kippur": ("yom_kippur", "יום כיפור", "Yom Kippur", "yom_tov"),
    "Succos": ("sukkot", "סוכות", "Sukkot", "yom_tov"),
    "Shmini Atzeres": (
        "simchat_torah",
        "שמיני עצרת ושמחת תורה",
        "Shmini Atzeret / Simchat Torah",
        "yom_tov",
    ),
    "Simchas Torah": (
        "simchat_torah",
        "שמחת תורה",
        "Simchat Torah",
        "yom_tov",
    ),
    "Chanuka": ("hanukkah", "חנוכה", "Hanukkah", "minor"),
    "Tu B'shvat": ("tu_bishvat", "ט״ו בשבט", "Tu BiShvat", "minor"),
    "Purim": ("purim", "פורים", "Purim", "minor"),
    "Shushan Purim": ("shushan_purim", "שושן פורים", "Shushan Purim", "minor"),
    "Pesach": ("pesach", "פסח", "Pesach", "yom_tov"),
    "Lag Ba'omer": ("lag_baomer", "ל״ג בעומר", "Lag BaOmer", "minor"),
    "Shavuos": ("shavuot", "שבועות", "Shavuot", "yom_tov"),
    "Tu B'av": ("tu_bav", "ט״ו באב", "Tu BeAv", "minor"),
    "Tzom Gedalia": ("tzom_gedalia", "צום גדליה", "Tzom Gedalia", "fast"),
    "10 of Teves": ("asara_btevet", "עשרה בטבת", "10 Tevet", "fast"),
    "Taanis Esther": ("taanit_esther", "תענית אסתר", "Taanit Esther", "fast"),
    "17 of Tamuz": (
        "shiva_asar_btamuz",
        "י״ז בתמוז",
        "17 Tammuz",
        "fast",
    ),
    "9 of Av": ("tisha_bav", "תשעה באב", "Tisha B'Av", "fast"),
}

# first day (Hebrew month, day) of multi-day holidays, for day numbering
_FIRST_DAY = {"Succos": (7, 15), "Pesach": (1, 15), "Rosh Hashana": (7, 1)}


def _heb(d: date) -> hdates.HebrewDate:
    return hdates.GregorianDate(d.year, d.month, d.day).to_heb()


def _greg(year: int, month: int, day: int) -> date:
    return hdates.HebrewDate(year, month, day).to_pydate()


def _modern_holidays(hyear: int) -> list[Holiday]:
    """Israeli national days for Hebrew year ``hyear`` (Nisan/Iyar)."""
    out: list[Holiday] = []
    # Yom HaShoah: 27 Nisan; Friday -> Thursday, Sunday -> Monday.
    shoah = _greg(hyear, 1, 27)
    if shoah.weekday() == 4:
        shoah -= timedelta(days=1)
    elif shoah.weekday() == 6:
        shoah += timedelta(days=1)
    out.append(
        Holiday(
            shoah,
            "yom_hashoah",
            "יום השואה",
            "Yom HaShoah",
            "modern",
            solemn=True,
        )
    )
    # Yom HaAtzmaut: 5 Iyar; Fri -> Thu, Sat -> Thu, Mon -> Tue.
    atz = _greg(hyear, 2, 5)
    shift = {4: -1, 5: -2, 0: 1}.get(atz.weekday(), 0)
    atz += timedelta(days=shift)
    out.append(
        Holiday(
            atz - timedelta(days=1),
            "yom_hazikaron",
            "יום הזיכרון",
            "Yom HaZikaron",
            "modern",
            solemn=True,
        )
    )
    out.append(
        Holiday(atz, "yom_haatzmaut", "יום העצמאות", "Yom HaAtzmaut", "modern")
    )
    out.append(
        Holiday(
            _greg(hyear, 2, 28),
            "yom_yerushalayim",
            "יום ירושלים",
            "Yom Yerushalayim",
            "modern",
        )
    )
    return out


@lru_cache(maxsize=8)
def _modern_for_year(gyear: int) -> tuple[Holiday, ...]:
    # Nisan/Iyar of Hebrew year (gyear + 3760) fall in Gregorian gyear.
    return tuple(_modern_holidays(gyear + 3760))


@lru_cache(maxsize=2048)
def _holidays_on(d: date, israel: bool) -> tuple[Holiday, ...]:
    g = hdates.GregorianDate(d.year, d.month, d.day)
    out: list[Holiday] = []
    name = g.holiday(israel=israel)
    if name in _PYLUACH:
        key, he, en, cat = _PYLUACH[name]
        yom_tov = g.festival(israel=israel, include_working_days=False)
        is_yt = yom_tov is not None
        day: int | None = None
        if name == "Chanuka":
            # pyluach's prefixed name starts with the day number
            prefixed = g.holiday(israel=israel, prefix_day=True) or ""
            day = int(prefixed.split()[0])
        elif name in _FIRST_DAY:
            h = g.to_heb()
            m, first = _FIRST_DAY[name]
            day = h.day - first + 1
        if cat == "yom_tov" and not is_yt:
            cat = "chol_hamoed"
        out.append(
            Holiday(
                d,
                key,
                he,
                en,
                cat,
                day=day,
                is_yom_tov=is_yt,
                is_fast=cat == "fast" or key == "yom_kippur",
                is_tisha_bav=key == "tisha_bav",
                solemn=cat == "fast",
            )
        )
    out.extend(h for h in _modern_for_year(d.year) if h.date == d)
    return tuple(out)


# --------------------------------------------------------------- restriction


@dataclass(frozen=True)
class Restriction:
    start: datetime
    end: datetime
    days: tuple[date, ...]
    kind: RestrictionKind
    name_he: str

    def contains(self, now: datetime) -> bool:
        return self.start <= now < self.end


def _require_aware(now: datetime) -> None:
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("now must be a timezone-aware datetime")


class ShabbatCalendar:
    """Shabbat / Yom Tov times and the holiday list for one location."""

    def __init__(self, location: Location, *, israel: bool = True) -> None:
        self.location = location
        self.israel = israel
        self._zone = location.zone
        self._observer = Observer(location.lat, location.lon, 0.0)

    # -- times

    def sunset(self, d: date) -> datetime:
        return sunset(self._observer, d, tzinfo=self._zone)

    def candle_lighting(self, d: date) -> datetime:
        return self.sunset(d) - timedelta(minutes=self.location.candle_minutes)

    def tzeit(self, d: date) -> datetime:
        fixed = self.location.tzeit_fixed_minutes
        if fixed is not None:
            return self.sunset(d) + timedelta(minutes=fixed)
        return time_at_elevation(
            self._observer,
            -self.location.tzeit_degrees,
            d,
            SunDirection.SETTING,
            tzinfo=self._zone,
        )

    # -- days

    def holidays_on(self, d: date) -> list[Holiday]:
        return list(_holidays_on(d, self.israel))

    def is_yom_tov(self, d: date) -> bool:
        return any(h.is_yom_tov for h in _holidays_on(d, self.israel))

    def is_restricted_day(
        self, d: date, *, shabbat: bool = True, yom_tov: bool = True
    ) -> bool:
        return (shabbat and d.weekday() == 5) or (
            yom_tov and self.is_yom_tov(d)
        )

    def upcoming_holidays(self, start: date, days: int = 60) -> list[Holiday]:
        out: list[Holiday] = []
        for i in range(days):
            out.extend(_holidays_on(start + timedelta(days=i), self.israel))
        return out

    # -- windows

    def _window_for(
        self, d: date, shabbat: bool, yom_tov: bool
    ) -> Restriction:
        """Window of the block of restricted days that contains ``d``."""
        first = last = d
        while self.is_restricted_day(
            first - timedelta(days=1), shabbat=shabbat, yom_tov=yom_tov
        ):
            first -= timedelta(days=1)
        while self.is_restricted_day(
            last + timedelta(days=1), shabbat=shabbat, yom_tov=yom_tov
        ):
            last += timedelta(days=1)
        days = tuple(
            first + timedelta(days=i) for i in range((last - first).days + 1)
        )
        start = self.candle_lighting(first - timedelta(days=1))
        end = self.tzeit(last)
        return Restriction(start, end, days, "shabbat", "שבת")

    def _label(
        self, r: Restriction, now: datetime, yom_tov: bool
    ) -> Restriction:
        local = now.astimezone(self._zone)
        day = local.date()
        if local >= self.sunset(day):
            day += timedelta(days=1)
        day = min(max(day, r.days[0]), r.days[-1])
        if yom_tov:
            for h in _holidays_on(day, self.israel):
                if h.is_yom_tov:
                    return dataclasses.replace(
                        r, kind="holiday", name_he=h.name_he
                    )
        return r

    def restriction_at(
        self, now: datetime, *, shabbat: bool = True, yom_tov: bool = True
    ) -> Restriction | None:
        _require_aware(now)
        if not (shabbat or yom_tov):
            return None
        local = now.astimezone(self._zone)
        # A window can only involve today's or tomorrow's civil date.
        for d in (local.date(), local.date() + timedelta(days=1)):
            for cand in (d, d - timedelta(days=1)):
                if self.is_restricted_day(
                    cand, shabbat=shabbat, yom_tov=yom_tov
                ):
                    r = self._window_for(cand, shabbat, yom_tov)
                    if r.contains(now):
                        return self._label(r, now, yom_tov)
        return None

    def is_restricted(
        self, now: datetime, *, shabbat: bool = True, yom_tov: bool = True
    ) -> bool:
        return (
            self.restriction_at(now, shabbat=shabbat, yom_tov=yom_tov)
            is not None
        )

    def next_restriction(
        self, now: datetime, *, shabbat: bool = True, yom_tov: bool = True
    ) -> Restriction | None:
        """The current restriction window, or the next one to start."""
        current = self.restriction_at(now, shabbat=shabbat, yom_tov=yom_tov)
        if current is not None:
            return current
        if not (shabbat or yom_tov):
            return None
        d = now.astimezone(self._zone).date()
        for i in range(0, 15 if shabbat else 400):
            cand = d + timedelta(days=i)
            if self.is_restricted_day(cand, shabbat=shabbat, yom_tov=yom_tov):
                r = self._window_for(cand, shabbat, yom_tov)
                if r.end > now:
                    return self._label(r, r.start, yom_tov)
        return None
