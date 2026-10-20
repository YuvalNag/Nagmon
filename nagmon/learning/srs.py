"""Leitner spaced repetition with an injected clock (SDD_LEARNING s.5)."""

from __future__ import annotations

import time
from collections.abc import Callable, Mapping
from dataclasses import asdict, dataclass
from typing import Any

DAY = 86400.0
INTERVALS_DAYS: tuple[int, ...] = (1, 3, 7, 14, 30)
MAX_BOX = len(INTERVALS_DAYS)


def interval_s(box: int) -> float:
    box = min(max(box, 1), MAX_BOX)
    return INTERVALS_DAYS[box - 1] * DAY


@dataclass
class Card:
    item_id: str
    skill_id: str
    seed: int | None
    box: int = 1
    due: float = 0.0
    reviews: int = 0
    lapses: int = 0
    last: float = 0.0


class LeitnerDeck:
    def __init__(self, clock: Callable[[], float] = time.time) -> None:
        self.clock = clock
        self.cards: dict[str, Card] = {}

    def __len__(self) -> int:
        return len(self.cards)

    def __contains__(self, item_id: object) -> bool:
        return item_id in self.cards

    def get(self, item_id: str) -> Card | None:
        return self.cards.get(item_id)

    def review(
        self,
        item_id: str,
        skill_id: str,
        seed: int | None,
        correct: bool,
        *,
        hinted: bool = False,
        now: float | None = None,
    ) -> Card:
        now = self.clock() if now is None else now
        card = self.cards.get(item_id)
        if card is None:
            card = Card(item_id=item_id, skill_id=skill_id, seed=seed, box=1)
            self.cards[item_id] = card
            if correct and not hinted:
                card.box = 2
        elif not correct:
            card.box = 1
            card.lapses += 1
        elif not hinted:
            card.box = min(card.box + 1, MAX_BOX)
        card.skill_id = skill_id or card.skill_id
        if seed is not None:
            card.seed = seed
        card.reviews += 1
        card.last = now
        card.due = now + interval_s(card.box)
        return card

    def due(
        self,
        now: float | None = None,
        skill_filter: Callable[[str], bool] | None = None,
    ) -> list[Card]:
        """Cards whose time has come, most overdue first."""
        now = self.clock() if now is None else now
        out = [
            c
            for c in self.cards.values()
            if c.due <= now
            and (skill_filter is None or skill_filter(c.skill_id))
        ]
        out.sort(key=lambda c: (c.due, c.item_id))
        return out

    def to_dict(self) -> dict[str, Any]:
        return {"cards": [asdict(c) for c in self.cards.values()]}

    @classmethod
    def from_dict(
        cls,
        data: Mapping[str, Any] | None,
        clock: Callable[[], float] = time.time,
    ) -> LeitnerDeck:
        deck = cls(clock=clock)
        for raw in (data or {}).get("cards", []):
            card = Card(**raw)
            deck.cards[card.item_id] = card
        return deck
