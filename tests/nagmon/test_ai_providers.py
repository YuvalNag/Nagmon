# SPDX-License-Identifier: GPL-3.0
"""WP9: OpenAI-compatible provider client (SDD_AI §3)."""

from __future__ import annotations

import json

import pytest

from nagmon.ai.fakes import (
    FakeClock,
    FakeTransport,
    chat_response,
    error_response,
    models_response,
)
from nagmon.ai.providers import (
    OpenAICompatClient,
    ProviderConfig,
    ProviderError,
    TransportTimeout,
)

BASE = "https://api.example.test/v1"


def make_client(transport, *, clock=None, cache=None, **overrides):
    fields = dict(
        name="groq",
        base_url=BASE,
        api_key="sk-secret",
        models_pref=["model-a"],
    )
    fields.update(overrides)
    config = ProviderConfig(**fields)
    return OpenAICompatClient(
        config, transport=transport, clock=clock or FakeClock(), cache=cache
    )


def sent_json(call):
    return json.loads(call.body.decode("utf-8"))


def test_chat_returns_message_text():
    transport = FakeTransport()
    transport.add("POST", "/chat/completions", chat_response("שלום"))
    client = make_client(transport)
    text = client.chat([{"role": "user", "content": "hi"}], model="model-a")
    assert text == "שלום"


def test_chat_sends_bearer_key_and_extra_headers():
    transport = FakeTransport()
    transport.add("POST", "/chat/completions", chat_response("ok"))
    client = make_client(transport, extra_headers={"X-Title": "Nagmon"})
    client.chat([{"role": "user", "content": "hi"}], model="model-a")
    call = transport.calls[-1]
    assert call.headers["Authorization"] == "Bearer sk-secret"
    assert call.headers["X-Title"] == "Nagmon"
    assert call.url == BASE + "/chat/completions"


def test_chat_body_contains_model_messages_and_limits():
    transport = FakeTransport()
    transport.add("POST", "/chat/completions", chat_response("ok"))
    client = make_client(transport)
    messages = [{"role": "user", "content": "hi"}]
    client.chat(messages, model="model-a", temperature=0.2, max_tokens=99)
    body = sent_json(transport.calls[-1])
    assert body["model"] == "model-a"
    assert body["messages"] == messages
    assert body["temperature"] == 0.2
    assert body["max_tokens"] == 99
    assert "response_format" not in body


def test_default_request_timeout_is_45_seconds():
    transport = FakeTransport()
    transport.add("POST", "/chat/completions", chat_response("ok"))
    client = make_client(transport)
    client.chat([{"role": "user", "content": "hi"}], model="model-a")
    assert transport.calls[-1].timeout == 45.0


def test_chat_result_reports_provider_and_model():
    transport = FakeTransport()
    transport.add("POST", "/chat/completions", chat_response("ok"))
    client = make_client(transport)
    result = client.chat_result(
        [{"role": "user", "content": "hi"}], model="model-a"
    )
    assert result.text == "ok"
    assert result.provider == "groq"
    assert result.model == "model-a"


SCHEMA = {"type": "object", "properties": {"answer": {"type": "string"}}}


def test_json_schema_sent_as_json_schema_when_supported():
    transport = FakeTransport()
    transport.add("POST", "/chat/completions", chat_response("{}"))
    client = make_client(transport, supports_json_schema=True)
    client.chat(
        [{"role": "user", "content": "hi"}],
        model="model-a",
        json_schema=SCHEMA,
    )
    body = sent_json(transport.calls[-1])
    assert body["response_format"]["type"] == "json_schema"
    assert body["response_format"]["json_schema"]["schema"] == SCHEMA


def test_json_schema_falls_back_to_json_object_with_schema_in_prompt():
    transport = FakeTransport()
    transport.add("POST", "/chat/completions", chat_response("{}"))
    client = make_client(transport, supports_json_schema=False)
    client.chat(
        [{"role": "user", "content": "hi"}],
        model="model-a",
        json_schema=SCHEMA,
    )
    body = sent_json(transport.calls[-1])
    assert body["response_format"] == {"type": "json_object"}
    system = body["messages"][0]
    assert system["role"] == "system"
    assert '"answer"' in system["content"]
    assert "JSON" in system["content"]


