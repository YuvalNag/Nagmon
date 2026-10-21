# SPDX-License-Identifier: GPL-3.0
"""The second batch of owner art (groups 7, 8 and 9), shipped as WebP.

    python -m tools.app.art2 --packages DIR --fixed DIR     # import
    python -m tools.app.art2 --check-sizes                  # report

Two halves:

* :func:`import_art` (this module's command line) reads the unzipped
  ChatGPT packages and the code-fixed copies (keyed RGBA, additive
  effects, repaired backdrops, 2560x1152 upscales), resizes and encodes
  each picture and writes ``app/public/game/art`` and its
  ``manifest.json``. A fixed copy wins over the package's. The manifest
  records the SHA-256 of every source, so a re-import is checked
  against the same inputs. The packages are not in the repository (they
  are about 100 MB of PNG); the shipped WebP files are.
* :func:`build` (part of ``build_data``) validates the committed
  manifest against the committed files, registers them so nothing
  deletes them, and republishes the manifest. ``--check`` then fails
  when a file is missing, unlisted, or does not match its record.

The manifest format is described in docs/app/ART_ASSETS.md.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

from PIL import Image

REPO = Path(__file__).resolve().parents[2]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))
from tools.app.common import OUT, Output  # noqa: E402

ART = OUT / "art"
MANIFEST = "art/manifest.json"
VERSION = 1

#: Backdrops and story scenes: 2560x1152 sources, kept at 3/4 size, so no screen shows it above 2x.
SCENE = (1920, 864)
CARD = (1672, 941)
#: A frame of a sheet is shown at most about 200 css px: 320 px is enough.
FRAME = 320
PORTRAIT_FRAME = 384
CAT_BATTLE_FRAME = 512
CAT_MAP_FRAME = 288
LOGO = 512

BACKDROPS = ("hearthrock", "moon", "sun", "rocky", "giants", "outer", "night")
SEASONS = ("spring", "summer", "autumn", "winter")
CARDS = ("forgetting_fog", "owl_help", "colors_return", "creature_steps")
EFFECTS = (
    "attack_math",
    "attack_geometry",
    "attack_hebrew",
    "attack_english",
    "attack_science",
    "attack_logic",
    "effect_hit",
    "effect_heal",
    "effect_net",
    "effect_befriend",
    "effect_levelup",
)
SUBJECTS = ("math", "geometry", "hebrew", "english", "science", "logic")
HEROES = ("boy", "girl", "curly")
GUIDES = ("owl", "mila")
UI_PIECES = (
    "question_frame",
    "pause_button",
    "message_frame",
    "down_marker",
    "enemy_name_card",
    "partner_name_card",
    "hint_left",
    "hint_right",
    "hp_frame",
    "hp_green_fill",
    "hp_blue_fill",
    "hp_orange_fill",
    "answer_blue",
    "answer_green",
    "answer_orange",
    "combo_medal",
)
CAT_MAP_FACES = (
    ("map_a", ("front", "left")),
    ("map_b", ("right", "back")),
)


class Sources:
    """The packages and the fixed copies; a fixed copy wins."""

    def __init__(self, packages: Path, fixed: Path) -> None:
        self.packages = packages
        self.fixed = fixed

    def find(self, *rels: str) -> Path:
        """The first existing file: each ``rel`` in ``fixed``, then in ``packages``."""
        for base in (self.fixed, self.packages):
            for rel in rels:
                path = base / rel
                if path.is_file():
                    return path
        raise FileNotFoundError(rels)

    def upscaled(self, rel: str) -> Path:
        """The 2560x1152 copy of a scene, or the package's when there is none."""
        return self.find(f"upscaled_2560x1152/{rel}", rel)


def _atlas(sources: Sources, group: str) -> dict[str, dict[str, Any]]:
    path = sources.packages / group / "atlas.json"
    return {a["id"]: a for a in json.loads(path.read_text())["assets"]}


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _save(image: Image.Image, target: Path, *, lossless: bool, q: int) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if lossless:
        image.save(target, "WEBP", lossless=True, quality=100, method=6)
    else:
        image.save(
            target,
            "WEBP",
            quality=q,
            alpha_quality=100,
            method=6,
            exact=False,
        )


