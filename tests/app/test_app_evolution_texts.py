"""The evolution texts (BATTLE_V3 S4) in the app's table and in both catalogues.

Every ``evo*`` key of ``app/src/i18nEvolution.ts`` (Hebrew, the language of the game)
has the msgid ``app_<key>`` in ``nagmon.po`` for ``he_IL`` (the same words)
and for ``en_US`` (English), with the same ``{placeholders}``.
"""

import json
import re

from tools.app import i18n

TS = i18n.REPO / "app" / "src" / "i18nEvolution.ts"
KEY = re.compile(r'^\s+(evo\w+): "((?:[^"\\]|\\.)*)",$', re.M)
HEBREW = re.compile(r"[֐-׿]")
HOLE = re.compile(r"\{(\w+)\}")


def app_texts() -> dict[str, str]:
    found = {}
    for m in KEY.finditer(TS.read_text(encoding="utf-8")):
        found[m.group(1)] = json.loads(f'"{m.group(2)}"')
    return found


def catalogue(lang: str) -> dict[str, str]:
    path = i18n.NAG / "l18n" / lang / "LC_MESSAGES" / "nagmon.po"
    return i18n.load_po(path)


def test_the_app_has_the_evolution_texts():
    texts = app_texts()
    assert len(texts) >= 30
    for must in ("evoWarm", "evoGo", "evoLater", "evoGateKnow", "evoShelf"):
        assert must in texts


def test_every_text_is_in_both_catalogues_with_the_same_holes():
    he, en = catalogue("he_IL"), catalogue("en_US")
    for key, text in app_texts().items():
        msgid = f"app_{key}"
        assert he.get(msgid) == text, (
            f"{msgid}: the Hebrew catalogue differs from i18n.ts"
        )
        assert msgid in en, f"{msgid}: no English"
        assert en[msgid].strip(), f"{msgid}: empty English"
        assert not HEBREW.search(en[msgid]), (
            f"{msgid}: Hebrew in the English text"
        )
        assert set(HOLE.findall(en[msgid])) == set(HOLE.findall(text)), msgid


def test_no_msgid_of_the_block_is_left_without_a_key():
    texts = app_texts()
    for lang in ("he_IL", "en_US"):
        for msgid in catalogue(lang):
            if msgid.startswith("app_evo"):
                assert msgid[len("app_") :] in texts, (
                    f"{lang}: {msgid} has no key in i18n.ts"
                )


def test_the_shipped_json_has_them(built):
    out, _ = built
    he = json.loads(out.data["i18n/he.json"])
    en = json.loads(out.data["i18n/en.json"])
    for key in app_texts():
        assert f"app_{key}" in he and f"app_{key}" in en
