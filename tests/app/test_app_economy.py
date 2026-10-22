"""The economy build step: the table is checked, then shipped."""

from __future__ import annotations

import copy

import pytest

from tools.app import economy
from tools.app.common import Output
from tools.app.content import read_yaml


def doc():
    return copy.deepcopy(read_yaml(economy.SOURCE))


def test_the_shipped_table_is_valid_and_has_forty_six_items():
    out = Output()
    assert economy.build(out) == {"items": 46, "chests": 1, "facts": 69}
    assert "economy.json" in out.paths()
    assert "loot.json" in out.paths()
    assert "facts.json" in out.paths()


def test_every_tab_has_items_and_nets_come_in_two_strengths():
    d = doc()
    for tab in d["tabs"]:
        assert [i for i in d["items"] if i["tab"] == tab]
    assert sorted(
        i["seal_less"] for i in d["items"] if i["kind"] == "net"
    ) == [0, 1]


def test_the_three_helpers_are_there():
    d = doc()
    assert {i["helper"] for i in d["items"] if i["kind"] == "helper"} == {
        "hint",
        "fifty",
        "pass",
    }


def test_the_shop_has_three_shelves_of_one_to_six_priced_items():
    """The shop screen (app/src/core/game/shop.ts) shelves nets, snacks and tonics, helpers."""
    d = doc()
    shelf_of = {
        "net": "nets",
        "snack": "snacks",
        "tonic": "snacks",
        "helper": "helpers",
    }
    for shelf in ("nets", "snacks", "helpers"):
        items = [i for i in d["items"] if shelf_of.get(i["kind"]) == shelf]
        assert 1 <= len(items) <= 6, shelf
        assert all(i["price"] > 0 for i in items)


@pytest.mark.parametrize(
    "change",
    [
        lambda d: d["items"][0].update(price=-1),
        lambda d: d["items"][0].update(price=0),
        lambda d: d["items"][1].update(id=d["items"][0]["id"]),
        lambda d: d["items"][0].update(tab="shop"),
        lambda d: d["items"][0].update(kind="sword"),
        lambda d: d["items"][0].pop("seal_less"),
        lambda d: d["items"][0].pop("icon"),
        lambda d: d["starter_kit"].update(ghost=1),
        lambda d: d["spare_net"].update(item="ghost"),
        lambda d: d["tabs"].pop(),
    ],
)
def test_a_typo_stops_the_build(change):
    d = doc()
    change(d)
    with pytest.raises(ValueError):
        economy.check(d)


# ---- the loot table: the Rest Center's gift and the chests


def loot():
    return copy.deepcopy(read_yaml(economy.LOOT))


def item_ids():
    return {i["id"] for i in doc()["items"]}


def test_the_shipped_loot_is_valid_and_the_home_chest_opens_each_day():
    d = economy.check_loot(loot(), item_ids())
    assert d["chests"]["home_daily"]["repeat"] == "daily"
    assert len(d["daily_gift"]) >= 3


def test_the_hint_and_the_egg_are_items_the_economy_has():
    assert {economy.HINT_ITEM, economy.EGG_ITEM} <= item_ids()
    egg = next(i for i in doc()["items"] if i["id"] == economy.EGG_ITEM)
    assert egg["kind"] == "key" and egg["price"] == 0  # found, never sold


@pytest.mark.parametrize(
    "change",
    [
        lambda d: d["daily_gift"].clear(),
        lambda d: d["daily_gift"].append({"coins": 0}),
        lambda d: d["daily_gift"].append({"coins": 5, "item": "berry"}),
        lambda d: d["daily_gift"].append({"item": "ghost", "n": 1}),
        lambda d: d["daily_gift"].append({"item": "berry", "n": 0}),
        lambda d: d["daily_gift"].append({"egg": 2}),
        lambda d: d["daily_gift"].append({"hint": 1, "mood": "x"}),
        lambda d: d["daily_gift"].append({}),
        lambda d: d["chests"]["home_daily"].update(repeat="weekly"),
        lambda d: d["chests"]["home_daily"].update(prizes=[]),
        lambda d: d["chests"]["home_daily"].pop("consolation"),
        lambda d: d["chests"].update({"bad id": d["chests"]["home_daily"]}),
        lambda d: d["chests"].clear(),
    ],
)
def test_a_loot_table_with_a_mistake_stops_the_build(change):
    d = loot()
    change(d)
    with pytest.raises(ValueError):
        economy.check_loot(d, item_ids())


# ---- the facts of signs and notice boards


def facts():
    return copy.deepcopy(read_yaml(economy.FACTS))


def test_the_shipped_facts_are_valid_one_liners_with_a_picture_that_exists():
    from tools.app import emoji

    d = economy.check_facts(facts())
    assert len(d["facts"]) >= 5
    for fid, fact in d["facts"].items():
        assert emoji.resolve(fact["emoji"]), fid
    assert economy.fact_codes() == {f["emoji"] for f in d["facts"].values()}


def test_the_fact_base_has_every_subject_and_no_line_twice():
    d = economy.check_facts(facts())["facts"]
    by_subject: dict[str, int] = {}
    for fact in d.values():
        by_subject[fact["subject"]] = by_subject.get(fact["subject"], 0) + 1
    assert set(by_subject) == set(economy.FACT_SUBJECTS)
    assert min(by_subject.values()) >= 5
    texts = [f["text_he"] for f in d.values()]
    assert len(set(texts)) == len(texts)


@pytest.mark.parametrize(
    "change",
    [
        lambda d: d["facts"].clear(),
        lambda d: d["facts"]["owl_night"].pop("emoji"),
        lambda d: d["facts"]["owl_night"].update(text_he=""),
        lambda d: d["facts"]["owl_night"].update(text_he="א" * 71),
        lambda d: d["facts"]["owl_night"].update(text_he="שורה\nשתיים"),
        lambda d: d["facts"].update({"bad id": d["facts"]["owl_night"]}),
        lambda d: d["facts"]["owl_night"].pop("subject"),
        lambda d: d["facts"]["owl_night"].update(subject="sports"),
    ],
)
def test_a_fact_with_a_mistake_stops_the_build(change):
    d = facts()
    change(d)
    with pytest.raises(ValueError):
        economy.check_facts(d)