class Importer:
    def __init__(self, sources: Sources, root: Path) -> None:
        self.s = sources
        self.root = root
        self.entries: list[dict[str, Any]] = []

    def _add(
        self,
        id_: str,
        kind: str,
        rel: str,
        image: Image.Image,
        source: Path,
        *,
        lossless: bool = False,
        q: int = 82,
        frame: tuple[int, int] | None = None,
        labels: list[str] | None = None,
        **extra: Any,
    ) -> None:
        _save(image, self.root / rel, lossless=lossless, q=q)
        w, h = image.size
        fw, fh = frame or (w, h)
        entry: dict[str, Any] = {
            "id": id_,
            "kind": kind,
            "file": f"art/{rel}",
            "size": [w, h],
            "frame": [fw, fh],
            "frames": (w // fw) * (h // fh),
            "cols": w // fw,
            "rows": h // fh,
        }
        if labels:
            entry["labels"] = labels
        entry.update(extra)
        entry["source"] = {
            "name": source.name,
            "sha256": _digest(source),
        }
        self.entries.append(entry)

    @staticmethod
    def _open(path: Path, mode: str) -> Image.Image:
        image = Image.open(path)
        image.load()
        return image.convert(mode)

    def _sheet(
        self,
        id_: str,
        kind: str,
        rel: str,
        source: Path,
        cell: dict[str, Any],
        frame: int,
        *,
        mode: str = "RGBA",
        **extra: Any,
    ) -> None:
        """A sheet of equal cells, scaled so a cell is ``frame`` px."""
        image = self._open(source, mode)
        cw, ch = cell["rect"][2], cell["rect"][3]
        cols = image.width // cw
        rows = image.height // ch
        size = (cols * frame, rows * round(frame * ch / cw))
        small = image.resize(size, Image.LANCZOS)
        self._add(
            id_,
            kind,
            rel,
            small,
            source,
            frame=(frame, size[1] // rows),
            **extra,
        )

    # ------------------------------------------------------------ groups
    def scenes(self) -> None:
        for name in BACKDROPS:
            src = self.s.upscaled(
                f"group7_battle/backdrops/battle_backdrop_{name}.png"
            )
            image = self._open(src, "RGB").resize(SCENE, Image.LANCZOS)
            self._add(
                f"backdrop_{name}", "backdrop", f"backdrops/{name}.webp",
                image, src,
            )  # fmt: skip
        for name in (
            "grey_valley",
            "color_burst",
            *(f"season_{x}" for x in SEASONS),
        ):
            src = self.s.upscaled(f"group8_story/story/story_{name}.png")
            image = self._open(src, "RGB").resize(SCENE, Image.LANCZOS)
            self._add(
                f"story_{name}", "story", f"story/{name}.webp", image, src
            )
        for name in CARDS:
            src = self.s.find(f"group8_story/story/story_card_{name}.png")
            image = self._open(src, "RGB").resize(CARD, Image.LANCZOS)
            self._add(
                f"card_{name}", "story", f"story/card_{name}.webp", image, src
            )
        for name, rel in (
            ("title_sunrise", "nagmon_title_sunrise"),
            ("title_band", "nagmon_title_sunrise_titleband"),
        ):
            src = self.s.upscaled(f"group9_town_part2/objects/{rel}.png")
            image = self._open(src, "RGB").resize(SCENE, Image.LANCZOS)
            self._add(name, "title", f"title/{name}.webp", image, src)
        src = self.s.find("group9_town_part2/objects/nagmon_logo.png")
        image = self._open(src, "RGBA").resize((LOGO, LOGO), Image.LANCZOS)
        self._add("logo", "title", "title/logo.webp", image, src)

    def battle(self) -> None:
        atlas = _atlas(self.s, "group7_battle")
        for name in EFFECTS:
            cell = atlas[name]["cells"][0]
            labels = [c["label"] for c in atlas[name]["cells"]]
            src = self.s.find(f"group7_battle/effects/{name}.png")
            self._sheet(
                f"fx_{name}", "effect", f"effects/{name}.webp", src, cell,
                FRAME, labels=labels, blend="normal", fps=12,
            )  # fmt: skip
            add = self.s.find(
                f"group7_battle/effects_additive/{name}_additive.png"
            )
            self._sheet(
                f"fx_{name}_add", "effect", f"effects_additive/{name}.webp",
                add, cell, FRAME, mode="RGB", labels=labels, blend="add",
                fps=12, of=f"fx_{name}",
            )  # fmt: skip
        for guide in GUIDES:
            key = f"guide_portrait_{guide}"
            cells = atlas[key]["cells"]
            src = self.s.find(f"group7_battle/portraits/{key}.png")
            self._sheet(
                f"portrait_{guide}", "portrait", f"portraits/{guide}.webp",
                src, cells[0], PORTRAIT_FRAME,
                labels=[c["label"] for c in cells],
            )  # fmt: skip
        for hero in HEROES:
            key = f"hero_pose_{hero}"
            cells = atlas[key]["cells"]
            src = self.s.find(f"group7_battle/poses/{key}.png")
            self._sheet(
                f"pose_{hero}", "pose", f"poses/{hero}.webp", src, cells[0],
                FRAME, labels=[c["label"] for c in cells],
            )  # fmt: skip
        for subject in SUBJECTS:
            key = f"enemy_parts_{subject}"
            cells = atlas[key]["cells"]
            src = self.s.find(f"group7_battle/enemy_parts/{key}.png")
            self._sheet(
                f"parts_{subject}", "enemy_parts",
                f"enemy_parts/{subject}.webp", src, cells[0], FRAME,
                labels=[c["label"] for c in cells],
            )  # fmt: skip
        for name in UI_PIECES:
            src = self.s.find(f"group7_battle/ui/pieces/{name}.png")
            mode = "RGB" if name.endswith("_fill") else "RGBA"
            image = self._open(src, mode)
            self._add(
                f"ui_{name}", "ui", f"ui/{name}.webp", image, src,
                lossless=True,
            )  # fmt: skip

    def cat(self) -> None:
        base = "group9_town_part1/art_inbox/npc_pet_cat"
        atlas = _atlas(self.s, "group9_town_part1")
        src = self.s.find(f"{base}/battle_keyed.png")
        cells = atlas["pet_cat_battle"]["cells"]
        self._sheet(
            "cat_battle", "cat", "cat/battle.webp", src, cells[0],
            CAT_BATTLE_FRAME, labels=[c["label"] for c in cells],
        )  # fmt: skip
        for sheet, _ in CAT_MAP_FACES:
            src = self.s.find(f"{base}/{sheet}_keyed.png")
            cells = atlas[f"pet_cat_{sheet}"]["cells"]
            self._sheet(
                f"cat_{sheet}", "cat", f"cat/{sheet}.webp", src, cells[0],
                CAT_MAP_FRAME, labels=[c["label"] for c in cells],
            )  # fmt: skip


def import_art(
    packages: Path, fixed: Path, root: Path = ART
) -> dict[str, Any]:
    """Write every picture under ``root`` and return the manifest."""
    imp = Importer(Sources(packages, fixed), root)
    imp.scenes()
    imp.battle()
    imp.cat()
    manifest = {
        "version": VERSION,
        "note": "Generated by tools/app/art2.py; see docs/app/ART_ASSETS.md.",
        "backdrops": backdrop_map(),
        "assets": sorted(imp.entries, key=lambda e: e["id"]),
    }
    keep = {root.parent / e["file"] for e in imp.entries}
    for old in root.rglob("*.webp"):
        if old not in keep:
            old.unlink()
    (root / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1) + "\n"
    )
    return manifest


def backdrop_map() -> dict[str, Any]:
    """Which backdrop a map gets: by map name, with a default."""
    return {
        "default": "backdrop_hearthrock",
        "maps": {
            "solar_moon": "backdrop_moon",
            "solar_sun": "backdrop_sun",
            "solar_rocky_planets": "backdrop_rocky",
            "solar_giants": "backdrop_giants",
            "solar_outer": "backdrop_outer",
        },
        "night": "backdrop_night",
    }


def problems(manifest: dict[str, Any], root: Path = OUT) -> list[str]:
    """What is wrong with the manifest or the files it lists."""
    out: list[str] = []
    ids: set[str] = set()
    files: set[str] = set()
    for e in manifest.get("assets", []):
        if e["id"] in ids:
            out.append(f"duplicate id {e['id']}")
        ids.add(e["id"])
        files.add(e["file"])
        path = root / e["file"]
        if not path.is_file():
            out.append(f"missing file {e['file']}")
            continue
        with Image.open(path) as im:
            if list(im.size) != e["size"]:
                out.append(f"{e['file']}: size {im.size} != {e['size']}")
        fw, fh = e["frame"]
        if e["size"][0] % fw or e["size"][1] % fh:
            out.append(f"{e['id']}: frame does not divide the picture")
        if e["frames"] != e["cols"] * e["rows"]:
            out.append(f"{e['id']}: frames != cols * rows")
        if "labels" in e and len(e["labels"]) != e["frames"]:
            out.append(f"{e['id']}: labels do not match the frames")
        if "of" in e and e["of"] not in {x["id"] for x in manifest["assets"]}:
            out.append(f"{e['id']}: unknown base {e['of']}")
    for p in (
        sorted((root / "art").rglob("*.webp"))
        if (root / "art").is_dir()
        else []
    ):
        rel = p.relative_to(root).as_posix()
        if rel not in files:
            out.append(f"not in the manifest: {rel}")
    names = set(manifest.get("backdrops", {}).get("maps", {}).values())
    names |= {manifest.get("backdrops", {}).get("default")}
    names |= {manifest.get("backdrops", {}).get("night")}
    out += [f"backdrop map names unknown id {n}" for n in sorted(names - ids)]
    return out


def build(out: Output) -> dict[str, Any]:
    """Register the committed art and its manifest in the build."""
    path = OUT / MANIFEST
    if not path.is_file():
        raise FileNotFoundError(
            f"{MANIFEST}: run python -m tools.app.art2 --packages ... --fixed ..."
        )
    manifest = json.loads(path.read_text())
    bad = problems(manifest)
    if bad:
        raise ValueError("art manifest: " + "; ".join(bad))
    for e in manifest["assets"]:
        out.add_copy(
            e["file"], OUT / e["file"], "art", note="owner art, batch 2"
        )
    out.add_json(MANIFEST, manifest)
    size = sum((OUT / e["file"]).stat().st_size for e in manifest["assets"])
    return {"assets": len(manifest["assets"]), "bytes": size}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--packages", type=Path, help="the unzipped packages")
    parser.add_argument("--fixed", type=Path, help="the code-fixed copies")
    args = parser.parse_args(argv)
    if not (args.packages and args.fixed):
        parser.error("--packages and --fixed are required")
    manifest = import_art(args.packages, args.fixed)
    total = sum((OUT / e["file"]).stat().st_size for e in manifest["assets"])
    print(f"{len(manifest['assets'])} pictures, {total / 1e6:.2f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
