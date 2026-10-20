# SPDX-License-Identifier: GPL-3.0
"""
The solar-system animals: from the parent's art folders to the game.

    python tools/art/import_solar_monsters.py [--check]

Reads ``art_sources/solar/monsters/<slug>/`` (``monster.json``,
``front.png`` and ``back.png`` of 256 px, ``icon.png`` of 96 px), the
words and shapes in ``tools/art/solar_monsters.yaml`` and the trip table
``mods/nagmon/trips/solar.yaml`` (which zone each family lives in), and
writes, for every animal:

* ``mods/nagmon/db/monster/<slug>.yaml``;
* ``mods/nagmon/gfx/sprites/battle/<slug>-sheet.png``: the battle sheet
  (front, back and two menu icons) at four times the 128x88 layout;

and for the trip: one encounter table per zone
(``mods/nagmon/db/encounter/<map>.yaml``) and the animals' names,
descriptions and species in both ``nagmon.po`` files (between two
marker lines, so a re-run replaces them).

What the generator wrote in ``monster.json`` and this tool corrects: the
same template sentence for every animal, the shape "blob" for all, an
empty ``where`` and Hebrew names of two words glued together.
"""

from __future__ import annotations

import argparse
import json
import sys
from io import BytesIO
from pathlib import Path
from typing import Any

import yaml
from PIL import Image

REPO = Path(__file__).resolve().parents[2]

if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))
from tools.app import solar_layouts  # noqa: E402

INBOX = REPO / "art_sources" / "solar" / "monsters"
TEXTS = Path(__file__).with_name("solar_monsters.yaml")
TRIP = REPO / "mods" / "nagmon" / "trips" / "solar.yaml"
MONSTERS = REPO / "mods" / "nagmon" / "db" / "monster"
ENCOUNTERS = REPO / "mods" / "nagmon" / "db" / "encounter"
SHEETS = REPO / "mods" / "nagmon" / "gfx" / "sprites" / "battle"
PO = REPO / "mods" / "nagmon" / "l18n"

#: The sheet layout is 128x88 at 1x; the art is 256 px for a 64 px cell.
K = 4
SHEET = (128 * K, 88 * K)
MAX_TEXT = 120
#: Sentences of the generator that every animal got.
TEMPLATES = (
    "יצור קוסמי מקורי",
    "An original cosmic creature",
    "learning science through",
)
SHAPES = {
    "blob",
    "humanoid",
    "flier",
    "sprite",
    "hunter",
    "brute",
    "varmint",
    "serpent",
    "dragon",
    "grub",
    "polliwog",
    "landrace",
    "piscine",
    "leviathan",
}
FIRST_ID = 500
BEGIN = "# --- solar-system animals (tools/art/import_solar_monsters.py) ---"
END = "# --- end of the solar-system animals ---"

#: What an animal knows, by stage (cosmic techniques of Tuxemon).
MOVES = {
    "basic": [(1, "ram"), (1, "starfall"), (4, "crystal"), (10, "orbs")],
    "stage1": [
        (1, "ram"),
        (1, "starfall"),
        (4, "crystal"),
        (10, "orbs"),
        (16, "rift_dash"),
        (24, "ruby"),
    ],
    "stage2": [
        (1, "starfall"),
        (1, "crystal"),
        (10, "orbs"),
        (16, "rift_dash"),
        (24, "ruby"),
        (30, "shapechange"),
        (36, "time_crisis"),
        (42, "divinity_beam"),
    ],
}
BODY = {  # height cm, weight kg
    "basic": (40, 6),
    "stage1": (90, 25),
    "stage2": (150, 70),
}
SOUNDS = {
    "basic": "sound_whistle",
    "stage1": "sound_weird_09",
    "stage2": "sound_creature_roar",
}


def load_trip(path: Path = TRIP) -> dict[str, Any]:
    return yaml.safe_load(path.read_text("utf-8"))


