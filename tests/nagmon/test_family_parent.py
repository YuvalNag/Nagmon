import json
import os
import random
import stat
import sys

import pytest
from nagmon.family.calendar import Location
from nagmon.family.parent import (
    LOCKOUT_SECONDS,
    MAX_ATTEMPTS,
    MIN_PBKDF2_ITERATIONS,
    PBKDF2_ITERATIONS,
    AIConfig,
    ParentSettings,
    ParentStore,
    PinError,
    make_gate_challenge,
    redact,
    scrub,
)
from nagmon.family.screentime import ScreenLimits


class Clock:
    def __init__(self, t: float = 1_000_000.0) -> None:
        self.t = t

    def __call__(self) -> float:
        return self.t


@pytest.fixture
def clock():
    return Clock()


@pytest.fixture
def store(tmp_path, clock):
    return ParentStore(tmp_path, clock=clock)


def test_defaults(store):
    s = store.settings
    assert s.location.city_he == "ירושלים"
    assert s.location.tz == "Asia/Jerusalem"
    assert s.location.candle_minutes == 40
    assert s.shabbat_mode is True
    assert s.holiday_mode is True
    assert s.values.modesty_filter is True
    assert s.ai.provider == "none"
    assert not store.has_pin()


def test_location_presets():
    assert Location.preset("jerusalem").candle_minutes == 40
    assert Location.preset("haifa").candle_minutes == 30
    assert Location.preset("tel_aviv").candle_minutes == 18
    with pytest.raises(KeyError):
        Location.preset("atlantis")


def test_iterations_constant():
    assert PBKDF2_ITERATIONS >= MIN_PBKDF2_ITERATIONS >= 200_000


def test_weak_iterations_rejected(tmp_path):
    with pytest.raises(ValueError):
        ParentStore(tmp_path, iterations=1000)


def test_set_and_verify_pin(store, tmp_path):
    store.set_pin("4821")
    assert store.has_pin()
    assert store.verify_pin("4821").ok
    assert not store.verify_pin("1111").ok
    raw = (tmp_path / "parent.json").read_text("utf-8")
    assert "4821" not in raw
    data = json.loads(raw)
    assert data["pin_iterations"] >= 200_000
    assert len(bytes.fromhex(data["pin_salt"])) == 16


def test_salt_is_random(tmp_path, clock):
    a = ParentStore(tmp_path / "a", clock=clock)
    b = ParentStore(tmp_path / "b", clock=clock)
    a.set_pin("1234")
    b.set_pin("1234")
    assert a.settings.pin_salt != b.settings.pin_salt
    assert a.settings.pin_hash != b.settings.pin_hash


def test_pin_persists(tmp_path, clock):
    ParentStore(tmp_path, clock=clock).set_pin("123456")
    assert ParentStore(tmp_path, clock=clock).verify_pin("123456").ok


@pytest.mark.parametrize("pin", ["123", "123456789", "12a4", "", " 1234"])
def test_invalid_pin_format(store, pin):
    with pytest.raises(PinError):
        store.set_pin(pin)


def test_change_pin_requires_current(store):
    store.set_pin("1234")
    with pytest.raises(PinError):
        store.set_pin("5678")
    with pytest.raises(PinError):
        store.set_pin("5678", current="0000")
    store.set_pin("5678", current="1234")
    assert store.verify_pin("5678").ok


def test_verify_without_pin_set(store):
    res = store.verify_pin("1234")
    assert not res.ok


def test_lockout_after_five_wrong(store, clock):
    store.set_pin("1234")
    assert MAX_ATTEMPTS == 5
    assert LOCKOUT_SECONDS == 60
    for i in range(4):
        res = store.verify_pin("0000")
        assert not res.ok and not res.locked
        assert res.attempts_left == 4 - i
    res = store.verify_pin("0000")
    assert res.locked
    assert res.retry_after_s == pytest.approx(60)
    # correct PIN while locked is refused
    clock.t += 30
    res = store.verify_pin("1234")
    assert not res.ok and res.locked
    assert res.retry_after_s == pytest.approx(30)
    clock.t += 31
    res = store.verify_pin("1234")
    assert res.ok
    assert store.settings.failed_attempts == 0


def test_success_resets_counter(store):
    store.set_pin("1234")
    for _ in range(4):
        store.verify_pin("0000")
    assert store.verify_pin("1234").ok
    for _ in range(4):
        assert not store.verify_pin("0000").locked


def test_lockout_persists_across_restart(tmp_path, clock):
    s = ParentStore(tmp_path, clock=clock)
    s.set_pin("1234")
    for _ in range(5):
        s.verify_pin("0000")
    s2 = ParentStore(tmp_path, clock=clock)
    assert s2.verify_pin("1234").locked


def test_clock_moved_back_does_not_extend_lockout(store, clock):
    store.set_pin("1234")
    for _ in range(5):
        store.verify_pin("0000")
    clock.t -= 10_000
    res = store.verify_pin("1234")
    assert res.locked
    assert res.retry_after_s <= LOCKOUT_SECONDS
    clock.t += LOCKOUT_SECONDS + 1
    assert store.verify_pin("1234").ok


