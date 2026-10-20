# SPDX-License-Identifier: GPL-3.0
"""Does a character's portrait show the same person as its map sprite?

A cheap guard, not a judge: the colours of the map sheet's front frame
against the colours of the portrait's front (the right half of a combat
sheet). Each is a histogram of its opaque pixels in 8 levels per
channel; the distance is the Hellinger distance between the two (0: the
same colours, 1: none in common). The same character drawn twice comes
out near 0.2-0.3; another person near 0.5-0.7.

    python -m tools.app.coherence      # the table, for the shipped files
"""

from __future__ import annotations

import sys

import numpy as np
from PIL import Image

#: Above this, the two pictures are taken for different characters.
THRESHOLD = 0.40
BITS = 3


def map_front(sheet: Image.Image) -> Image.Image:
    from tools.app.db import map_frames

    return map_frames(sheet)[0]


def portrait_front(sheet: Image.Image) -> Image.Image:
    """The right half of a combat sheet, trimmed."""
    sheet = sheet.convert("RGBA")
    half = sheet.crop((sheet.width // 2, 0, sheet.width, sheet.height))
    box = half.getbbox()
    if box is None:
        raise ValueError("an empty portrait front")
    return half.crop(box)


def histogram(image: Image.Image) -> np.ndarray:
    rgba = np.asarray(image.convert("RGBA"))
    rgb = rgba[rgba[..., 3] >= 128][:, :3].astype(int) >> (8 - BITS)
    index = (rgb[:, 0] << (2 * BITS)) | (rgb[:, 1] << BITS) | rgb[:, 2]
    counts = np.bincount(index, minlength=1 << (3 * BITS)).astype(float)
    return counts / max(1.0, counts.sum())


def distance(map_sheet: Image.Image, combat_sheet: Image.Image) -> float:
    a = histogram(map_front(map_sheet))
    b = histogram(portrait_front(combat_sheet))
    return float(np.sqrt(max(0.0, 1.0 - np.sqrt(a * b).sum())))


def pairs(npcs: dict, avatars: list) -> dict[str, tuple[str, str]]:
    """Character -> (map sheet, portrait), both relative to public/game."""
    found = {}
    for slug, rec in npcs.items():
        art = rec["sprites"]
        if art.get("map") and art.get("portrait"):
            if art["map"].startswith("sprites/npc/"):
                found[slug] = (art["map"], art["portrait"])
    for avatar in avatars:
        found[f"avatar {avatar['key']}"] = (avatar["map"], avatar["portrait"])
    return found


def table(game) -> list[tuple[str, float]]:
    """(character, distance) for the shipped files under ``game``."""
    import json

    npcs = json.loads((game / "db/npcs.json").read_text(encoding="utf-8"))
    avatars = json.loads(
        (game / "db/avatars.json").read_text(encoding="utf-8")
    )["avatars"]
    rows = []
    for name, (m, p) in sorted(pairs(npcs, avatars).items()):
        with Image.open(game / m) as ms, Image.open(game / p) as cs:
            rows.append((name, distance(ms, cs)))
    return rows


def main() -> int:
    from tools.app.common import OUT

    rows = table(OUT)
    for name, d in rows:
        flag = "DIFFERENT" if d > THRESHOLD else ""
        print(f"{name:28s} {d:.3f} {flag}")
    return 1 if any(d > THRESHOLD for _, d in rows) else 0


if __name__ == "__main__":
    sys.exit(main())
