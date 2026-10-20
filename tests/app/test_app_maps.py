"""Maps: Tiled JSON, the used-tile atlases, events and collisions."""

import json

import pytest
from PIL import Image

from tools.app import maps, overlays
from tools.app.common import WORLD_MAPS

# Every action and behaviour the converted events use. The TS event
# interpreter must know all of them (docs/app/INVENTORY.md §4.2).
KNOWN_ACTIONS = {
    "add_item",
    "add_monster",
    "ask_quiz",
    "char_face",
    "char_talk",
    "choice_monster",
    "clear_variable",
    "create_npc",
    "modify_money",
    "nagmon_apply_profile",
    "nagmon_daily_count",
    "play_map_animation",
    "play_music",
    "random_encounter",
    "remove_npc",
    "set_battle",
    "set_environment",
    "set_monster_health",
    "set_monster_status",
    "set_teleport_faint",
    "set_template",
    "set_variable",
    "start_battle",
    "transition_teleport",
    "translated_dialog",
    "translated_dialog_choice",
    "variable_math",
}
KNOWN_BEHAVIORS = {"talk"}
KNOWN_CONDITIONS = {
    "battle_outcome",
    "char_at",
    "char_defeated",
    "char_exists",
    "char_facing",
    "char_moved",
    "environment_is",
    "music_playing",
    "nagmon_daily_below",
    "one_of",
    "party_size",
    "profile_grade_at_least",
    "time_is",
    "variable_is",
    "variable_set",
}


#: The insides of the city's houses (the doors are HOUSE_DOORS, below).
INTERIORS = (
    "nagmon_home",
    "nagmon_lab",
    "nagmon_friend_house",
    "nagmon_rest_center",
    "nagmon_shop",
)


def map_doc(built, name):
    out, _ = built
    return json.loads(out.data[f"maps/{name}.json"])


def prop(doc, name):
    return next(p["value"] for p in doc["properties"] if p["name"] == name)


def layer(doc, name):
    return next(lay for lay in doc["layers"] if lay["name"] == name)


def scripts(doc):
    return [
        o["properties"][0]["value"] for o in layer(doc, "events")["objects"]
    ]


@pytest.mark.parametrize("name", WORLD_MAPS)
def test_map_is_tiled_json_with_one_embedded_atlas_tileset(built, name):
    doc = map_doc(built, name)
    assert doc["type"] == "map"
    assert doc["orientation"] == "orthogonal"
    assert doc["tilewidth"] == doc["tileheight"] == 64
    assert len(doc["tilesets"]) == 1
    tileset = doc["tilesets"][0]
    assert tileset["image"] == f"../atlas/{name}.png"
    assert tileset["margin"] == 2
    assert tileset["spacing"] == 4


@pytest.mark.parametrize("name", WORLD_MAPS)
def test_every_tile_gid_is_inside_the_atlas(built, name):
    doc = map_doc(built, name)
    count = doc["tilesets"][0]["tilecount"]
    for lay in doc["layers"]:
        if lay["type"] == "tilelayer":
            gids = [g & maps.GID_MASK for g in lay["data"]]
            assert all(0 <= g <= count for g in gids), lay["name"]
            assert len(gids) == doc["width"] * doc["height"]


@pytest.mark.parametrize("name", WORLD_MAPS)
def test_atlas_fits_a_mobile_texture(built, name):
    out, _ = built
    image = out.images[f"atlas/{name}.png"]
    assert image.width <= 4096 and image.height <= 4096


@pytest.mark.parametrize("name", WORLD_MAPS)
def test_atlas_tiles_are_the_hd_tiles_with_their_edges_extruded(built, name):
    out, _ = built
    atlas = out.images[f"atlas/{name}.png"]
    frames = json.loads(out.data[f"atlas/{name}.json"])["frames"]
    sheets = {}
    for frame in frames:
        ts = maps.load_tsx(
            maps.TUX / "gfx" / "tilesets" / f"{frame['tileset']}.tsx"
        )
        if ts.name not in sheets:
            sheets[ts.name] = Image.open(ts.hd_image).convert("RGBA")
        col, row = frame["tile"] % ts.columns, frame["tile"] // ts.columns
        source = overlays.apply(
            ts.name,
            frame["tile"],
            sheets[ts.name].crop(
                (col * 64, row * 64, col * 64 + 64, row * 64 + 64)
            ),
        )
        x, y = frame["x"], frame["y"]
        assert atlas.crop((x, y, x + 64, y + 64)).tobytes() == source.tobytes()
        assert atlas.getpixel((x - 2, y)) == source.getpixel((0, 0))
        assert atlas.getpixel((x + 65, y + 63)) == source.getpixel((63, 63))