def zone_of_each(trip: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Every animal of the table: its zone (the zone of its base form)."""
    zones: dict[str, dict[str, Any]] = {}
    for zone in trip["zones"]:
        for base, evolved in zone["families"].items():
            for slug in [base, *evolved]:
                if slug in zones:
                    raise ValueError(f"{slug} is in two zones")
                zones[slug] = zone
    return zones


def load_records(
    inbox: Path = INBOX,
    texts_path: Path = TEXTS,
    trip: dict[str, Any] | None = None,
) -> dict[str, dict[str, Any]]:
    """The corrected record of every animal, in the order of the trip."""
    trip = trip or load_trip()
    texts = yaml.safe_load(texts_path.read_text("utf-8"))
    zones = zone_of_each(trip)
    raw = {
        p.parent.name: json.loads(p.read_text("utf-8"))
        for p in sorted(inbox.glob("*/monster.json"))
    }
    if set(raw) != set(zones) or set(texts) != set(zones):
        raise ValueError(
            "art folders, texts and trip table name different animals: "
            f"{sorted(set(raw) ^ set(zones))} {sorted(set(texts) ^ set(zones))}"
        )
    records: dict[str, dict[str, Any]] = {}
    for slug in zones:
        rec = dict(raw[slug])
        word = texts[slug]
        zone = zones[slug]
        rec["name_he"] = word["name_he"]
        rec["description_he"] = word["he"]
        rec["description_en"] = word["en"]
        rec["shape"] = word["shape"]
        rec["zone"] = zone["id"]
        low, high = zone["wild_levels"]
        base = not rec["evolves_from"]
        rec["where"] = [
            {
                "map": zone["map"],
                "levels": [low, high] if base else _evolved_levels(raw, slug),
                "rarity": "common",
                "time": "any",
                "wild": base,
            }
        ]
        records[slug] = rec
    return records


def _evolved_levels(raw: dict[str, Any], slug: str) -> list[int]:
    """An evolved form is met from the level it evolves at."""
    at = raw[raw[slug]["evolves_from"]]["evolves_into"]["at_level"]
    return [at, at + 4]


def check(rec: dict[str, Any]) -> list[str]:
    """What is wrong with one record (empty: nothing)."""
    problems = []
    for key in ("description_he", "description_en"):
        if not rec[key].strip() or len(rec[key]) > MAX_TEXT:
            problems.append(f"{key} is empty or over {MAX_TEXT}")
        if any(t in rec[key] for t in TEMPLATES):
            problems.append(f"{key} is the generator's template")
    if rec["shape"] not in SHAPES:
        problems.append(f"shape {rec['shape']}")
    if not rec["where"]:
        problems.append("no where")
    return problems


# ------------------------------------------------------------- outputs
def png_bytes(image: Image.Image) -> bytes:
    buf = BytesIO()
    image.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def sheet(slug: str, inbox: Path = INBOX) -> Image.Image:
    """Front, back and the icon twice, on Tuxemon's monster layout x4."""
    out = Image.new("RGBA", SHEET, (0, 0, 0, 0))
    folder = inbox / slug
    front = Image.open(folder / "front.png").convert("RGBA")
    back = Image.open(folder / "back.png").convert("RGBA")
    icon = Image.open(folder / "icon.png").convert("RGBA")
    out.paste(front, (0, 0))
    out.paste(back, (64 * K, 0))
    out.paste(icon, (0, 64 * K))
    out.paste(icon, (24 * K, 64 * K))
    return out


def monster_yaml(rec: dict[str, Any], txmn_id: int, species: str) -> str:
    slug, stage = rec["slug"], rec["stage"]
    height, weight = BODY[stage]
    moveset: list[dict[str, Any]] = [
        {
            "level_learned": 1,
            "technique": "struggle",
            "learning_method": "fallback",
        }
    ]
    moveset += [
        {"level_learned": lv, "technique": t} for lv, t in MOVES[stage]
    ]
    into = rec["evolves_into"]
    data = {
        "slug": slug,
        "species": species,
        "moveset": moveset,
        "evolutions": (
            [{"at_level": into["at_level"], "monster_slug": into["slug"]}]
            if into
            else []
        ),
        "terrains": ["extraterrestrial"],
        "tags": ["love"],
        "shape": rec["shape"],
        "stage": stage,
        "types": rec["types"],
        "gender_weights": {"male": 0.5, "female": 0.5},
        "txmn_id": txmn_id,
        "height": height,
        "weight": weight,
        "sounds": {
            "combat_call": {"sfx": SOUNDS[stage], "volume": 1.5},
            "faint_call": {"sfx": SOUNDS[stage] + "_faint", "volume": 1.5},
        },
        "catch_rate": 100.0 if stage == "basic" else 70.0,
        "lower_catch_resistance": 0.95 if stage == "basic" else 0.9,
        "upper_catch_resistance": 1.25 if stage == "basic" else 1.15,
    }
    return (
        f"# {rec['name_en']}: solar-system animal, zone {rec['zone']} "
        "(tools/art/import_solar_monsters.py; do not edit by hand).\n"
        + yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    )


def with_history(
    text: str, rec: dict[str, Any], records: dict[str, dict[str, Any]]
) -> str:
    """The yaml with its ``history`` (the whole family), after moveset."""
    chain = [rec["slug"]]
    while records[chain[0]]["evolves_from"]:
        chain.insert(0, records[chain[0]]["evolves_from"])
    while records[chain[-1]]["evolves_into"]:
        chain.append(records[chain[-1]]["evolves_into"]["slug"])
    history = []
    for i, slug in enumerate(chain):
        history.append(
            {
                "slug": slug,
                "stage": records[slug]["stage"],
                "evolves_from": chain[i - 1 : i] if i else [],
                "evolves_into": chain[i + 1 : i + 2],
            }
        )
    block = yaml.safe_dump({"history": history}, sort_keys=False)
    return text.replace("terrains:", block + "terrains:", 1)


def encounter_yaml(zone: dict[str, Any]) -> str:
    low, high = zone["wild_levels"]
    rows = [
        {
            "encounter_rate": 3,
            "exp_req_mod": 3,
            "held_items": [],
            "level_range": [low, high],
            "variables": [],
            "monster": base,
        }
        for base in zone["families"]
    ]
    head = (
        f"# Wild animals of the zone {zone['id']} of the solar-system trip "
        "(mods/nagmon/trips/solar.yaml): its base forms.\n"
    )
    data = {"monsters": rows, "slug": zone["encounter"]}
    return head + yaml.safe_dump(data, sort_keys=False)


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')


def po_block(
    records: dict[str, dict[str, Any]], trip: dict[str, Any], locale: str
) -> str:
    he = locale == "he_IL"
    lines = [BEGIN, ""]

    def entry(msgid: str, text: str) -> None:
        lines.extend([f'msgid "{msgid}"', f'msgstr "{_escape(text)}"', ""])

    for rec in records.values():
        entry(rec["slug"], rec["name_he"] if he else rec["name_en"])
        entry(
            f"{rec['slug']}_description",
            rec["description_he"] if he else rec["description_en"],
        )
    for slug, (he_name, en_name) in solar_layouts.NPC_NAMES.items():
        entry(slug, he_name if he else en_name)
    for (zone, npc), (he_text, en_text) in solar_layouts.DIALOGS.items():
        entry(solar_layouts.dialog_id(zone, npc), he_text if he else en_text)
    for zone in trip["zones"]:
        entry(
            f"cat_{zone['species']}",
            zone["species_he"] if he else zone["species_en"],
        )
    lines.append(END)
    return "\n".join(lines) + "\n"


def with_block(po_text: str, block: str) -> str:
    """``po_text`` with ``block`` at its end, replacing an older block."""
    if BEGIN in po_text:
        head, rest = po_text.split(BEGIN, 1)
        tail = rest.split(END, 1)[1]
        po_text = head.rstrip("\n") + "\n" + tail
    return po_text.rstrip("\n") + "\n\n" + block


def build() -> dict[Path, bytes]:
    """Every file the importer owns: path -> bytes."""
    trip = load_trip()
    records = load_records(trip=trip)
    for slug, rec in records.items():
        found = check(rec)
        if found:
            raise ValueError(f"{slug}: {found}")
    zones = zone_of_each(trip)
    files: dict[Path, bytes] = {}
    for i, (slug, rec) in enumerate(records.items()):
        text = monster_yaml(rec, FIRST_ID + i, zones[slug]["species"])
        files[MONSTERS / f"{slug}.yaml"] = with_history(
            text, rec, records
        ).encode("utf-8")
        files[SHEETS / f"{slug}-sheet.png"] = png_bytes(sheet(slug))
    for zone in trip["zones"]:
        files[ENCOUNTERS / f"{zone['encounter']}.yaml"] = encounter_yaml(
            zone
        ).encode("utf-8")
    for locale in ("he_IL", "en_US"):
        path = PO / locale / "LC_MESSAGES" / "nagmon.po"
        files[path] = with_block(
            path.read_text("utf-8"), po_block(records, trip, locale)
        ).encode("utf-8")
    return files


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    files = build()
    stale = [
        p for p, d in files.items() if not p.is_file() or p.read_bytes() != d
    ]
    if args.check:
        for path in stale:
            print("out of date:", path.relative_to(REPO))
        return 1 if stale else 0
    for path in stale:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(files[path])
    print(f"wrote {len(stale)} of {len(files)} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
