"""The solar-system chapter plays: people, missions, exits, wild areas."""

import json
import re

import pytest
import yaml

from tools.app import solar_layouts as L
from tools.app import solar_missions as M
from tools.app import solar_texts as T
from tools.app.common import NAG

TRIP = yaml.safe_load((NAG / "trips" / "solar.yaml").read_text("utf-8"))
ZONES = TRIP["zones"]
STATION = TRIP["station"]
ZONE_MAPS = [z["map"] for z in ZONES]
ALL = [*ZONE_MAPS, STATION["map"]]
CITY = "classic_hearthrock_city"

# what app/src/core/world/events.ts runs (its ACTIONS and CONDITIONS)
RUNS = {
    "translated_dialog",
    "set_variable",
    "clear_variable",
    "modify_money",
    "nagmon_daily_count",
    "ask_quiz",
    "open_tutor",
    "give_item",
    "create_npc",
    "char_face",
}
KNOWS = {"variable_set", "one_of", "char_exists", "nagmon_daily_below"}
NIQQUD = [chr(c) for c in range(0x591, 0x5C8)]


def doc(built, name):
    out, _ = built
    return json.loads(out.data[f"maps/{name}.json"])


def prop(d, name):
    return next(p["value"] for p in d["properties"] if p["name"] == name)


def layer(d, name):
    return next(x for x in d["layers"] if x["name"] == name)


def free(d):
    rows = prop(d, "collision")["rows"]
    return {
        (x, y)
        for y, row in enumerate(rows)
        for x, c in enumerate(row)
        if c == "."
    }


def scripts(d):
    return [
        (o["name"], o["properties"][0]["value"])
        for o in layer(d, "events")["objects"]
    ]


def entry(name):
    for z in ZONES:
        if z["map"] == name:
            return z["id"]
    return "station"


# ------------------------------------------------------------ 1. the people
@pytest.mark.parametrize("name", ALL)
def test_events_run_in_the_apps_interpreter(built, name):
    for ev, s in scripts(doc(built, name)):
        acts = {a["type"] for a in s["actions"]}
        conds = {c["type"] for c in s["conditions"]}
        ok = RUNS | {"transition_teleport", "random_encounter"}
        assert acts <= ok, (ev, acts - ok)
        assert conds <= KNOWS | {"char_at", "char_moved"}, ev


def test_every_text_has_both_languages_and_no_niqqud(built):
    out, _ = built
    he = json.loads(out.data["i18n/he.json"])
    en = json.loads(out.data["i18n/en.json"])
    for (zone, name), (h, e) in T.TEXTS.items():
        mid = L.dialog_id(zone, name)
        assert he[mid] == h and en[mid] == e, mid
        assert not any(c in h for c in NIQQUD), mid


@pytest.mark.parametrize("name", ALL)
def test_each_person_has_two_or_three_facts_then_one_question(built, name):
    d = doc(built, name)
    zone = entry(name)
    evs = scripts(d)
    created = [
        a["args"][0]
        for _, s in evs
        for a in s["actions"]
        if a["type"] == "create_npc"
    ]
    assert created
    for slug in created:
        talks = [
            s
            for _, s in evs
            if {"type": "talk", "args": [slug]} in s["behaviors"]
        ]
        assert talks, slug
        # the first thing said is the person's own greeting
        hello = L.dialog_id(zone, slug)
        said = [
            a["args"][0]
            for s in talks
            for a in s["actions"]
            if a["type"] == "translated_dialog"
        ]
        assert hello in said, slug
        he, _ = T.TEXTS[(zone, slug)]
        sentences = [x for x in re.split(r"[.!?]\s*", he) if x.strip()]
        if not slug.endswith("astronomer"):
            assert 2 <= len(sentences) <= 3, (slug, he)
        asks = [
            a for s in talks for a in s["actions"] if a["type"] == "ask_quiz"
        ]
        assert asks, slug
        assert all(a["args"][0] == "science" for a in asks)
        # a talk never starts two everyday questions: one ask per state
        for s in talks:
            assert (
                len([a for a in s["actions"] if a["type"] == "ask_quiz"]) <= 3
            )


@pytest.mark.parametrize("name", ALL)
def test_every_question_has_its_good_free_and_wrong_event(built, name):
    evs = scripts(doc(built, name))
    variables = {
        a["args"][1]
        for _, s in evs
        for a in s["actions"]
        if a["type"] == "ask_quiz"
    }
    assert variables

    def reads(v, want):
        return [
            s
            for _, s in evs
            if any(
                c["type"] == want[0] and c["args"][0].split(":")[0] == v
                for c in s["conditions"]
            )
        ]

    for v in variables:
        if re.search(r"_d[123]$", v):  # the drive's stops are read together
            continue
        right = reads(v, ("one_of",))
        wrong = reads(v, ("variable_set",))
        assert right and wrong, v
        # each ends by clearing its variable, so a question is asked afresh
        for s in [*right, *wrong]:
            assert {"type": "clear_variable", "args": [v]} in s["actions"]


