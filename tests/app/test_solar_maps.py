"""The solar-system trip's maps: five zones and the space station."""

import json

import pytest
import yaml

from tests.app.test_app_maps import (
    KNOWN_ACTIONS,
    KNOWN_BEHAVIORS,
    KNOWN_CONDITIONS,
)
from tools.app import solar_layouts as L
from tools.app import solar_maps
from tools.app.common import NAG

TRIP = yaml.safe_load((NAG / "trips" / "solar.yaml").read_text("utf-8"))
ZONE_MAPS = [z["map"] for z in TRIP["zones"]]
ALL = [*ZONE_MAPS, TRIP["station"]["map"]]


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


def reachable(d, start):
    ok, seen, todo = free(d), {start}, [start]
    while todo:
        x, y = todo.pop()
        for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if n in ok and n not in seen:
                seen.add(n)
                todo.append(n)
    return seen


def marker(d, name):
    o = next(o for o in layer(d, "markers")["objects"] if o["name"] == name)
    return o["x"] // 64, o["y"] // 64, o["width"] // 64, o["height"] // 64


def test_the_table_names_six_maps_and_the_five_zones():
    assert [z["id"] for z in TRIP["zones"]] == [
        "moon",
        "sun",
        "rocky_planets",
        "giants",
        "outer",
    ]
    assert len(set(ALL)) == 6


@pytest.mark.parametrize("name", ALL)
def test_a_small_tiled_map_with_its_atlas(built, name):
    out, _ = built
    d = doc(built, name)
    assert (d["width"], d["height"]) == (30, 20)
    assert d["tilewidth"] == 64 and d["orientation"] == "orthogonal"
    ts = d["tilesets"][0]
    assert ts["margin"] == 2 and ts["spacing"] == 4
    atlas = out.images[f"atlas/{name}.png"]
    assert atlas.size == (ts["imagewidth"], ts["imageheight"])
    gids = [g for n in ("Ground", "Objects") for g in layer(d, n)["data"]]
    assert max(gids) <= ts["tilecount"]
    assert all(g > 0 for g in layer(d, "Ground")["data"])
    rows = prop(d, "collision")["rows"]
    assert len(rows) == 20 and all(len(r) == 30 for r in rows)


@pytest.mark.parametrize("name", ALL)
def test_everything_that_matters_can_be_reached(built, name):
    d = doc(built, name)
    sx, sy, _, _ = marker(d, "spawn")
    seen = reachable(d, (sx, sy))
    assert (sx, sy) in free(d)
    for o in layer(d, "markers")["objects"]:
        x, y = o["x"] // 64, o["y"] // 64
        w, h = o["width"] // 64, o["height"] // 64
        for cell in ((x + i, y + j) for i in range(w) for j in range(h)):
            assert cell in seen, (name, o["name"], cell)


@pytest.mark.parametrize("name", ZONE_MAPS)
def test_a_zone_has_a_spawn_an_exit_a_wild_area_and_people(built, name):
    d = doc(built, name)
    names = [o["name"] for o in layer(d, "markers")["objects"]]
    assert {"spawn", "exit", "wild"} <= set(names)
    assert 2 <= len([n for n in names if n.startswith("npc:")]) <= 3
    x, y, w, h = marker(d, "wild")
    assert w * h >= 40
    assert not any(
        c == "#"
        for row in prop(d, "collision")["rows"][y : y + h]
        for c in row[x : x + w]
    )


@pytest.mark.parametrize("name", ZONE_MAPS)
def test_the_ship_blocks_and_its_door_does_not(built, name):
    d = doc(built, name)
    sx, sy = L.SHIP
    rows = prop(d, "collision")["rows"]
    for j in range(3):
        for i in range(3):
            assert rows[sy + j][sx + i] == "#"
    assert marker(d, "exit")[:2] == (sx + 1, sy + 3)


def scripts(d):
    for o in layer(d, "events")["objects"]:
        yield o, o["properties"][0]["value"]


