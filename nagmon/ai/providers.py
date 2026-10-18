# SPDX-License-Identifier: GPL-3.0
"""OpenAI-compatible chat client with model discovery (SDD_AI §3)."""

from __future__ import annotations

import fnmatch
import json
import re
import time
import urllib.error
import urllib.request
from collections.abc import Callable, Iterable, Mapping, MutableMapping
from dataclasses import dataclass, field
from typing import Any, Protocol

DEFAULT_TIMEOUT = 45.0
DISCOVERY_TTL = 24 * 3600.0
DISCOVERY_FAILURE_TTL = 3600.0
USER_AGENT = "Nagmon/0.1 (family learning game)"

# Models that are never chosen by a partial (prefix/contains/wildcard)
# preference match: they are not chat models.
NON_CHAT_MARKERS = (
    "tts",
    "image",
    "embed",
    "audio",
    "whisper",
    "guard",
    "transcribe",
    "imagen",
    "veo",
    "aqa",
    "live",
    "vision",
    "moderation",
)

PER_DAY_MARKERS = ("per day", "perday", "rpd", "tpd", "daily", "per-day")


@dataclass
class ProviderConfig:
    name: str
    base_url: str
    api_key: str | None
    models_pref: list[str]
    extra_headers: dict[str, str] = field(default_factory=dict)
    kid_safe: bool = False
    fallback_models: list[str] = field(default_factory=list)
    supports_json_schema: bool = False
    daily_reset_tz: str = "UTC"
    label_he: str = ""

    def __repr__(self) -> str:  # never show the key
        return (
            f"ProviderConfig(name={self.name!r}, base_url={self.base_url!r}, "
            f"kid_safe={self.kid_safe})"
        )


@dataclass(frozen=True)
class HttpResponse:
    status: int
    headers: Mapping[str, str]
    body: bytes

    def header(self, name: str) -> str | None:
        wanted = name.lower()
        for key, value in self.headers.items():
            if key.lower() == wanted:
                return value
        return None


class TransportError(Exception):
    """The request did not reach the server or the connection broke."""


class TransportTimeout(TransportError):
    """The server did not answer in time."""


class Transport(Protocol):
    def __call__(
        self,
        method: str,
        url: str,
        headers: Mapping[str, str],
        body: bytes | None,
        timeout: float,
    ) -> HttpResponse: ...


