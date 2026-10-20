"""The space bank and the solar system trip zones (docs/app/TRIPS.md section 3).

Every space item carries exactly one zone tag, so a zone of the trip can
ask its own questions (five zones: the moon, near the sun, the rocky
planets, the giants and the edge of the solar system), and every zone
has items from kindergarten (grade 0) to grade 9. Only yaml + stdlib.
"""

from __future__ import annotations

from collections import Counter
from pathlib import Path

import pytest
import yaml

SPACE = (
    Path(__file__).resolve().parents[2]
    / "mods"
    / "nagmon"
    / "learning"
    / "science"
    / "space.yaml"
)
ZONES = ("moon", "sun", "rocky_planets", "giants", "outer")
GRADES = range(10)
MIN_KINDERGARTEN = 12
MIN_PER_ZONE = 20

with SPACE.open(encoding="utf-8") as _f:
    ITEMS = yaml.safe_load(_f)["items"]


def _zones(item) -> list[str]:
    return [t for t in item["tags"] if t in ZONES]


@pytest.mark.parametrize("item", ITEMS, ids=lambda i: i["id"])
def test_item_has_exactly_one_zone(item):
    assert len(_zones(item)) == 1, f"{item['id']}: zones {_zones(item)}"


@pytest.mark.parametrize("zone", ZONES)
def test_zone_covers_every_grade(zone):
    grades = Counter(i["grade"] for i in ITEMS if _zones(i) == [zone])
    missing = [g for g in GRADES if not grades[g]]
    assert not missing, f"{zone}: no items for grades {missing}"


def test_kindergarten_items_are_simple():
    kg = [i for i in ITEMS if i["grade"] == 0]
    assert len(kg) >= MIN_KINDERGARTEN
    assert {z for i in kg for z in _zones(i)} == set(ZONES)
    for i in kg:
        assert len(i["prompt_he"]) <= 60, f"{i['id']}: prompt too long"
        if i["kind"] != "true_false":
            emoji = [c for c in i["choices"] if c.get("emoji")]
            assert len(i["choices"]) <= 3, f"{i['id']}: too many choices"
            assert len(emoji) in (0, len(i["choices"])), i["id"]


def test_kindergarten_mostly_pictures():
    kg = [i for i in ITEMS if i["grade"] == 0 and i["kind"] != "true_false"]
    with_pictures = [
        i for i in kg if all(c.get("emoji") for c in i["choices"])
    ]
    assert len(with_pictures) >= 0.75 * len(kg)


def test_zone_sizes():
    sizes = Counter(z for i in ITEMS for z in _zones(i))
    for zone in ZONES:
        assert sizes[zone] >= MIN_PER_ZONE, f"{zone}: only {sizes[zone]} items"


def test_prompts_short():
    for i in ITEMS:
        assert len(i["prompt_he"]) <= 120, f"{i['id']}: prompt_he over 120"
