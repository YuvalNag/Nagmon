# SPDX-License-Identifier: GPL-3.0
"""WP9: ordered fallback router, rest windows, budget (SDD_AI §4)."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone

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
    TransportTimeout,
)
from nagmon.ai.router import (
    AllProvidersFailed,
    Budget,
    BudgetExceeded,
    JsonStateStore,
    MemoryStateStore,
    Router,
)

MSG = [{"role": "user", "content": "hi"}]
NOON_UTC = datetime(2026, 10, 18, 12, 0, tzinfo=timezone.utc).timestamp()


def provider(name, transport, clock, *, models=("m1",), **overrides):
    fields = dict(
        name=name,
        base_url=f"https://{name}.test/v1",
        api_key=f"key-{name}",
        models_pref=list(models),
        fallback_models=list(models),
        kid_safe=True,
    )
    fields.update(overrides)
    return OpenAICompatClient(
        ProviderConfig(**fields), transport=transport, clock=clock
    )


def setup(*names, clock=None, budget=None, store=None, **overrides):
    clock = clock or FakeClock(NOON_UTC)
    transport = FakeTransport()
    for name in names:
        models = overrides.get(f"{name}_models", ("m1",))
        transport.add(
            "GET", f"https://{name}.test/v1/models", models_response(models)
        )
    clients = [
        provider(
            n,
            transport,
            clock,
            models=overrides.get(f"{n}_models", ("m1",)),
            **overrides.get(n, {}),
        )
        for n in names
    ]
    router = Router(
        clients,
        store or MemoryStateStore(),
        clock,
        budget=budget or Budget(),
    )
    return router, transport, clock


def chat_url(name):
    return f"https://{name}.test/v1/chat/completions"


def chat_calls(transport, name):
    return [c for c in transport.calls if c.url == chat_url(name)]


def test_first_provider_answers():
    router, transport, _ = setup("a", "b")
    transport.add("POST", chat_url("a"), chat_response("from a"))
    result = router.chat(MSG, purpose="studio")
    assert result.text == "from a"
    assert result.provider == "a"
    assert result.model == "m1"


def test_falls_back_to_next_provider_on_error():
    router, transport, _ = setup("a", "b")
    transport.add("POST", chat_url("a"), error_response(400, "bad"))
    transport.add("POST", chat_url("b"), chat_response("from b"))
    assert router.chat(MSG, purpose="studio").provider == "b"


def test_429_rests_model_for_retry_after_seconds():
    router, transport, clock = setup("a", "b")
    transport.add(
        "POST",
        chat_url("a"),
        error_response(429, "slow", headers={"Retry-After": "30"}),
        chat_response("a again"),
    )
    transport.add("POST", chat_url("b"), chat_response("from b"))
    assert router.chat(MSG, purpose="studio").provider == "b"
    clock.advance(10)
    assert router.chat(MSG, purpose="studio").provider == "b"
    assert len(chat_calls(transport, "a")) == 1
    clock.advance(21)
    assert router.chat(MSG, purpose="studio").provider == "a"


def test_429_without_retry_after_rests_60_seconds():
    router, transport, clock = setup("a", "b")
    transport.add(
        "POST",
        chat_url("a"),
        error_response(429, "slow"),
        chat_response("a again"),
    )
    transport.add("POST", chat_url("b"), chat_response("from b"))
    router.chat(MSG, purpose="studio")
    clock.advance(59)
    assert router.chat(MSG, purpose="studio").provider == "b"
    clock.advance(2)
    assert router.chat(MSG, purpose="studio").provider == "a"


def test_429_tries_next_model_of_same_provider_first():
    router, transport, _ = setup("a", "b", a_models=("m1", "m2"))

    def answer(call):
        model = json.loads(call.body)["model"]
        if model == "m1":
            return error_response(429, "slow")
        return chat_response("from m2")

    transport.add("POST", chat_url("a"), answer)
    result = router.chat(MSG, purpose="studio")
    assert (result.provider, result.model) == ("a", "m2")


def test_gemini_daily_429_rests_until_los_angeles_midnight():
    clock = FakeClock(
        datetime(2026, 10, 18, 20, 0, tzinfo=timezone.utc).timestamp()
    )
    router, transport, _ = setup(
        "gemini",
        "b",
        clock=clock,
        gemini={"daily_reset_tz": "America/Los_Angeles"},
    )
    transport.add(
        "POST",
        chat_url("gemini"),
        error_response(429, "Quota exceeded: requests per day"),
        chat_response("gemini again"),
    )
    transport.add("POST", chat_url("b"), chat_response("from b"))
    router.chat(MSG, purpose="studio")
    la_midnight = datetime(2026, 10, 19, 7, 0, tzinfo=timezone.utc)
    clock.t = la_midnight.timestamp() - 60
    assert router.chat(MSG, purpose="studio").provider == "b"
    clock.t = la_midnight.timestamp() + 1
    assert router.chat(MSG, purpose="studio").provider == "gemini"


def test_daily_429_status_is_hebrew_daily_quota():
    router, transport, _ = setup("a", "b")
    transport.add(
        "POST", chat_url("a"), error_response(429, "tokens per day (TPD)")
    )
    transport.add("POST", chat_url("b"), chat_response("ok"))
    router.chat(MSG, purpose="studio")
    status = {s.name: s for s in router.status_report()}["a"]
    assert status.state == "daily_quota"
    assert "מכסה" in status.message_he


def test_5xx_retried_once_then_next_provider():
    router, transport, _ = setup("a", "b")
    transport.add("POST", chat_url("a"), error_response(500, "oops"))
    transport.add("POST", chat_url("b"), chat_response("from b"))
    assert router.chat(MSG, purpose="studio").provider == "b"
    assert len(chat_calls(transport, "a")) == 2


def test_5xx_retry_can_succeed():
    router, transport, _ = setup("a", "b")
    transport.add(
        "POST",
        chat_url("a"),
        error_response(503, "busy"),
        chat_response("second try"),
    )
    assert router.chat(MSG, purpose="studio").text == "second try"


def test_401_marks_key_problem_and_skips_provider_later():
    router, transport, _ = setup("a", "b")
    transport.add("POST", chat_url("a"), error_response(401, "bad key"))
    transport.add("POST", chat_url("b"), chat_response("from b"))
    router.chat(MSG, purpose="studio")
    router.chat(MSG, purpose="studio")
    assert len(chat_calls(transport, "a")) == 1
    status = {s.name: s for s in router.status_report()}["a"]
    assert status.state == "key_problem"
    assert "מפתח" in status.message_he


def test_key_problem_cleared_when_key_changes():
    router, transport, _ = setup("a", "b")
    transport.add(
        "POST",
        chat_url("a"),
        error_response(403, "forbidden"),
        chat_response("fixed"),
    )
    transport.add("POST", chat_url("b"), chat_response("from b"))
    router.chat(MSG, purpose="studio")
    router.providers[0].config.api_key = "new-key"
    assert router.chat(MSG, purpose="studio").provider == "a"


def test_reset_provider_clears_key_problem():
    router, transport, _ = setup("a", "b")
    transport.add(
        "POST",
        chat_url("a"),
        error_response(401, "bad"),
        chat_response("fixed"),
    )
    transport.add("POST", chat_url("b"), chat_response("from b"))
    router.chat(MSG, purpose="studio")
    router.reset_provider("a")
    assert router.chat(MSG, purpose="studio").provider == "a"


def test_404_model_invalidated_until_next_discovery():
    router, transport, clock = setup("a", "b", a_models=("m1", "m2"))
    seen = []

    def answer(call):
        model = json.loads(call.body)["model"]
        seen.append(model)
        if model == "m1":
            return error_response(404, "model not found")
        return chat_response("from " + model)

    transport.add("POST", chat_url("a"), answer)
    assert router.chat(MSG, purpose="studio").model == "m2"
    assert router.chat(MSG, purpose="studio").model == "m2"
    assert seen == ["m1", "m2", "m2"]
    clock.advance(25 * 3600)
    router.chat(MSG, purpose="studio")
    assert seen[-2:] == ["m1", "m2"]


def test_timeout_moves_to_next_provider():
    router, transport, _ = setup("a", "b")
    transport.add("POST", chat_url("a"), TransportTimeout("slow"))
    transport.add("POST", chat_url("b"), chat_response("from b"))
    assert router.chat(MSG, purpose="studio").provider == "b"
    assert len(chat_calls(transport, "a")) == 1


def test_overall_deadline_stops_trying_more_providers():
    router, transport, clock = setup("a", "b")

    def slow(call):
        clock.advance(121)
        raise TransportTimeout("slow")

    transport.add("POST", chat_url("a"), slow)
    transport.add("POST", chat_url("b"), chat_response("from b"))
    with pytest.raises(AllProvidersFailed):
        router.chat(MSG, purpose="studio")
    assert chat_calls(transport, "b") == []


def test_request_timeout_is_capped_by_remaining_deadline():
    router, transport, clock = setup("a", "b")

    def slow(call):
        clock.advance(100)
        raise TransportTimeout("slow")

    transport.add("POST", chat_url("a"), slow)
    transport.add("POST", chat_url("b"), chat_response("from b"))
    router.chat(MSG, purpose="studio")
    assert chat_calls(transport, "a")[0].timeout == 45.0
    assert chat_calls(transport, "b")[0].timeout == pytest.approx(20.0)


def test_kid_purpose_skips_provider_that_is_not_kid_safe():
    router, transport, _ = setup("a", "b", a={"kid_safe": False})
    transport.add("POST", chat_url("a"), chat_response("from a"))
    transport.add("POST", chat_url("b"), chat_response("from b"))
    assert router.chat(MSG, purpose="kid", budget_key="p1").provider == "b"
    assert chat_calls(transport, "a") == []


def test_kid_budget_is_per_child_per_day():
    router, transport, clock = setup(
        "a", budget=Budget(kid_per_child_per_day=2)
    )
    transport.add("POST", chat_url("a"), chat_response("ok"))
    router.chat(MSG, purpose="kid", budget_key="p1")
    router.chat(MSG, purpose="kid", budget_key="p1")
    with pytest.raises(BudgetExceeded) as info:
        router.chat(MSG, purpose="kid", budget_key="p1")
    assert re.search("[א-ת]", info.value.message_he)
    router.chat(MSG, purpose="kid", budget_key="p2")
    clock.advance(24 * 3600)
    router.chat(MSG, purpose="kid", budget_key="p1")


def test_budget_default_for_kids_is_60():
    assert Budget().kid_per_child_per_day == 60


def test_failed_calls_are_not_charged_to_budget():
    router, transport, _ = setup("a", budget=Budget(kid_per_child_per_day=1))
    transport.add(
        "POST",
        chat_url("a"),
        error_response(400, "bad"),
        chat_response("ok"),
    )
    with pytest.raises(AllProvidersFailed):
        router.chat(MSG, purpose="kid", budget_key="p1")
    assert router.usage_today("kid", "p1") == 0
    router.chat(MSG, purpose="kid", budget_key="p1")
    assert router.usage_today("kid", "p1") == 1


def test_studio_budget_is_enforced():
    router, transport, _ = setup("a", budget=Budget(studio_per_day=1))
    transport.add("POST", chat_url("a"), chat_response("ok"))
    router.chat(MSG, purpose="studio")
    with pytest.raises(BudgetExceeded):
        router.chat(MSG, purpose="studio")


def test_state_persists_across_router_instances(tmp_path):
    path = tmp_path / "ai_state.json"
    router, transport, clock = setup("a", "b", store=JsonStateStore(path))
    transport.add("POST", chat_url("a"), error_response(429, "slow"))
    transport.add("POST", chat_url("b"), chat_response("from b"))
    router.chat(MSG, purpose="kid", budget_key="p1")
    saved = json.loads(path.read_text(encoding="utf-8"))
    assert saved["schema_version"] == 1
    again = Router(router.providers, JsonStateStore(path), clock)
    assert again.usage_today("kid", "p1") == 1
    again.chat(MSG, purpose="studio")
    assert len(chat_calls(transport, "a")) == 1


def test_corrupt_state_file_starts_empty(tmp_path):
    path = tmp_path / "ai_state.json"
    path.write_text("{not json", encoding="utf-8")
    router, transport, _ = setup("a", store=JsonStateStore(path))
    transport.add("POST", chat_url("a"), chat_response("ok"))
    assert router.chat(MSG, purpose="studio").text == "ok"


def test_status_report_is_hebrew_without_http_codes():
    router, transport, _ = setup("a", "b", "c", c={"api_key": None})
    transport.add(
        "POST",
        chat_url("a"),
        error_response(429, "slow", headers={"Retry-After": "30"}),
    )
    transport.add("POST", chat_url("b"), chat_response("ok"))
    router.chat(MSG, purpose="studio")
    report = {s.name: s for s in router.status_report()}
    assert report["a"].state == "resting"
    assert report["b"].state == "ok"
    assert report["c"].state == "no_key"
    for status in report.values():
        assert re.search("[א-ת]", status.message_he)
        assert not re.search(r"\b(429|401|403|404|500)\b", status.message_he)


def test_all_providers_failed_has_hebrew_message():
    router, transport, _ = setup("a")
    transport.add("POST", chat_url("a"), TransportTimeout("down"))
    with pytest.raises(AllProvidersFailed) as info:
        router.chat(MSG, purpose="studio")
    assert re.search("[א-ת]", info.value.message_he)
    assert info.value.errors


def test_provider_without_key_is_skipped():
    router, transport, _ = setup("a", "b", a={"api_key": None})
    transport.add("POST", chat_url("b"), chat_response("from b"))
    assert router.chat(MSG, purpose="studio").provider == "b"
    assert chat_calls(transport, "a") == []
