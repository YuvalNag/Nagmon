# SPDX-License-Identifier: GPL-3.0
"""Test doubles: a scripted HTTP transport, a clock and a router.

They live in the package (not in tests/) so the UI layer can also run
screens without network access.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from nagmon.ai.providers import HttpResponse


class FakeClock:
    def __init__(self, t: float = 1_790_000_000.0) -> None:
        self.t = float(t)

    def __call__(self) -> float:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += seconds


@dataclass(frozen=True)
class RecordedCall:
    method: str
    url: str
    headers: Mapping[str, str]
    body: bytes | None
    timeout: float


Scripted = HttpResponse | BaseException | Callable[[RecordedCall], Any]


class FakeTransport:
    """Answers by (method, url substring). Responses are used in order;
    the last one repeats. A response may be an ``HttpResponse``, an
    exception to raise, or a callable taking the ``RecordedCall``."""

    def __init__(self) -> None:
        self.routes: list[tuple[str, str, list[Scripted]]] = []
        self.calls: list[RecordedCall] = []

    def add(self, method: str, url_part: str, *responses: Scripted) -> None:
        self.routes.append((method.upper(), url_part, list(responses)))

    def __call__(
        self,
        method: str,
        url: str,
        headers: Mapping[str, str],
        body: bytes | None,
        timeout: float,
    ) -> HttpResponse:
        call = RecordedCall(method.upper(), url, dict(headers), body, timeout)
        self.calls.append(call)
        for route_method, part, responses in self.routes:
            if route_method == call.method and part in url and responses:
                scripted = (
                    responses.pop(0) if len(responses) > 1 else responses[0]
                )
                return _play(scripted, call)
        return error_response(404, f"no fake route for {method} {url}")


def _play(scripted: Scripted, call: RecordedCall) -> HttpResponse:
    if isinstance(scripted, BaseException):
        raise scripted
    if isinstance(scripted, HttpResponse):
        return scripted
    result = scripted(call)
    if isinstance(result, BaseException):
        raise result
    return result


def json_response(
    status: int, data: Any, headers: Mapping[str, str] | None = None
) -> HttpResponse:
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    hdrs = {"Content-Type": "application/json", **(headers or {})}
    return HttpResponse(status, hdrs, body)


def chat_response(text: str, *, model: str = "fake-model") -> HttpResponse:
    return json_response(
        200,
        {
            "id": "chatcmpl-fake",
            "object": "chat.completion",
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": text},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
        },
    )


def models_response(ids: Iterable[str]) -> HttpResponse:
    return json_response(
        200,
        {
            "object": "list",
            "data": [{"id": i, "object": "model"} for i in ids],
        },
    )


def error_response(
    status: int, message: str, headers: Mapping[str, str] | None = None
) -> HttpResponse:
    return json_response(
        status, {"error": {"message": message, "code": status}}, headers
    )


class FakeRouter:
    """Duck-types ``Router.chat``: returns queued texts (the last one
    repeats) or raises queued exceptions, and records every call."""

    def __init__(self, *outputs: str | BaseException) -> None:
        self.outputs = list(outputs)
        self.calls: list[dict[str, Any]] = []

    def chat(self, messages: list[dict[str, Any]], **kwargs: Any) -> Any:
        from nagmon.ai.router import RouterResult

        self.calls.append({"messages": messages, **kwargs})
        if not self.outputs:
            raise RuntimeError("FakeRouter has no scripted output")
        out = self.outputs.pop(0) if len(self.outputs) > 1 else self.outputs[0]
        if isinstance(out, BaseException):
            raise out
        return RouterResult(text=out, provider="fake", model="fake-1")
