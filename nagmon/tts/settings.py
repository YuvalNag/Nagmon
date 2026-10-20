# SPDX-License-Identifier: GPL-3.0
"""Per-profile text-to-speech settings (SDD_TTS §2.3)."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, fields, replace
from typing import Any, Literal

Lang = Literal["he", "en"]
LANGS: tuple[Lang, ...] = ("he", "en")

# Children under this age get questions read aloud automatically.
AUTO_READ_UNDER_AGE = 8

_RATE_RE = re.compile(r"^[+-]?\d{1,3}%$")


@dataclass
class TTSSettings:
    enabled: bool = True
    allow_online: bool = False
    rate_he: str = "-10%"
    rate_en: str = "-10%"
    voice_he: str = "he-IL-HilaNeural"
    voice_en: str = "en-US-AnaNeural"
    offline_voice_he: str | None = None
    offline_voice_en: str | None = None
    auto_read_questions: bool = True
    read_english_with_english_voice: bool = True
    volume: float = 1.0
    cache_max_mb: int = 200

    @classmethod
    def for_age(cls, age: int | None, **overrides: Any) -> TTSSettings:
        auto = age is None or age < AUTO_READ_UNDER_AGE
        return replace(cls(auto_read_questions=auto), **overrides)

    def rate(self, lang: Lang) -> str:
        return self.rate_he if lang == "he" else self.rate_en

    def voice(self, lang: Lang) -> str:
        return self.voice_he if lang == "he" else self.voice_en

    def offline_voice(self, lang: Lang) -> str | None:
        return self.offline_voice_he if lang == "he" else self.offline_voice_en

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Any) -> TTSSettings:
        """Build settings from saved JSON; bad values fall back to defaults."""
        default = cls()
        if not isinstance(data, dict):
            return default
        values: dict[str, Any] = {}
        for f in fields(cls):
            if f.name not in data:
                continue
            value = data[f.name]
            if _valid(f.name, value, getattr(default, f.name)):
                values[f.name] = value
        return replace(default, **values)


def _valid(name: str, value: Any, default: Any) -> bool:
    if isinstance(default, bool):
        return isinstance(value, bool)
    if name.startswith("rate_"):
        return isinstance(value, str) and bool(_RATE_RE.match(value))
    if name.startswith("offline_voice_"):
        return value is None or isinstance(value, str)
    if name.startswith("voice_"):
        return isinstance(value, str) and bool(value.strip())
    if name == "volume":
        return (
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and 0.0 <= value <= 1.0
        )
    if name == "cache_max_mb":
        return (
            isinstance(value, int)
            and not isinstance(value, bool)
            and 1 <= value <= 10_000
        )
    return False
