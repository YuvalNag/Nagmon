"""The people of the world: the build step checks them (tools/app/npcs.py)."""

from __future__ import annotations

import copy
import json
import shutil
from pathlib import Path

import pytest

from tools.app import npcs
from tools.app.common import OUT, WORLD_MAPS, Output
from tools.app.content import read_yaml


@pytest.fixture(scope="module")
def shipped():
    """The cast as the build ships it, and the persona cards."""
    return npcs.load()


def test_the_shipped_cast_is_valid_and_complete(shipped):
    people, cards = shipped
    assert len(people) == 33
    # 26 people of Hearthrock and Route 1 (WORLD_V2.md 6.1) and the 7 of the solar chapter
    assert len([s for s in people if not s.startswith("nagmon_solar_")]) == 26
    assert len([s for s in people if s.startswith("nagmon_solar_")]) == 7
    assert set(people) == set(cards)
    lines = sum(len(p) for r in people.values() for p in r["lines"].values())
    assert lines > 1000
    out = Output()
    report = npcs.build(out)
    assert report["people"] == 33
    assert "npcs.json" in out.paths()


def test_the_committed_json_is_what_the_build_makes(shipped):
    people, _ = shipped
    doc = json.loads((OUT / "npcs.json").read_text(encoding="utf-8"))
    assert doc == {"version": 1, "npcs": people}


def test_the_ai_and_persona_card_stay_out_of_the_game_files(shipped):
    """No model and no persona text ships in W1 (the live-line slice reads the cards)."""
    people, cards = shipped
    text = (OUT / "npcs.json").read_text(encoding="utf-8")
    for key in ("voice", "personality", "never_says", "catchphrases", '"ai"'):
        assert key not in text
    assert all("ai" in c for c in cards.values())
    # and the build has no network code or key anywhere in it
    source = Path(npcs.__file__).read_text(encoding="utf-8")
    for word in ("requests", "urllib", "http.client", "api_key", "socket"):
        assert word not in source


def test_every_person_has_the_right_shape(shipped):
    people, cards = shipped
    for slug, p in people.items():
        assert cards[slug]["id"] == slug
        assert p["role"] in npcs.ROLES and p["age_feel"] in npcs.AGE_FEELS
        assert 0 <= len(p["topics"]) <= npcs.MAX_TOPICS
        assert p["relationship"]["levels"] == [0, 4, 10, 20]
        # friendship only goes up: no gain is ever negative
        assert all(v >= 0 for v in p["relationship"]["gain"].values())
        assert len(p["relationship"]["flags"]) <= 12
        for pool, lines in p["lines"].items():
            assert pool in npcs.POOLS or pool.startswith("topic:"), (slug, pool)
            for line in lines:
                assert len(line["id"]) <= npcs.ID_MAX
                assert npcs.HEBREW.search(line["text"])


def test_the_top_eight_have_twelve_lines_in_every_situation_group(shipped):
    people, _ = shipped
    top = [
        "nagmon_owl",
        "nagmon_cashier",
        "nagmon_house_nurse",
        "nagmon_house_tutor",
        "nagmon_granny",
        "nagmon_gardener",
        "nagmon_route1_trainer",
        "nagmon_tourist",
    ]
    for slug in top:
        for group in npcs.POOLS:
            assert len(people[slug]["lines"][group]) >= 12, (slug, group)


def test_no_shipped_line_carries_family_details_fear_or_a_brand(shipped):
    people, _ = shipped
    for slug, p in people.items():
        for pool, lines in p["lines"].items():
            for line in lines:
                for name, pattern in npcs.FORBIDDEN.items():
                    assert not pattern.search(line["text"]), (slug, name, line)


def test_the_spots_of_every_map_with_people_are_in_the_map():
    """A spot is inside the map; the free-ground check is the app's own data test."""
    for name in WORLD_MAPS:
        placement = npcs.read_placement(name)
        if not placement:
            continue
        doc = json.loads((OUT / "maps" / f"{name}.json").read_text(encoding="utf-8"))
        prop = next(p for p in doc["properties"] if p["name"] == "nagmon_placement")
        assert prop["value"] == placement
        for spot, at in placement["spots"].items():
            assert 0 <= at[0] < doc["width"] and 0 <= at[1] < doc["height"], spot


