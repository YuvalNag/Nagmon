"""Database subset, sprites, audio, emoji and credits."""

import json

import pytest

from tools.app import db, emoji
from tools.app.common import Output
from tools.app.db import table

NAGMON_MONSTERS = {
    "alphabel",
    "botanikos",
    "enigmon",
    "flaskling",
    "geometrion",
    "lexicon",
    "megillon",
    "multivolt",
    "pluson",
    "polygonos",
    "puzzlet",
    "scrollo",
}
WORLD_MUSIC = {
    "music_town_theme",
    "music_cathedral_theme",
    "music_battle_loop",
    "music_win_battle_boss",
    "music_gameover",
    "music_main_theme",
}


def data(built, rel):
    out, _ = built
    return json.loads(out.data[rel])


def test_world_uses_111_monsters_with_the_82_nagmon_ones(built):
    monsters = data(built, "db/monsters.json")
    assert len(monsters) == 111
    assert NAGMON_MONSTERS <= set(monsters)
    assert {"agnite", "rockitten", "kroki", "nut", "dandicub"} <= set(monsters)


def test_every_encounter_monster_exists(built):
    monsters = data(built, "db/monsters.json")
    route = data(built, "db/encounters.json")["nagmon_route1"]
    assert len(route["monsters"]) == 12
    assert {m["monster"] for m in route["monsters"]} <= set(monsters)


def test_every_evolution_and_technique_exists(built):
    monsters = data(built, "db/monsters.json")
    techniques = data(built, "db/techniques.json")
    for rec in monsters.values():
        for evo in rec.get("evolutions") or []:
            assert evo["monster_slug"] in monsters
        for move in rec["moveset"]:
            assert move["technique"] in techniques
    assert len(techniques) == 130


def test_nagmon_record_replaces_the_tuxemon_record_of_the_same_slug():
    leader = table("npc")["classic_gym_leader_granite"]
    assert leader["template"]["sprite_name"] == "nagmon_granite"
    assert leader["_source"] == ["mods/nagmon/db/npc/nagmon_world.yaml"]


def test_all_monster_sheets_are_hd(built):
    monsters = data(built, "db/monsters.json")
    sprites = monsters["geometrion"]["sprites"]
    assert sprites["scale"] == 3
    assert sprites["front"] == [0, 0, 192, 192]
    # a 1x Tuxemon sheet ships as xBRZ x3: the same scale
    assert monsters["agnite"]["sprites"]["scale"] == 3
    assert monsters["agnite"]["sprites"]["front"] == [0, 0, 192, 192]


def test_every_picture_a_record_names_is_shipped(built):
    out, _ = built
    shipped = out.paths()

    def walk(node):
        if isinstance(node, dict):
            for value in node.values():
                yield from walk(value)
        elif isinstance(node, list):
            for value in node:
                yield from walk(value)
        elif isinstance(node, str) and node.startswith("sprites/"):
            yield node

    for rel in (
        "monsters",
        "items",
        "npcs",
        "avatars",
        "animations",
        "elements",
        "environments",
    ):
        for path in walk(data(built, f"db/{rel}.json")):
            assert path in shipped, path


def test_only_the_three_hd_heroes_are_avatars(built):
    doc = data(built, "db/avatars.json")
    assert [a["key"] for a in doc["avatars"]] == [
        "boy_blue",
        "girl_teal",
        "girl_curly",
    ]
    assert doc["fallback"] == "boy_blue"


def test_old_avatar_keys_map_to_an_hd_hero(built):
    doc = data(built, "db/avatars.json")
    assert doc["legacy"] == {
        "boy_light": "boy_blue",
        "boy_dark": "boy_blue",
        "girl_light": "girl_teal",
        "girl_dark": "girl_curly",
    }
    keys = {a["key"] for a in doc["avatars"]}
    assert set(doc["legacy"].values()) <= keys


def test_tuxemon_avatar_pictures_are_not_shipped(built):
    out, _ = built
    for name in (
        "adventurer",
        "adventurerblack",
        "heroine",
        "brownheroine_brown",
        "heroineblack",
    ):
        assert f"sprites/npc/{name}.png" not in out.paths()
        assert f"sprites/portraits/{name}.png" not in out.paths()


def test_map_sheets_say_their_frame_size(built):
    avatars = data(built, "db/avatars.json")["avatars"]
    assert avatars[0]["frame"] == [128, 256]
    npcs = data(built, "db/npcs.json")
    assert npcs["nagmon_owl"]["sprites"]["frame"] == [128, 256]
    assert npcs["nagmon_owl"]["sprites"]["scale"] == 8
    # 1x Tuxemon map pictures ship as xBRZ x4
    assert npcs["nagmon_kitten"]["sprites"]["frame"] == [64, 128]
    assert npcs["nagmon_kitten"]["sprites"]["scale"] == 4
    assert npcs["nagmon_sign_route1"]["sprites"]["frame"] == [64, 64]


def test_frighten_shows_a_gentle_animation_not_a_skull(built):
    out, _ = built
    techniques = data(built, "db/techniques.json")
    assert techniques["frighten"]["visuals"]["animation"] == "sparks_white"
    for rec in techniques.values():
        assert rec["visuals"]["animation"] != "skull"
    assert "skull" not in data(built, "db/animations.json")
    assert "sprites/animations/technique/skull.png" not in out.paths()


def test_only_the_six_world_music_tracks_ship(built):
    out, _ = built
    assert set(data(built, "db/music.json")) == WORLD_MUSIC
    tracks = [p for p in out.paths() if p.startswith("audio/music/")]
    assert len(tracks) == 6


def test_every_sound_the_database_names_ships(built):
    out, _ = built
    sounds = data(built, "db/sounds.json")
    _, report = built
    assert set(report["db"]["sounds"]) <= set(sounds)
    assert all(path in out.paths() for path in sounds.values())


def test_every_content_emoji_has_a_picture(built):
    index = data(built, "emoji/index.json")
    for code in emoji.content.emoji_codes():
        assert f"emoji/{index['codes'][code]}" in built[0].paths()


def test_emoji_ship_in_one_format_only(built):
    out, _ = built
    shipped = [p for p in out.paths() if p.startswith("emoji/")]
    assert all(p.endswith((".svg", "index.json")) for p in shipped)


def test_generator_emoji_found_in_the_source():
    codes = emoji.generator_codes()
    assert {"1f34e", "2b50", "1f98b"} <= codes


def test_each_hero_has_a_trimmed_front_card(built):
    out, _ = built
    for avatar in data(built, "db/avatars.json")["avatars"]:
        card = avatar["card"]
        assert card == f"avatars/{avatar['key']}.png"
        image = out.images[card]
        assert image.getbbox() == (0, 0, *image.size)
        assert image.height >= 160, card


def test_one_name_cannot_hold_two_pictures():
    sprites = db.Sprites(Output())
    rel = "gfx/sprites/battle/agnite-sheet.png"
    first = sprites.upscaled(rel, "x/a.png", "monster", 3)
    assert sprites.upscaled(rel, "x/a.png", "monster", 3) == first
    with pytest.raises(ValueError, match="already made"):
        sprites.upscaled(rel, "x/a.png", "monster", 4)
    with pytest.raises(ValueError, match="already made"):
        sprites.upscaled(
            "gfx/sprites/battle/nut-sheet.png", "x/a.png", "monster", 3
        )
    with pytest.raises(ValueError, match="already made"):
        sprites.upscaled(rel, "x/a.png", "monster", 3, [(0, 0, 64, 64)])
