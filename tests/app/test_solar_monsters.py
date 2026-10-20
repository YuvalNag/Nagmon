"""The solar-system animals: the parent's art folders, made game-ready."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml
from PIL import Image

from tools.art import import_solar_monsters as imp

REPO = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def records():
    return imp.load_records()


@pytest.fixture(scope="module")
def files():
    return imp.build()


@pytest.fixture(scope="module")
def trip():
    return imp.load_trip()


def test_seventy_animals_in_twenty_five_families(records):
    assert len(records) == 70
    bases = [r for r in records.values() if not r["evolves_from"]]
    assert len(bases) == 25


def test_every_animal_has_both_pictures_and_an_icon():
    for folder in sorted(imp.INBOX.iterdir()):
        for name, size in (("front", 256), ("back", 256), ("icon", 96)):
            with Image.open(folder / f"{name}.png") as im:
                assert im.size == (size, size), (folder.name, name)


def test_every_animal_has_hebrew_and_english_descriptions(records):
    for slug, rec in records.items():
        for key in ("description_he", "description_en"):
            text = rec[key]
            assert text.strip(), (slug, key)
            assert len(text) <= imp.MAX_TEXT, (slug, key, len(text))
        assert any("א" <= c <= "ת" for c in rec["description_he"]), slug
        assert not any("א" <= c <= "ת" for c in rec["description_en"]), slug


def test_no_template_text_is_left(records):
    for slug, rec in records.items():
        for key in ("description_he", "description_en"):
            for phrase in imp.TEMPLATES:
                assert phrase not in rec[key], (slug, key)


def test_the_raw_files_do_use_the_templates():
    # the rule above is a real check: the generator's own text fails it
    raw = json.loads(
        (imp.INBOX / "lunibble" / "monster.json").read_text("utf-8")
    )
    assert any(p in raw["description_en"] for p in imp.TEMPLATES)


def test_descriptions_are_all_different(records):
    he = [r["description_he"] for r in records.values()]
    en = [r["description_en"] for r in records.values()]
    assert len(set(he)) == 70 and len(set(en)) == 70


def test_every_animal_belongs_to_a_zone_of_the_trip(records, trip):
    zones = {z["id"] for z in trip["zones"]}
    for slug, rec in records.items():
        assert rec["zone"] in zones, slug


def test_the_zone_table_of_the_parent(trip):
    bases = {z["id"]: set(z["families"]) for z in trip["zones"]}
    assert bases == {
        "moon": {"lunibble", "terrabub"},
        "sun": {"heliobud", "solwind", "sailbit"},
        "rocky_planets": {
            "mercurip",
            "venubud",
            "rustip",
            "roveroo",
            "asterchip",
            "meteet",
            "dustip",
        },
        "giants": {
            "jovibud",
            "iobud",
            "europip",
            "ganybit",
            "ringlet",
            "titanip",
            "gravip",
        },
        "outer": {"tiltip", "nepbit", "plutot", "kuipip", "combit", "probip"},
    }


def test_an_evolution_lives_in_the_zone_of_its_base(records):
    for slug, rec in records.items():
        if rec["evolves_from"]:
            assert rec["zone"] == records[rec["evolves_from"]]["zone"], slug


def test_where_is_the_map_of_the_zone(records, trip):
    maps = {z["id"]: z["map"] for z in trip["zones"]}
    for slug, rec in records.items():
        assert rec["where"], slug
        for place in rec["where"]:
            assert place["map"] == maps[rec["zone"]], slug
    for slug, rec in records.items():
        assert rec["where"][0]["wild"] == (not rec["evolves_from"]), slug


def test_shapes_are_real_and_not_all_blob(records):
    shapes = [r["shape"] for r in records.values()]
    assert set(shapes) <= imp.SHAPES
    assert shapes.count("blob") < 30
    assert len(set(shapes)) >= 8


def test_compound_hebrew_names_have_their_space(records):
    names = {s: r["name_he"] for s, r in records.items()}
    assert names["lunwarden"] == "שומר ירח"
    assert names["venuveil"] == "צעיף נוגה"
    assert names["cometail"] == "זנב שביט"
    assert names["marstrix"] == "אביר מאדים"
    assert " " not in names["lunibble"]
    spaced = [n for n in names.values() if " " in n]
    assert len(spaced) >= 25
    assert len(set(names.values())) == 70
    assert all(len(n) <= 10 for n in names.values())


def test_evolution_chains_agree(records):
    for slug, rec in records.items():
        nxt = rec["evolves_into"]
        if nxt:
            assert records[nxt["slug"]]["evolves_from"] == slug
            assert nxt["at_level"] in (16, 20, 36)
        if rec["evolves_from"]:
            into = records[rec["evolves_from"]]["evolves_into"]
            assert into and into["slug"] == slug


def test_monster_yaml_is_the_games_format(records, trip, files):
    for slug in records:
        path = REPO / "mods/nagmon/db/monster" / f"{slug}.yaml"
        data = yaml.safe_load(files[path])
        assert data["slug"] == slug
        assert data["types"] == ["cosmic"]
        assert data["shape"] == records[slug]["shape"]
        assert data["moveset"][0]["technique"] == "struggle"
        assert data["txmn_id"] >= 500
    ids = [
        yaml.safe_load(files[REPO / "mods/nagmon/db/monster" / f"{s}.yaml"])[
            "txmn_id"
        ]
        for s in records
    ]
    assert len(set(ids)) == 70


def test_sheets_have_the_battle_layout_at_four_times(records, files):
    import io

    for slug in records:
        path = REPO / "mods/nagmon/gfx/sprites/battle" / f"{slug}-sheet.png"
        with Image.open(io.BytesIO(files[path])) as sheet:
            assert sheet.size == (512, 352)
            rgba = sheet.convert("RGBA")
        front = rgba.crop((0, 0, 256, 256)).getchannel("A").getbbox()
        back = rgba.crop((256, 0, 512, 256)).getchannel("A").getbbox()
        icon = rgba.crop((0, 256, 96, 352)).getchannel("A").getbbox()
        assert front and back and icon, slug


def test_the_encounter_tables_hold_the_zones_base_forms(trip, files):
    for zone in trip["zones"]:
        path = REPO / "mods/nagmon/db/encounter" / f"{zone['encounter']}.yaml"
        data = yaml.safe_load(files[path])
        met = {m["monster"] for m in data["monsters"]}
        assert met == set(zone["families"])
        for m in data["monsters"]:
            assert m["level_range"] == zone["wild_levels"]


def test_texts_in_both_languages_without_niqqud(files):
    for loc in ("he_IL", "en_US"):
        po = REPO / f"mods/nagmon/l18n/{loc}/LC_MESSAGES/nagmon.po"
        text = files[po].decode("utf-8")
        assert 'msgid "lunibble_description"' in text
        assert 'msgid "cat_moon_critter"' in text
    he = files[REPO / "mods/nagmon/l18n/he_IL/LC_MESSAGES/nagmon.po"].decode()
    assert not any("ֽ" <= c <= "ׇ" or "֑" <= c <= "ֽ" for c in he)


def test_the_committed_files_are_what_the_importer_makes(files):
    for path, data in files.items():
        assert path.read_bytes() == data, path.relative_to(REPO)