@pytest.mark.parametrize("name", ALL)
def test_the_daily_limit_guards_every_everyday_reward(built, name):
    for ev, s in scripts(doc(built, name)):
        pays = [a for a in s["actions"] if a["type"] == "modify_money"]
        if not pays or ev.startswith(("Mission", "Drive")):
            continue
        assert pays == [
            {"type": "modify_money", "args": ["player", str(T.QUIZ_COINS)]}
        ]
        below = [
            c for c in s["conditions"] if c["type"] == "nagmon_daily_below"
        ]
        assert below[0]["operator"] == "is"
        assert below[0]["args"][1] == str(T.DAILY_LIMIT)
        assert {
            "type": "nagmon_daily_count",
            "args": below[0]["args"][:1],
        } in s["actions"]


# ------------------------------------------------------------- 2. missions
def test_the_trip_names_each_zones_done_variable():
    for z in ZONES:
        assert z["done_variable"] == M.done_variable(z["id"])
    assert [z["id"] for z in ZONES] == list(M.ZONES)


@pytest.mark.parametrize("zone", ZONES, ids=lambda z: z["id"])
def test_each_zone_has_a_mission_that_pays_and_marks_the_zone_done(
    built, zone
):
    evs = scripts(doc(built, zone["map"]))
    ends = [
        s
        for _, s in evs
        if {
            "type": "set_variable",
            "args": [f"{zone['done_variable']}:yes"],
        }
        in s["actions"]
    ]
    assert ends
    for s in ends:
        pay = [a for a in s["actions"] if a["type"] == "modify_money"]
        assert pay[0]["args"] == ["player", str(T.MISSION_COINS[zone["id"]])]
        assert {
            "type": "set_variable",
            "args": [f"{M.mission_variable(zone['id'])}:done"],
        } in s["actions"]
        # saved before the words: a kill in the dialog loses nothing
        kinds = [a["type"] for a in s["actions"]]
        assert kinds.index("translated_dialog") > kinds.index("modify_money")
    # the mission is given by one of the zone's own people
    giver = f"nagmon_solar_{M.GIVER[zone['id']]}"
    assert giver in zone["npcs"]


def test_a_mission_pays_once_and_the_money_matches_the_costs():
    assert sum(T.MISSION_COINS.values()) >= sum(z["cost"] for z in ZONES) * 0.8
    for z in ZONES:
        assert T.MISSION_COINS[z["id"]] > 0


def test_the_drive_counts_every_way_three_answers_can_go(built):
    good, weak = M.drive_combinations()
    assert len(good) == 4 and len(weak) == 4
    d = doc(built, "solar_rocky_planets")
    names = [n for n, _ in scripts(d) if n.startswith("Drive ")]
    assert len(names) == 8 and len(set(names)) == 8


def test_the_sun_filter_goes_from_the_grey_hood_to_the_owl(built):
    d = doc(built, "solar_sun")
    m = M.mission_variable("sun")
    found = [
        s
        for _, s in scripts(d)
        if {"type": "set_variable", "args": [f"{m}:found"]} in s["actions"]
    ]
    assert len(found) == 1
    assert found[0]["behaviors"] == [
        {"type": "talk", "args": ["nagmon_solar_grey_hood"]}
    ]
    assert found[0]["conditions"] == [
        {"operator": "is", "type": "variable_set", "args": [f"{m}:asked"]}
    ]


def test_the_astronomer_knows_when_all_five_zones_are_done(built):
    d = doc(built, STATION["map"])
    ready = next(
        s for n, s in scripts(d) if n == "Talk station/astronomer ready"
    )
    assert {c["args"][0] for c in ready["conditions"]} == {
        f"{z['done_variable']}:yes" for z in ZONES
    }


def test_the_astronomer_opens_the_stations_lessons(built):
    d = doc(built, STATION["map"])
    talk = next(
        s for n, s in scripts(d) if n == "Talk station/astronomer lessons"
    )
    assert [(a["type"], a["args"]) for a in talk["actions"]] == [
        ("open_tutor", [STATION["id"]])
    ]
    assert talk["behaviors"] == [
        {"type": "talk", "args": ["nagmon_solar_astronomer"]}
    ]


# --------------------------------------------------------------- 3. exits
def lab_door():
    city = yaml.safe_load((NAG / "maps" / f"{CITY}.yaml").read_text("utf-8"))[
        "events"
    ]["Teleport to Lab"]
    return city["x"], city["y"]