@pytest.mark.parametrize("name", ALL)
def test_events_use_only_what_the_interpreter_knows(built, name):
    d = doc(built, name)
    for _, s in scripts(d):
        assert {a["type"] for a in s["actions"]} <= KNOWN_ACTIONS
        assert {b["type"] for b in s["behaviors"]} <= KNOWN_BEHAVIORS
        assert {c["type"] for c in s["conditions"]} <= KNOWN_CONDITIONS


def test_every_zone_exit_leads_to_the_station_and_back(built):
    station = doc(built, TRIP["station"]["map"])
    free_s = free(station)
    by_door = {}
    for _, s in scripts(station):
        for a in s["actions"]:
            if a["type"] == "transition_teleport":
                by_door[a["args"][1]] = a
    assert sorted(by_door) == sorted(f"{m}.tmx" for m in ZONE_MAPS)
    for z in TRIP["zones"]:
        d = doc(built, z["map"])
        tele = next(
            a
            for _, s in scripts(d)
            for a in s["actions"]
            if a["type"] == "transition_teleport"
        )
        assert tele["args"][1] == f"{TRIP['station']['map']}.tmx"
        x, y = int(tele["args"][2]), int(tele["args"][3])
        assert (x, y) in free_s
        arrival = by_door[f"{z['map']}.tmx"]
        ax, ay = int(arrival["args"][2]), int(arrival["args"][3])
        assert (ax, ay) in free(d)


def test_wild_areas_call_their_zones_encounter_table(built):
    for z in TRIP["zones"]:
        d = doc(built, z["map"])
        calls = [
            a
            for _, s in scripts(d)
            for a in s["actions"]
            if a["type"] == "random_encounter"
        ]
        assert [c["args"][0] for c in calls] == [z["encounter"]]
        assert (NAG / "db" / "encounter" / f"{z['encounter']}.yaml").is_file()


def test_people_stand_where_the_markers_say_and_have_a_line(built):
    out, _ = built
    npcs = json.loads(out.data["db/npcs.json"])
    he = json.loads(out.data["i18n/he.json"])
    en = json.loads(out.data["i18n/en.json"])
    entries = [*TRIP["zones"], {**TRIP["station"], "id": "station"}]
    for z in entries:
        d = doc(built, z["map"])
        for _, s in scripts(d):
            for a in s["actions"]:
                if a["type"] == "create_npc":
                    slug = a["args"][0]
                    assert slug in npcs and slug in z["npcs"]
                    m = marker(d, f"npc:{slug}")
                    assert (m[0], m[1]) == (
                        int(a["args"][1]),
                        int(a["args"][2]),
                    )
                if a["type"] == "translated_dialog":
                    assert a["args"][0] in he and a["args"][0] in en, a


def test_the_station_has_a_door_for_each_zone_and_a_telescope(built):
    d = doc(built, TRIP["station"]["map"])
    doors = [
        o
        for o in layer(d, "markers")["objects"]
        if o["name"].startswith("door:")
    ]
    assert sorted(o["name"] for o in doors) == sorted(
        f"door:{z['id']}" for z in TRIP["zones"]
    )
    rows = prop(d, "collision")["rows"]
    assert rows[5][22] == "#" and rows[6][23] == "#"


def test_the_new_people_are_in_the_data(built):
    out, _ = built
    npcs = json.loads(out.data["db/npcs.json"])
    for slug in (
        "astronomer",
        "mila",
        "owl",
        "moon_engineer",
        "rover_driver",
        "sage",
        "grey_hood",
    ):
        assert f"nagmon_solar_{slug}" in npcs
    monsters = json.loads(out.data["db/monsters.json"])
    assert all(
        m in monsters
        for z in TRIP["zones"]
        for f, e in z["families"].items()
        for m in [f, *e]
    )


def test_layouts_are_deterministic():
    a = solar_maps.zone_plan(L.ZONES["moon"])
    b = solar_maps.zone_plan(L.ZONES["moon"])
    assert a.blocked == b.blocked and a.objects == b.objects