def test_city_atlas_holds_only_the_tiles_the_city_draws(built):
    _, report = built
    assert report["maps"]["classic_hearthrock_city"]["tiles"] < 250


def test_route_1_atlas_holds_the_animation_frames_of_its_tiles(built):
    doc = map_doc(built, "classic_route_1")
    tiles = doc["tilesets"][0]["tiles"]
    count = doc["tilesets"][0]["tilecount"]
    assert tiles
    for tile in tiles:
        assert all(0 <= f["tileid"] < count for f in tile["animation"])


@pytest.mark.parametrize("name", WORLD_MAPS)
def test_events_use_only_known_actions_and_conditions(built, name):
    for script in scripts(map_doc(built, name)):
        assert {a["type"] for a in script["actions"]} <= KNOWN_ACTIONS
        assert {b["type"] for b in script["behaviors"]} <= KNOWN_BEHAVIORS
        assert {c["type"] for c in script["conditions"]} <= KNOWN_CONDITIONS
        assert {c["operator"] for c in script["conditions"]} <= {"is", "not"}


def test_city_has_both_the_tmx_events_and_the_nagmon_events(built):
    sources = [
        s["source"] for s in scripts(map_doc(built, "classic_hearthrock_city"))
    ]
    assert sources.count("tmx") == 6
    assert sources.count("nagmon") == 57


def test_event_box_is_in_pixels_of_the_map_tiles(built):
    doc = map_doc(built, "classic_hearthrock_city")
    gym = next(
        o
        for o in layer(doc, "events")["objects"]
        if o["name"] == "Teleport to Gym 1"
    )
    assert (gym["x"], gym["y"], gym["width"]) == (18 * 64, 13 * 64, 64)


def test_route_1_encounters_are_replaced_by_the_nagmon_table(built):
    found = [
        a["args"]
        for s in scripts(map_doc(built, "classic_route_1"))
        for a in s["actions"]
        if a["type"] == "random_encounter"
    ]
    assert found == [["nagmon_route1", "11"]] * 3


def test_talk_behaviour_is_kept_for_the_interpreter(built):
    cashier = [
        s
        for s in scripts(map_doc(built, "classic_hearthrock_city"))
        if {"type": "talk", "args": ["nagmon_cashier"]} in s["behaviors"]
    ]
    assert cashier


@pytest.mark.parametrize(
    ("name", "exit_name", "tiles"),
    [
        (
            "classic_hearthrock_city",
            "Teleport to Route8",
            [(39, 15), (39, 17)],
        ),
        ("classic_route_1", "Teleport to Steamshore", [(5, 0), (7, 0)]),
    ],
)
def test_exits_outside_the_world_are_walled_off(built, name, exit_name, tiles):
    doc = map_doc(built, name)
    blocked = [o["name"] for o in layer(doc, "blocked_exits")["objects"]]
    assert blocked == [exit_name]
    rows = prop(doc, "collision")["rows"]
    for x, y in tiles:
        assert rows[y][x] == "#"
    for script in scripts(doc):
        assert maps.leaves_world(script) is None


@pytest.mark.parametrize("name", WORLD_MAPS)
def test_teleports_land_on_free_tiles_of_world_maps(built, name):
    for script in scripts(map_doc(built, name)):
        for action in script["actions"]:
            if action["type"] in ("transition_teleport", "set_teleport_faint"):
                target = action["args"][1].removesuffix(".tmx")
                x, y = int(action["args"][2]), int(action["args"][3])
                assert target in WORLD_MAPS
                rows = prop(map_doc(built, target), "collision")["rows"]
                assert rows[y][x] == ".", (target, x, y)


@pytest.mark.parametrize("name", WORLD_MAPS)
def test_npcs_are_created_on_free_tiles(built, name):
    doc = map_doc(built, name)
    rows = prop(doc, "collision")["rows"]
    for script in scripts(doc):
        for action in script["actions"]:
            if action["type"] == "create_npc":
                x, y = int(action["args"][1]), int(action["args"][2])
                assert rows[y][x] == ".", action


