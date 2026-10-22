"""The working objects' build step: definitions, letters and their places are checked, then shipped."""

from __future__ import annotations

import copy

import pytest

from tools.app import economy, objects
from tools.app.common import WORLD_MAPS, Output
from tools.app.content import read_yaml


def defs():
    return copy.deepcopy(objects.load_objects())


def letters():
    return copy.deepcopy(read_yaml(objects.LETTERS))


def facts():
    return set(read_yaml(economy.FACTS)["facts"])


def items():
    return {i["id"] for i in read_yaml(economy.SOURCE)["items"]}


def test_the_shipped_objects_and_letters_are_valid_and_built():
    out = Output()
    summary = objects.build(out)
    assert summary["objects"] == 7
    assert summary["letters"] >= 13
    assert {"objects.json", "mail.json"} <= out.paths()


def test_every_object_stands_where_its_map_says_it_does():
    # the check reads the maps' own events: each object has its prop and its talk event
    objects.check_objects(defs())
    for d in defs().values():
        for place in d["places"]:
            assert place["map"] in WORLD_MAPS


def test_the_spec_objects_are_there_in_the_places_the_spec_names():
    d = defs()
    assert set(d) == {
        "pc",
        "mailbox",
        "bookshelf",
        "library",
        "tv",
        "fridge",
        "noticeboard",
    }
    at = {(p["map"], p["x"], p["y"]) for p in d["pc"]["places"]}
    # the PC goes in the home nook (2,2) and at the Rest Center; the bookshelf in the other nook (5,2)
    assert ("nagmon_home", 2, 2) in at
    assert any(m == "nagmon_rest_center" for m, _, _ in at)
    assert {(p["map"], p["x"], p["y"]) for p in d["bookshelf"]["places"]} == {
        ("nagmon_home", 5, 2)
    }
    assert d["tv"]["places"][0]["map"] == "nagmon_friend_house"
    assert d["fridge"]["places"][0]["map"] == "nagmon_friend_house"


@pytest.mark.parametrize(
    "change",
    [
        lambda d: d["pc"].update(screen="nope"),
        lambda d: d["pc"].update(title_he=""),
        lambda d: d["pc"].update(sprite="nagmon_missing"),
        lambda d: d["pc"].update(places=[]),
        lambda d: d["pc"]["places"].append({"map": "nowhere", "x": 1, "y": 1}),
        # a place the map's events do not make: the build stops, the object would never show
        lambda d: d["pc"]["places"][0].update(x=3),
        # two objects on one tile
        lambda d: d["library"].update(
            places=[{"map": "nagmon_home", "x": 2, "y": 2}]
        ),
        lambda d: d["bookshelf"].update(mode="shelf"),
        lambda d: d["fridge"]["snacks"].__delitem__(slice(2, None)),
        lambda d: d["fridge"]["snacks"][0].pop("emoji"),
        lambda d: d["tv"]["news"].__delitem__(slice(1, None)),
        lambda d: d["tv"]["news"].append("א" * 71),
        lambda d: d["tv"]["creatures"].update(nosuchcreature="א"),
        # the board's cards are the quests': a static list would be a second source
        lambda d: d["noticeboard"].update(postings=[]),
        lambda d: d["pc"]["people"].append(
            {
                "slug": "Bad Slug",
                "name_he": "א",
                "offers_he": "ב",
                "emoji": "1f989",
            }
        ),
        lambda d: d["pc"]["people"].append(
            copy.deepcopy(d["pc"]["people"][0])
        ),
    ],
)
def test_an_object_with_a_mistake_stops_the_build(change):
    d = defs()
    change(d)
    with pytest.raises(ValueError):
        objects.check_objects(d)


def test_the_shipped_letters_are_valid_one_letter_per_variant_with_real_facts_and_items():
    doc = objects.check_letters(letters(), facts(), items())
    posts = [l for l in doc["letters"].values() if l["kind"] == "postcard"]
    assert len(posts) >= 10
    for letter in doc["letters"].values():
        assert letter["from"] in doc["senders"]
        for v in letter["variants"]:
            assert len(v["text_he"]) <= objects.LETTER_MAX
            if v.get("recall"):
                assert v.get("fact") in facts()
    # every postcard has three variants, so a variant never repeats the one before it
    assert {len(l["variants"]) for l in posts} == {3}
    # a child who knows nobody yet still gets a postcard: the owl is always known
    assert any(s.get("always") for s in doc["senders"].values())


@pytest.mark.parametrize(
    "change",
    [
        lambda d: d["letters"]["postcard_owl"].update(**{"from": "ghost"}),
        lambda d: d["letters"]["postcard_owl"].update(kind="telegram"),
        lambda d: d["letters"]["postcard_owl"]["variants"].pop(),
        lambda d: d["letters"]["postcard_owl"]["variants"][0].update(
            text_he=""
        ),
        lambda d: d["letters"]["postcard_owl"]["variants"][0].update(
            text_he="א" * 200
        ),
        lambda d: d["letters"]["postcard_owl"]["variants"][0].update(
            fact="no_such_fact"
        ),
        lambda d: d["letters"]["postcard_owl"]["variants"][0].pop("fact"),
        lambda d: d["letters"]["level3_gift"]["variants"][0].update(
            gift={"item": "no_such_item"}
        ),
        lambda d: d["letters"]["level3_gift"]["variants"][0].update(
            gift={"coins": 500}
        ),
        lambda d: d["gifts"].append({"item": "no_such_item"}),
        lambda d: d["gifts"].append({"coins": 25}),
        lambda d: [s.pop("always", None) for s in d["senders"].values()],
        lambda d: d["senders"]["nagmon_owl"].update(name_he=""),
        lambda d: d["letters"]["postcard_owl"]["variants"][0].update(
            text_he="שלום {kid}"
        ),
    ],
)
def test_a_letter_with_a_mistake_stops_the_build(change):
    d = letters()
    change(d)
    with pytest.raises(ValueError):
        objects.check_letters(d, facts(), items())


def test_the_pictures_the_objects_use_exist_in_the_emoji_set():
    from tools.app import emoji

    for code in objects.emoji_codes():
        assert emoji.resolve(code), code
