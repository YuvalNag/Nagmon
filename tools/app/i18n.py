# SPDX-License-Identifier: GPL-3.0
"""Texts: the ``.po`` catalogues as flat ``{msgid: text}`` JSON.

The lookup order is the old game's (``tuxemon/locale/translator.py``
with Nagmon's ``nagmon`` domain as an extra domain): ``nagmon`` in the
locale, ``base`` in the locale, then the same two in ``en_US``. Fuzzy
and empty entries are skipped, as when the ``.mo`` files are compiled.

All of ``nagmon.po`` is shipped, except the names of Tuxemon's
creatures (no creature of Tuxemon is in the app). Of Tuxemon's 5.4k ``base`` msgids only
the ones the Nagmon world can show (docs/app/INVENTORY.md §5):

* every msgid the converted maps, NPCs and database refer to;
* the generic UI and battle strings, by prefix (:data:`UI_PREFIXES`);
* every msgid written as a literal in the engine screens the app ports
  (battle, items, evolution, monster info, journal: :data:`ENGINE_SOURCES`),
  e.g. ``attempting_capture``, ``gotcha``, ``evolution_confirmation``;
* the gym masters' lines.

Plural entries (there are none today) would be written as
``msgid`` (first form) and ``msgid#<n>`` for the other forms.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from babel.messages.pofile import read_po

from tools.app.common import NAG, REPO, TUX, Output

LOCALES = {"he": "he_IL", "en": "en_US"}
UI_PREFIXES = (
    "combat_",
    "menu_",
    "tuxeball_",
    "unit_",
    "level_",
    "currency_symbol",
    "monster_",
    "technique_",
    "status_",
    "stat_",
    "taste_",
    "terrain_",
    "weather_",
    "month_",
    "relation_",
    "tuxepedia_",
    "app_",
    "gender_",
)
#: Engine code whose literal msgids the ported screens show.
ENGINE_SOURCES = (
    *(
        f"tuxemon/states/{name}.py"
        for name in (
            "combat_state",
            "combat_menus",
            "combat_animations",
            "item_menu",
            "technique_menu",
            "evolution",
            "transition_evolution",
            "monster_info",
            "monster_menu",
            "monster_moves",
            "level_up",
            "journal_info",
            "journal_state",
            "journal_choice",
            "choice_monster",
            "choice_item",
            "party",
        )
    ),
    "tuxemon/combat/*.py",
    "tuxemon/ui/text_formatter.py",
)
_LITERAL = re.compile(r"[\"']([a-z][a-z0-9_]*)[\"']")
EXTRA_IDS = tuple(
    f"classic_gym_leader_{who}{part}"
    for who in ("granite", "mila")
    for part in ("", "_pre", "_post")
)


def load_po(path: Path) -> dict[str, str]:
    """``{msgid: text}`` of the translated, non-fuzzy entries."""
    with path.open(encoding="utf-8") as fp:
        catalog = read_po(fp)
    texts: dict[str, str] = {}
    for message in catalog:
        if not message.id or message.fuzzy:
            continue
        if isinstance(message.id, (tuple, list)):
            forms = list(message.string or ())
            if not any(forms):
                continue
            key = str(message.id[0])
            texts[key] = forms[0]
            for n, form in enumerate(forms[1:], start=1):
                texts[f"{key}#{n}"] = form
        elif message.string:
            texts[str(message.id)] = str(message.string)
    return texts


def catalogs() -> dict[str, dict[str, dict[str, str]]]:
    """``{domain: {lang: {msgid: text}}}``."""
    out: dict[str, dict[str, dict[str, str]]] = {"nagmon": {}, "base": {}}
    for lang, locale in LOCALES.items():
        out["nagmon"][lang] = load_po(
            NAG / "l18n" / locale / "LC_MESSAGES" / "nagmon.po"
        )
        out["base"][lang] = load_po(
            TUX / "l18n" / locale / "LC_MESSAGES" / "base.po"
        )
    return out


def lookup(
    cats: dict[str, dict[str, dict[str, str]]], lang: str, msgid: str
) -> str | None:
    chain = [("nagmon", lang), ("base", lang)]
    if lang != "en":
        chain += [("nagmon", "en"), ("base", "en")]
    for domain, chain_lang in chain:
        text = cats[domain][chain_lang].get(msgid)
        if text:
            return text
    return None


def known_ids(cats: dict[str, dict[str, dict[str, str]]]) -> set[str]:
    return {k for dom in cats.values() for t in dom.values() for k in t}


def engine_ids(known: set[str]) -> set[str]:
    """String literals of :data:`ENGINE_SOURCES` that are msgids."""
    found: set[str] = set()
    for pattern in ENGINE_SOURCES:
        for path in sorted(REPO.glob(pattern)):
            found |= set(_LITERAL.findall(path.read_text(encoding="utf-8")))
    return found & known


def tuxemon_creature_ids() -> set[str]:
    """
    The msgids of Tuxemon's creatures (name, description, category) that
    no creature of the app uses. ``nagmon.po`` still holds their Hebrew
    names for the old game; the app does not ship them.
    """
    from tools.app.content import read_yaml

    def species(folder: Path) -> dict[str, str | None]:
        return {
            p.stem: (read_yaml(p) or {}).get("species")
            for p in sorted(folder.glob("*.yaml"))
        }

    ours = species(NAG / "db" / "monster")
    ours_species = {v for v in ours.values() if v}
    ids: set[str] = set()
    for slug, kind in species(TUX / "db" / "monster").items():
        if slug in ours:
            continue
        ids |= {slug, f"{slug}_description"}
        if kind and kind not in ours_species:
            ids.add(f"cat_{kind}")
    return ids


def build(out: Output, used: Iterable[str]) -> dict[str, Any]:
    cats = catalogs()
    base_ids = set(cats["base"]["en"]) | set(cats["base"]["he"])
    nagmon_ids = set(cats["nagmon"]["en"]) | set(cats["nagmon"]["he"])
    nagmon_ids -= tuxemon_creature_ids()
    used = set(used)
    wanted = set(nagmon_ids)
    wanted |= {
        k for k in base_ids if k.startswith(UI_PREFIXES) or k in EXTRA_IDS
    }
    wanted |= used & (base_ids | nagmon_ids)
    engine = engine_ids(base_ids)
    wanted |= engine
    missing = sorted(used - (base_ids | nagmon_ids))
    stats: dict[str, Any] = {"missing": missing, "engine": len(engine)}
    for lang in LOCALES:
        texts = {}
        for msgid in sorted(wanted):
            text = lookup(cats, lang, msgid)
            if text is not None:
                texts[msgid] = text
        out.add_json(f"i18n/{lang}.json", texts)
        stats[lang] = len(texts)
    stats["from_base"] = len(wanted - nagmon_ids)
    stats["from_nagmon"] = len(nagmon_ids)
    return stats