def test_collision_grid_holds_the_tmx_collision_rects(built):
    doc = map_doc(built, "classic_hearthrock_city")
    collision = prop(doc, "collision")
    # <object type="collision" x="16" y="0" width="16" height="288"/>
    assert all(collision["rows"][y][1] == "#" for y in range(18))
    assert collision["rows"][16][29] == "."  # the start, by the owl


def test_collision_regions_say_where_they_can_be_entered_from(built):
    doc = map_doc(built, "classic_hearthrock_city")
    collision = prop(doc, "collision")
    for key, region in collision["regions"].items():
        x, y = map(int, key.split(","))
        assert collision["rows"][y][x] == "r"
        assert set(region["enter_from"]) <= {"up", "down", "left", "right"}


def test_leaves_world_reads_the_teleport_target():
    script = {
        "actions": [
            {
                "type": "transition_teleport",
                "args": ["player", "classic_route_8.tmx", "0", "16"],
            }
        ]
    }
    assert maps.leaves_world(script) == "classic_route_8"


def test_extruded_cell_repeats_the_tile_edges():
    tile = Image.new("RGBA", (64, 64), (10, 20, 30, 255))
    tile.putpixel((0, 0), (255, 0, 0, 255))
    cell = maps._extruded(tile)
    assert cell.size == (68, 68)
    assert cell.getpixel((0, 0)) == (255, 0, 0, 255)
    assert cell.getpixel((2, 0)) == (255, 0, 0, 255)
    assert cell.getpixel((67, 67)) == (10, 20, 30, 255)


def test_teleport_actions_are_the_engine_ones():
    assert set(maps.TELEPORTS) == {
        "transition_teleport",
        "teleport",
        "set_teleport_faint",
    }


def healing_center_sign(built):
    out, _ = built
    frames = json.loads(out.data["atlas/classic_hearthrock_city.json"])
    frame = next(
        f
        for f in frames["frames"]
        if (f["tileset"], f["tile"]) == ("core_buildings", 351)
    )
    x, y = frame["x"], frame["y"]
    return out.images["atlas/classic_hearthrock_city.png"].crop(
        (x, y, x + 64, y + 64)
    )


def is_red(pixel):
    r, g, b, _ = pixel
    return r > 150 and g < 90 and b < 90


def test_healing_center_sign_has_no_cross(built):
    sign = healing_center_sign(built)
    # The cross's arms: the top of the upright and both ends of the bar.
    for point in [(31, 6), (32, 6), (18, 18), (45, 18)]:
        assert not is_red(sign.getpixel(point)), point


def test_healing_center_sign_shows_a_red_heart(built):
    sign = healing_center_sign(built)
    for point in [(25, 14), (39, 14), (32, 22), (32, 30)]:
        assert is_red(sign.getpixel(point)), point


def test_overlay_changes_only_its_own_tiles(built):
    from tools.app import overlays

    assert set(overlays.OVERLAYS) == {("core_buildings", 351)}


