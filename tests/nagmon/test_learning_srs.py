"""S1-S5: Leitner boxes with an injected clock."""

import pytest

from nagmon.learning.srs import DAY, INTERVALS_DAYS, LeitnerDeck


def test_intervals():
    assert INTERVALS_DAYS == (1, 3, 7, 14, 30)


def test_s1_new_item(clock):
    deck = LeitnerDeck(clock=clock)
    c = deck.review("i1", "math.x", 11, True)
    assert c.box == 2
    assert c.due == pytest.approx(clock.now + 3 * DAY)
    w = deck.review("i2", "math.x", 12, False)
    assert w.box == 1
    assert w.due == pytest.approx(clock.now + DAY)


def test_s2_progression(clock):
    deck = LeitnerDeck(clock=clock)
    boxes = []
    for _ in range(6):
        boxes.append(deck.review("i1", "math.x", 1, True).box)
        clock.advance(40 * DAY)
    assert boxes == [2, 3, 4, 5, 5, 5]
    c = deck.get("i1")
    assert c.due - c.last == pytest.approx(30 * DAY)


def test_s3_lapse(clock):
    deck = LeitnerDeck(clock=clock)
    for _ in range(3):
        deck.review("i1", "math.x", 1, True)
    assert deck.get("i1").box == 4
    c = deck.review("i1", "math.x", 1, False)
    assert c.box == 1
    assert c.lapses == 1


def test_hint_does_not_promote(clock):
    deck = LeitnerDeck(clock=clock)
    deck.review("i1", "math.x", 1, True)
    c = deck.review("i1", "math.x", 1, True, hinted=True)
    assert c.box == 2


def test_s4_due(clock):
    deck = LeitnerDeck(clock=clock)
    deck.review("a", "math.x", 1, False)  # due +1d
    deck.review("b", "math.y", 2, True)  # due +3d
    clock.advance(0.5 * DAY)
    deck.review("c", "math.x", 3, False)  # due +1.5d from start
    assert deck.due() == []
    clock.advance(2 * DAY)
    assert [c.item_id for c in deck.due()] == ["a", "c"]
    clock.advance(DAY)
    assert [c.item_id for c in deck.due()] == ["a", "c", "b"]
    only_y = deck.due(skill_filter=lambda s: s == "math.y")
    assert [c.item_id for c in only_y] == ["b"]


def test_s5_roundtrip(clock):
    deck = LeitnerDeck(clock=clock)
    deck.review("a", "math.x", 5, True)
    deck.review("b", "math.y", 6, False)
    again = LeitnerDeck.from_dict(deck.to_dict(), clock=clock)
    assert again.to_dict() == deck.to_dict()
    assert len(again) == 2
