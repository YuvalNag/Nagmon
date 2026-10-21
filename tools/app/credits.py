# SPDX-License-Identifier: GPL-3.0
"""credits.json: every shipped asset with all its authors and licences.

The authors and licences are taken from ``ATTRIBUTIONS.md`` (split into
its bullet entries, by section) and matched to each shipped file by
kind and name. Every author and every licence an entry names is kept
(an entry often credits a work and the works it is based on), and the
entries keep their full text for the credits screen. A file the build
cannot match keeps a ``matched: false`` flag, so a person can finish
the job by hand instead of the screen guessing.

Adapted art says so in its main licence: the xBRZ x4 atlases are
"CC BY-SA 4.0, adapted (xBRZ x4)", and every picture the build enlarges
itself (``tools/app/hd.py``) says so in its ``adapted`` field ("xBRZ
xN") and a note; a real licence also gets ", adapted (xBRZ xN)" (not
"unknown..." or "not stated...", which name no licence to adapt).

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
_BY = re.compile(
    r"(?<!CC )(?<!CC-)\b[Bb]y\s+(.+?)(?=\s+(?:is|are)\s+licensed|\s+licensed|,\s*licensed"
    r"|\s+[\[(]|\s+has been|\s+have been|\s+based on|,\s*from\b|\s+is\b|$)"
)


def adapted(licence: str, how: str) -> str:
    """A licence with the adaptation it went through: "..., adapted (...)"."""
    return f"{licence}, adapted ({how})"


def is_real_licence(licence: str) -> bool:
    """A licence that names one, not "unknown..." or "not stated..."."""
    return bool(licence) and not licence.startswith(("unknown", "not stated"))


#: How the HD tilesets were made (tools/art/upscale_tiles.py).
TILES_XBRZ = "xBRZ x4"
ADAPTED_XBRZ = adapted("CC BY-SA 4.0", TILES_XBRZ)
ADAPTED_MODEST = "CC BY-SA 4.0, adapted (modest version)"
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
        """The licence of the entry itself: the last one it names."""
        found = self.licences
        return found[-1] if found else "not stated in ATTRIBUTIONS.md"

    @property
    def authors(self) -> list[str]:
        """Everyone the entry names after a "by"."""
        found = []
        for match in _BY.finditer(self.plain):
            author = match.group(1).strip(" .,")
            while author.endswith(")") and author.count(")") > author.count(
                "("
            ):
                author = author[:-1].strip(" .,")
            if author:
                found.append(author)
        if not found:
            found = self._sources()
        return list(dict.fromkeys(found))

    def _sources(self) -> list[str]:
        """For an entry with no "by": the pack or page it comes from."""
        no_urls = re.sub(r"https?://\S+\s*", "", self.plain)
        match = re.search(
            r"\bfrom (?:the )?\[?([^\].(\[]+)", no_urls, re.IGNORECASE
        )
        if match and match.group(1).strip():
            return [match.group(1).strip()]
        urls = re.findall(r"https?://[^\s\])]+", self.text)
        urls = [u for u in urls if "wiki.tuxemon.org" not in u] or urls
        return [f"source: {urls[0]}"] if urls else []

    @property
    def file_names(self) -> list[str]:
        """Quoted and bracketed names: "Foom_0.wav", [Growl1.wav]..."""
        names = re.findall(r'"([^"]+)"', self.plain)
        names += re.findall(r"\[([^\]]+)\]", self.text)
        return [n.strip('"') for n in names]

    def as_json(self) -> dict[str, Any]:
        return {
            "section": self.section,
            "title": self.title,
            "authors": self.authors,
            "licence": self.licence,
            "licences": self.licences,
            "text": self.plain,
            "markdown": self.text,
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
            quoted = re.match(r'\[?"([^"]+)"', body)
            title_match = _TITLE.search(body)
            if quoted:
                title = quoted.group(1)
            elif title_match:
                title = title_match.group(1)
            else:
                title = body[:60]
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
        """An entry that names this file (quoted or in brackets)."""
        key = _key(re.sub(r"^reverse_", "", stem))
        wanted = {key, re.sub(r"\d+$", "", key)}
        for entry in self.in_sections(sections):
            for quoted in entry.file_names:
                name = _key(
                    re.sub(
                        r"\s+sound$",
                        "",
                        PurePosixPath(quoted).stem,
                        flags=re.I,
                    )
                )
                if not name:
                    continue
                if name in wanted or (len(name) >= 5 and key.endswith(name)):
                    return entry
        return None

    def by_name_prefix(
        self, stem: str, sections: tuple[str, ...]
    ) -> Entry | None:
        """
        An entry titled like the file, or like the file without its last
        words (``lightning_claw_large`` -> "Lightning Claw", ``drip_blue``
        -> "Drip Animations").
        """
        words = stem.split("_")
        pool = self.in_sections(sections)
        for n in range(len(words), 0, -1):
            key = _key("".join(words[:n]))
            for entry in pool:
                title = _key(entry.title)
                if key in (
                    title,
                    title.removesuffix("animations"),
                    title.removesuffix("animation"),
                ):
                    return entry
        return None

    def exact(self, title: str, sections: tuple[str, ...]) -> Entry:
        for entry in self.in_sections(sections):
            if entry.title == title:
                return entry
        raise KeyError(f"ATTRIBUTIONS.md has no entry {title!r}")

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


def _info(
    entries: list[Entry],
    *,
    note: str = "",
    licence: str | None = None,
) -> dict[str, Any]:
    """The credit of an asset made from ``entries`` (all kept)."""
    authors = list(dict.fromkeys(a for e in entries for a in e.authors))
    licences = list(dict.fromkeys(x for e in entries for x in e.licences))
    if not licences:
        licences = [e.licence for e in entries]
    main = licence or "; ".join(dict.fromkeys(e.licence for e in entries))
    return {
        "credits": [e.id for e in entries],
        "authors": authors,
        "author": "; ".join(authors) or "; ".join(e.title for e in entries),
        "licences": licences,
        "licence": main,
        "note": note,
        "matched": bool(entries),
    }


def _unmatched(group: str, note: str = "") -> dict[str, Any]:
    return {
        "credits": [],
        "authors": [],
        "author": "Tuxemon contributors",
        "licences": [group],
        "licence": group,
        "note": note,
        "matched": False,
    }


ANIMATION_SECTIONS = ("Technique Animations", "Item Animations", "Tilesets")
UNLISTED = "unknown: not listed in ATTRIBUTIONS.md"


def credit_for(asset: Asset, m: Matcher) -> dict[str, Any]:
    """Credits, authors, licences, note and ``matched`` for one asset."""
    src = asset.sources[0] if asset.sources else ""
    name = PurePosixPath(src).name
    stem = PurePosixPath(src).stem
    if asset.kind == "licence":
        return {
            "credits": [],
            "authors": [],
            "author": "",
            "licences": [],
            "licence": "",
            "note": "Licence text shipped with the app.",
            "matched": True,
        }
    if asset.kind == "sound" and src.startswith(OWN_SOUNDS):
        return {
            "credits": [],
            "authors": [OWN_SOUND["author"]],
            "author": OWN_SOUND["author"],
            "licences": [OWN_SOUND["licence"]],
            "licence": OWN_SOUND["licence"],
            "note": OWN_SOUND["note"],
            "matched": True,
        }
    if _is_owner_art(src):
        return {
            "credits": [],
            "authors": [OWNER["author"]],
            "author": OWNER["author"],
            "licences": [OWNER["licence"]],
            "licence": OWNER["licence"],
            "note": OWNER["note"],
            "matched": True,
        }
    entry: Entry | None = None
    group = f"{UNLISTED} (Tuxemon art is mostly CC BY-SA 4.0)"
    note = asset.note
    if asset.kind == "tileset":
        cores = sorted({CORES[PurePosixPath(s).stem] for s in asset.sources})
        found = [m.exact(c, ("CORES",)) for c in cores]
        text = "HD (xBRZ x4) upscale of the Tuxemon core tilesets."
        return _info(
            found,
            note=" ".join(filter(None, [text, note])),
            licence=ADAPTED_XBRZ,
        )
    if asset.kind == "map":
        return _unmatched(
            f"{UNLISTED}, Maps",
            "Tuxemon classic map converted to Tiled JSON, with Nagmon's "
            "events. ATTRIBUTIONS.md does not list the classic maps.",
        )
    if asset.kind == "monster":
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
                "(docs/kids/SDD_MODESTY.md)."
            )
            return _info(
                [entry] if entry else [], note=note, licence=ADAPTED_MODEST
            )
    elif asset.kind == "item":
        entry = m.by_title(stem, ("Items",))
    elif asset.kind == "animation":
        entry = m.by_name_prefix(stem, ANIMATION_SECTIONS) or m.by_title(
            re.sub(r"_\d+$", "", stem), ANIMATION_SECTIONS
        )
    elif asset.kind == "ui":
        entry = m.by_text(
            name, ("Battle Backgrounds", "Type Icons")
        ) or m.by_title(stem, ("Battle Backgrounds", "Type Icons", "Bubbles"))
    elif asset.kind == "music":
        group = f"{UNLISTED}, Music"
        if name.startswith("JRPG_"):
            entry = m.first("JRPG Collection", ("Music",))
    elif asset.kind == "sound":
        group = f"{UNLISTED}, Sounds"
        entry = m.by_file_name(stem, ("Sounds",))
    elif asset.kind == "emoji":
        entry = m.first("Twemoji", ("Emoji (Nagmon)",))
    if entry is None:
        return _unmatched(group, note)
    return _info([entry], note=note)


#: The battle's sounds: synthesized by tools/sfx_battle.py, our own.
OWN_SOUNDS = "mods/nagmon/sounds/battle/"
OWN_SOUND = {
    "author": "Nagmon (own work: sine waves synthesized by "
    "tools/sfx_battle.py, no samples)",
    "licence": "GPL-3.0",
    "note": "Made by the project's own script; nothing from another game "
    "or a sound library.",
}


def _is_owner_art(src: str) -> bool:
    p = PurePosixPath(src)
    if src.startswith("app/public/game/art/"):
        return True
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
        if asset.note and asset.note not in info["note"]:
            info["note"] = " ".join(filter(None, [info["note"], asset.note]))
        info["adapted"] = asset.adapted or (
            TILES_XBRZ if asset.kind == "tileset" else ""
        )
        if asset.adapted:
            if is_real_licence(info["licence"]):
                info["licence"] = adapted(info["licence"], asset.adapted)
            text = (
                f"HD ({asset.adapted}) upscale of the original picture, "
                "made by the app build (tools/app/hd.py)."
            )
            info["note"] = " ".join(filter(None, [text, info["note"]]))
        used_entries |= set(info["credits"])
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
            "authors": [
                "Hubert and Fischer",
                "Meir Sadan",
                "Cyreal (the Rubik Project Authors)",
            ],
            "licence": "SIL OFL 1.1",
            "licences": ["SIL OFL 1.1"],
            "text": "Rubik variable font (300-900), shipped through "
            "@fontsource-variable/rubik. Licence: licenses/Rubik-OFL.txt.",
            "markdown": "Rubik variable font (300-900), shipped through "
            "@fontsource-variable/rubik. Licence: licenses/Rubik-OFL.txt.",
        },
    }
    doc = {
        "schema_version": 2,
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
        "owner_art": sum(1 for a in assets if a["author"] == OWNER["author"]),
    }


def _count_kinds(assets: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for a in assets:
        if not a["matched"]:
            counts[a["kind"]] = counts.get(a["kind"], 0) + 1
    return dict(sorted(counts.items()))