def test_a_person_is_not_placed_twice(shipped):
    """What the resolver places is not also created by a map's own script."""
    people, _ = shipped
    for name in WORLD_MAPS:
        path = npcs.MAPS_DIR / f"{name}.yaml"
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        for slug, p in people.items():
            placed = (
                p["schedule"]["default"]
                or p["schedule"]["rules"]
                or p["schedule"]["roam"]
            )
            if placed:
                assert f"create_npc {slug}," not in text, (name, slug)


# ------------------------------------------------------------ what the build refuses
GOOD = {
    "id": "nagmon_test",
    "short": "test",
    "class": "R",
    "name_he": "בדיקה",
    "name_en": "Test",
    "role": "wanderer",
    "age_feel": "adult",
    "sprite": "nagmon_kid",
    "voice": {"style": "calm", "register": "simple"},
    "personality": ["calm"],
    "knows": {
        "topics": [
            {"id": "town", "label_he": "מי בעיר?", "icon": "1f3d8", "unlock": 0}
        ],
        "facts": [],
    },
    "schedule": {
        "roam": {
            "map": "classic_hearthrock_city",
            "spots": ["fountain", "plaza_mid", "plaza_east"],
        }
    },
    "ai": {"enabled": False},
    "safety": {"age_min_band": "A", "heavy_topics": "none"},
}
GOOD_LINES = {
    "greet_first": ["שלום וברוכים הבאים."],
    "topic.town": ["העיר שקטה היום."],
}


@pytest.fixture
def cast(tmp_path, monkeypatch):
    """A one-person cast in a folder of its own, written from a card and its lines."""
    import yaml

    folder = tmp_path / "npcs"
    folder.mkdir()
    monkeypatch.setattr(npcs, "NPC_DIR", folder)

    def write(card=None, lines=None, name="nagmon_test"):
        c = copy.deepcopy(GOOD if card is None else card)
        (folder / f"{name}.yaml").write_text(
            yaml.safe_dump(c, allow_unicode=True), encoding="utf-8"
        )
        if lines is not False:
            (folder / f"{name}.lines.he.yaml").write_text(
                yaml.safe_dump(
                    GOOD_LINES if lines is None else lines, allow_unicode=True
                ),
                encoding="utf-8",
            )
        return npcs.load(check_art=False)

    return write


def test_a_good_card_loads(cast):
    people, _ = cast()
    assert people["nagmon_test"]["lines"]["greet_first"][0]["id"] == "test.gf.01"
    assert people["nagmon_test"]["lines"]["topic:town"][0]["id"] == "test.t-town.01"
    assert people["nagmon_test"]["priority"] == 2


def change(**edits):
    card = copy.deepcopy(GOOD)
    for dotted, value in edits.items():
        node = card
        *path, last = dotted.split("__")
        for key in path:
            node = node[key]
        if value is DROP:
            del node[last]
        else:
            node[last] = value
    return card


DROP = object()


@pytest.mark.parametrize(
    "card",
    [
        change(role="wizard"),
        change(age_feel="ancient"),
        change(**{"class": "X"}),
        change(name_he="Test"),
        change(name_en="בדיקה"),
        change(sprite=DROP),
        change(id="nagmon_other"),
        change(voice__register="rude"),
        change(schedule={"roam": {"map": "nowhere", "spots": ["a", "b"]}}),
        change(schedule={"roam": {"map": "classic_hearthrock_city", "spots": ["no_such_spot", "fountain"]}}),
        change(schedule={"default": {"map": "classic_hearthrock_city", "spot": "fountain"}, "roam": {"map": "classic_hearthrock_city", "spots": ["fountain", "plaza_mid"]}, "wander": True}),
        change(schedule={}),
        change(schedule={"visit": {"every_days": 3, "stay_days": 3}, "default": {"map": "classic_hearthrock_city", "spot": "fountain"}}),
        change(schedule={"rules": [{"when": {"phase": ["dawn"]}, "at": {"map": "classic_hearthrock_city", "spot": "fountain"}}]}),
        change(knows={"topics": [{"id": f"t{i}", "label_he": "נושא", "icon": "1f3d8"} for i in range(5)], "facts": []}),
        change(knows={"topics": [{"id": "town", "label_he": "מי בעיר?", "icon": "not-a-code"}], "facts": []}),
        change(knows={"topics": [{"id": "town", "label_he": "מי בעיר?", "icon": "1f3d8", "unlock": 4}], "facts": []}),
        change(knows={"topics": [], "facts": ["no_such_fact"]}),
        change(knows={"topics": [{"id": "fact", "label_he": "עובדה", "icon": "1f3d8"}], "facts": []}),
        change(relationship={"gain": {"first_talk_today": -1}}),
        change(relationship={"levels": [0, 10, 5, 20]}),
        change(relationship={"memory_flags": [f"f{i}" for i in range(13)]}),
        change(likes={"hated": ["berry"]}),
        change(likes={"loved": ["no_such_item"]}),
        change(safety={"age_min_band": "Z"}),
        change(ai={"enabled": True}),
        change(ai={"share": 3}),
        change(unknown_field=1),
    ],
)
def test_a_bad_card_stops_the_build(cast, card):
    with pytest.raises(ValueError, match="npcs"):
        cast(card)