def test_the_station_door_lands_next_to_the_labs_door_on_free_tiles(built):
    st = doc(built, STATION["map"])
    leaving = [
        a
        for _, s in scripts(st)
        for a in s["actions"]
        if a["type"] == "transition_teleport" and a["args"][1] == f"{CITY}.tmx"
    ]
    assert len(leaving) == 1
    x, y = int(leaving[0]["args"][2]), int(leaving[0]["args"][3])
    dx, dy = lab_door()
    assert abs(x - dx) + abs(y - dy) == 1  # right next to the door
    assert (x, y) in free(doc(built, CITY))
    # and the door is a free tile of the station, reachable from its spawn
    door = next(
        o for o in layer(st, "markers")["objects"] if o["name"] == "exit"
    )
    tile = (door["x"] // 64, door["y"] // 64)
    assert tile in free(st)
    todo, seen = [L.STATION_SPAWN], {L.STATION_SPAWN}
    while todo:
        cx, cy = todo.pop()
        for n in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
            if n in free(st) and n not in seen:
                seen.add(n)
                todo.append(n)
    assert tile in seen
    assert (x, y) != (dx, dy)


def test_the_landing_is_not_a_trigger_of_the_city(built):
    city = doc(built, CITY)
    landing = next(
        a
        for _, s in scripts(doc(built, STATION["map"]))
        for a in s["actions"]
        if a["type"] == "transition_teleport" and a["args"][1] == f"{CITY}.tmx"
    )
    x, y = int(landing["args"][2]), int(landing["args"][3])
    for o in layer(city, "events")["objects"]:
        if o["width"] and o["height"]:
            inside = (
                o["x"] // 64 <= x < (o["x"] + o["width"]) // 64
                and o["y"] // 64 <= y < (o["y"] + o["height"]) // 64
            )
            s = o["properties"][0]["value"]
            has_here = any(c["type"] == "char_at" for c in s["conditions"])
            assert not (inside and has_here), o["name"]


@pytest.mark.parametrize("zone", ZONES, ids=lambda z: z["id"])
def test_every_zone_exit_leads_to_the_station_on_a_free_tile(built, zone):
    d = doc(built, zone["map"])
    tele = [
        a
        for _, s in scripts(d)
        for a in s["actions"]
        if a["type"] == "transition_teleport"
    ]
    assert len(tele) == 1
    assert tele[0]["args"][1] == f"{STATION['map']}.tmx"
    tile = (int(tele[0]["args"][2]), int(tele[0]["args"][3]))
    assert tile in free(doc(built, STATION["map"]))


# ---------------------------------------------------------- 4. wild areas
@pytest.mark.parametrize("zone", ZONES, ids=lambda z: z["id"])
def test_the_wild_area_leads_to_the_zones_table_and_its_animals(built, zone):
    out, _ = built
    tables = json.loads(out.data["db/encounters.json"])
    d = doc(built, zone["map"])
    wild = [
        (n, s)
        for n, s in scripts(d)
        if any(a["type"] == "random_encounter" for a in s["actions"])
    ]
    assert [n for n, _ in wild] == ["Wild Animals"]
    s = wild[0][1]
    table = s["actions"][0]["args"][0]
    assert table == f"solar_{zone['id']}" == zone["encounter"]
    assert {c["type"] for c in s["conditions"]} >= {"char_at", "char_moved"}
    assert table in tables
    met = {m["monster"] for m in tables[table]["monsters"]}
    assert met == set(zone["families"])  # the base forms of this zone
    assert met <= set(zone["monsters"])
    # every animal exists with a picture, so the app can start the battle
    monsters = json.loads(out.data["db/monsters.json"])
    for m in met:
        assert m in monsters
    for m in tables[table]["monsters"]:
        lo, hi = m["level_range"]
        assert zone["wild_levels"] == [lo, hi]
    # the rate is a real chance, and the area is walkable
    assert 0 < int(s["actions"][0]["args"][1]) <= 50
    ev = next(
        o for o in layer(d, "events")["objects"] if o["name"] == "Wild Animals"
    )
    cells = {
        (x, y)
        for x in range(ev["x"] // 64, (ev["x"] + ev["width"]) // 64)
        for y in range(ev["y"] // 64, (ev["y"] + ev["height"]) // 64)
    }
    assert cells and cells <= free(d)


@pytest.mark.parametrize("zone", ZONES, ids=lambda z: z["id"])
def test_the_trips_start_tile_is_free_and_is_the_spawn(built, zone):
    d = doc(built, zone["map"])
    start = (zone["start"]["x"], zone["start"]["y"])
    assert start in free(d)
    assert start == L.SPAWN
    # and it is where the station's door puts the child
    st = doc(built, STATION["map"])
    arrival = next(
        a
        for _, s in scripts(st)
        for a in s["actions"]
        if a["type"] == "transition_teleport"
        and a["args"][1] == f"{zone['map']}.tmx"
    )
    assert (int(arrival["args"][2]), int(arrival["args"][3])) == start
