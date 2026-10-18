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
