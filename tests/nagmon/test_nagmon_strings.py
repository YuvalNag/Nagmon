"""Every msgid Nagmon's Python code uses exists in both nagmon.po files."""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PO = REPO / "mods" / "nagmon" / "l18n"
CODE = [
    *(REPO / "mods" / "nagmon").rglob("*.py"),
    *(REPO / "nagmon").rglob("*.py"),
]
USED = re.compile(r'T\.(?:translate|format)\(\s*f?"(nagmon_[a-z0-9_{}]+)"')


def _msgids(locale: str) -> set[str]:
    text = (PO / locale / "LC_MESSAGES" / "nagmon.po").read_text("utf-8")
    return set(re.findall(r'^msgid "([^"]+)"', text, re.M))


def test_both_languages_have_the_same_keys():
    assert _msgids("en_US") == _msgids("he_IL")


def test_code_uses_only_existing_keys():
    known = _msgids("en_US")
    missing = set()
    for path in CODE:
        for key in USED.findall(path.read_text("utf-8")):
            if "{" in key:  # f-string family, e.g. nagmon_grade_{g}
                prefix = key.split("{")[0]
                if not any(k.startswith(prefix) for k in known):
                    missing.add(key)
            elif key not in known:
                missing.add(key)
    assert not missing, sorted(missing)


def test_no_niqqud_in_hebrew():
    text = (PO / "he_IL" / "LC_MESSAGES" / "nagmon.po").read_text("utf-8")
    assert not re.search("[֑-ׇֽֿׁׂׅׄ]", text)


# ------------------------------------------------- monster names in Hebrew
# The parent saw "Geometrion" and "Agnite" in a Hebrew battle
# (docs/kids/SDD_ANDROID.md §2.7): every monster a child meets in
# Nagmon's world has a Hebrew name.

MODS = REPO / "mods"
HEBREW = re.compile("[א-ת]")
#: Hard words (tests/nagmon/test_art_game.py) and religious symbols.
NOT_IN_A_NAME = ("חנק", "קבר", "קללה", "מוות", "הרג", "דם", "לפיתה", "צלב")
NOT_IN_A_NAME += ("כנסי", "כומר", "קדוש", "מקדש", "אליל", "קרדינ")


def _monster_file(slug: str) -> Path | None:
    for mod in ("nagmon", "tuxemon"):
        path = MODS / mod / "db" / "monster" / f"{slug}.yaml"
        if path.exists():
            return path
    return None


def _evolutions(slug: str) -> set[str]:
    import yaml

    path = _monster_file(slug)
    if path is None:
        return set()
    data = yaml.safe_load(path.read_text("utf-8")) or {}
    return {
        e["monster_slug"]
        for e in data.get("evolutions") or []
        if e.get("monster_slug")
    }


def met_in_nagmon() -> set[str]:
    """Nagmon's monsters, the encounter tables, the starters and every
    team in Nagmon's map scripts, and what they all evolve into."""
    import yaml

    found = {p.stem for p in (MODS / "nagmon" / "db" / "monster").glob("*")}
    for table in (MODS / "nagmon" / "db" / "encounter").glob("*.yaml"):
        data = yaml.safe_load(table.read_text("utf-8")) or {}
        found |= {m["monster"] for m in data.get("monsters", [])}
    for script in (MODS / "nagmon" / "maps").glob("*.yaml"):
        text = script.read_text("utf-8")
        found |= set(re.findall(r"add_monster ([a-z_]+)", text))
        for names in re.findall(r"choice_monster ([a-z_:]+)", text):
            found |= set(names.split(":"))
    todo = list(found)
    while todo:
        for evolved in _evolutions(todo.pop()) - found:
            found.add(evolved)
            todo.append(evolved)
    return found


def _po_names(locale: str) -> dict[str, str]:
    text = (PO / locale / "LC_MESSAGES" / "nagmon.po").read_text("utf-8")
    return dict(re.findall(r'^msgid "([^"]+)"\nmsgstr "([^"]*)"', text, re.M))


def test_the_monsters_a_child_meets_are_found():
    met = met_in_nagmon()
    assert {"geometrion", "agnite", "rockitten", "kroki", "agnigon"} <= met
    assert all(_monster_file(slug) for slug in met), "a slug with no monster"
    assert len(met) >= 40


def test_every_monster_a_child_meets_has_a_hebrew_name():
    he, en = _po_names("he_IL"), _po_names("en_US")
    missing = sorted(
        m for m in met_in_nagmon() if not HEBREW.search(he.get(m, ""))
    )
    assert not missing, missing
    # the English name stays (the language ladder shows both)
    for slug in met_in_nagmon():
        assert en[slug] and not HEBREW.search(en[slug])


def test_hebrew_monster_names_are_short_and_gentle():
    he = _po_names("he_IL")
    names = [he[m] for m in met_in_nagmon()]
    assert len(set(names)) == len(names), "two monsters with one name"
    for name in names:
        assert len(name) <= 10, name
        assert not any(word in name for word in NOT_IN_A_NAME), name


# The descriptions a child reads (the monster's page, a long dialog) use
# the Hebrew names and gentle words too.

HARSH = ("טרף", "טורף", "רעיל", "ארס", "מלחמ", "תותח", "לארוב", "מתפוצצ")
HARSH += ("מוות", "קבר", "הרג", "קללה", "צלב", "בישופ")


def _po_text(path: Path, msgid: str) -> str:
    """A msgstr, also one split over several quoted lines."""
    found = re.search(
        r'^msgid "'
        + re.escape(msgid)
        + r'"\nmsgstr ((?:"(?:[^"\\]|\\.)*"\n?)+)',
        path.read_text("utf-8"),
        re.M,
    )
    if found is None:
        return ""
    parts = re.findall(r'"((?:[^"\\]|\\.)*)"', found.group(1))
    return "".join(parts)


def _hebrew_text(msgid: str) -> str:
    """What the game shows in Hebrew: nagmon.po first, then Tuxemon's."""
    return _po_text(PO / "he_IL" / "LC_MESSAGES" / "nagmon.po", msgid) or (
        _po_text(
            MODS / "tuxemon" / "l18n" / "he_IL" / "LC_MESSAGES" / "base.po",
            msgid,
        )
    )


def _english_names() -> list[str]:
    en = _po_names("en_US")
    return [en[slug] for slug in met_in_nagmon()]


def test_descriptions_a_child_reads_use_the_hebrew_names():
    names = re.compile(
        r"(?<![A-Za-z])(" + "|".join(_english_names()) + r")(?![A-Za-z])",
        re.I,
    )
    english = {}
    for slug in met_in_nagmon():
        text = _hebrew_text(f"{slug}_description")
        assert text, slug
        if names.search(text):
            english[slug] = names.search(text).group(0)
    assert not english, english


def test_descriptions_a_child_reads_are_gentle():
    harsh = {}
    for slug in met_in_nagmon():
        text = _hebrew_text(f"{slug}_description")
        words = [w for w in HARSH if w in text]
        if words:
            harsh[slug] = words
    assert not harsh, harsh
