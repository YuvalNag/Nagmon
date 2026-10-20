"""Maps: Tiled JSON, the used-tile atlases, events and collisions."""

import json

import pytest
from PIL import Image

from tools.app import maps
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
    for frame in frames[::7]:
        ts = maps.load_tsx(
            maps.TUX / "gfx" / "tilesets" / f"{frame['tileset']}.tsx"
        )
        if ts.name not in sheets:
            sheets[ts.name] = Image.open(ts.hd_image).convert("RGBA")
        col, row = frame["tile"] % ts.columns, frame["tile"] // ts.columns
        source = sheets[ts.name].crop(
            (col * 64, row * 64, col * 64 + 64, row * 64 + 64)
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
    assert sources.count("nagmon") == 52


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
