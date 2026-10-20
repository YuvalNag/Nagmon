# SPDX-License-Identifier: GPL-3.0
"""Provider presets, parent AI settings, keys and router factories
(SDD_AI §1, §10). Model ids are preferences, checked against
``GET /models`` at runtime."""

from __future__ import annotations

import json
import os
import time
from collections.abc import Callable, Mapping
from dataclasses import asdict, dataclass, field, fields
from pathlib import Path
from typing import Any

from nagmon.ai.providers import OpenAICompatClient, ProviderConfig, Transport
from nagmon.ai.router import Budget, JsonStateStore, Router

GEMINI_KID_WARNING_HE = (
    "שימו לב: לפי תנאי השימוש של Gemini API, צריך להיות בן 18 ומעלה, "
    "ואסור להשתמש בשירות באפליקציה שמיועדת לקטינים מתחת לגיל 18 או "
    "שקטינים צפויים להשתמש בה. בגרסה החינמית Google משתמשת בשאלות "
    "ובתשובות כדי לשפר את המוצרים שלה, ובני אדם עשויים לקרוא אותן. "
    "אם תפעילו את האפשרות הזו, שאלות של הילדים לינשוף עלולות להישלח "
    "ל־Gemini (רק אם Groq ו־Cloudflare לא זמינים). "
    "זו החלטה שלכם כהורים. מומלץ להשאיר כבוי."
)

GROQ_ZDR_NOTE_HE = (
    "מומלץ להדליק ב־Groq console (Settings → Data Controls) את "
    "Zero Data Retention, כדי ש־Groq לא ישמור את השאלות והתשובות של "
    "הילדים. Groq לא מאמן מודלים על הנתונים."
)

CLOUDFLARE_NOTE_HE = (
    "Cloudflare Workers AI לא משתמש בתוכן כדי לאמן מודלים. "
    "צריך גם מפתח (API token) וגם מזהה חשבון (Account ID)."
)

CLOUDFLARE_BASE = (
    "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1"
)


@dataclass(frozen=True)
class ProviderPreset:
    name: str
    label_he: str
    base_url: str
    models_pref: tuple[str, ...]
    fallback_models: tuple[str, ...]
    env_key: str
    kid_safe: bool = False
    supports_json_schema: bool = False
    daily_reset_tz: str = "UTC"
    extra_headers: tuple[tuple[str, str], ...] = ()
    note_he: str = ""


