"""
Pure logic behind the question screen and the battle hooks
(docs/kids/SDD_QUIZ_GAMEPLAY.md): which subject a monster type practises,
the combo bonus, the per-battle question budget, and the input buffers
for the number pad, ordering and letter tiles.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

DEFAULT_SUBJECT = "math"
COMBO_EVERY = 3
COMBO_BONUS = 0.5


@dataclass
class SubjectMap:
    element_to_subject: dict[str, str]
    info: dict[str, dict[str, Any]]
    #: Monsters with a subject of their own, whatever their techniques'
    #: types (Hebrew has no element; docs/kids/SDD_ART.md §2.10).
    monster_to_subject: dict[str, str] = field(default_factory=dict)

    @classmethod
    def load(cls, path: Path) -> SubjectMap:
        doc = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
        info = dict(doc.get("subjects") or {})
        mapping = {
            element: subject
            for subject, data in info.items()
            for element in data.get("elements") or ()
        }
        monsters = {
            monster: subject
            for subject, data in info.items()
            for monster in data.get("monsters") or ()
        }
        return cls(mapping, info, monsters)

    def subject_for(
        self,
        types: Iterable[str],
        override: Mapping[str, str] | None = None,
        monster: str | None = None,
    ) -> str:
        """
        The subject of the attacking monster when it has one of its own,
        otherwise of the first technique type we know.
        """
        if monster and monster in self.monster_to_subject:
            return self.monster_to_subject[monster]
        for t in types:
            if override and t in override:
                return override[t]
            if t in self.element_to_subject:
                return self.element_to_subject[t]
        return DEFAULT_SUBJECT

    def title(self, subject: str) -> str:
        return str(self.info.get(subject, {}).get("title_he", subject))

    def color(self, subject: str) -> str:
        return str(self.info.get(subject, {}).get("color", "#999999"))


def combo_bonus(streak: int) -> float:
    """Extra power on every third correct answer in a row."""
    if streak > 0 and streak % COMBO_EVERY == 0:
        return COMBO_BONUS
    return 0.0


def power_with_combo(power: float, streak: int) -> float:
    return power + combo_bonus(streak) if power > 1.0 else power


@dataclass
class BattleQuizBudget:
    """How many questions one battle may ask (the parent sets it)."""

    limit: int
    asked: int = 0

    def take(self) -> bool:
        if self.asked >= self.limit:
            return False
        self.asked += 1
        return True


@dataclass
class NumberPad:
    """Digits, one decimal point or one fraction bar, leading minus."""

    max_len: int = 10
    text: str = ""

    def press(self, key: str) -> None:
        if key == "back":
            self.text = self.text[:-1]
            return
        if len(self.text) >= self.max_len:
            return
        if key.isdigit():
            self.text += key
        elif key == "-" and not self.text:
            self.text = "-"
        elif key == "." and "." not in self.text and "/" not in self.text:
            self.text += "."
        elif (
            key == "/" and self._has_digit() and not set("./") & set(self.text)
        ):
            self.text += "/"

    def _has_digit(self) -> bool:
        return any(c.isdigit() for c in self.text)

    def clear(self) -> None:
        self.text = ""


@dataclass
class OrderPicker:
    """Builds an ordering by picking items one after another."""

    ids: Sequence[str]
    picked: list[str] = field(default_factory=list)

    def pick(self, item_id: str) -> None:
        if item_id in self.ids and item_id not in self.picked:
            self.picked.append(item_id)

    def undo(self) -> None:
        if self.picked:
            self.picked.pop()

    @property
    def complete(self) -> bool:
        return len(self.picked) == len(self.ids)


@dataclass
class LetterTiles:
    """Spells a word from shuffled letter tiles."""

    letters: Sequence[str]
    used: list[int] = field(default_factory=list)

    def available(self, index: int) -> bool:
        return index not in self.used

    def pick(self, index: int) -> None:
        if 0 <= index < len(self.letters) and self.available(index):
            self.used.append(index)

    def undo(self) -> None:
        if self.used:
            self.used.pop()

    @property
    def word(self) -> str:
        return "".join(self.letters[i] for i in self.used)
