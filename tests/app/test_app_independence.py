"""The app's creatures are the family's own: none comes from Tuxemon."""

import json

import yaml

from tools.app import db
from tools.app.common import MODS, NAG, TUX


def data(built, rel):
    out, _ = built
    return json.loads(out.data[rel])


def trip_slugs():
    slugs = set()
    for path in sorted((NAG / "trips").glob("*.yaml")):
        doc = yaml.safe_load(path.read_text(encoding="utf-8"))
        slugs.add(doc["master"]["monster"])
        for zone in doc["zones"]:
            slugs |= set(zone["monsters"])
    return slugs


def test_the_monster_table_has_no_tuxemon_creature():
    tux = {p.stem for p in (TUX / "db" / "monster").glob("*.yaml")}
    table = db.app_monsters()
    assert table
    assert not tux & set(table)
    for rec in table.values():
        assert all(s.startswith("mods/nagmon/") for s in rec["_source"])


def test_every_creature_of_the_app_belongs_to_a_trip(built):
    monsters = set(data(built, "db/monsters.json"))
    assert monsters == trip_slugs()
    assert len(monsters) == 70


def test_the_nagmon_folder_holds_only_trip_creatures():
    files = {p.stem for p in (NAG / "db" / "monster").glob("*.yaml")}
    assert files == trip_slugs()
    assert MODS.is_dir()


def test_every_creature_is_a_solar_one_in_every_table(built):
    monsters = set(data(built, "db/monsters.json"))
    route = data(built, "db/encounters.json")["nagmon_route1"]
    assert {m["monster"] for m in route["monsters"]} <= monsters
    for rec in data(built, "db/encounters.json").values():
        assert {m["monster"] for m in rec["monsters"]} <= monsters


def test_the_starter_choice_comes_from_solar_base_forms(built):
    text = (NAG / "maps" / "classic_hearthrock_city.yaml").read_text(
        encoding="utf-8"
    )
    monsters = data(built, "db/monsters.json")
    for line in text.splitlines():
        if "choice_monster" in line:
            slugs = (
                line.split("choice_monster")[1]
                .strip()
                .split(",")[0]
                .split(":")
            )
            assert len(slugs) == 3
            for slug in slugs:
                assert monsters[slug]["stage"] == "basic"


def test_no_tuxemon_creature_name_is_shipped(built):
    from tools.app import i18n

    he = data(built, "i18n/he.json")
    en = data(built, "i18n/en.json")
    gone = i18n.tuxemon_creature_ids()
    assert "agnite" in gone and "kroki_description" in gone
    assert not gone & (set(he) | set(en))
