"""Learning content and the message catalogues (he/en)."""

import json

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
    assert index["counts"]["skills"] == 260


def test_content_keeps_its_structure(built):
    math = data(built, "content/skills/math.json")
    assert math["subject"] == "math"
    assert math["skills"][0]["id"] == "math.count.objects_5"
    subjects = data(built, "content/subjects.json")["subjects"]
    assert subjects["hebrew"]["monsters"] == ["scrollo", "megillon"]
    faq = data(built, "content/owl_faq.json")
    assert faq["fallback_he"] and len(faq["items"]) == 67


def test_he_and_en_catalogues_have_the_same_keys(built):
    assert set(data(built, "i18n/he.json")) == set(data(built, "i18n/en.json"))


def test_every_nagmon_msgid_is_in_both_catalogues(built):
    he, en = data(built, "i18n/he.json"), data(built, "i18n/en.json")
    for lang in ("he_IL", "en_US"):
        po = i18n.NAG / "l18n" / lang / "LC_MESSAGES" / "nagmon.po"
        for msgid in i18n.load_po(po):
            assert msgid in he and msgid in en


def test_hebrew_catalogue_is_hebrew_for_the_nagmon_world(built):
    he = data(built, "i18n/he.json")
    world = [k for k in he if k.startswith("nagmon_world_")]
    assert len(world) >= 50
    assert all(any("א" <= ch <= "ת" for ch in he[k]) for k in world)


def test_only_a_subset_of_tuxemon_texts_ships(built):
    _, report = built
    assert 700 <= report["i18n"]["from_base"] <= 1000
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