def test_an_anchor_does_not_roam_and_is_not_a_visitor(cast):
    anchor = change(anchor=True)
    with pytest.raises(ValueError, match="anchor"):
        cast(anchor)
    good = change(
        anchor=True,
        schedule={"default": {"map": "classic_hearthrock_city", "spot": "fountain"}},
    )
    cast(good)
    visitor = change(
        anchor=True,
        schedule={
            "default": {"map": "classic_hearthrock_city", "spot": "fountain"},
            "visit": {"every_days": 3, "stay_days": 1},
        },
    )
    with pytest.raises(ValueError, match="anchor"):
        cast(visitor)


def test_a_fixed_person_is_placed_by_the_map_and_has_no_schedule_of_their_own(cast):
    fixed = change(schedule={"fixed": {"map": "nagmon_rest_center"}})
    people, _ = cast(fixed)
    assert people["nagmon_test"]["schedule"]["default"] is None
    with pytest.raises(ValueError, match="fixed"):
        cast(change(schedule={"fixed": {"map": "nagmon_rest_center"}, "roam": {"map": "x", "spots": ["a"]}}))
    with pytest.raises(ValueError, match="fixed"):
        cast(change(schedule={"fixed": {"map": "atlantis"}}))


@pytest.mark.parametrize(
    "lines, why",
    [
        (False, "needs a lines file"),
        ({"greet_first": []}, "a list of lines"),
        ({"shout": ["שלום."]}, "unknown pool"),
        ({"topic.nothing": ["שלום."]}, "no such topic"),
        ({"greet_first": ["Hello there."]}, "Hebrew"),
        ({"greet_first": ["שלום, " + "מילה " * 30]}, "characters"),
        ({"greet_first": ["שלום. מה נשמע? הכל טוב."]}, "sentences"),
        ({"greet_first": ["אמא שלך אמרה שלום."]}, "family"),
        ({"greet_first": ["זה מפחיד מאוד."]}, "fear"),
        ({"greet_first": ["צריך תמיד להיות ילד טוב."]}, "moralising"),
        ({"greet_first": ["שלום 123."]}, "only Hebrew"),
        ({"greet_first": [{"text": "שלום.", "mood": "x"}]}, "unknown keys"),
        ({"greet_first": [{"text": "שלום.", "when": {"phase": ["dawn"]}}]}, "phase"),
        ({"greet_first": [{"text": "שלום.", "when": {"friendship_min": 9}}]}, "friendship_min"),
        ({"greet_first": [{"text": "שלום.", "weight": 0}]}, "weight"),
        ({"greet_first": [{"text": "שלום.", "id": "x" * 40}]}, "id"),
        ({"greet_first": [{"text": "שלום.", "id": "a.b"}, {"text": "היי.", "id": "a.b"}]}, "twice"),
    ],
)
def test_a_bad_lines_file_stops_the_build(cast, lines, why):
    with pytest.raises(ValueError, match=why):
        cast(None, lines)


def test_a_line_with_the_child_name_slot_or_who_is_here_slot_is_fine_and_counted_short(cast):
    people, _ = cast(None, {"greet_first": ["שלום {hero}, היום פה {who}."]})
    assert people["nagmon_test"]["lines"]["greet_first"][0]["text"].count("{") == 2