PRESETS: dict[str, ProviderPreset] = {
    p.name: p
    for p in (
        ProviderPreset(
            name="gemini",
            label_he="Google Gemini",
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            models_pref=(
                "gemini-3.8-flash",
                "gemini-3.7-flash",
                "gemini-3.6-flash",
                "gemini-flash-latest",
                "gemini-*-flash",
                "gemini-3.8-flash-lite",
                "gemini-*-flash-lite",
                "gemini-*flash*",
            ),
            fallback_models=("gemini-flash-latest", "gemini-2.5-flash"),
            env_key="GEMINI_API_KEY",
            supports_json_schema=True,
            daily_reset_tz="America/Los_Angeles",
            note_he="הכי טוב בעברית. לסטודיו של ההורים בלבד.",
        ),
        ProviderPreset(
            name="groq",
            label_he="Groq",
            base_url="https://api.groq.com/openai/v1",
            models_pref=(
                "openai/gpt-oss-120b",
                "qwen/qwen3.6-27b",
                "openai/gpt-oss-20b",
                "llama-3.3-70b",
                "gpt-oss",
            ),
            fallback_models=("openai/gpt-oss-120b", "openai/gpt-oss-20b"),
            env_key="GROQ_API_KEY",
            kid_safe=True,
            note_he=GROQ_ZDR_NOTE_HE,
        ),
        ProviderPreset(
            name="cerebras",
            label_he="Cerebras",
            base_url="https://api.cerebras.ai/v1",
            models_pref=(
                "gpt-oss-120b",
                "zai-glm",
                "llama-3.3-70b",
                "gpt-oss",
            ),
            fallback_models=("gpt-oss-120b",),
            env_key="CEREBRAS_API_KEY",
            supports_json_schema=True,
        ),
        ProviderPreset(
            name="openrouter",
            label_he="OpenRouter (מודלים חינמיים)",
            base_url="https://openrouter.ai/api/v1",
            models_pref=(
                "google/gemma-4-31b-it:free",
                "google/gemma-*:free",
                "openai/gpt-oss-120b:free",
                "*:free",
            ),
            fallback_models=("google/gemma-4-31b-it:free",),
            env_key="OPENROUTER_API_KEY",
            extra_headers=(
                ("HTTP-Referer", "https://github.com/nagmon/nagmon"),
                ("X-Title", "Nagmon content studio"),
            ),
            note_he="רק 50 בקשות ביום בחינם. כדאי לחסום ספקים שמאמנים.",
        ),
        ProviderPreset(
            name="mistral",
            label_he="Mistral",
            base_url="https://api.mistral.ai/v1",
            models_pref=(
                "mistral-medium-latest",
                "mistral-small-latest",
                "mistral-small",
            ),
            fallback_models=("mistral-small-latest",),
            env_key="MISTRAL_API_KEY",
            note_he="בתוכנית החינמית Mistral מאמן על הבקשות.",
        ),
        ProviderPreset(
            name="cloudflare",
            label_he="Cloudflare Workers AI",
            base_url=CLOUDFLARE_BASE,
            models_pref=(
                "@cf/openai/gpt-oss-120b",
                "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
                "@cf/mistralai/mistral-small-3.1-24b-instruct",
                "@cf/google/gemma-3-12b-it",
            ),
            fallback_models=(
                "@cf/openai/gpt-oss-120b",
                "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
            ),
            env_key="CLOUDFLARE_API_TOKEN",
            kid_safe=True,
            note_he=CLOUDFLARE_NOTE_HE,
        ),
    )
}

STUDIO_ORDER = ("gemini", "groq", "cerebras", "openrouter", "mistral")
KID_ORDER = ("groq", "cloudflare")

ENV_KEYS = {name: preset.env_key for name, preset in PRESETS.items()}
ENV_KEYS["cloudflare_account_id"] = "CLOUDFLARE_ACCOUNT_ID"
ENV_ALIASES = {"gemini": ("GOOGLE_API_KEY",)}


@dataclass(frozen=True)
class AISettings:
    """Parent choices. Stored by WP8 (``ParentSettings.ai``) as a dict."""

    owl_enabled: bool = False
    allow_gemini_for_kids: bool = False
    kid_daily_per_child: int = 60
    studio_daily: int = 300
    free_text_min_age: int = 8

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Mapping[str, Any] | None) -> AISettings:
        known = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in (data or {}).items() if k in known})


def default_data_root(environ: Mapping[str, str] | None = None) -> Path:
    env = os.environ if environ is None else environ
    if env.get("NAGMON_DATA"):
        return Path(env["NAGMON_DATA"])
    return Path.home() / ".nagmon"


def _secrets_path(data_root: Path) -> Path:
    return Path(data_root) / "secrets.json"