class UrllibTransport:
    """Default transport: stdlib urllib, honours HTTPS_PROXY."""

    def __call__(
        self,
        method: str,
        url: str,
        headers: Mapping[str, str],
        body: bytes | None,
        timeout: float,
    ) -> HttpResponse:
        request = urllib.request.Request(
            url, data=body, headers=dict(headers), method=method
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as resp:
                return HttpResponse(
                    resp.status, dict(resp.headers.items()), resp.read()
                )
        except urllib.error.HTTPError as err:
            data = err.read() if err.fp is not None else b""
            hdrs = dict(err.headers.items()) if err.headers else {}
            return HttpResponse(err.code, hdrs, data)
        except TimeoutError as err:
            raise TransportTimeout(str(err)) from err
        except urllib.error.URLError as err:
            if isinstance(err.reason, TimeoutError):
                raise TransportTimeout(str(err.reason)) from err
            raise TransportError(str(err.reason)) from err
        except OSError as err:
            raise TransportError(str(err)) from err


class ProviderError(Exception):
    """A classified provider failure. ``kind`` drives the router."""

    def __init__(
        self,
        kind: str,
        message: str = "",
        *,
        provider: str = "",
        model: str | None = None,
        status: int | None = None,
        retry_after: float | None = None,
        per_day: bool = False,
    ) -> None:
        super().__init__(f"{provider}:{kind}:{status}: {message}")
        self.kind = kind
        self.message = message
        self.provider = provider
        self.model = model
        self.status = status
        self.retry_after = retry_after
        self.per_day = per_day


@dataclass(frozen=True)
class ChatResult:
    text: str
    model: str
    provider: str
    usage: Mapping[str, Any] = field(default_factory=dict)


def _strip_model_prefix(model_id: str) -> str:
    return (
        model_id[len("models/") :]
        if model_id.startswith("models/")
        else model_id
    )


def _is_chat_model(model_id: str) -> bool:
    low = model_id.lower()
    return not any(marker in low for marker in NON_CHAT_MARKERS)


def match_preferences(
    prefs: Iterable[str], available: Iterable[str]
) -> list[str]:
    """Order ``available`` by the first preference each one matches.

    For every preference: exact match, then fnmatch (if it has ``*``),
    then prefix, then substring. Shorter ids win among several matches.
    Partial matches never pick non-chat models (tts, image...).
    """
    pool = list(dict.fromkeys(available))
    chosen: list[str] = []

    def take(candidates: Iterable[str]) -> None:
        for model in sorted(candidates, key=lambda m: (len(m), m)):
            if model not in chosen:
                chosen.append(model)

    for pref in prefs:
        if pref in pool:
            take([pref])
        partial = [m for m in pool if _is_chat_model(m)]
        if "*" in pref or "?" in pref:
            take(m for m in partial if fnmatch.fnmatchcase(m, pref))
            continue
        take(m for m in partial if m.startswith(pref))
        take(m for m in partial if pref in m)
    return chosen


def _plain_preferences(config: ProviderConfig) -> list[str]:
    plain = [p for p in config.models_pref if "*" not in p and "?" not in p]
    return list(dict.fromkeys([*plain, *config.fallback_models]))


class OpenAICompatClient:
    """One provider behind the OpenAI-compatible REST API."""

    def __init__(
        self,
        config: ProviderConfig,
        transport: Transport | None = None,
        clock: Callable[[], float] = time.time,
        cache: MutableMapping[str, Any] | None = None,
    ) -> None:
        self.config = config
        self.transport = transport or UrllibTransport()
        self.clock = clock
        self.cache: MutableMapping[str, Any] = (
            cache if cache is not None else {}
        )
        self.json_schema_supported = config.supports_json_schema

    # -- HTTP -----------------------------------------------------------
    def _url(self, path: str) -> str:
        return self.config.base_url.rstrip("/") + path

    def _headers(self) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        }
        headers.update(self.config.extra_headers)
        return headers

    def _scrub(self, text: str) -> str:
        key = self.config.api_key
        if key:
            text = text.replace(key, "***")
        return text[:500]

    def _request(
        self,
        method: str,
        path: str,
        payload: Mapping[str, Any] | None,
        timeout: float,
        model: str | None,
    ) -> Any:
        if not self.config.api_key:
            raise ProviderError(
                "no_key", "no API key", provider=self.config.name, model=model
            )
        body = None
        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        try:
            resp = self.transport(
                method, self._url(path), self._headers(), body, timeout
            )
        except TransportTimeout as err:
            raise ProviderError(
                "timeout",
                self._scrub(str(err)),
                provider=self.config.name,
                model=model,
            ) from err
        except TransportError as err:
            raise ProviderError(
                "network",
                self._scrub(str(err)),
                provider=self.config.name,
                model=model,
            ) from err
        if resp.status >= 400:
            raise self._classify(resp, model)
        try:
            return json.loads(resp.body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as err:
            raise ProviderError(
                "bad_response",
                "response is not JSON",
                provider=self.config.name,
                model=model,
                status=resp.status,
            ) from err

    def _classify(
        self, resp: HttpResponse, model: str | None
    ) -> ProviderError:
        status = resp.status
        text = self._scrub(resp.body.decode("utf-8", errors="replace"))
        low = text.lower()
        kwargs: dict[str, Any] = dict(
            provider=self.config.name, model=model, status=status
        )
        if status == 429:
            retry_after = _parse_retry_after(resp.header("Retry-After"))
            if retry_after is None:
                retry_after = _retry_after_from_text(text)
            per_day = any(m in low for m in PER_DAY_MARKERS) or (
                retry_after is not None and retry_after > 3600
            )
            return ProviderError(
                "rate_limit",
                text,
                retry_after=retry_after,
                per_day=per_day,
                **kwargs,
            )
        if status in (401, 403):
            return ProviderError("auth", text, **kwargs)
        if status == 404:
            return ProviderError("model_not_found", text, **kwargs)
        if status >= 500:
            return ProviderError("server", text, **kwargs)
        if "json_schema" in low or "response_format" in low:
            return ProviderError("bad_request", text, **kwargs)
        if "model" in low and (
            "not found" in low
            or "does not exist" in low
            or "decommissioned" in low
        ):
            return ProviderError("model_not_found", text, **kwargs)
        return ProviderError("bad_request", text, **kwargs)

    # -- discovery ------------------------------------------------------
    def discover_models(self, *, force: bool = False) -> list[str]:
        """GET /models, cached for 24 h (failures for 1 h)."""
        now = self.clock()
        ts = self.cache.get("ts")
        ttl = (
            DISCOVERY_TTL
            if self.cache.get("ok", True)
            else DISCOVERY_FAILURE_TTL
        )
        if not force and ts is not None and 0 <= now - ts < ttl:
            return list(self.cache.get("ids", []))
        try:
            data = self._request("GET", "/models", None, 15.0, None)
            entries = data.get("data", []) if isinstance(data, dict) else []
            ids = [
                _strip_model_prefix(str(e["id"]))
                for e in entries
                if isinstance(e, dict) and e.get("id")
            ]
            ok = bool(ids)
        except ProviderError as err:
            if err.kind in ("auth", "no_key"):
                raise
            ids, ok = [], False
        self.cache.clear()
        self.cache.update({"ts": now, "ids": ids, "ok": ok})
        return list(ids)

    def resolve_models(self, exclude: Iterable[str] = ()) -> list[str]:
        """Candidate models, best first, minus ``exclude``."""
        excluded = set(exclude)
        ids = self.discover_models()
        if ids:
            models = match_preferences(self.config.models_pref, ids)
        else:
            models = _plain_preferences(self.config)
        return [m for m in models if m not in excluded]

    # -- chat -----------------------------------------------------------
    def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        json_schema: Mapping[str, Any] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        timeout: float = DEFAULT_TIMEOUT,
        model: str | None = None,
    ) -> str:
        return self.chat_result(
            messages,
            json_schema=json_schema,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
            model=model,
        ).text

    def chat_result(
        self,
        messages: list[dict[str, Any]],
        *,
        json_schema: Mapping[str, Any] | None = None,
        temperature: float = 0.7,
        max_tokens: int = 1024,
        timeout: float = DEFAULT_TIMEOUT,
        model: str | None = None,
    ) -> ChatResult:
        if not self.config.api_key:
            raise ProviderError(
                "no_key", "no API key", provider=self.config.name, model=model
            )
        if model is None:
            candidates = self.resolve_models()
            if not candidates:
                raise ProviderError(
                    "model_not_found",
                    "no matching model",
                    provider=self.config.name,
                )
            model = candidates[0]
        use_schema = json_schema is not None and self.json_schema_supported
        payload = self._payload(
            messages, model, json_schema, use_schema, temperature, max_tokens
        )
        try:
            data = self._request(
                "POST", "/chat/completions", payload, timeout, model
            )
        except ProviderError as err:
            if not (
                use_schema
                and err.kind == "bad_request"
                and (
                    "json_schema" in err.message
                    or "response_format" in err.message
                )
            ):
                raise
            self.json_schema_supported = False
            payload = self._payload(
                messages, model, json_schema, False, temperature, max_tokens
            )
            data = self._request(
                "POST", "/chat/completions", payload, timeout, model
            )
        return ChatResult(
            text=self._extract_text(data, model),
            model=model,
            provider=self.config.name,
            usage=data.get("usage") or {} if isinstance(data, dict) else {},
        )

    def _payload(
        self,
        messages: list[dict[str, Any]],
        model: str,
        json_schema: Mapping[str, Any] | None,
        use_schema: bool,
        temperature: float,
        max_tokens: int,
    ) -> dict[str, Any]:
        msgs = [dict(m) for m in messages]
        payload: dict[str, Any] = {
            "model": model,
            "messages": msgs,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_schema is None:
            return payload
        if use_schema:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "nagmon_output",
                    "schema": dict(json_schema),
                },
            }
            return payload
        payload["response_format"] = {"type": "json_object"}
        instruction = (
            "Return ONLY one valid JSON value (no prose, no code fences) "
            "that matches this JSON Schema:\n"
            + json.dumps(json_schema, ensure_ascii=False)
        )
        if msgs and msgs[0].get("role") == "system":
            msgs[0]["content"] = f"{msgs[0]['content']}\n\n{instruction}"
        else:
            msgs.insert(0, {"role": "system", "content": instruction})
        return payload

    def _extract_text(self, data: Any, model: str) -> str:
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            content = None
        if isinstance(content, list):
            content = "".join(
                part.get("text", "")
                for part in content
                if isinstance(part, dict)
            )
        if not isinstance(content, str) or not content.strip():
            raise ProviderError(
                "bad_response",
                "empty answer",
                provider=self.config.name,
                model=model,
            )
        return content


def _parse_retry_after(value: str | None) -> float | None:
    if not value:
        return None
    try:
        seconds = float(value.strip())
    except ValueError:
        return None
    return seconds if seconds >= 0 else None


_RETRY_DELAY_RE = re.compile(r'"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"')
_TRY_AGAIN_RE = re.compile(
    r"try again in\s+(?:(\d+)h)?\s*(?:(\d+)m(?!s))?\s*(?:(\d+(?:\.\d+)?)s)?",
    re.IGNORECASE,
)


def _retry_after_from_text(text: str) -> float | None:
    """Gemini puts ``retryDelay: "37s"`` in the body; Groq writes
    "Please try again in 7m12.5s"."""
    match = _RETRY_DELAY_RE.search(text)
    if match:
        return float(match.group(1))
    match = _TRY_AGAIN_RE.search(text)
    if match and any(match.groups()):
        hours, minutes, seconds = match.groups()
        return (
            int(hours or 0) * 3600
            + int(minutes or 0) * 60
            + float(seconds or 0)
        )
    return None
