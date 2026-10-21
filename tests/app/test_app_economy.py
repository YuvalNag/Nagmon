"""The economy build step: the table is checked, then shipped."""

from __future__ import annotations

import copy

import pytest

from tools.app import economy
from tools.app.common import Output
from tools.app.content import read_yaml


def doc():
    return copy.deepcopy(read_yaml(economy.SOURCE))


def test_the_shipped_table_is_valid_and_has_about_twelve_items():
    out = Output()
    assert economy.build(out) == {"items": 12}
    assert "economy.json" in out.paths()


def test_every_tab_has_items_and_nets_come_in_two_strengths():
    d = doc()
    for tab in d["tabs"]:
        assert [i for i in d["items"] if i["tab"] == tab]
    assert sorted(i["seal_less"] for i in d["items"] if i["kind"] == "net") == [0, 1]


def test_the_three_helpers_are_there():
    d = doc()
    assert {i["helper"] for i in d["items"] if i["kind"] == "helper"} == {"hint", "fifty", "pass"}


def test_the_shop_has_three_shelves_of_one_to_six_priced_items():
    """The shop screen (app/src/core/game/shop.ts) shelves nets, snacks and tonics, helpers."""
    d = doc()
    shelf_of = {"net": "nets", "snack": "snacks", "tonic": "snacks", "helper": "helpers"}
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