def read_secrets(data_root: Path) -> dict[str, Any]:
    """Everything in ``secrets.json`` ({} if missing or broken)."""
    try:
        data = json.loads(_secrets_path(data_root).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def load_keys(
    data_root: Path, environ: Mapping[str, str] | None = None
) -> dict[str, str]:
    """Environment variables first, then ``secrets.json["ai_keys"]``."""
    env = os.environ if environ is None else environ
    stored = read_secrets(data_root).get("ai_keys")
    stored = stored if isinstance(stored, dict) else {}
    keys: dict[str, str] = {}
    for name, var in ENV_KEYS.items():
        candidates = [env.get(var, "")]
        candidates += [env.get(a, "") for a in ENV_ALIASES.get(name, ())]
        candidates.append(str(stored.get(name) or ""))
        value = next((c.strip() for c in candidates if c and c.strip()), "")
        if value:
            keys[name] = value
    return keys


def save_keys(data_root: Path, keys: Mapping[str, str | None]) -> None:
    """Merge keys into ``secrets.json`` (0600). Empty value removes."""
    data = read_secrets(data_root)
    ai_keys = data.get("ai_keys")
    ai_keys = dict(ai_keys) if isinstance(ai_keys, dict) else {}
    for name, value in keys.items():
        if value:
            ai_keys[name] = value.strip()
        else:
            ai_keys.pop(name, None)
    data["ai_keys"] = ai_keys
    write_secrets(data_root, data)


def write_secrets(data_root: Path, data: Mapping[str, Any]) -> None:
    """
    Writes the whole ``secrets.json`` (0600, atomic). Callers read it
    first and change only their own part (read-merge-write).
    """
    path = _secrets_path(data_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(dict(data), fh, ensure_ascii=False, indent=1)
    os.replace(tmp, path)
    try:
        os.chmod(path, 0o600)
    except OSError:  # not enforced on Windows
        pass


def provider_config(
    name: str, keys: Mapping[str, str], *, kid_safe: bool | None = None
) -> ProviderConfig | None:
    """A ``ProviderConfig`` from a preset, or None if it cannot work
    (Cloudflare without an account id)."""
    preset = PRESETS[name]
    base_url = preset.base_url
    if name == "cloudflare":
        account = keys.get("cloudflare_account_id", "").strip()
        if not account:
            return None
        base_url = CLOUDFLARE_BASE.format(account_id=account)
    return ProviderConfig(
        name=name,
        base_url=base_url,
        api_key=keys.get(name) or None,
        models_pref=list(preset.models_pref),
        extra_headers=dict(preset.extra_headers),
        kid_safe=preset.kid_safe if kid_safe is None else kid_safe,
        fallback_models=list(preset.fallback_models),
        supports_json_schema=preset.supports_json_schema,
        daily_reset_tz=preset.daily_reset_tz,
        label_he=preset.label_he,
    )


@dataclass
class _Factory:
    transport: Transport | None = None
    clock: Callable[[], float] = time.time
    clients: list[OpenAICompatClient] = field(default_factory=list)

    def add(self, config: ProviderConfig | None) -> None:
        if config is not None:
            self.clients.append(
                OpenAICompatClient(
                    config, transport=self.transport, clock=self.clock
                )
            )


def build_studio_router(
    keys: Mapping[str, str],
    data_root: Path,
    *,
    settings: AISettings | None = None,
    transport: Transport | None = None,
    clock: Callable[[], float] = time.time,
) -> Router:
    """Parent content studio: Gemini → Groq → Cerebras → OpenRouter →
    Mistral."""
    settings = settings or AISettings()
    factory = _Factory(transport, clock)
    for name in STUDIO_ORDER:
        factory.add(provider_config(name, keys))
    return Router(
        factory.clients,
        JsonStateStore(Path(data_root) / "ai_state_studio.json"),
        clock,
        budget=Budget(studio_per_day=settings.studio_daily),
    )


def build_kid_router(
    keys: Mapping[str, str],
    data_root: Path,
    settings: AISettings,
    *,
    transport: Transport | None = None,
    clock: Callable[[], float] = time.time,
) -> Router:
    """Kid-facing: Groq → Cloudflare (→ Gemini, only if the parent
    explicitly allowed it after reading ``GEMINI_KID_WARNING_HE``).
    Offline canned answers are the caller's last fallback."""
    factory = _Factory(transport, clock)
    for name in KID_ORDER:
        factory.add(provider_config(name, keys))
    if settings.allow_gemini_for_kids:
        factory.add(provider_config("gemini", keys, kid_safe=True))
    return Router(
        factory.clients,
        JsonStateStore(Path(data_root) / "ai_state_kid.json"),
        clock,
        budget=Budget(kid_per_child_per_day=settings.kid_daily_per_child),
        request_timeout=15.0,
        overall_deadline=30.0,
    )
