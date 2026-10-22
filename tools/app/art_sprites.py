# SPDX-License-Identifier: GPL-3.0
"""Manifest entries for the owner's sprites that are not in ``art/``.

    python -m tools.app.art_sprites            # write them into the manifest
    python -m tools.app.art_sprites --check    # fail when the manifest is behind

The creature sheets, the people's map sheets, the dialog portraits and
the avatar cards are owner art too (``tools/app/credits.py``), but they
sit outside ``game/art`` and the art2/art3 importers never listed them.
Slice A1 of docs/app/ART_DELIVERY.md lists them, so each has an id, a
pack and a frame size, and the placeholder generator
(``tools/app/placeholders.py``) can draw a stand-in for every one.

The files are written by other steps of the build; this module only
**reads** them (and ``db/monsters.json``, ``db/npcs.json``,
``db/avatars.json`` for the frame sizes) and writes the manifest. Its
entries carry ``importer: "sprites"``, so ``art2`` and ``art3`` keep
them when they rewrite the manifest.

It also gives every art2 entry (which had neither) its ``pack`` and
``status``: :func:`stamp`.

Ids: ``sprite.monster.<slug>``, ``sprite.npc.<name>``,
``sprite.portrait.<name>``, ``sprite.avatar.<key>``.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from PIL import Image

REPO = Path(__file__).resolve().parents[2]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))
from tools.app.common import OUT  # noqa: E402

IMPORTER = "sprites"
MANIFEST = "art/manifest.json"

#: The pack (a group of pictures that ship together) of each art2 kind.
ART2_PACKS = {
    "backdrop": "backdrops",
    "story": "story",
    "title": "title",
    "effect": "effects",
    "portrait": "portraits",
    "pose": "poses",
    "enemy_parts": "enemy_parts",
    "ui": "ui",
    "cat": "cat",
}
#: The pack of each kind this module lists.
SPRITE_PACKS = {
    "creature": "monsters",
    "npc": "npc_sheets",
    "portrait": "portraits",
    "avatar": "avatars",
}
#: A map sheet is 3 frames across (step, stand, step) and 4 directions down.
WALK_GRID = (3, 4)


def _png_size(path: Path) -> tuple[int, int]:
    with Image.open(path) as im:
        return im.size


def _entry(
    id_: str,
    kind: str,
    file: str,
    size: tuple[int, int],
    frame: tuple[int, int],
    **extra: Any,
) -> dict[str, Any]:
    cols, rows = size[0] // frame[0], size[1] // frame[1]
    return {
        "id": id_,
        "kind": kind,
        "file": file,
        "size": list(size),
        "frame": list(frame),
        "frames": cols * rows,
        "cols": cols,
        "rows": rows,
        **extra,
        "pack": SPRITE_PACKS[kind],
        "status": "accepted",
        "importer": IMPORTER,
    }


def _db(root: Path, name: str) -> Any:
    return json.loads((root / "db" / f"{name}.json").read_text("utf-8"))


def _is_owner(name: str) -> bool:
    """A file name the credits rule calls owner art (``nagmon_*``)."""
    return name.startswith("nagmon_")


def entries(root: Path = OUT) -> list[dict[str, Any]]:
    """The entries of every owner sprite under ``root`` (app/public/game)."""
    out: list[dict[str, Any]] = []
    # creatures: the whole sheet is one picture; where front, back and the
    # menu icons are is in the record
    for slug, rec in sorted(_db(root, "monsters").items()):
        sp = rec.get("sprites")
        if not sp:
            continue
        size = _png_size(root / sp["sheet"])
        regions = {
            k: sp[k] for k in ("front", "back", "menu1", "menu2") if k in sp
        }
        out.append(
            _entry(
                f"sprite.monster.{slug}",
                "creature",
                sp["sheet"],
                size,
                size,
                regions=regions,
            )
        )
    # people: frames from the records, else the usual 3x4 grid
    frames: dict[str, tuple[int, int]] = {}
    for rec in _db(root, "npcs").values():
        sp = rec.get("sprites")
        if sp:
            frames[sp["map"]] = (sp["frame"][0], sp["frame"][1])
    for av in _db(root, "avatars")["avatars"]:
        frames[av["map"]] = (av["frame"][0], av["frame"][1])
    for path in sorted((root / "sprites" / "npc").glob("*.png")):
        if not _is_owner(path.name):
            continue  # e.g. rockitten.png is Tuxemon art
        file = f"sprites/npc/{path.name}"
        size = _png_size(path)
        frame = frames.get(file) or (
            size[0] // WALK_GRID[0],
            size[1] // WALK_GRID[1],
        )
        out.append(_entry(f"sprite.npc.{path.stem}", "npc", file, size, frame))
    for path in sorted((root / "sprites" / "portraits").glob("*.png")):
        if _is_owner(path.name):
            size = _png_size(path)
            out.append(
                _entry(
                    f"sprite.portrait.{path.stem}",
                    "portrait",
                    f"sprites/portraits/{path.name}",
                    size,
                    size,
                )
            )
    for path in sorted((root / "avatars").glob("*.png")):
        size = _png_size(path)
        out.append(
            _entry(
                f"sprite.avatar.{path.stem}",
                "avatar",
                f"avatars/{path.name}",
                size,
                size,
            )
        )
    return out


def stamp(manifest: dict[str, Any]) -> dict[str, Any]:
    """Give every entry without one a ``pack`` and a ``status`` (art2's)."""
    for e in manifest["assets"]:
        if e.get("importer") in ("art3", IMPORTER):
            continue
        e.setdefault("pack", ART2_PACKS[e["kind"]])
        e.setdefault("status", "accepted")
    return manifest


def sync(manifest: dict[str, Any], root: Path = OUT) -> dict[str, Any]:
    """The manifest with this module's entries replaced and art2's stamped."""
    kept = [e for e in manifest["assets"] if e.get("importer") != IMPORTER]
    manifest["assets"] = sorted(kept + entries(root), key=lambda e: e["id"])
    return stamp(manifest)


def _load(root: Path) -> dict[str, Any]:
    return json.loads((root / MANIFEST).read_text("utf-8"))


def _dump(manifest: dict[str, Any]) -> str:
    return json.dumps(manifest, ensure_ascii=False, indent=1) + "\n"


def is_current(root: Path = OUT) -> bool:
    manifest = _load(root)
    return _dump(sync(json.loads(_dump(manifest)), root)) == _dump(manifest)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    if args.check:
        if is_current():
            print("manifest lists the owner sprites")
            return 0
        print("manifest is behind: run python -m tools.app.art_sprites")
        return 1
    manifest = sync(_load(OUT))
    (OUT / MANIFEST).write_text(_dump(manifest), encoding="utf-8")
    n = sum(1 for e in manifest["assets"] if e.get("importer") == IMPORTER)
    print(f"{n} sprite entries, {len(manifest['assets'])} in all")
    return 0


if __name__ == "__main__":
    sys.exit(main())