def test_two_people_may_not_share_a_short_name_or_a_friend_who_is_not_there(cast, tmp_path):
    cast()
    folder = npcs.NPC_DIR
    other = copy.deepcopy(GOOD)
    other["id"] = "nagmon_test2"
    import yaml

    (folder / "nagmon_test2.yaml").write_text(yaml.safe_dump(other, allow_unicode=True), encoding="utf-8")
    shutil.copy(folder / "nagmon_test.lines.he.yaml", folder / "nagmon_test2.lines.he.yaml")
    with pytest.raises(ValueError, match="short name"):
        npcs.load(check_art=False)
    other["short"] = "test2"
    other["not_with"] = ["nagmon_nobody"]
    (folder / "nagmon_test2.yaml").write_text(yaml.safe_dump(other, allow_unicode=True), encoding="utf-8")
    with pytest.raises(ValueError, match="not_with"):
        npcs.load(check_art=False)


def test_the_database_must_know_the_person_and_draw_the_same_picture(tmp_path, monkeypatch):
    """A person with no record in mods/nagmon/db/npc, or with another sprite there, stops the build."""
    import yaml

    folder = tmp_path / "npcs"
    folder.mkdir()
    monkeypatch.setattr(npcs, "NPC_DIR", folder)
    card = change(id="nagmon_unknown_person")
    (folder / "nagmon_unknown_person.yaml").write_text(yaml.safe_dump(card, allow_unicode=True), encoding="utf-8")
    (folder / "nagmon_unknown_person.lines.he.yaml").write_text(yaml.safe_dump(GOOD_LINES, allow_unicode=True), encoding="utf-8")
    with pytest.raises(ValueError, match="no record"):
        npcs.load()
    real = read_yaml(Path(__file__).resolve().parents[2] / "mods/nagmon/npcs/nagmon_granny.yaml")
    real["sprite"] = "nagmon_kid"
    folder2 = tmp_path / "npcs2"
    folder2.mkdir()
    monkeypatch.setattr(npcs, "NPC_DIR", folder2)
    (folder2 / "nagmon_granny.yaml").write_text(yaml.safe_dump(real, allow_unicode=True), encoding="utf-8")
    shutil.copy(Path(__file__).resolve().parents[2] / "mods/nagmon/npcs/nagmon_granny.lines.he.yaml", folder2)
    with pytest.raises(ValueError, match="another sprite"):
        npcs.load()


def test_a_missing_picture_stops_the_build(cast):
    cast(change(sprite="nagmon_nobody_drew_this"))  # (the fixture does not look at art)
    with pytest.raises(ValueError, match="no picture"):
        npcs.load()


@pytest.mark.parametrize(
    "placement, why",
    [
        ({"spots": {"a": [1, 2]}}, "max_npcs"),
        ({"max_npcs": 5}, "spots"),
        ({"max_npcs": 5, "spots": {"a": [1]}}, "spot"),
        ({"max_npcs": 5, "spots": {"a": [1, 2, "sideways"]}}, "spot"),
        ({"max_npcs": 5, "spots": {"A B": [1, 2]}}, "bad spot name"),
        ({"max_npcs": 99, "spots": {"a": [1, 2]}}, "max_npcs"),
    ],
)
def test_a_bad_placement_block_of_a_map_stops_the_build(tmp_path, monkeypatch, placement, why):
    import yaml

    monkeypatch.setattr(npcs, "MAPS_DIR", tmp_path)
    (tmp_path / "somewhere.yaml").write_text(yaml.safe_dump({"placement": placement, "events": {}}), encoding="utf-8")
    with pytest.raises(ValueError, match=why):
        npcs.read_placement("somewhere")


def test_no_spot_is_where_a_map_script_puts_a_prop():
    """The wallet and the kitten stand on tiles of their own (create_npc in the map)."""
    import re

    for name in WORLD_MAPS:
        placement = npcs.read_placement(name)
        if not placement:
            continue
        text = (npcs.MAPS_DIR / f"{name}.yaml").read_text(encoding="utf-8")
        props = {
            (int(x), int(y))
            for x, y in re.findall(r"create_npc [a-z0-9_]+,(\d+),(\d+)", text)
        }
        for spot, at in placement["spots"].items():
            assert (at[0], at[1]) not in props, (name, spot)
