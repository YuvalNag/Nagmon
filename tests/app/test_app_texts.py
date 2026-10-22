"""Learning content and the message catalogues (he/en)."""

import json
import re

import pytest

from tools.app import content, i18n


def data(built, rel):
    out, _ = built
    return json.loads(out.data[rel])


def test_every_content_yaml_file_has_a_json_file_with_the_same_data(built):
    for path in content.content_files():
        rel = path.relative_to(content.LEARNING).with_suffix(".json")
        assert data(built, f"content/{rel.as_posix()}") == content.read_yaml(
            path
        )


def test_content_index_lists_every_file(built):
    index = data(built, "content/index.json")
    assert len(index["files"]) == len(content.content_files())
    assert index["counts"]["skills"] == 292


def test_content_keeps_its_structure(built):
    math = data(built, "content/skills/math.json")
    assert math["subject"] == "math"
    assert math["skills"][0]["id"] == "math.count.objects_5"
    subjects = data(built, "content/subjects.json")["subjects"]
    assert subjects["hebrew"]["monsters"][-3:] == [
        "plutot",
        "plutopaw",
        "plutaur",
    ]
    assert "ringwarden" in subjects["hebrew"]["monsters"]
    faq = data(built, "content/owl_faq.json")
    assert faq["fallback_he"] and len(faq["items"]) == 67


def test_he_and_en_catalogues_have_the_same_keys(built):
    assert set(data(built, "i18n/he.json")) == set(data(built, "i18n/en.json"))


def test_every_nagmon_msgid_is_in_both_catalogues(built):
    he, en = data(built, "i18n/he.json"), data(built, "i18n/en.json")
    # the Hebrew names of Tuxemon's creatures stay in the file for the
    # old game; the app does not ship them
    skipped = i18n.tuxemon_creature_ids()
    for lang in ("he_IL", "en_US"):
        po = i18n.NAG / "l18n" / lang / "LC_MESSAGES" / "nagmon.po"
        for msgid in i18n.load_po(po):
            if msgid not in skipped:
                assert msgid in he and msgid in en


def test_hebrew_catalogue_is_hebrew_for_the_nagmon_world(built):
    he = data(built, "i18n/he.json")
    world = [k for k in he if k.startswith("nagmon_world_")]
    assert len(world) >= 50
    assert all(any("א" <= ch <= "ת" for ch in he[k]) for k in world)


def test_only_a_subset_of_tuxemon_texts_ships(built):
    _, report = built
    assert 400 <= report["i18n"]["from_base"] <= 700
    assert report["i18n"]["missing"] == []


@pytest.mark.parametrize(
    "msgid", ["combat_used_x", "menu_items", "currency_symbol"]
)
def test_generic_ui_strings_are_kept(built, msgid):
    assert msgid in data(built, "i18n/he.json")


def test_nagmon_texts_win_over_tuxemon_texts(built):
    assert data(built, "i18n/en.json")["wicked_wind"] == "Mystery Wind"


def test_lookup_order_is_nagmon_then_base_then_english():
    cats = {
        "nagmon": {"he": {"a": "נ"}, "en": {"a": "N", "b": "NB", "c": "NC"}},
        "base": {"he": {"a": "ב", "b": "בב"}, "en": {"c": "BC", "d": "BD"}},
    }
    assert i18n.lookup(cats, "he", "a") == "נ"
    assert i18n.lookup(cats, "he", "b") == "בב"
    assert i18n.lookup(cats, "he", "c") == "NC"
    assert i18n.lookup(cats, "he", "d") == "BD"
    assert i18n.lookup(cats, "en", "a") == "N"
    assert i18n.lookup(cats, "he", "zzz") is None


def test_po_reader_skips_fuzzy_and_empty_entries(tmp_path):
    po = tmp_path / "x.po"
    po.write_text(
        'msgid ""\nmsgstr "Content-Type: text/plain; charset=UTF-8\\n"\n\n'
        'msgid "ok"\nmsgstr "fine"\n\n'
        '#, fuzzy\nmsgid "fuzzy"\nmsgstr "maybe"\n\n'
        'msgid "empty"\nmsgstr ""\n\n'
        'msgid "one"\nmsgid_plural "many"\nmsgstr[0] "1"\nmsgstr[1] "n"\n',
        encoding="utf-8",
    )
    assert i18n.load_po(po) == {"ok": "fine", "one": "1", "one#1": "n"}


ENGINE_SCREENS = (
    "combat_state",
    "combat_menus",
    "item_menu",
    "technique_menu",
    "evolution",
    "transition_evolution",
    "monster_info",
    "monster_menu",
    "level_up",
    "journal_info",
    "journal_state",
)
TRANSLATE_CALL = re.compile(
    r"T\.(?:translate|format)\(\s*\"([a-z][a-z0-9_]*)\""
)


def engine_screen_msgids():
    """Literal msgids the battle, item, evolution and journal screens show."""
    root = i18n.REPO / "tuxemon"
    files = [root / "states" / f"{name}.py" for name in ENGINE_SCREENS]
    files += sorted((root / "combat").glob("*.py"))
    base = set(i18n.load_po(i18n.TUX / "l18n/en_US/LC_MESSAGES/base.po"))
    found = set()
    for path in files:
        found |= set(TRANSLATE_CALL.findall(path.read_text(encoding="utf-8")))
    return found & base


def test_engine_screen_texts_are_shipped(built):
    he = data(built, "i18n/he.json")
    wanted = engine_screen_msgids()
    assert len(wanted) > 30
    assert sorted(wanted - set(he)) == []


@pytest.mark.parametrize(
    "msgid",
    [
        "attempting_capture",
        "gotcha",
        "gotcha_team",
        "gotcha_kennel",
        "tuxemon_new_tech",
        "evolution_confirmation",
        "allow_evolution",
        "evolution_ended",
        "yes",
        "no",
        "item_cannot_use_here",
        "item_no_available_target",
        "melee",
        "ranged",
        "armour",
        "dodge",
        "speed",
        "short_hp",
        "exp_to_next_level",
        "gender_male",
        "gender_female",
    ],
)
def test_texts_the_engine_shows_are_shipped(built, msgid):
    assert msgid in data(built, "i18n/he.json")
    assert msgid in data(built, "i18n/en.json")


def test_every_monster_shape_has_a_text(built):
    he = data(built, "i18n/he.json")
    from tools.app.db import table

    shapes = set(table("shape"))
    assert len(shapes) == 14
    assert shapes <= set(he)


def test_every_monster_has_a_hebrew_name(built):
    he = data(built, "i18n/he.json")
    for slug in data(built, "db/monsters.json"):
        assert any("א" <= ch <= "ת" for ch in he[slug]), slug
