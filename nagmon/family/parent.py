"""Parent area: PIN, quick gate, location, Shabbat/holiday mode, AI
provider settings (key kept separately), per-child limits and values.

``root/parent.json`` holds :class:`ParentSettings`. The AI API key lives
in ``root/secrets.json`` (mode 0600 where the OS supports it) and is never
put in ``parent.json``, ``repr`` output or logs.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import random
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from nagmon.family._jsonio import (
    as_bool,
    as_float,
    as_int,
    as_str,
    atomic_write_json,
    load_json,
)
from nagmon.family.calendar import Location
from nagmon.family.goals import default_weekly_days
from nagmon.family.screentime import ScreenLimits
from nagmon.family.values import FamilyValues

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 1
MIN_PBKDF2_ITERATIONS = 200_000
PBKDF2_ITERATIONS = 240_000
SALT_BYTES = 16
MAX_ATTEMPTS = 5
LOCKOUT_SECONDS = 60.0
PIN_MIN_LEN = 4
PIN_MAX_LEN = 8


class PinError(ValueError):
    """Bad PIN format, or the current PIN is required/wrong."""


# ---------------------------------------------------------------- redaction


def redact(value: str | None) -> str:
    """Hide a secret; keep the last 4 characters of long values."""
    if not value or len(value) < 12:
        return "***"
    return "***" + value[-4:]


def scrub(text: str, *secrets: str) -> str:
    """Replace every occurrence of each secret in ``text``."""
    for s in secrets:
        if s:
            text = text.replace(s, redact(s))
    return text


# ---------------------------------------------------------------- settings


@dataclass
class AIConfig:
    provider: str = "none"
    base_url: str = ""
    model: str = ""
    enabled: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "base_url": self.base_url,
            "model": self.model,
            "enabled": self.enabled,
        }

    @classmethod
    def from_dict(cls, d: Any) -> AIConfig:
        if not isinstance(d, dict):
            return cls()
        return cls(
            provider=as_str(d.get("provider"), "none"),
            base_url=as_str(d.get("base_url"), ""),
            model=as_str(d.get("model"), ""),
            enabled=as_bool(d.get("enabled"), False),
        )


def _default_location() -> Location:
    return Location.preset("jerusalem")


@dataclass
class ParentSettings:
    pin_hash: str | None = None
    pin_salt: str | None = None
    pin_iterations: int = PBKDF2_ITERATIONS
    failed_attempts: int = 0
    locked_until: float = 0.0
    location: Location = field(default_factory=_default_location)
    shabbat_mode: bool = True
    holiday_mode: bool = True
    shabbat_stop_before_minutes: int = 10
    ai: AIConfig = field(default_factory=AIConfig)
    default_limits: ScreenLimits = field(default_factory=ScreenLimits)
    profile_limits: dict[str, ScreenLimits] = field(default_factory=dict)
    weekly_days: dict[str, int] = field(default_factory=dict)
    values: FamilyValues = field(default_factory=FamilyValues)

    def __repr__(self) -> str:
        return (
            f"ParentSettings(pin_set={self.pin_hash is not None}, "
            f"city={self.location.city_he!r}, shabbat={self.shabbat_mode}, "
            f"holidays={self.holiday_mode}, ai={self.ai.provider!r})"
        )

    def limits_for(self, pid: str) -> ScreenLimits:
        return self.profile_limits.get(pid, self.default_limits)

    def weekly_days_for(self, pid: str, age: int | None) -> int:
        return self.weekly_days.get(pid, default_weekly_days(age))

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": SCHEMA_VERSION,
            "pin_hash": self.pin_hash,
            "pin_salt": self.pin_salt,
            "pin_iterations": self.pin_iterations,
            "failed_attempts": self.failed_attempts,
            "locked_until": self.locked_until,
            "location": self.location.to_dict(),
            "shabbat_mode": self.shabbat_mode,
            "holiday_mode": self.holiday_mode,
            "shabbat_stop_before_minutes": self.shabbat_stop_before_minutes,
            "ai": self.ai.to_dict(),
            "default_limits": self.default_limits.to_dict(),
            "profile_limits": {
                pid: lim.to_dict() for pid, lim in self.profile_limits.items()
            },
            "weekly_days": dict(self.weekly_days),
            "values": self.values.to_dict(),
        }

    @classmethod
    def from_dict(cls, d: Any) -> ParentSettings:
        """Lenient loader: bad fields fall back to defaults."""
        s = cls()
        if not isinstance(d, dict):
            return s
        pin_hash, pin_salt = d.get("pin_hash"), d.get("pin_salt")
        if isinstance(pin_hash, str) and isinstance(pin_salt, str):
            s.pin_hash, s.pin_salt = pin_hash, pin_salt
            s.pin_iterations = as_int(
                d.get("pin_iterations"), PBKDF2_ITERATIONS
            )
        s.failed_attempts = max(0, as_int(d.get("failed_attempts"), 0))
        s.locked_until = as_float(d.get("locked_until"), 0.0)
        try:
            s.location = Location.from_dict(d.get("location"))
        except ValueError:
            pass
        s.shabbat_mode = as_bool(d.get("shabbat_mode"), True)
        s.holiday_mode = as_bool(d.get("holiday_mode"), True)
        stop = as_int(d.get("shabbat_stop_before_minutes"), 10)
        s.shabbat_stop_before_minutes = stop if 0 <= stop <= 120 else 10
        s.ai = AIConfig.from_dict(d.get("ai"))
        s.default_limits = ScreenLimits.from_dict(d.get("default_limits"))
        limits = d.get("profile_limits")
        if isinstance(limits, dict):
            s.profile_limits = {
                pid: ScreenLimits.from_dict(v)
                for pid, v in limits.items()
                if isinstance(v, dict)
            }
        weekly = d.get("weekly_days")
        if isinstance(weekly, dict):
            s.weekly_days = {
                pid: v
                for pid, v in weekly.items()
                if as_int(v, 0) in range(1, 8)
            }
        s.values = FamilyValues.from_dict(d.get("values"))
        return s


@dataclass(frozen=True)
class PinCheck:
    ok: bool
    locked: bool = False
    attempts_left: int = MAX_ATTEMPTS
    retry_after_s: float = 0.0


# ------------------------------------------------------------------ secrets


class SecretStore:
    """The AI API key, in ``root/secrets.json`` (0600)."""

    def __init__(self, root: Path) -> None:
        self.path = Path(root) / "secrets.json"

    def __repr__(self) -> str:
        key = self.get_api_key()
        return f"SecretStore(api_key={redact(key) if key else None})"

    def get_api_key(self) -> str | None:
        data = load_json(self.path).data or {}
        key = data.get("ai_api_key")
        return key if isinstance(key, str) and key else None

    def set_api_key(self, key: str) -> None:
        if not isinstance(key, str) or not key.strip():
            raise ValueError("empty API key")
        self._write({"schema_version": 1, "ai_api_key": key.strip()})

    def clear(self) -> None:
        self._write({"schema_version": 1, "ai_api_key": None})

    def _write(self, data: dict[str, Any]) -> None:
        # no .bak copy: do not leave extra copies of the key around
        atomic_write_json(self.path, data, mode=0o600, backup=False)


# --------------------------------------------------------------------- gate


@dataclass(frozen=True)
class GateChallenge:
    """Quick parent gate: a two-digit multiplication a young child
    cannot do in their head. Not a security boundary; the PIN is."""

    a: int
    b: int

    @property
    def answer(self) -> int:
        return self.a * self.b

    @property
    def prompt_he(self) -> str:
        return f"כמה זה {self.a} × {self.b}?"

    def check(self, given: str) -> bool:
        given = (given or "").strip()
        return given.isdigit() and int(given) == self.answer


def _gate_number(rng: random.Random) -> int:
    while True:
        n = rng.randint(12, 99)
        if n % 10 and n % 11:
            return n


def make_gate_challenge(rng: random.Random | None = None) -> GateChallenge:
    rng = rng or random.SystemRandom()
    return GateChallenge(_gate_number(rng), _gate_number(rng))


# -------------------------------------------------------------------- store


class ParentStore:
    def __init__(
        self,
        root: Path,
        *,
        clock: Callable[[], float] = time.time,
        iterations: int = PBKDF2_ITERATIONS,
    ) -> None:
        if iterations < MIN_PBKDF2_ITERATIONS:
            raise ValueError(
                f"PBKDF2 needs at least {MIN_PBKDF2_ITERATIONS} iterations"
            )
        self.root = Path(root)
        self.path = self.root / "parent.json"
        self._clock = clock
        self._iterations = iterations
        res = load_json(self.path)
        self.recovered = res.recovered
        if res.recovered:
            logger.warning("parent.json recovered (%s)", res.status)
        self.settings = ParentSettings.from_dict(res.data)
        self.secrets = SecretStore(self.root)

    def __repr__(self) -> str:
        return f"ParentStore({self.settings!r})"

    def save(self) -> None:
        atomic_write_json(self.path, self.settings.to_dict())

    # ---------------------------------------------------------------- PIN

    def has_pin(self) -> bool:
        return self.settings.pin_hash is not None

    @staticmethod
    def _hash(pin: str, salt: bytes, iterations: int) -> str:
        dk = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, iterations)
        return dk.hex()

    @staticmethod
    def _check_format(pin: str) -> None:
        if not (
            isinstance(pin, str)
            and pin.isascii()
            and pin.isdigit()
            and PIN_MIN_LEN <= len(pin) <= PIN_MAX_LEN
        ):
            raise PinError(f"PIN must be {PIN_MIN_LEN}-{PIN_MAX_LEN} digits")

    def set_pin(self, pin: str, *, current: str | None = None) -> None:
        self._check_format(pin)
        if self.has_pin():
            if current is None or not self.verify_pin(current).ok:
                raise PinError("the current PIN is required")
        salt = os.urandom(SALT_BYTES)
        s = self.settings
        s.pin_salt = salt.hex()
        s.pin_iterations = self._iterations
        s.pin_hash = self._hash(pin, salt, self._iterations)
        s.failed_attempts = 0
        s.locked_until = 0.0
        self.save()

    def lockout_remaining(self) -> float:
        s = self.settings
        now = self._clock()
        if s.locked_until - now > LOCKOUT_SECONDS:
            # the clock moved back: never lock longer than the full period
            s.locked_until = now + LOCKOUT_SECONDS
            self.save()
        return max(0.0, s.locked_until - now)

    def verify_pin(self, pin: str) -> PinCheck:
        s = self.settings
        if not self.has_pin():
            return PinCheck(ok=False, attempts_left=0)
        remaining = self.lockout_remaining()
        if remaining > 0:
            return PinCheck(
                ok=False, locked=True, attempts_left=0, retry_after_s=remaining
            )
        if s.locked_until:  # lockout over
            s.locked_until = 0.0
            s.failed_attempts = 0
        salt = bytes.fromhex(s.pin_salt or "")
        candidate = pin if isinstance(pin, str) else ""
        ok = hmac.compare_digest(
            self._hash(candidate, salt, s.pin_iterations), s.pin_hash or ""
        )
        if ok:
            s.failed_attempts = 0
            if s.pin_iterations < self._iterations:
                new_salt = os.urandom(SALT_BYTES)
                s.pin_salt = new_salt.hex()
                s.pin_iterations = self._iterations
                s.pin_hash = self._hash(candidate, new_salt, self._iterations)
            self.save()
            return PinCheck(ok=True)
        s.failed_attempts += 1
        if s.failed_attempts >= MAX_ATTEMPTS:
            s.locked_until = self._clock() + LOCKOUT_SECONDS
            self.save()
            return PinCheck(
                ok=False,
                locked=True,
                attempts_left=0,
                retry_after_s=LOCKOUT_SECONDS,
            )
        self.save()
        return PinCheck(
            ok=False, attempts_left=MAX_ATTEMPTS - s.failed_attempts
        )
