"""Family values settings: what the game emphasises and how it words
things. Defaults are all ON."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

DEFAULT_EMPHASIS: tuple[str, ...] = (
    "giving",
    "respect",
    "honesty",
    "responsibility",
    "helping",
)

_BOOL_FIELDS = ("kindness_quests", "gentle_battle_wording", "modesty_filter")


@dataclass
class FamilyValues:
    kindness_quests: bool = True
    gentle_battle_wording: bool = True
    modesty_filter: bool = True
    emphasis: list[str] = field(default_factory=lambda: list(DEFAULT_EMPHASIS))
    extra: dict[str, Any] = field(default_factory=dict, compare=False)

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = dict(self.extra)
        for name in _BOOL_FIELDS:
            d[name] = getattr(self, name)
        d["emphasis"] = list(self.emphasis)
        return d

    @classmethod
    def from_dict(cls, d: Any) -> FamilyValues:
        if not isinstance(d, dict):
            return cls()
        v = cls()
        for name in _BOOL_FIELDS:
            if isinstance(d.get(name), bool):
                setattr(v, name, d[name])
        emphasis = d.get("emphasis")
        if isinstance(emphasis, list):
            v.emphasis = [e for e in emphasis if e in DEFAULT_EMPHASIS]
        known = set(_BOOL_FIELDS) | {"emphasis"}
        v.extra = {k: val for k, val in d.items() if k not in known}
        return v
