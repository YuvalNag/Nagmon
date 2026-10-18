# SPDX-License-Identifier: GPL-3.0
"""WP9: default provider chains, settings and keys (SDD_AI §1, §10)."""

from __future__ import annotations

import json
import os

import pytest

from nagmon.ai.config import (
    GEMINI_KID_WARNING_HE,
    GROQ_ZDR_NOTE_HE,
    PRESETS,
    AISettings,
    build_kid_router,
    build_studio_router,
    load_keys,
    save_keys,
)
from nagmon.ai.fakes import FakeTransport

ALL_KEYS = {
    "gemini": "g",
    "groq": "q",
    "cerebras": "c",
    "openrouter": "o",
    "mistral": "m",
    "cloudflare": "cf",
    "cloudflare_account_id": "acct123",
}


def names(router):
    return [client.config.name for client in router.providers]


def test_studio_chain_order(tmp_path):
    router = build_studio_router(ALL_KEYS, tmp_path, transport=FakeTransport())
    assert names(router) == [
        "gemini",
        "groq",
        "cerebras",
        "openrouter",
        "mistral",
    ]


def test_kid_chain_is_groq_then_cloudflare(tmp_path):
    router = build_kid_router(
        ALL_KEYS, tmp_path, AISettings(), transport=FakeTransport()
    )
    assert names(router) == ["groq", "cloudflare"]
    assert all(client.config.kid_safe for client in router.providers)


def test_gemini_joins_kid_chain_only_when_parent_enabled(tmp_path):
    settings = AISettings(allow_gemini_for_kids=True)
    router = build_kid_router(
        ALL_KEYS, tmp_path, settings, transport=FakeTransport()
    )
    assert names(router) == ["groq", "cloudflare", "gemini"]
    assert router.providers[-1].config.kid_safe is True


def test_gemini_preset_is_not_kid_safe_by_default():
    assert PRESETS["gemini"].kid_safe is False
    assert PRESETS["groq"].kid_safe is True
    assert PRESETS["cloudflare"].kid_safe is True


def test_gemini_daily_quota_resets_in_los_angeles():
    assert PRESETS["gemini"].daily_reset_tz == "America/Los_Angeles"


BASE_URLS = [
    pytest.param(
        "gemini",
        "https://generativelanguage.googleapis.com/v1beta/openai",
        id="gemini",
    ),
    pytest.param("groq", "https://api.groq.com/openai/v1", id="groq"),
    pytest.param("cerebras", "https://api.cerebras.ai/v1", id="cerebras"),
    pytest.param(
        "openrouter", "https://openrouter.ai/api/v1", id="openrouter"
    ),
    pytest.param("mistral", "https://api.mistral.ai/v1", id="mistral"),
]


@pytest.mark.parametrize("name,url", BASE_URLS)
def test_preset_base_urls(name, url):
    assert PRESETS[name].base_url.rstrip("/") == url


def test_cloudflare_base_url_contains_account_id(tmp_path):
    router = build_kid_router(
        ALL_KEYS, tmp_path, AISettings(), transport=FakeTransport()
    )
    cloudflare = router.providers[1].config
    assert cloudflare.base_url == (
        "https://api.cloudflare.com/client/v4/accounts/acct123/ai/v1"
    )


def test_cloudflare_dropped_without_account_id(tmp_path):
    keys = dict(ALL_KEYS)
    del keys["cloudflare_account_id"]
    router = build_kid_router(
        keys, tmp_path, AISettings(), transport=FakeTransport()
    )
    assert names(router) == ["groq"]


def test_openrouter_prefers_free_models():
    assert any(":free" in pref for pref in PRESETS["openrouter"].models_pref)


def test_router_state_files_live_in_data_root(tmp_path):
    studio = build_studio_router(ALL_KEYS, tmp_path, transport=FakeTransport())
    kid = build_kid_router(
        ALL_KEYS, tmp_path, AISettings(), transport=FakeTransport()
    )
    assert studio.state_store.path == tmp_path / "ai_state_studio.json"
    assert kid.state_store.path == tmp_path / "ai_state_kid.json"


def test_kid_budget_comes_from_settings(tmp_path):
    settings = AISettings(kid_daily_per_child=7)
    router = build_kid_router(
        ALL_KEYS, tmp_path, settings, transport=FakeTransport()
    )
    assert router.budget.kid_per_child_per_day == 7


def test_load_keys_prefers_environment_then_secrets_file(tmp_path):
    (tmp_path / "secrets.json").write_text(
        json.dumps({"api_key": "x", "ai_keys": {"groq": "file-groq"}}),
        encoding="utf-8",
    )
    env = {"GEMINI_API_KEY": "env-gemini", "GROQ_API_KEY": ""}
    keys = load_keys(tmp_path, environ=env)
    assert keys["gemini"] == "env-gemini"
    assert keys["groq"] == "file-groq"


def test_save_keys_merges_and_keeps_other_secrets(tmp_path):
    path = tmp_path / "secrets.json"
    path.write_text(json.dumps({"api_key": "keep-me"}), encoding="utf-8")
    save_keys(tmp_path, {"groq": "new"})
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["api_key"] == "keep-me"
    assert data["ai_keys"]["groq"] == "new"
    if os.name == "posix":
        assert (path.stat().st_mode & 0o777) == 0o600


def test_warning_texts_explain_the_terms():
    assert "18" in GEMINI_KID_WARNING_HE
    assert "Gemini" in GEMINI_KID_WARNING_HE
    assert "Zero Data Retention" in GROQ_ZDR_NOTE_HE


def test_settings_roundtrip_dict():
    settings = AISettings(allow_gemini_for_kids=True, kid_daily_per_child=9)
    assert AISettings.from_dict(settings.to_dict()) == settings