def test_rehash_when_iterations_were_lower(tmp_path, clock):
    s = ParentStore(tmp_path, clock=clock)
    s.set_pin("1234")
    s.settings.pin_iterations = MIN_PBKDF2_ITERATIONS
    # recompute hash with the lower count, simulating an older file
    salt = bytes.fromhex(s.settings.pin_salt)
    s.settings.pin_hash = s._hash("1234", salt, MIN_PBKDF2_ITERATIONS)
    s.save()
    s2 = ParentStore(
        tmp_path, clock=clock, iterations=MIN_PBKDF2_ITERATIONS + 1
    )
    assert s2.verify_pin("1234").ok
    assert s2.settings.pin_iterations == MIN_PBKDF2_ITERATIONS + 1
    assert s2.verify_pin("1234").ok


def test_gate_challenge():
    rng = random.Random(7)
    for _ in range(200):
        g = make_gate_challenge(rng)
        assert 12 <= g.a <= 99 and 12 <= g.b <= 99
        assert g.a % 10 and g.b % 10
        assert g.a % 11 and g.b % 11
        assert g.answer == g.a * g.b
        assert str(g.a) in g.prompt_he and str(g.b) in g.prompt_he
        assert g.check(str(g.answer))
        assert g.check(f" {g.answer} ")
        assert not g.check(str(g.answer + 1))
        assert not g.check("abc")
        assert not g.check("")


def test_gate_challenge_deterministic():
    a = make_gate_challenge(random.Random(1))
    b = make_gate_challenge(random.Random(1))
    assert (a.a, a.b) == (b.a, b.b)


def test_api_key_stored_separately(store, tmp_path):
    store.secrets.set_api_key("sk-test-1234567890abcdef")
    store.save()
    assert "sk-test" not in (tmp_path / "parent.json").read_text("utf-8")
    assert store.secrets.get_api_key() == "sk-test-1234567890abcdef"
    assert "sk-test" not in repr(store.secrets)
    assert "sk-test" not in repr(store)
    assert "sk-test" not in repr(store.settings)
    reloaded = ParentStore(tmp_path)
    assert reloaded.secrets.get_api_key() == "sk-test-1234567890abcdef"
    store.secrets.clear()
    assert store.secrets.get_api_key() is None


@pytest.mark.skipif(sys.platform == "win32", reason="POSIX permissions")
def test_secrets_file_permissions(store, tmp_path):
    store.secrets.set_api_key("abc123abc123abc123")
    mode = stat.S_IMODE(os.stat(tmp_path / "secrets.json").st_mode)
    assert mode == 0o600


def test_corrupt_secrets_file(store, tmp_path):
    (tmp_path / "secrets.json").write_text("{{", "utf-8")
    assert store.secrets.get_api_key() is None


def test_redact():
    assert redact(None) == "***"
    assert redact("") == "***"
    assert redact("short") == "***"
    assert redact("sk-test-1234567890abcdef") == "***cdef"


def test_scrub():
    key = "sk-test-1234567890abcdef"
    text = f"error calling api with key={key} (key {key})"
    out = scrub(text, key, "")
    assert key not in out
    assert out.count("***cdef") == 2


def test_limits_for_profile(store):
    s = store.settings
    assert s.limits_for("pabcde") == s.default_limits
    s.profile_limits["pabcde"] = ScreenLimits(daily_max_minutes=30)
    assert s.limits_for("pabcde").daily_max_minutes == 30
    assert s.limits_for("pother") == s.default_limits


def test_weekly_days_for_profile(store):
    s = store.settings
    assert s.weekly_days_for("p1", age=6) == 3
    assert s.weekly_days_for("p1", age=10) == 4
    s.weekly_days["p1"] = 5
    assert s.weekly_days_for("p1", age=6) == 5


def test_full_round_trip(tmp_path, clock):
    s = ParentStore(tmp_path, clock=clock)
    s.settings.location = Location.preset("haifa")
    s.settings.shabbat_mode = False
    s.settings.shabbat_stop_before_minutes = 15
    s.settings.ai = AIConfig(
        provider="gemini",
        base_url="https://x.example",
        model="m",
        enabled=True,
    )
    s.settings.profile_limits["pabcde"] = ScreenLimits(
        daily_max_minutes=45, weekday_windows=("15:00-18:00",)
    )
    s.settings.values.kindness_quests = False
    s.settings.weekly_days["pabcde"] = 2
    s.save()
    s2 = ParentStore(tmp_path, clock=clock)
    assert s2.settings == s.settings
    assert ParentSettings.from_dict(s.settings.to_dict()) == s.settings


def test_corrupt_parent_json_recovers_defaults(tmp_path, clock):
    (tmp_path / "parent.json").write_text("not json at all", "utf-8")
    s = ParentStore(tmp_path, clock=clock)
    assert s.recovered
    assert s.settings.location.city_he == "ירושלים"
    assert list(tmp_path.glob("parent.json.corrupt-*"))


def test_bad_values_in_parent_json_fall_back(tmp_path, clock):
    (tmp_path / "parent.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "shabbat_mode": "maybe",
                "location": {"lat": "x"},
                "profile_limits": {"p1": "bad"},
            }
        ),
        "utf-8",
    )
    s = ParentStore(tmp_path, clock=clock)
    assert s.settings.shabbat_mode is True
    assert s.settings.location.city_he == "ירושלים"
    assert s.settings.profile_limits == {}
