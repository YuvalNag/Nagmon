# SPDX-License-Identifier: GPL-3.0
"""Ordered fallback across providers, with rest windows, budgets and
plain-Hebrew status lines for the parent (SDD_AI §4)."""

from __future__ import annotations

import copy
import hashlib
import json
import os
import tempfile
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone, tzinfo
from pathlib import Path
from typing import Any, Protocol

from nagmon.ai.providers import OpenAICompatClient, ProviderError

SCHEMA_VERSION = 1
DEFAULT_REST_S = 60.0
USAGE_KEEP_DAYS = 7
PURPOSES = ("studio", "kid")

_FIXED_OFFSETS = {
    "America/Los_Angeles": -8,
    "Asia/Jerusalem": 2,
    "UTC": 0,
}


def zone(name: str) -> tzinfo:
    """``ZoneInfo(name)``, or a fixed offset when tzdata is missing."""
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo(name)
    except Exception:  # noqa: BLE001 - tzdata may be absent on Windows
        return timezone(timedelta(hours=_FIXED_OFFSETS.get(name, 0)))


def next_midnight(ts: float, tz_name: str) -> float:
    tz = zone(tz_name)
    local = datetime.fromtimestamp(ts, tz)
    nxt = (local + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    return nxt.timestamp()


def key_fingerprint(key: str | None) -> str:
    if not key:
        return ""
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:12]


# -- state stores --------------------------------------------------------
class StateStore(Protocol):
    def load(self) -> dict[str, Any]: ...

    def save(self, data: Mapping[str, Any]) -> None: ...


class MemoryStateStore:
    def __init__(self, data: Mapping[str, Any] | None = None) -> None:
        self.data: dict[str, Any] = copy.deepcopy(dict(data or {}))

    def load(self) -> dict[str, Any]:
        return copy.deepcopy(self.data)

    def save(self, data: Mapping[str, Any]) -> None:
        self.data = copy.deepcopy(dict(data))


