# SPDX-License-Identifier: GPL-3.0
"""credits.json: every shipped asset with its author and licence.

The authors and licences are taken from ``ATTRIBUTIONS.md`` (split into
its bullet entries, by section) and matched to each shipped file by
kind and name. A file the build cannot match to an entry keeps a
``matched: false`` flag with the licence of its whole group, so a
person can finish the job by hand instead of the screen guessing.

The licence texts the app must carry are copied under ``licenses/``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any

from tools.app.common import NAG, REPO, TUX, Asset, Output

ATTRIBUTIONS = REPO / "ATTRIBUTIONS.md"
LICENSE_FILES = {
    "licenses/GPL-3.0.txt": REPO / "LICENSE",
    "licenses/ATTRIBUTIONS.md": ATTRIBUTIONS,
    "licenses/Rubik-OFL.txt": TUX / "font" / "Rubik-OFL.txt",
    "licenses/Twemoji-LICENSE.md": NAG / "gfx" / "emoji" / "LICENSE.md",
    "licenses/KelvinShadewing-soundpack-readme.txt": TUX
    / "sounds"
    / "readme.txt",
}
_LICENCE = re.compile(
    r"(CC[- ]?BY[- ]?SA[- ]?\d\.\d|CC[- ]?BY[- ]?\d\.\d|CC[- ]BY(?![- ]?S)"
    r"|CC[- ]?0(?: 1\.0)?|CC0|Public Domain|SIL Open Font License, 1\.1"
    r"|XYG Open Source License v1\.1|Bitstream Vera License)",
    re.IGNORECASE,
)
_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
_TITLE = re.compile(r"\[\"?([^\]\"]+)\"?\]")
OWNER = {
    "author": "the Nagmon owner (made with image generators)",
    "licence": "not stated yet",
    "note": "Owner art: the owner has to choose a licence "
    "(docs/app/INVENTORY.md §6.1).",
}


@dataclass
class Entry:
    id: str
    section: str
    title: str
    text: str

    @property
    def plain(self) -> str:
        return re.sub(r"\s+", " ", _LINK.sub(r"\1", self.text)).strip()

    @property
    def licences(self) -> list[str]:
        found = [_norm_licence(m) for m in _LICENCE.findall(self.plain)]
        return list(dict.fromkeys(found))

    @property
    def licence(self) -> str:
        found = self.licences
        return found[-1] if found else "not stated in ATTRIBUTIONS.md"

    @property
    def authors(self) -> str:
        match = re.search(
            r"\bby\s+(.+?)(?:\s+(?:is|are|has been|have been|licensed)\b|,"
            r" licensed|$)",
            self.plain,
            re.IGNORECASE,
        )
        if not match:
            return ""
        authors = match.group(1).strip(" .,")
        while authors.endswith(")") and authors.count(")") > authors.count(
            "("
        ):
            authors = authors[:-1].strip(" .,")
        return authors

    def as_json(self) -> dict[str, Any]:
        return {
            "section": self.section,
            "title": self.title,
            "authors": self.authors,
            "licence": self.licence,
            "licences": self.licences,
            "text": self.plain,
        }


def _norm_licence(text: str) -> str:
    t = text.upper().replace("-", " ").replace("  ", " ")
    if "PUBLIC DOMAIN" in t or t.startswith("CC0") or t.startswith("CC 0"):
        return "CC0 / public domain"
    if "OPEN FONT" in t:
        return "SIL OFL 1.1"
    if "XYG" in t:
        return "XYG Open Source License v1.1"
    if "BITSTREAM" in t:
        return "Bitstream Vera License"
    t = re.sub(r"CC ?BY ?SA ?", "CC BY-SA ", t)
    t = re.sub(r"CC ?BY ?(?=\d)", "CC BY ", t)
    return t.strip()


def parse_attributions(text: str) -> list[Entry]:
    entries: list[Entry] = []
    section = ""
    current: list[str] | None = None
    current_section = ""
    lines = text.splitlines()

    def close() -> None:
        nonlocal current
        if current:
            body = "\n".join(current).strip()
            title_match = _TITLE.search(body)
            title = title_match.group(1) if title_match else body[:60]
            entries.append(
                Entry(
                    _slug(f"{current_section}-{title}"),
                    current_section,
                    title,
                    body,
                )
            )
        current = None

    for i, line in enumerate(lines):
        underline = i + 1 < len(lines) and re.fullmatch(
            r"[-=]{3,}", lines[i + 1]
        )
        if line.startswith("#") or (underline and line.strip()):
            close()
            section = line.lstrip("#").strip()
            continue
        if re.fullmatch(r"[-=]{3,}", line):
            continue
        if line.startswith("* "):
            close()
            current = [line[2:]]
            current_section = section
        elif current is not None:
            current.append(line)
    close()
    # Ids must be unique: number repeated titles.
    seen: dict[str, int] = {}
    for entry in entries:
        n = seen.get(entry.id, 0)
        seen[entry.id] = n + 1
        if n:
            entry.id = f"{entry.id}-{n + 1}"
    return entries


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _key(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


class Matcher:
    def __init__(self, entries: list[Entry]) -> None:
        self.entries = entries

    def in_sections(self, sections: tuple[str, ...]) -> list[Entry]:
        return [e for e in self.entries if e.section in sections]

    def by_title(self, name: str, sections: tuple[str, ...]) -> Entry | None:
        """An entry whose title is ``name`` (or contains it as a word)."""
        key = _key(name)
        if not key:
            return None
        pool = self.in_sections(sections)
        for entry in pool:
            if _key(entry.title) == key:
                return entry
        for suffix in (
            "sprite",
            "sprites",
            "item",
            "overworldsprites",
            "sheet",
        ):
            for entry in pool:
                if _key(entry.title) == key + suffix:
                    return entry
        for entry in pool:
            words = {_key(w) for w in re.split(r"[\s&/,]+", entry.title)}
            if key in words:
                return entry
        return None

    def by_text(self, needle: str, sections: tuple[str, ...]) -> Entry | None:
        key = needle.lower()
        for entry in self.in_sections(sections):
            if key in entry.plain.lower():
                return entry
        return None

    def by_file_name(
        self, stem: str, sections: tuple[str, ...]
    ) -> Entry | None:
        """An entry that names this file (quoted, any separators)."""
        key = _key(re.sub(r"^reverse_", "", stem))
        for entry in self.in_sections(sections):
            for quoted in re.findall(r'"([^"]+)"', entry.plain):
                name = _key(PurePosixPath(quoted).stem)
                if len(name) >= 5 and (name == key or key.endswith(name)):
                    return entry
        return None

    def first(self, title_part: str, sections: tuple[str, ...]) -> Entry:
        for entry in self.in_sections(sections):
            if title_part.lower() in entry.title.lower():
                return entry
        raise KeyError(f"ATTRIBUTIONS.md has no entry like {title_part!r}")


SPRITE_SECTIONS = (
    "Character Sprites",
    "Character Front Sprites",
    "Pair Character Front Sprites",
    "Tuxemon",
)
CORES = {
    "core_indoor_walls": "Core Indoor Walls",
    "core_indoor_floors": "Core Indoor Walls",
    "core_indoor_stairs": "Core Indoor Stairs",
    "core_outdoor_nature": "Core Outdoor Nature",
    "core_outdoor_water": "Core Outdoor Nature",
    "core_city_and_country": "Core City and Country",
    "core_buildings": "Core Buildings",
    "core_set pieces": "Core Set Pieces",
    "core_outdoor": "Core Outdoor",
}


def credit_for(asset: Asset, m: Matcher) -> dict[str, Any]:
    """``{credit, author, licence, note, matched}`` for one asset."""
    src = asset.sources[0] if asset.sources else ""
    name = PurePosixPath(src).name
    stem = PurePosixPath(src).stem
    owner = _is_owner_art(src)
    if owner:
        return {"credit": None, **OWNER, "matched": True}
    entry: Entry | None = None
    note = asset.note
    group = (
        "unknown: not listed in ATTRIBUTIONS.md "
        "(Tuxemon art is mostly CC BY-SA 4.0)"
    )
    if asset.kind == "tileset":
        cores = sorted(
            {CORES.get(PurePosixPath(s).stem, "") for s in asset.sources}
        )
        found = [m.first(c, ("CORES",)) for c in cores if c]
        note = (
            "HD (xBRZ x4) upscale of the Tuxemon core tilesets; same credit."
        )
        out = _from_entries(found, note)
        return out
    if asset.kind == "map":
        entry = None
        group = "CC BY 4.0 (ATTRIBUTIONS.md, Maps)"
        note = "Tuxemon classic map converted to Tiled JSON, with Nagmon's events."
    elif asset.kind == "monster":
        entry = m.by_title(stem.removesuffix("-sheet"), ("Tuxemon",))
    elif asset.kind in ("npc", "portrait"):
        base = stem.split("_")[0]
        entry = m.by_title(stem, SPRITE_SECTIONS) or m.by_title(
            base, SPRITE_SECTIONS
        )
        if entry is None and src.startswith("mods/tuxemon/sprites_obj/"):
            entry = m.by_title(stem, ("Tilesets",))
        if src.startswith("mods/nagmon/gfx/sprites/player/"):
            note = (
                "Modest version made for Nagmon of the Tuxemon portrait "
                "(docs/kids/SDD_MODESTY.md); stays CC BY-SA 4.0."
            )
    elif asset.kind == "item":
        entry = m.by_title(stem, ("Items",))
    elif asset.kind == "animation":
        entry = m.by_title(
            re.sub(r"_\d+$", "", stem),
            ("Technique Animations", "Item Animations", "Tilesets"),
        )
    elif asset.kind == "ui":
        entry = m.by_text(
            name, ("Battle Backgrounds", "Type Icons")
        ) or m.by_title(stem, ("Battle Backgrounds", "Type Icons", "Bubbles"))
    elif asset.kind == "music":
        group = "unknown: not listed in ATTRIBUTIONS.md, Music"
        if name.startswith("JRPG_"):
            entry = m.first("JRPG Collection", ("Music",))
    elif asset.kind == "sound":
        group = "unknown: not listed in ATTRIBUTIONS.md, Sounds"
        entry = m.by_file_name(stem, ("Sounds",))
    elif asset.kind == "emoji":
        entry = m.first("Twemoji", ("Emoji (Nagmon)",))
    elif asset.kind == "licence":
        return {
            "credit": None,
            "author": "",
            "licence": "",
            "note": "Licence text shipped with the app.",
            "matched": True,
        }
    if entry is None:
        return {
            "credit": None,
            "author": "Tuxemon contributors",
            "licence": group,
            "note": note,
            "matched": False,
        }
    return {
        "credit": entry.id,
        "author": entry.authors,
        "licence": entry.licence,
        "note": note,
        "matched": True,
    }


def _from_entries(found: list[Entry], note: str) -> dict[str, Any]:
    return {
        "credit": [e.id for e in found],
        "author": "; ".join(
            dict.fromkeys(e.authors or e.title for e in found)
        ),
        "licence": "; ".join(dict.fromkeys(e.licence for e in found)),
        "note": note,
        "matched": bool(found),
    }


def _is_owner_art(src: str) -> bool:
    p = PurePosixPath(src)
    if not src.startswith("mods/nagmon/"):
        return False
    if p.name.startswith("nagmon_") or "/owl/" in src:
        return True
    return src.startswith("mods/nagmon/gfx/sprites/battle/")


def build(out: Output) -> dict[str, Any]:
    for dest, src in LICENSE_FILES.items():
        out.add_copy(dest, src, "licence")
    entries = parse_attributions(ATTRIBUTIONS.read_text(encoding="utf-8"))
    matcher = Matcher(entries)
    assets = []
    used_entries: set[str] = set()
    for path in sorted(out.assets):
        asset = out.assets[path]
        info = credit_for(asset, matcher)
        credit = info["credit"]
        if isinstance(credit, list):
            used_entries |= set(credit)
        elif credit:
            used_entries.add(credit)
        assets.append(
            {
                "path": path,
                "kind": asset.kind,
                "sources": asset.sources,
                **info,
            }
        )
    by_id = {e.id: e for e in entries}
    extra = {
        "rubik": {
            "section": "Fonts",
            "title": "Rubik",
            "authors": "Hubert and Fischer, Meir Sadan, Cyreal "
            "(the Rubik Project Authors)",
            "licence": "SIL OFL 1.1",
            "licences": ["SIL OFL 1.1"],
            "text": "Rubik variable font (300-900), shipped through "
            "@fontsource-variable/rubik. Licence: licenses/Rubik-OFL.txt.",
        },
    }
    doc = {
        "schema_version": 1,
        "code": {
            "licence": "GPL-3.0",
            "file": "licenses/GPL-3.0.txt",
            "note": "Tuxemon and the Nagmon fork; the app is a derivative "
            "work and stays GPL-3.0.",
        },
        "font": extra["rubik"],
        "entries": {
            **{i: by_id[i].as_json() for i in sorted(used_entries)},
        },
        "assets": assets,
    }
    out.add_json("credits.json", doc)
    unmatched = [a["path"] for a in assets if not a["matched"]]
    return {
        "assets": len(assets),
        "entries": len(used_entries),
        "unmatched": len(unmatched),
        "unmatched_by_kind": _count_kinds(assets),
        "owner_art": sum(
            1 for a in assets if a["licence"] == OWNER["licence"]
        ),
    }


def _count_kinds(assets: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for a in assets:
        if not a["matched"]:
            counts[a["kind"]] = counts.get(a["kind"], 0) + 1
    return dict(sorted(counts.items()))
