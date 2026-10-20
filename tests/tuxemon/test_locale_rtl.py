# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
import re

import pytest
import yaml
from babel.messages.pofile import read_po

from tuxemon.constants.paths import mods_folder
from tuxemon.locale.locale import RTL_LOCALES, T

HE_PO = mods_folder / "tuxemon/l18n/he_IL/LC_MESSAGES/base.po"
EN_PO = mods_folder / "tuxemon/l18n/en_US/LC_MESSAGES/base.po"

NEW_MSGIDS = {
    "currency_symbol",
    "level_short",
    "level_short_spaced",
    "level_up_range",
    "measure_value",
    "menu_key_delete",
    "menu_key_done",
    "menu_key_space",
    "menu_option_default",
    "menu_option_unnamed",
    "quantity_symbol",
    "unit_cm",
    "unit_ft",
    "unit_kg",
    "unit_km",
    "unit_lb",
    "unit_m",
    "unit_mi",
    "unit_t",
    "unknown_location",
}
ALLOWED_HE_MSGIDS = NEW_MSGIDS | {
    "language_he_il",
    "menu_alphabet",
    "menu_char_variants",
}


def _catalog(path):
    with path.open("rb") as f:
        return read_po(f)


def test_rtl_locales():
    assert "he_IL" in RTL_LOCALES


def test_is_rtl_follows_active_language(monkeypatch):
    assert T.is_rtl() is False
    monkeypatch.setattr(T, "get_current_language", lambda: "he_IL")
    assert T.is_rtl() is True


def test_translate_in_does_not_change_language():
    before = T.get_current_language()
    assert T.translate_in("language_he_il", "he_IL") == "עברית"
    assert T.translate_in("unknown_location", "en_US") == "Unknown Location"
    assert T.translate_in("unknown_location", "he_IL") == "מקום לא ידוע"
    assert T.get_current_language() == before
    assert T.translate("unknown_location") == "Unknown Location"


def test_translate_in_caches_translators():
    T.translate_in("language_he_il", "he_IL")
    first = T._translator_in("he_IL", None)
    T.translate_in("language_he_il", "he_IL")
    assert T._translator_in("he_IL", None) is first


def test_translate_in_reads_hebrew_and_falls_back():
    assert T.translate_in("cosmic_berry", "he_IL") != "Cosmic Berry"
    assert T.translate_in("cosmic_berry", "en_US") == "Cosmic Berry"
    # A key nobody translated comes back unchanged.
    assert T.translate_in("no_such_msgid_xyz", "he_IL") == "no_such_msgid_xyz"


def test_format_in():
    assert T.format_in("level_short", "he_IL", {"level": 5}) == "רמה 5"
    assert T.format_in("level_short", "en_US", {"level": 5}) == "Lv.5"


def test_lookup_in_strict():
    assert T.lookup_in("language_he_il", "he_IL") == "עברית"
    assert T.lookup_in("no_such_msgid_xyz", "he_IL") is None
    assert T.lookup_in("cosmic_berry", "en_US") == "Cosmic Berry"
    assert T.lookup_in("no_such_msgid_xyz", "en_US") is None


def test_unknown_locale_falls_back():
    assert T.translate_in("unknown_location", "xx_XX") == "Unknown Location"


def test_he_po_header_and_scope():
    catalog = _catalog(HE_PO)
    assert str(catalog.locale) == "he"
    assert catalog.plural_forms == "nplurals=2; plural=(n != 1);"
    ids = {m.id for m in catalog if m.id}
    english = {m.id for m in _catalog(EN_PO) if m.id}
    # Every Hebrew entry translates an English one; nothing is invented.
    assert ids <= english | ALLOWED_HE_MSGIDS
    assert NEW_MSGIDS <= ids
    assert "language_he_il" in ids


def test_new_msgids_in_english():
    ids = {m.id for m in _catalog(EN_PO) if m.id}
    assert NEW_MSGIDS <= ids
    assert "language_he_il" in ids


def test_hebrew_placeholders_preserved():
    en = {m.id: m.string for m in _catalog(EN_PO) if m.id}
    for message in _catalog(HE_PO):
        if message.id in NEW_MSGIDS:
            fields_he = set(re.findall(r"{(\w+)}", message.string))
            fields_en = set(re.findall(r"{(\w+)}", en[message.id]))
            assert fields_he == fields_en, message.id


def test_hebrew_alphabet():
    alphabet = T.translate_in("menu_alphabet", "he_IL")
    for letter in "אבגדהוזחטיכלמנסעפצקרשת" + "ךםןףץ" + "0123456789 ":
        assert letter in alphabet
    assert len(set(alphabet)) == len(alphabet)


@pytest.fixture(scope="module")
def npc_names():
    with (mods_folder / "npc_names.yaml").open(encoding="utf-8") as f:
        return yaml.safe_load(f)["random_names"]


def test_hebrew_npc_names(npc_names):
    he = npc_names["he_il"]
    total = sum(len(v) for v in he.values())
    assert total >= 30
    assert set(he) == set(npc_names["en_us"])
    for names in he.values():
        for name in names:
            assert re.fullmatch(r"[א-ת]+", name), name