def test_json_schema_rejected_with_400_retries_as_json_object_and_remembers():
    transport = FakeTransport()
    transport.add(
        "POST",
        "/chat/completions",
        error_response(400, "response_format json_schema is not supported"),
        chat_response("{}"),
        chat_response("{}"),
    )
    client = make_client(transport, supports_json_schema=True)
    messages = [{"role": "user", "content": "hi"}]
    client.chat(messages, model="model-a", json_schema=SCHEMA)
    assert sent_json(transport.calls[1])["response_format"] == {
        "type": "json_object"
    }
    client.chat(messages, model="model-a", json_schema=SCHEMA)
    assert len(transport.calls) == 3
    assert sent_json(transport.calls[2])["response_format"] == {
        "type": "json_object"
    }


ERROR_CASES = [
    pytest.param(429, "rate_limit", id="429-rate-limit"),
    pytest.param(500, "server", id="500-server"),
    pytest.param(503, "server", id="503-server"),
    pytest.param(401, "auth", id="401-auth"),
    pytest.param(403, "auth", id="403-auth"),
    pytest.param(404, "model_not_found", id="404-model"),
    pytest.param(400, "bad_request", id="400-bad-request"),
]


@pytest.mark.parametrize("status,kind", ERROR_CASES)
def test_http_errors_are_classified(status, kind):
    transport = FakeTransport()
    transport.add("POST", "/chat/completions", error_response(status, "x"))
    client = make_client(transport)
    with pytest.raises(ProviderError) as info:
        client.chat([{"role": "user", "content": "hi"}], model="model-a")
    assert info.value.kind == kind
    assert info.value.status == status
    assert info.value.provider == "groq"


def test_400_model_not_found_message_is_model_not_found():
    transport = FakeTransport()
    transport.add(
        "POST",
        "/chat/completions",
        error_response(400, "The model `x` does not exist"),
    )
    client = make_client(transport)
    with pytest.raises(ProviderError) as info:
        client.chat([{"role": "user", "content": "hi"}], model="x")
    assert info.value.kind == "model_not_found"


def test_429_reads_retry_after_header():
    transport = FakeTransport()
    transport.add(
        "POST",
        "/chat/completions",
        error_response(429, "slow down", headers={"Retry-After": "17"}),
    )
    client = make_client(transport)
    with pytest.raises(ProviderError) as info:
        client.chat([{"role": "user", "content": "hi"}], model="model-a")
    assert info.value.retry_after == 17.0
    assert info.value.per_day is False


def test_429_per_day_detected_from_body():
    body = (
        "Quota exceeded for metric: "
        "GenerateRequestsPerDayPerProjectPerModel-FreeTier"
    )
    transport = FakeTransport()
    transport.add("POST", "/chat/completions", error_response(429, body))
    client = make_client(transport)
    with pytest.raises(ProviderError) as info:
        client.chat([{"role": "user", "content": "hi"}], model="model-a")
    assert info.value.per_day is True


def test_timeout_raises_timeout_kind():
    transport = FakeTransport()
    transport.add("POST", "/chat/completions", TransportTimeout("slow"))
    client = make_client(transport)
    with pytest.raises(ProviderError) as info:
        client.chat([{"role": "user", "content": "hi"}], model="model-a")
    assert info.value.kind == "timeout"


def test_empty_content_is_bad_response():
    transport = FakeTransport()
    transport.add("POST", "/chat/completions", chat_response(""))
    client = make_client(transport)
    with pytest.raises(ProviderError) as info:
        client.chat([{"role": "user", "content": "hi"}], model="model-a")
    assert info.value.kind == "bad_response"


def test_missing_key_raises_no_key_without_network():
    transport = FakeTransport()
    client = make_client(transport, api_key=None)
    with pytest.raises(ProviderError) as info:
        client.chat([{"role": "user", "content": "hi"}], model="model-a")
    assert info.value.kind == "no_key"
    assert transport.calls == []


def test_error_message_never_contains_the_api_key():
    transport = FakeTransport()
    transport.add(
        "POST", "/chat/completions", error_response(401, "bad key sk-secret")
    )
    client = make_client(transport)
    with pytest.raises(ProviderError) as info:
        client.chat([{"role": "user", "content": "hi"}], model="model-a")
    assert "sk-secret" not in str(info.value)


def test_discovery_strips_models_prefix():
    transport = FakeTransport()
    transport.add(
        "GET",
        "/models",
        models_response(["models/gemini-3.8-flash", "models/x"]),
    )
    client = make_client(transport)
    assert client.discover_models() == ["gemini-3.8-flash", "x"]