class JsonStateStore:
    """JSON file, written atomically. A corrupt file reads as empty."""

    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)

    def load(self) -> dict[str, Any]:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
        if not isinstance(data, dict):
            return {}
        version = data.get("schema_version")
        if not isinstance(version, int) or version > SCHEMA_VERSION:
            return {}
        return data

    def save(self, data: Mapping[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(
            dir=self.path.parent, prefix=".ai_state.", suffix=".tmp"
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(data, fh, ensure_ascii=False, indent=1)
            os.replace(tmp, self.path)
        except OSError:
            try:
                os.unlink(tmp)
            except OSError:
                pass


# -- results and errors ---------------------------------------------------
@dataclass(frozen=True)
class Budget:
    studio_per_day: int = 300
    kid_per_child_per_day: int = 60


@dataclass(frozen=True)
class RouterResult:
    text: str
    provider: str
    model: str


@dataclass(frozen=True)
class ProviderStatus:
    name: str
    label_he: str
    state: str  # ok | no_key | key_problem | resting | daily_quota |
    #             unavailable | unknown
    message_he: str
    kid_safe: bool = False


class BudgetExceeded(Exception):
    def __init__(self, message_he: str) -> None:
        super().__init__(message_he)
        self.message_he = message_he


class AllProvidersFailed(Exception):
    def __init__(
        self, message_he: str, errors: Sequence[ProviderError]
    ) -> None:
        super().__init__(message_he)
        self.message_he = message_he
        self.errors = list(errors)


class _DeadlineReached(Exception):
    pass


# -- the router ------------------------------------------------------------
class Router:
    def __init__(
        self,
        providers: Sequence[OpenAICompatClient],
        state_store: StateStore,
        clock: Callable[[], float] = time.time,
        *,
        budget: Budget | None = None,
        budget_tz: str = "Asia/Jerusalem",
        request_timeout: float = 45.0,
        overall_deadline: float = 120.0,
    ) -> None:
        self.providers = list(providers)
        self.state_store = state_store
        self.clock = clock
        self.budget = budget or Budget()
        self.budget_tz = budget_tz
        self.request_timeout = request_timeout
        self.overall_deadline = overall_deadline
        self.state = self._fresh_state(state_store.load())
        for client in self.providers:
            client.cache = self.state["models"].setdefault(
                client.config.name, {}
            )

    # -- state helpers ---------------------------------------------------
    @staticmethod
    def _fresh_state(loaded: Mapping[str, Any]) -> dict[str, Any]:
        state: dict[str, Any] = {"schema_version": SCHEMA_VERSION}
        for key in ("models", "rest", "invalid", "status", "usage"):
            value = loaded.get(key)
            state[key] = value if isinstance(value, dict) else {}
        return state

    def _save(self) -> None:
        self.state_store.save(self.state)

    def _status(self, name: str) -> dict[str, Any]:
        return self.state["status"].setdefault(name, {})

    def _set_status(self, name: str, state: str, **extra: Any) -> None:
        entry = self._status(name)
        keep = {k: entry[k] for k in ("last_ok",) if k in entry}
        entry.clear()
        entry.update(keep)
        entry.update({"state": state, "ts": self.clock(), **extra})

    def _day(self, ts: float | None = None) -> str:
        now = self.clock() if ts is None else ts
        return (
            datetime.fromtimestamp(now, zone(self.budget_tz))
            .date()
            .isoformat()
        )

    @staticmethod
    def _usage_key(purpose: str, budget_key: str | None) -> str:
        if purpose == "kid":
            return f"kid:{budget_key or 'anon'}"
        return purpose

    def usage_today(self, purpose: str, budget_key: str | None = None) -> int:
        day = self.state["usage"].get(self._day(), {})
        return int(day.get(self._usage_key(purpose, budget_key), 0))

    def _limit(self, purpose: str) -> int:
        if purpose == "kid":
            return self.budget.kid_per_child_per_day
        return self.budget.studio_per_day

    def _charge(self, purpose: str, budget_key: str | None) -> None:
        usage = self.state["usage"]
        today = self._day()
        day = usage.setdefault(today, {})
        key = self._usage_key(purpose, budget_key)
        day[key] = int(day.get(key, 0)) + 1
        for old in sorted(usage)[:-USAGE_KEEP_DAYS]:
            del usage[old]

    def _resting(self, name: str) -> dict[str, float]:
        now = self.clock()
        rests = self.state["rest"].get(name, {})
        return {
            model: float(info["until"])
            for model, info in rests.items()
            if float(info.get("until", 0)) > now
        }

    def _key_problem(self, client: OpenAICompatClient) -> bool:
        entry = self._status(client.config.name)
        if entry.get("state") != "key_problem":
            return False
        if entry.get("key_fp") == key_fingerprint(client.config.api_key):
            return True
        self._set_status(client.config.name, "unknown")
        return False

    def reset_provider(self, name: str) -> None:
        """Forget rests, invalid models and a key problem (new key)."""
        for section in ("rest", "invalid", "status"):
            self.state[section].pop(name, None)
        self._save()

    def _candidates(self, client: OpenAICompatClient) -> list[str]:
        name = client.config.name
        before = client.cache.get("ts")
        client.discover_models()
        if client.cache.get("ts") != before:
            self.state["invalid"].pop(name, None)
        excluded = set(self.state["invalid"].get(name, []))
        excluded |= set(self._resting(name))
        return client.resolve_models(exclude=excluded)

    # -- error handling --------------------------------------------------
    def _handle(
        self,
        client: OpenAICompatClient,
        model: str,
        err: ProviderError,
        retries: int,
    ) -> str:
        name = client.config.name
        now = self.clock()
        if err.kind == "rate_limit":
            if err.per_day:
                until = next_midnight(now, client.config.daily_reset_tz)
            else:
                until = now + (err.retry_after or DEFAULT_REST_S)
            self.state["rest"].setdefault(name, {})[model] = {
                "until": until,
                "per_day": err.per_day,
            }
            self._set_status(
                name,
                "daily_quota" if err.per_day else "resting",
                until=until,
            )
            return "next_model"
        if err.kind == "server":
            if retries < 1:
                return "retry"
            self._set_status(name, "unavailable")
            return "next_provider"
        if err.kind == "auth":
            self._set_status(
                name,
                "key_problem",
                key_fp=key_fingerprint(client.config.api_key),
            )
            return "next_provider"
        if err.kind == "model_not_found":
            invalid = self.state["invalid"].setdefault(name, [])
            if model not in invalid:
                invalid.append(model)
            return "next_model"
        if err.kind in ("timeout", "network"):
            self._set_status(name, "unavailable")
            return "next_provider"
        if err.kind == "no_key":
            self._set_status(name, "no_key")
            return "next_provider"
        return "next_model"  # bad_request, bad_response

    # -- main entry --------------------------------------------------------
    def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        purpose: str = "studio",
        budget_key: str | None = None,
        json_schema: Mapping[str, Any] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        timeout: float | None = None,
        deadline: float | None = None,
    ) -> RouterResult:
        if purpose not in PURPOSES:
            raise ValueError(f"unknown purpose {purpose!r}")
        if self.usage_today(purpose, budget_key) >= self._limit(purpose):
            raise BudgetExceeded(self._budget_message(purpose))
        per_request = timeout or self.request_timeout
        end = self.clock() + (deadline or self.overall_deadline)
        errors: list[ProviderError] = []
        try:
            for client in self.providers:
                result = self._try_provider(
                    client,
                    messages,
                    purpose=purpose,
                    json_schema=json_schema,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    per_request=per_request,
                    end=end,
                    errors=errors,
                )
                if result is not None:
                    self._charge(purpose, budget_key)
                    return result
        except _DeadlineReached:
            pass
        finally:
            self._save()
        raise AllProvidersFailed(self._failure_message(errors), errors)

    def _try_provider(
        self,
        client: OpenAICompatClient,
        messages: list[dict[str, Any]],
        *,
        purpose: str,
        json_schema: Mapping[str, Any] | None,
        temperature: float,
        max_tokens: int,
        per_request: float,
        end: float,
        errors: list[ProviderError],
    ) -> RouterResult | None:
        name = client.config.name
        if purpose == "kid" and not client.config.kid_safe:
            return None
        if not client.config.api_key:
            self._set_status(name, "no_key")
            return None
        if self._key_problem(client):
            return None
        if self.clock() >= end:
            raise _DeadlineReached
        try:
            models = self._candidates(client)
        except ProviderError as err:
            errors.append(err)
            self._handle(client, "", err, 1)
            return None
        if not models:
            if not self._resting(name):
                self._set_status(name, "unavailable", reason="no_model")
            return None
        for model in models:
            retries = 0
            while True:
                remaining = end - self.clock()
                if remaining <= 0:
                    raise _DeadlineReached
                try:
                    result = client.chat_result(
                        messages,
                        json_schema=json_schema,
                        temperature=temperature,
                        max_tokens=max_tokens,
                        timeout=min(per_request, remaining),
                        model=model,
                    )
                except ProviderError as err:
                    errors.append(err)
                    action = self._handle(client, model, err, retries)
                    if action == "retry":
                        retries += 1
                        continue
                    if action == "next_provider":
                        return None
                    break  # next model
                self._set_status(name, "ok", last_ok=self.clock(), model=model)
                return RouterResult(result.text, name, model)
        return None

    # -- Hebrew messages ---------------------------------------------------
    def _budget_message(self, purpose: str) -> str:
        if purpose == "kid":
            return "הגענו למספר השאלות להיום. מחר אפשר לשאול שוב."
        return (
            "הגענו לתקציב היומי של סטודיו התוכן "
            f"({self.budget.studio_per_day} בקשות). "
            "אפשר להגדיל אותו במסך ההגדרות, או לנסות שוב מחר."
        )

    @staticmethod
    def _failure_message(errors: Sequence[ProviderError]) -> str:
        kinds = {e.kind for e in errors}
        if not errors:
            return (
                "אין ספק AI זמין: לא הוגדר מפתח, או שכל הספקים במנוחה. "
                "אפשר להוסיף מפתח במסך ההגדרות."
            )
        if kinds <= {"rate_limit"}:
            return (
                "כל הספקים עמוסים או שהמכסה החינמית נגמרה. נסו שוב מאוחר יותר."
            )
        if kinds <= {"auth", "no_key"}:
            return (
                "המפתחות לא התקבלו אצל הספקים. כדאי לבדוק אותם במסך ההגדרות."
            )
        return (
            "לא הצלחנו לקבל תשובה מאף ספק. "
            "כדאי לבדוק את החיבור לאינטרנט ואת המפתחות במסך ההגדרות."
        )

    def _clock_text(self, ts: float) -> str:
        return datetime.fromtimestamp(ts, zone(self.budget_tz)).strftime(
            "%H:%M"
        )

    @staticmethod
    def _wait_text(seconds: float) -> str:
        if seconds < 90:
            return f"כ־{max(1, round(seconds))} שניות"
        minutes = round(seconds / 60)
        if minutes < 90:
            return f"כ־{minutes} דקות"
        return f"כ־{round(minutes / 60)} שעות"

    def status_report(self) -> list[ProviderStatus]:
        """One plain-Hebrew line per provider. Never does network I/O."""
        now = self.clock()
        report = []
        for client in self.providers:
            cfg = client.config
            entry = self.state["status"].get(cfg.name, {})
            state = entry.get("state", "unknown")
            until = float(entry.get("until", 0) or 0)
            if not cfg.api_key:
                state = "no_key"
            elif state == "key_problem" and entry.get(
                "key_fp"
            ) != key_fingerprint(cfg.api_key):
                state = "unknown"
            elif state in ("resting", "daily_quota") and until <= now:
                state = "ok"
            report.append(
                ProviderStatus(
                    name=cfg.name,
                    label_he=cfg.label_he or cfg.name,
                    state=state,
                    message_he=self._status_message(state, entry, until, now),
                    kid_safe=cfg.kid_safe,
                )
            )
        return report

    def _status_message(
        self, state: str, entry: Mapping[str, Any], until: float, now: float
    ) -> str:
        if state == "no_key":
            return "לא הוגדר מפתח. אפשר להוסיף מפתח במסך ההגדרות."
        if state == "key_problem":
            return (
                "המפתח לא התקבל: אולי הוא שגוי, בוטל, או שאין לו הרשאה. "
                "כדאי ליצור מפתח חדש באתר של הספק ולהדביק אותו שוב."
            )
        if state == "resting":
            return (
                "הגענו למגבלת הקצב של הספק. "
                f"ננסה אותו שוב בעוד {self._wait_text(until - now)}."
            )
        if state == "daily_quota":
            return (
                "המכסה היומית החינמית נגמרה. "
                f"היא תתחדש בערך ב־{self._clock_text(until)} (שעון ישראל)."
            )
        if state == "unavailable":
            if entry.get("reason") == "no_model":
                return (
                    "לא מצאנו אצל הספק מודל מתאים. "
                    "ייתכן שרשימת המודלים שלו השתנתה."
                )
            return "הספק לא ענה בזמן, או שהייתה אצלו תקלה. ננסה שוב בפעם הבאה."
        if state == "ok":
            last_ok = entry.get("last_ok")
            if last_ok:
                return f"עובד. הצליח לאחרונה ב־{self._clock_text(last_ok)}."
            return "זמין שוב."
        return "עוד לא השתמשנו בספק הזה."
