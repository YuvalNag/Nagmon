"""
Installs modest replacements for flagged character portraits.

Reads content/modesty/sprites_review.yaml and, for every flagged or
borderline portrait, copies its replacement to mods/nagmon under the
flagged file's own name. Because mods/nagmon is searched before
mods/tuxemon, every NPC that used the flagged portrait now shows the
replacement, with no data or code changes.

Short-sleeved replacements (florist_*) are swapped for long-sleeved ones
(healer_*). The heroine sheets are handled by lengthen_skirt.py instead.

Usage: python tools/modesty/apply_overlays.py
"""

from __future__ import annotations

import shutil
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
REVIEW = REPO / "content" / "modesty" / "sprites_review.yaml"
SRC = REPO / "mods" / "tuxemon" / "gfx" / "sprites" / "player"
DST = REPO / "mods" / "nagmon" / "gfx" / "sprites" / "player"

LONG_SLEEVES = {
    "florist.png": "healer.png",
    "florist_alt1.png": "healer_alt2.png",
    "florist_black.png": "healer_black.png",
    "florist_brown.png": "healer_brown.png",
    "florist_fiery.png": "healer_fiery.png",
    "florist_green.png": "healer_green.png",
    "florist_lapi.png": "healer_alt1.png",
    "florist_rose.png": "healer_rose.png",
}

# Children in sleeveless pinafores get the long-dress dancer portrait.
CHILD_REPLACEMENT = "dancer.png"
CHILD_PORTRAITS = ("catgirl", "little_pair", "enthusiast_pair")


def replacement_for(entry: dict) -> str | None:
    name = Path(entry["file"]).name
    if entry.get("kind") != "portrait" or name.startswith("heroine"):
        return None
    if name.startswith(CHILD_PORTRAITS):
        return CHILD_REPLACEMENT
    proposed = entry.get("proposed_replacement")
    if not proposed:
        return None
    proposed_name = Path(proposed).name
    return LONG_SLEEVES.get(proposed_name, proposed_name)


def overlays() -> dict[str, str]:
    review = yaml.safe_load(REVIEW.read_text(encoding="utf-8"))
    result = {}
    for entry in review["entries"]:
        if entry.get("status") not in ("flag", "borderline"):
            continue
        rep = replacement_for(entry)
        if rep:
            result[Path(entry["file"]).name] = rep
    return result


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    for flagged, rep in sorted(overlays().items()):
        shutil.copyfile(SRC / rep, DST / flagged)
        print(f"{flagged} <- {rep}")


if __name__ == "__main__":
    main()