@pytest.mark.parametrize("name", WORLD_MAPS)
def test_no_door_gap_in_a_building_wall_leads_nowhere(built, name):
    """
    A free tile between walls is a door. If nothing teleports from it the
    hero walks into the house body behind it, so it must be a wall (the
    old game's houses without an inside). A host's spot in a counter gap
    (the nurse, the shopkeeper) is the other kind of gap.
    """
    doc = map_doc(built, name)
    rows = prop(doc, "collision")["rows"]
    doors = set()
    for obj in layer(doc, "events")["objects"]:
        script = obj["properties"][0]["value"]
        if any(a["type"] == "transition_teleport" for a in script["actions"]):
            for x in range(obj["x"] // 64, (obj["x"] + obj["width"]) // 64):
                for y in range(
                    obj["y"] // 64, (obj["y"] + obj["height"]) // 64
                ):
                    doors.add((x, y))
        for a in script["actions"]:
            if a["type"] == "create_npc" and name in INTERIORS:
                doors.add((int(a["args"][1]), int(a["args"][2])))
    for y, row in enumerate(rows):
        for x in range(2, len(row) - 2):
            gap = (
                row[x] == "."
                and row[x - 2 : x] == "##"
                and row[x + 1 : x + 3] == "##"
            )
            assert not gap or (x, y) in doors, (name, x, y)


#: The doors of Hearthrock's houses: city tile -> (interior, way-out tile
#: inside, the city tile the hero comes back to).
HOUSE_DOORS = {
    (5, 5): ("nagmon_home", (4, 6), (5, 6)),
    (10, 5): ("nagmon_lab", (6, 17), (10, 6)),
    (15, 5): ("nagmon_friend_house", (5, 7), (15, 6)),
    (8, 13): ("nagmon_rest_center", (6, 10), (8, 14)),
    (13, 13): ("nagmon_shop", (6, 10), (13, 14)),
}


def teleports(doc):
    """(x, y, facing, map, to x, to y) of every transition_teleport."""
    found = []
    for obj in layer(doc, "events")["objects"]:
        script = obj["properties"][0]["value"]
        facing = [
            c["args"][-1]
            for c in script["conditions"]
            if c["type"] == "char_facing"
        ]
        for a in script["actions"]:
            if a["type"] == "transition_teleport":
                found.append(
                    (
                        obj["x"] // 64,
                        obj["y"] // 64,
                        facing[0] if facing else None,
                        a["args"][1].removesuffix(".tmx"),
                        int(a["args"][2]),
                        int(a["args"][3]),
                    )
                )
    return found


@pytest.mark.parametrize("door", sorted(HOUSE_DOORS))
def test_a_house_door_teleports_into_its_interior_and_back(built, door):
    interior, way_out, back = HOUSE_DOORS[door]
    city = map_doc(built, "classic_hearthrock_city")
    inside = map_doc(built, interior)
    city_rows = prop(city, "collision")["rows"]
    rows = prop(inside, "collision")["rows"]
    # the door is open and teleports (facing up) onto the interior's way out
    assert city_rows[door[1]][door[0]] == "."
    into = [t for t in teleports(city) if t[:2] == door]
    assert into == [(*door, "up", interior, *way_out)]
    assert rows[way_out[1]][way_out[0]] == "."
    # the way out is that tile, facing down, onto a free tile below the door
    out = [t for t in teleports(inside) if t[:2] == way_out]
    assert out == [(*way_out, "down", "classic_hearthrock_city", *back)]
    assert city_rows[back[1]][back[0]] == "."
    assert back == (door[0], door[1] + 1)


def test_every_house_interior_is_in_the_build_and_fits_a_mobile_texture(built):
    out, _ = built
    assert sorted(i for i, _, _ in HOUSE_DOORS.values()) == sorted(INTERIORS)
    for interior in INTERIORS:
        assert interior in WORLD_MAPS
        assert f"maps/{interior}.json" in out.data
        width, height = out.images[f"atlas/{interior}.png"].size
        assert max(width, height) <= maps.MAX_TEXTURE


@pytest.mark.parametrize("door", sorted(HOUSE_DOORS))
def test_a_house_has_a_host_a_child_can_walk_up_to(built, door):
    interior = HOUSE_DOORS[door][0]
    doc = map_doc(built, interior)
    rows = prop(doc, "collision")["rows"]
    hosts = []
    for script in scripts(doc):
        for a in script["actions"]:
            if a["type"] == "create_npc":
                hosts.append((int(a["args"][1]), int(a["args"][2])))
        assert [b["type"] for b in script["behaviors"]] in ([], ["talk"])
    assert len(hosts) == 1
    x, y = hosts[0]
    free = [
        (x + dx, y + dy)
        for dx, dy in ((0, 1), (1, 0), (-1, 0), (0, -1))
        if rows[y + dy][x + dx] == "."
    ]
    assert free, f"nobody can stand next to the host at {(x, y)}"
    talks = [s for s in scripts(doc) if s["behaviors"]]
    assert len(talks) == 1


def test_the_cashier_leaves_the_shop_door_free(built):
    city = map_doc(built, "classic_hearthrock_city")
    spots = {
        (int(a["args"][1]), int(a["args"][2]))
        for script in scripts(city)
        for a in script["actions"]
        if a["type"] == "create_npc"
    }
    assert not spots & {(13, 14), (8, 14), (5, 6), (10, 6), (15, 6)}