def test_discovery_is_cached_for_24_hours():
    clock = FakeClock()
    transport = FakeTransport()
    transport.add("GET", "/models", models_response(["model-a"]))
    client = make_client(transport, clock=clock)
    client.discover_models()
    clock.advance(23 * 3600)
    client.discover_models()
    assert len(transport.calls) == 1
    clock.advance(2 * 3600)
    client.discover_models()
    assert len(transport.calls) == 2


def test_discovery_cache_dict_is_shared_with_caller():
    cache: dict = {}
    transport = FakeTransport()
    transport.add("GET", "/models", models_response(["model-a"]))
    make_client(transport, cache=cache).discover_models()
    assert cache["ids"] == ["model-a"]
    second = make_client(FakeTransport(), cache=cache)
    assert second.discover_models() == ["model-a"]


PREFERENCE_CASES = [
    pytest.param(
        ["gemini-3.8-flash"],
        ["gemini-3.8-flash-lite", "gemini-3.8-flash"],
        "gemini-3.8-flash",
        id="exact-beats-prefix",
    ),
    pytest.param(
        ["gemini-*-flash"],
        ["gemini-3.6-flash", "gemini-3.6-pro"],
        "gemini-3.6-flash",
        id="fnmatch-wildcard",
    ),
    pytest.param(
        ["openai/gpt-oss"],
        ["openai/gpt-oss-20b", "openai/gpt-oss-120b-long"],
        "openai/gpt-oss-20b",
        id="prefix-shortest-first",
    ),
    pytest.param(
        ["gpt-oss-120b"],
        ["llama", "@cf/openai/gpt-oss-120b"],
        "@cf/openai/gpt-oss-120b",
        id="contains",
    ),
    pytest.param(
        ["*:free"],
        ["paid/model", "google/gemma-4-31b-it:free"],
        "google/gemma-4-31b-it:free",
        id="openrouter-free",
    ),
    pytest.param(
        ["missing", "model-b"],
        ["model-a", "model-b"],
        "model-b",
        id="second-preference",
    ),
]


@pytest.mark.parametrize("prefs,available,expected", PREFERENCE_CASES)
def test_preference_matching(prefs, available, expected):
    transport = FakeTransport()
    transport.add("GET", "/models", models_response(available))
    client = make_client(transport, models_pref=prefs)
    assert client.resolve_models()[0] == expected


def test_tts_and_image_models_not_chosen_by_partial_match():
    transport = FakeTransport()
    transport.add(
        "GET",
        "/models",
        models_response(
            ["gemini-3.8-flash-preview-tts", "gemini-3.8-flash-image"]
        ),
    )
    client = make_client(
        transport, models_pref=["gemini-3.8-flash"], fallback_models=[]
    )
    assert client.resolve_models() == []


def test_resolve_models_excludes_given_models():
    transport = FakeTransport()
    transport.add("GET", "/models", models_response(["model-a", "model-b"]))
    client = make_client(transport, models_pref=["model-a", "model-b"])
    assert client.resolve_models(exclude={"model-a"}) == ["model-b"]


def test_discovery_failure_uses_fallback_models():
    transport = FakeTransport()
    transport.add("GET", "/models", error_response(404, "no such route"))
    client = make_client(
        transport, models_pref=["model-*"], fallback_models=["model-z"]
    )
    assert client.resolve_models() == ["model-z"]


def test_discovery_failure_keeps_plain_preferences_as_candidates():
    transport = FakeTransport()
    transport.add("GET", "/models", TransportTimeout("down"))
    client = make_client(
        transport, models_pref=["model-a", "model-*"], fallback_models=[]
    )
    assert client.resolve_models() == ["model-a"]


def test_discovery_with_bad_key_raises_auth():
    transport = FakeTransport()
    transport.add("GET", "/models", error_response(401, "invalid key"))
    client = make_client(transport)
    with pytest.raises(ProviderError) as info:
        client.discover_models()
    assert info.value.kind == "auth"


def test_chat_without_model_uses_first_resolved_model():
    transport = FakeTransport()
    transport.add("GET", "/models", models_response(["model-b", "model-a"]))
    transport.add("POST", "/chat/completions", chat_response("ok"))
    client = make_client(transport, models_pref=["model-a"])
    client.chat([{"role": "user", "content": "hi"}])
    assert sent_json(transport.calls[-1])["model"] == "model-a"
