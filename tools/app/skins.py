# SPDX-License-Identifier: GPL-3.0
"""
Owner art on the map: the people and props that have a picture of their own.

W1's people and W2's objects were drawn with borrowed or stand-in map
pictures (``docs/app/ART_NEEDED_W1.md``, ``ART_NEEDED_W2.md``). The art
registry (``art/manifest.json``, ``npc_sprites``) has pictures for some of
them. :func:`override` swaps the map picture of a record in
``db/npcs.json`` for the owner's, and only where the match is certain
(the registry id is the person's own id, or the role is the same and the
sheets are accepted). The stand-in stays for every other record.

A person's sheet is the registry's ``map_a`` (down, left) over ``map_b``
(right, up): the 3x4 layout the map already walks, with 256 px frames
drawn two tiles tall. A prop is one frame of a props sheet, trimmed and
drawn one tile wide.
"""

from __future__ import annotations

import json
from functools import cache
from typing import Any

from PIL import Image

from tools.app.art2 import MANIFEST, OUT
from tools.app.common import Output

#: db/npc slug -> registry person. Only the exact ids: a person with a portrait (the house nurse) needs the portrait to match too.
PEOPLE = {
    "nagmon_baker": "nagmon_baker",
    "nagmon_fisher": "nagmon_fisher",
    "nagmon_librarian": "nagmon_librarian",
}
#: A map frame of a person: 256 px drawn two tiles tall (16 px of source).
PERSON_SCALE = 8
#: db/npc slug -> (props sheet id, frame). Only objects that look alike.
PROPS = {
    "nagmon_obj_noticeboard": ("props.world", 3),
    "nagmon_obj_mailbox": ("props.world", 14),
    "nagmon_obj_bookshelf": ("props.home_pets", 13),
    "nagmon_obj_library": ("props.home_pets", 13),
}
#: A prop is drawn this many source pixels wide (one tile), from 128 px.
PROP_WIDTH = 128
PROP_SCALE = 8


@cache
def _manifest() -> dict[str, Any]:
    return json.loads((OUT / MANIFEST).read_text())


def _asset(art_id: str) -> dict[str, Any]:
    return next(e for e in _manifest()["assets"] if e["id"] == art_id)


def person_ready(person: str) -> bool:
    """Whether the registry has the person with every sheet accepted."""
    rec = _manifest().get("npc_sprites", {}).get(person)
    return bool(
        rec
        and rec.get("status") == "accepted"
        and all(s == "accepted" for s in rec["sheet_status"].values())
        and {"map_a", "map_b"} <= set(rec["sheets"])
    )


def person_sheet(person: str) -> tuple[Image.Image, list[Any]]:
    """The 3x4 map sheet of a person, and its source files."""
    rec = _manifest()["npc_sprites"][person]
    files = [
        OUT / _asset(rec["sheets"][k])["file"] for k in ("map_a", "map_b")
    ]
    parts = [Image.open(f).convert("RGBA") for f in files]
    fw, fh = rec["frame"]
    if any(p.size != (3 * fw, 2 * fh) for p in parts):
        raise ValueError(
            f"{person}: a map sheet is not 3x2 frames of {fw}x{fh}"
        )
    sheet = Image.new("RGBA", (3 * fw, 4 * fh), (0, 0, 0, 0))
    sheet.paste(parts[0], (0, 0))
    sheet.paste(parts[1], (0, 2 * fh))
    return sheet, files


def prop_picture(art_id: str, frame: int) -> tuple[Image.Image, list[Any]]:
    """One frame of a props sheet, trimmed and PROP_WIDTH wide."""
    e = _asset(art_id)
    fw, fh = e["frame"]
    cols = e["cols"]
    with Image.open(OUT / e["file"]) as im:
        x, y = (frame % cols) * fw, (frame // cols) * fh
        cell = im.convert("RGBA").crop((x, y, x + fw, y + fh))
    box = cell.getbbox()
    if box is None:
        raise ValueError(f"{art_id}: frame {frame} is empty")
    cell = cell.crop(box)
    size = (PROP_WIDTH, max(1, round(cell.height * PROP_WIDTH / cell.width)))
    small = (
        cell.convert("RGBa")
        .resize(size, Image.Resampling.LANCZOS)
        .convert("RGBA")
    )
    return small, [OUT / e["file"]]


def override(out: Output, slug: str) -> dict[str, Any] | None:
    """The record's ``map``, ``frame`` and ``scale`` from the owner's art, or None."""
    if slug in PEOPLE and person_ready(PEOPLE[slug]):
        person = PEOPLE[slug]
        sheet, files = person_sheet(person)
        dest = f"sprites/npc/{person}_map.png"
        if dest not in out.images:
            out.add_image(dest, sheet, files, "npc")
            out.assets[
                dest
            ].note = "owner art: map_a over map_b of the registry"
        frame = [sheet.width // 3, sheet.height // 4]
        return {"map": dest, "frame": frame, "scale": PERSON_SCALE}
    if slug in PROPS:
        art_id, frame = PROPS[slug]
        picture, files = prop_picture(art_id, frame)
        dest = f"sprites/objects/{art_id.replace('.', '_')}_{frame}.png"
        if dest not in out.images:
            out.add_image(dest, picture, files, "npc")
            out.assets[
                dest
            ].note = "owner art: one frame of a props sheet, trimmed"
        return {"map": dest, "frame": list(picture.size), "scale": PROP_SCALE}
    return None
