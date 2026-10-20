"""Database subset, sprites, audio, emoji and credits."""

import json
from pathlib import PurePosixPath

from tools.app import credits, emoji
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


def test_world_uses_41_monsters_with_the_12_nagmon_ones(built):
    monsters = data(built, "db/monsters.json")
    assert len(monsters) == 41
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
    assert len(techniques) == 126


def test_nagmon_record_replaces_the_tuxemon_record_of_the_same_slug():
    leader = table("npc")["classic_gym_leader_granite"]
    assert leader["template"]["sprite_name"] == "nagmon_granite"
    assert leader["_source"] == ["mods/nagmon/db/npc/nagmon_world.yaml"]


def test_nagmon_monster_sheets_are_hd(built):
    monsters = data(built, "db/monsters.json")
    sprites = monsters["geometrion"]["sprites"]
    assert sprites["scale"] == 3
    assert sprites["front"] == [0, 0, 192, 192]
    assert monsters["agnite"]["sprites"]["scale"] == 1


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


def test_avatars_keep_the_old_keys(built):
    keys = [a["key"] for a in data(built, "db/avatars.json")]
    assert keys == [
        "boy_blue",
        "girl_teal",
        "girl_curly",
        "boy_light",
        "boy_dark",
        "girl_light",
        "girl_dark",
    ]


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
        stem = index["codes"][code]
        assert f"emoji/png/{stem}.png" in built[0].paths()


def test_generator_emoji_found_in_the_source():
    codes = emoji.generator_codes()
    assert {"1f34e", "2b50", "1f98b"} <= codes


def test_every_shipped_asset_has_an_author_and_a_licence_entry(built):
    out, _ = built
    doc = data(built, "credits.json")
    listed = {a["path"]: a for a in doc["assets"]}
    for path in out.paths():
        if PurePosixPath(path).suffix == ".json" and not path.startswith(
            "maps/"
        ):
            continue
        assert path in listed, path
        asset = listed[path]
        if asset["kind"] != "licence":
            assert asset["licence"], path
            assert asset["author"] or asset["credit"], path


def test_owner_art_is_not_marked_with_a_licence(built):
    doc = data(built, "credits.json")
    owl = next(
        a for a in doc["assets"] if a["path"] == "sprites/npc/nagmon_owl.png"
    )
    assert owl["licence"] == credits.OWNER["licence"]


def test_music_is_credited_to_its_composer(built):
    doc = data(built, "credits.json")
    town = next(
        a for a in doc["assets"] if a["path"].endswith("JRPG_town_loop.ogg")
    )
    assert "Yubatake" in doc["entries"][town["credit"]]["text"]
    assert town["licence"] == "CC BY 3.0"


def test_licence_texts_ship(built):
    out, _ = built
    for path in credits.LICENSE_FILES:
        assert path in out.paths()


def test_attribution_entries_are_split_with_author_and_licence():
    text = (
        "### Items\n\n"
        '* ["Potion"](https://x) by\n[Someone](https://y)\n'
        "is licensed under [CC BY-SA 4.0](https://z)\n\n"
        '* ["Ball"] By Other, licensed under CC0\n'
    )
    entries = credits.parse_attributions(text)
    assert [e.title for e in entries] == ["Potion", "Ball"]
    assert entries[0].section == "Items"
    assert entries[0].authors == "Someone"
    assert entries[0].licence == "CC BY-SA 4.0"
    assert entries[1].licence == "CC0 / public domain"
