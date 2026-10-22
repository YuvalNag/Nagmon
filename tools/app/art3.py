# SPDX-License-Identifier: GPL-3.0
"""The third batch of owner art (ChatGPT checkpoint 59 and its repairs).

    python -m tools.app.art3 --package DIR [--seamless DIR]   # first import
    python -m tools.app.art3 --update DIR_OR_ZIP [...] [--dry-run]
    python -m tools.app.art3 --report                         # a table

Everything that has a use is imported, drafts and files that need repair
included, under **stable ids** and **stable paths**: when a repaired file
arrives, ``--update`` replaces it (same id, same file, same atlas layout)
and nothing in the code changes. See docs/app/ART_ASSETS.md.

What an entry of ``art/manifest.json`` says (on top of art2's fields):

* ``status``: ``accepted`` | ``draft`` | ``needs_revision`` (the package's
  ASSET_STATUS.json; ``package_status`` is its own word);
* ``known_issues``: tags, see :data:`ISSUES`;
* ``source``: the package-relative ``path`` (how ``--update`` finds the
  entry), the SHA-256 and the native size of the file;
* ``cleanup``: what the keyer did (art3_key.py);
* for a walk sheet: ``anchor`` (the feet, in frame pixels) and ``feet``
  (one per frame);
* ``lazy``: a chapter picture that is not in the app unless the build asks
  for it (``NAGMON_CHAPTER_ART=1``).

Top-level keys added: ``drafts_enabled``, ``chapters_lazy``, ``icons``
(item id and UI name -> frame of an icon sheet) and ``npc_sprites``.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
import tempfile
import zipfile
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))
from tools.app import art2  # noqa: E402
from tools.app import art3_key as key  # noqa: E402
from tools.app.common import OUT  # noqa: E402

ART = art2.ART
MANIFEST = art2.MANIFEST
IMPORTER = "art3"
STATUSES = ("accepted", "draft", "needs_revision")
#: The tags a ``known_issues`` list may hold.
ISSUES = {
    "magenta": "pink or fuchsia pixels are left after the cleanup",
    "mirrored_floor": "the ground cells are mirror-built, not seamless",
    "door_size": "the door is too big for the building's opening",
    "wall_join": "wall and corner do not join at one height",
    "cut_off": "the figure touches the edge of its cell",
    "foot_order": "the walk's leading foot is on the wrong side",
    "wrong_hand": "the prop is in the wrong hand",
    "star_mark": "an unrequested star ornament",
    "profile_view": "a side view is really a front view",
    "size_off": "the figure is not the requested size",
    "margins": "no clear margin round the object",
    "see_note": "needs repair; see ``note``",
}
#: Over this many bytes added, the chapter packs go to the lazy folder.
CHAPTER_BUDGET = 14_000_000
#: Pictures whose thick fuchsia is real (the fisher's pink rod).
KEEP_FUCHSIA = ("npc.nagmon_fisher.",)
#: Pink (fuchsia) pixels left over this many are tagged ``magenta``.
PINK_TAG = 150
SEVERITY = {"accepted": 0, "draft": 1, "needs_revision": 2}

WALK_DIRS = {
    "map_a": ("down", "left"),
    "map_b": ("right", "up"),
}
SHIP_DIRS = ("down", "left", "right", "up")

# ------------------------------------------------------------- labels
ITEM_FRAMES = (
    "net",
    "strong_net",
    "jar",
    "cookie",
    "cake_slice",
    "small_potion",
    "big_potion",
    "berry_red",
    "berry_blue",
    "berry_green",
    "berry_yellow",
    "berry_purple",
    "berry_orange",
    "feather",
    "clover",
    "owl_wing",
    "note_card",
    "key",
    "map_scroll",
    "coin",
    "coins_5",
    "coin_bag",
    "gift_box",
    "star_badge",
    "planet_badge",
    "telescope_badge",
    "medal_ribbon",
    "trophy",
    "egg",
    "nest",
    "bone_biscuit",
    "yarn_ball",
)
_E = ""
UI_FRAMES = (
    # row 1
    "friends", "bag", "book", "quests", "me", "settings", _E, _E,
    # row 2
    "ask", "net", "bag_tab", "friends_tab", "leave", _E, _E, _E,
    # row 3
    "math", "hebrew", "english", "science", "geography", "art", "music", "history",
    # row 4
    "logic", _E, _E, _E, _E, _E, _E, _E,
    # row 5
    "heart_full", "heart_empty", "star_full", "star_empty", "lock_closed",
    "lock_open", "check", "question",
    # row 6
    "sound", "muted", "pause", "play", "back", "home", "more", "close",
    # row 7
    "moon", "sun", "rocky_planet", "ringed_planet", "icy_planet",
    "space_station", "spaceship", "telescope",
)  # fmt: skip
PROPS = {
    "world": (
        "chest_closed", "chest_open", "sign_post", "notice_board", "postbox",
        "bench", "lamp_post", "fountain", "signpost_arrows", "haystack",
        "crates", "barrel", "flower_pot", "tree_stump", "mailbox", "campfire",
    ),
    "hidden": (
        "egg_dots", "egg_stripes", "egg_blue_white", "egg_gold",
        "egg_gold_cracked", "bush_eyes", "bush_paw", "dust_hole", "rock_crack",
        "star_fragment", "checkpoint_stone", "vending_machine", "keypad_door",
        "telescope_stand", "fishing_spot", "tent",
    ),
    "home_pets": (
        "bed_mat", "food_bowl", "toy_ball", "water_bowl", "scratching_post",
        "cushion", "desk_lamp", "wardrobe", "apple_basket", "round_rug",
        "wall_clock", "picture_frame", "bunk_ladder", "bookshelf", "cactus",
        "window_seat",
    ),
}  # fmt: skip
INTERIORS = {
    "home": (
        "floor_wood_a", "floor_wood_b", "floor_carpet", "floor_rug_dots",
        "wall_straight", "wall_inner_corner", "wall_outer_corner",
        "window_round", "door_closed", "door_open", "bed", "bookcase",
        "trophy_shelf", "mirror", "plant_big", _E,
    ),
    "shop": (
        "floor_a", "floor_b", "floor_c", "wall_straight", "wall_inner_corner",
        "wall_outer_corner", "counter_left", "counter_middle", "counter_right",
        "shelf_jars", "shelf_boxes", "shelf_fruit", "awning", "cash_register",
        "door", "rug",
    ),
    "rest": (
        "floor_cream", "floor_teal", "floor_pattern", "wall_straight",
        "wall_inner_corner", "wall_outer_corner", "desk_left", "desk_middle",
        "desk_right", "bed_round", "healing_machine", "water_cooler",
        "bench", "door", _E, _E,
    ),
    "lab": (
        "floor_a", "floor_b", "floor_c", "wall_straight", "wall_inner_corner",
        "wall_outer_corner", "table_left", "table_right", "blackboard",
        "globe", "bookshelf", "microscope", "computer_desk", "door", _E, _E,
    ),
    "station": (
        "floor_a", "floor_b", "floor_c", "wall_straight", "wall_inner_corner",
        "wall_outer_corner", "window_a", "window_b", "door_closed",
        "door_open", "desk_left", "desk_right", "telescope", "console",
        "lamp", _E,
    ),
}  # fmt: skip
ZONE_TILES = (
    "floor_1", "floor_2", "floor_3", "floor_4", "floor_5", "floor_6",
    "floor_7", "floor_8", "building_shell", "obstacle_a", "obstacle_b",
    "decoration_a", "decoration_b", "door_closed", "door_open", "blank_sign",
)  # fmt: skip
HUB_TILES = (
    "floor_a", "floor_b", "floor_c", "floor_d", "wall_straight",
    "wall_inner_corner", "wall_outer_corner", "window_round", "door_closed",
    "door_open", "desk_left", "desk_right", "parking_pad", "bench",
    "cabinet", "lamp",
)  # fmt: skip

# ------------------------------------------------------------- the rules


@dataclass(frozen=True)
class Ship:
    """How a picture is made small for the app."""

    #: Width of a cell (a sheet) or the longest side (a single picture).
    size: int
    q: int = 82
    lossless: bool = False
    opaque: bool = False


@dataclass(frozen=True)
class Rule:
    pattern: str
    id: str  # a format string over the pattern's groups
    kind: str
    pack: str  # a fixed word, or "{c}" for the chapter
    grid: tuple[int, int] | None
    ship: Ship
    #: the sheet has an alpha (False: opaque art)
    alpha: bool = True
    #: the status the package gave is replaced
    status: str | None = None

    def match(self, rel: str) -> re.Match[str] | None:
        return re.fullmatch(self.pattern, rel)


SHEET = Ship(256)
BATTLE = Ship(1064)
CH = r"chapter_(?P<c>[a-z]+)"
RULES: tuple[Rule, ...] = (
    Rule(
        r"group1_people/art_inbox/(?P<n>nagmon_[a-z_]+)/(?P<s>map_a|map_b)\.png",
        "npc.{n}.{s}",
        "walk",
        "people",
        (3, 2),
        SHEET,
    ),
    Rule(
        r"group1_people/art_inbox/(?P<n>nagmon_[a-z_]+)/battle\.png",
        "npc.{n}.battle",
        "battle",
        "people",
        (2, 1),
        BATTLE,
    ),
    Rule(
        r"group5_upgrades/art_inbox/(?P<n>nagmon_[a-z_]+)/(?P<s>map_a|map_b)\.png",
        "npc.{n}.{s}",
        "walk",
        "upgrades",
        (3, 2),
        SHEET,
    ),
    Rule(
        r"group5_upgrades/art_inbox/(?P<n>nagmon_[a-z_]+)/battle\.png",
        "npc.{n}.battle",
        "battle",
        "upgrades",
        (2, 1),
        BATTLE,
    ),
    Rule(
        r"group2_interiors/tiles/tiles_interior_(?P<n>[a-z_]+)\.png",
        "interior.{n}",
        "interior",
        "interiors",
        (4, 4),
        Ship(256, 85),
        status="draft",
    ),
    Rule(
        r"group3_props/props/props_(?P<n>[a-z_]+)\.png",
        "props.{n}",
        "props",
        "props",
        (4, 4),
        Ship(320, 85),
    ),
    Rule(
        r"group4_icons/icons/icons_(?P<n>items|ui)\.png",
        "icon.{n}",
        "icons",
        "icons",
        (8, 8),
        Ship(192, 88),
    ),
    Rule(
        r"solar_trip_art_2/art_inbox/ship_small/map\.png",
        "trip.ship_small",
        "walk",
        "trip",
        (3, 4),
        SHEET,
    ),
    Rule(
        r"solar_trip_art_2/objects/(?P<n>[a-z_]+)\.png",
        "trip.{n}",
        "object",
        "trip",
        None,
        Ship(640, 85),
    ),
    Rule(
        r"seamless_tiles/(?P<n>[a-z_0-9]+)\.png",
        "tile.{n}",
        "seamless",
        "tiles",
        None,
        Ship(320, lossless=True),
        alpha=False,
        status="draft",
    ),
    # the chapter packs
    Rule(
        CH + r"/art_inbox/(?P=c)_(?P<n>[a-z0-9]+)/(?P<s>map_a|map_b)\.png",
        "chapter.{c}.{n}.{s}",
        "walk",
        "{c}",
        (3, 2),
        SHEET,
    ),
    Rule(
        CH + r"/art_inbox/(?P=c)_(?P<n>[a-z0-9]+)/battle\.png",
        "chapter.{c}.{n}.battle",
        "battle",
        "{c}",
        (2, 1),
        BATTLE,
    ),
    Rule(
        CH + r"/tiles/(?P=c)_background\.png",
        "chapter.{c}.background",
        "background",
        "{c}",
        None,
        Ship(1024, 80, opaque=True),
        alpha=False,
    ),
    Rule(
        CH + r"/tiles/(?P=c)_(?P<n>[a-z_]+)\.png",
        "chapter.{c}.{n}",
        "tiles",
        "{c}",
        (4, 4),
        Ship(256, 85),
    ),
    Rule(
        CH + r"/props/(?P=c)_props\.png",
        "chapter.{c}.props",
        "props",
        "{c}",
        (4, 4),
        Ship(256, 85),
    ),
    Rule(
        CH + r"/objects/(?P=c)_(?P<n>[a-z_0-9]+)\.png",
        "chapter.{c}.{n}",
        "object",
        "{c}",
        None,
        Ship(640, 85),
    ),
    Rule(
        CH + r"/icons/(?P=c)_icons\.png",
        "chapter.{c}.icons",
        "icons",
        "{c}",
        (8, 8),
        Ship(160, 88),
    ),
    Rule(
        CH + r"/cards/(?P=c)_card_(?P<n>\d+)\.png",
        "chapter.{c}.card_{n}",
        "card",
        "{c}",
        None,
        Ship(1254, 80, opaque=True),
        alpha=False,
    ),
)


@dataclass
class Spec:
    """One file of a package, what it is called and how it is shipped."""

    rel: str
    rule: Rule
    id: str
    pack: str
    chapter: str | None
    kind: str
    grid: tuple[int, int] | None
    groups: dict[str, str] = field(default_factory=dict)

    @property
    def file(self) -> str:
        """The path under ``game/``: stable for the life of the id."""
        if self.chapter:
            tail = self.id.split(".", 2)[2].replace(".", "_")
            return f"art/chapters/{self.chapter}/{tail}.webp"
        return "art/" + self.id.replace(".", "/") + ".webp"


def classify(rel: str, grid: tuple[int, int] | None = None) -> Spec | None:
    """The spec of a package-relative path, or None for a file we do not use."""
    for rule in RULES:
        m = rule.match(rel)
        if not m:
            continue
        g = m.groupdict()
        chapter = g.get("c")
        return Spec(
            rel=rel,
            rule=rule,
            id=rule.id.format(**g),
            pack=rule.pack.format(**g),
            chapter=chapter,
            kind=rule.kind,
            grid=grid if grid is not None else rule.grid,
            groups=g,
        )
    return None


def match_path(rel: str) -> Spec | None:
    """Like :func:`classify`, also when a wrapper folder is in front of it."""
    parts = PurePosixPath(rel).parts
    for i in range(len(parts)):
        spec = classify("/".join(parts[i:]))
        if spec:
            return spec
    return None


# ------------------------------------------------------------- the status
def _status_word(word: str) -> str:
    if word.startswith("accepted"):
        return "accepted"
    if word.startswith("needs_revision"):
        return "needs_revision"
    return "draft"


def tags_from_note(note: str, status: str) -> list[str]:
    """Known-issue tags read from the package's QA note."""
    n = note.lower()
    out: list[str] = []
    if re.search(r"door.{0,60}(oversized|larger|too large|too big)", n) or (
        re.search(r"(oversized|too large|much larger).{0,60}door", n)
    ):
        out.append("door_size")
    if "wall" in n and re.search(r"join|shorter|height", n):
        out.append("wall_join")
    foot = bool(re.search(r"\bfoot\b|feet|\blead|leg-order|shoe|gait", n))
    if foot:
        out.append("foot_order")
    if not foot and re.search(
        r"physical ?(left|right)|\bhand|\bheld\b|holds|carries|primer"
        r"|abacus|clock|book|scroll",
        n,
    ):
        out.append("wrong_hand")
    if "star" in n and status != "accepted":
        out.append("star_mark")
    if "profile" in n and status != "accepted" and not foot:
        out.append("profile_view")
    if re.search(r"rather than requested|about ?\d+px", n):
        out.append("size_off")
    if "margin" in n:
        out.append("margins")
    if status != "accepted" and not out and note.strip():
        out.append("see_note")
    return out


@dataclass
class Status:
    word: str
    note: str
    grid: tuple[int, int] | None


def read_status(root: Path | None) -> dict[str, Status]:
    """ASSET_STATUS.json of a package, by package-relative path."""
    if not root:
        return {}
    path = next(iter(sorted(root.rglob("ASSET_STATUS.json"))), None)
    if not path:
        return {}
    doc = json.loads(path.read_text(encoding="utf-8"))
    out: dict[str, Status] = {}
    for a in doc.get("assets", []):
        grid = a.get("atlas_grid")
        out[a["path"]] = Status(
            a.get("status", "draft"),
            a.get("qa_note", ""),
            (grid[0], grid[1]) if grid else None,
        )
    return out


# ------------------------------------------------------------- pictures
def _bounds(n: int, parts: int) -> list[int]:
    return [round(i * n / parts) for i in range(parts + 1)]


def native_frames(spec: Spec, size: tuple[int, int]) -> tuple[int, int]:
    """(cols, rows) of the native picture: a sheet only when it divides."""
    if not spec.grid:
        return (1, 1)
    cols, rows = spec.grid
    if spec.kind != "walk" and (size[0] % cols or size[1] % rows):
        return (1, 1)
    return spec.grid


def _scaled(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    if image.size == size:
        return image
    return image.resize(size, Image.LANCZOS)


def ship_image(
    spec: Spec, image: Image.Image
) -> tuple[Image.Image, tuple[int, int], tuple[int, int]]:
    """
    The picture as it is shipped: (image, frame size, (cols, rows)).

    A sheet is cut into its cells (a cell may be fractional: 1024 / 3) and
    each is scaled to the same shipped size; nothing is enlarged.
    """
    ship = spec.rule.ship
    cols, rows = native_frames(spec, image.size)
    w, h = image.size
    if cols * rows == 1:
        s = min(1.0, ship.size / max(w, h))
        size = (max(1, round(w * s)), max(1, round(h * s)))
        return _scaled(image, size), size, (1, 1)
    xs, ys = _bounds(w, cols), _bounds(h, rows)
    cw, ch = w / cols, h / rows
    s = min(1.0, ship.size / cw)
    fw, fh = max(1, round(cw * s)), max(1, round(ch * s))
    out = Image.new("RGBA", (cols * fw, rows * fh), (0, 0, 0, 0))
    for r in range(rows):
        for c in range(cols):
            cell = image.crop((xs[c], ys[r], xs[c + 1], ys[r + 1]))
            out.paste(_scaled(cell, (fw, fh)), (c * fw, r * fh))
    return out, (fw, fh), (cols, rows)


def analyse_cells(
    rgba: np.ndarray, cols: int, rows: int, scale: float
) -> dict[str, Any]:
    """Per frame: empty, touching the edge, and where the feet are."""
    h, w = rgba.shape[:2]
    xs, ys = _bounds(w, cols), _bounds(h, rows)
    empty: list[int] = []
    cut: list[int] = []
    feet: list[list[float]] = []
    boxes: list[list[int]] = []
    for r in range(rows):
        for c in range(cols):
            i = r * cols + c
            a = rgba[ys[r] : ys[r + 1], xs[c] : xs[c + 1], 3] > 127
            if not a.any():
                empty.append(i)
                feet.append([0, 0])
                boxes.append([0, 0, 0, 0])
                continue
            yy, xx = np.nonzero(a)
            top, bottom = int(yy.min()), int(yy.max())
            left, right = int(xx.min()), int(xx.max())
            if (
                top <= 0
                or left <= 0
                or bottom >= a.shape[0] - 1
                or (right >= a.shape[1] - 1)
            ):
                cut.append(i)
            low = yy >= bottom - max(2, (bottom - top) // 16)
            feet.append(
                [
                    round(float(xx[low].mean()) * scale, 1),
                    round((bottom + 1) * scale, 1),
                ]
            )
            boxes.append(
                [
                    round(left * scale),
                    round(top * scale),
                    round((right + 1) * scale),
                    round((bottom + 1) * scale),
                ]
            )
    return {"empty": empty, "cut": cut, "feet": feet, "boxes": boxes}


def labels_for(spec: Spec, frames: int) -> list[str] | None:
    n = spec.groups.get("n", "")
    s = spec.groups.get("s", "")
    kind = spec.rule.kind
    out: list[str] | None = None
    if spec.id == "trip.ship_small":
        out = [f"{d}_{i}" for d in SHIP_DIRS for i in range(3)]
    elif kind == "walk" and s in WALK_DIRS:
        out = [f"{d}_{i}" for d in WALK_DIRS[s] for i in range(3)]
    elif kind == "battle":
        out = ["back", "front"]
    elif spec.id == "icon.items":
        out = list(ITEM_FRAMES)
    elif spec.id == "icon.ui":
        out = list(UI_FRAMES)
    elif kind == "props" and spec.pack == "props":
        out = list(PROPS.get(n, ()))
    elif kind == "interior":
        out = list(INTERIORS.get(n, ()))
    elif kind == "tiles":
        out = list(HUB_TILES if n == "hub" else ZONE_TILES)
    if out is None or frames == 1:
        return None
    return (out + [""] * frames)[:frames]


def _save(image: Image.Image, target: Path, ship: Ship) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if ship.lossless:
        image.save(target, "WEBP", lossless=True, quality=100, method=6)
    else:
        image.save(
            target, "WEBP", quality=ship.q, alpha_quality=100, method=6,
            exact=False,
        )  # fmt: skip


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# ------------------------------------------------------------- one file
@dataclass
class Result:
    entry: dict[str, Any]
    problems: list[str]
    warnings: list[str]


def process(
    spec: Spec,
    source: Path,
    status: Status | None,
    root: Path,
    *,
    old: dict[str, Any] | None = None,
) -> Result:
    """Cleans, scales and writes one picture; returns its manifest entry."""
    problems: list[str] = []
    warnings: list[str] = []
    with Image.open(source) as im:
        im.load()
        native = im.convert("RGBA")
    arr = np.array(native)
    if spec.rule.alpha and not key.has_matte(arr):
        warnings.append("no transparent pixel: the matte was not cleared")
    cleaned, stats = key.clean_matte(
        arr, keep_fuchsia=spec.id.startswith(KEEP_FUCHSIA)
    )
    if stats["blob_after"]:
        problems.append(f"{stats['blob_after']} px of flat matte are left")
    image = Image.fromarray(cleaned)
    shipped, frame, (cols, rows) = ship_image(spec, image)
    if spec.rule.ship.opaque:
        shipped = shipped.convert("RGB")
    _save(shipped, root / spec.file, spec.rule.ship)
    word = (
        status.word if status else (old or {}).get("package_status", "draft")
    )
    note = status.note if status else (old or {}).get("note", "")
    st = spec.rule.status or _status_word(word)
    if status is None and old:
        st = old["status"]
    issues = tags_from_note(note, st) if st != "accepted" else []
    if spec.kind in ("tiles", "interior"):
        issues.append("mirrored_floor")
    entry: dict[str, Any] = {
        "id": spec.id,
        "kind": spec.kind,
        "file": spec.file,
        "size": list(shipped.size),
        "frame": list(frame),
        "frames": cols * rows,
        "cols": cols,
        "rows": rows,
    }
    labels = labels_for(spec, cols * rows)
    if labels:
        entry["labels"] = labels
    if spec.kind not in (
        "background",
        "card",
        "seamless",
        "tiles",
        "interior",
    ):
        scale = frame[0] / (arr.shape[1] / cols)
        info = analyse_cells(cleaned, cols, rows, scale)
        if info["empty"] and cols * rows > 1:
            entry["empty_frames"] = info["empty"]
        if info["cut"]:
            issues.append("cut_off")
            entry["cut_frames"] = info["cut"]
        if spec.kind in ("walk", "battle"):
            entry["feet"] = info["feet"]
            if spec.kind == "walk":
                ys = sorted(f[1] for f in info["feet"] if f[1])
                xs = sorted(f[0] for f in info["feet"] if f[0])
                entry["anchor"] = [
                    xs[len(xs) // 2] if xs else frame[0] / 2,
                    ys[len(ys) // 2] if ys else frame[1] * 0.9,
                ]
        if spec.kind in ("walk", "battle", "object"):
            entry["boxes"] = info["boxes"]
    if stats["pink_after"] >= PINK_TAG:
        issues.append("magenta")
    entry.update(
        pack=spec.pack,
        status=st,
        package_status=word,
        known_issues=sorted(set(issues)),
        importer=IMPORTER,
        source={
            "path": spec.rel,
            "name": source.name,
            "sha256": _sha(source),
            "size": list(native.size),
        },
        cleanup={
            k: int(stats[k])
            for k in ("pink_before", "pink_after", "blob_before", "blob_after")
        },
    )
    if st != "accepted" and note:
        entry["note"] = note[:300]
    if spec.chapter:
        entry["chapter"] = spec.chapter
    if old and old.get("lazy") is not None:
        entry["lazy"] = old["lazy"]
    return Result(entry, problems, warnings)


# ------------------------------------------------------------- icons, NPCs
def build_icons(entries: list[dict[str, Any]]) -> dict[str, Any]:
    """Item id -> frame of ``icon.items``; UI name -> frame of ``icon.ui``."""
    items = {}
    for item_id, name in ITEM_ICONS.items():
        items[item_id] = {
            "asset": "icon.items",
            "frame": ITEM_FRAMES.index(name),
        }
    ui = {
        n: {"asset": "icon.ui", "frame": i}
        for i, n in enumerate(UI_FRAMES)
        if n
    }
    return {"items": items, "ui": ui}


#: The shop's items that have an icon in ``icon.items`` (the others keep
#: their emoji): item id -> frame name.
ITEM_ICONS = {
    "magic_net": "net",
    "silver_net": "strong_net",
    "berry": "berry_red",
    "biscuit": "cookie",
    "pie": "cake_slice",
    "growth_tonic": "big_potion",
    "spring_tonic": "small_potion",
    "hint_feather": "feather",
    "clover": "clover",
    "owl_pass": "owl_wing",
    "explorer_map": "map_scroll",
    "badge_case": "medal_ribbon",
    "mystery_egg": "egg",
    "wake_berry": "berry_blue",
    "energy_berry": "berry_purple",
    "sunrise_berry": "berry_orange",
}


def person_key(e: dict[str, Any]) -> str | None:
    """The NPC sprite id of a walk or battle entry (None for others)."""
    parts = e["id"].split(".")
    if e["kind"] not in ("walk", "battle"):
        return None
    if parts[0] == "npc":
        return parts[1]
    if parts[0] == "chapter":
        return f"{parts[1]}_{parts[2]}"
    return None


def build_npcs(entries: list[dict[str, Any]]) -> dict[str, Any]:
    """The sprite registry: one record per person, from their sheets."""
    by_person: dict[str, dict[str, dict[str, Any]]] = {}
    for e in entries:
        k = person_key(e)
        if k:
            by_person.setdefault(k, {})[e["id"].rsplit(".", 1)[1]] = e
    icons = {e["id"]: e for e in entries if e["kind"] == "npc_icon"}
    out: dict[str, Any] = {}
    for k, sheets in sorted(by_person.items()):
        rec: dict[str, Any] = {
            "sheets": {s: e["id"] for s, e in sorted(sheets.items())},
            "pack": next(iter(sheets.values()))["pack"],
            "status": max(
                (e["status"] for e in sheets.values()), key=SEVERITY.get
            ),
            "sheet_status": {s: e["status"] for s, e in sheets.items()},
            "known_issues": sorted(
                {t for e in sheets.values() for t in e["known_issues"]}
            ),
        }
        walk: dict[str, Any] = {}
        for sheet, dirs in WALK_DIRS.items():
            if sheet in sheets:
                for r, d in enumerate(dirs):
                    walk[d] = {
                        "sheet": sheet,
                        "frames": [r * 3, r * 3 + 1, r * 3 + 2],
                    }
        if walk:
            a = sheets.get("map_a") or sheets["map_b"]
            rec["walk"] = walk
            rec["frame"] = a["frame"]
            rec["anchor"] = a["anchor"]
            rec["feet"] = {
                s: e["feet"]
                for s, e in sheets.items()
                if "feet" in e and s != "battle"
            }
        if "battle" in sheets:
            b = sheets["battle"]
            rec["battle"] = {
                "sheet": "battle",
                "frame": b["frame"],
                "back": 0,
                "front": 1,
                "feet": b["feet"],
            }
        icon_id = icon_id_for(k, sheets)
        if icon_id in icons:
            rec["icon"] = icon_id
        out[k] = rec
    return out


def icon_id_for(key_: str, sheets: dict[str, Any]) -> str:
    any_id = next(iter(sheets.values()))["id"].split(".")
    base = ".".join(any_id[:-1])
    return base + ".icon"


ICON = 128


def build_npc_icons(
    root: Path, entries: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """A face icon per person, cut from the shipped battle (or map) picture."""
    by_person: dict[str, dict[str, dict[str, Any]]] = {}
    for e in entries:
        k = person_key(e)
        if k:
            by_person.setdefault(k, {})[e["id"].rsplit(".", 1)[1]] = e
    made: list[dict[str, Any]] = []
    for k, sheets in sorted(by_person.items()):
        src = (
            sheets.get("battle") or sheets.get("map_a") or sheets.get("map_b")
        )
        assert src is not None
        path = root / src["file"]
        if not path.is_file():
            continue
        with Image.open(path) as im:
            im.load()
            img = im.convert("RGBA")
        fw, fh = src["frame"]
        # the front-view cell: battle frame 1; a walk sheet's standing front
        cell = 1 if "battle" in sheets else (1 if "map_a" in sheets else 4)
        cols = src["cols"]
        c, r = cell % cols, cell // cols
        tile = img.crop((c * fw, r * fh, (c + 1) * fw, (r + 1) * fh))
        a = np.array(tile)[..., 3] > 127
        if not a.any():
            continue
        yy, xx = np.nonzero(a)
        top, bottom = int(yy.min()), int(yy.max())
        side = max(8, round((bottom - top) * 0.42))
        head = a[top : top + side]
        cx = int(np.nonzero(head)[1].mean()) if head.any() else fw // 2
        left = min(max(0, cx - side // 2), max(0, fw - side))
        box = (left, top, left + side, top + side)
        face = tile.crop(box).resize((ICON, ICON), Image.LANCZOS)
        icon_id = icon_id_for(k, sheets)
        spec_file = _icon_file(icon_id)
        _save(face, root / spec_file, Ship(ICON, 88))
        made.append(
            {
                "id": icon_id,
                "kind": "npc_icon",
                "file": spec_file,
                "size": [ICON, ICON],
                "frame": [ICON, ICON],
                "frames": 1,
                "cols": 1,
                "rows": 1,
                "pack": src["pack"],
                "status": src["status"],
                "known_issues": [],
                "importer": IMPORTER,
                "derived_from": src["id"],
            }
        )
        if "chapter" in src:
            made[-1]["chapter"] = src["chapter"]
        if src.get("lazy") is not None:
            made[-1]["lazy"] = src["lazy"]
    return made


def _icon_file(icon_id: str) -> str:
    parts = icon_id.split(".")
    if parts[0] == "chapter":
        return f"art/chapters/{parts[1]}/{parts[2]}_icon.webp"
    return "art/" + "/".join(parts) + ".webp"


# ------------------------------------------------------------- the manifest
#: What an entry keeps in art/manifest_detail.json, not in manifest.json:
#: the app's start does not need it, and the manifest is bundled with it.
DETAIL = "art/manifest_detail.json"
DETAIL_KEYS = (
    "source",
    "cleanup",
    "boxes",
    "feet",
    "note",
    "package_status",
    "cut_frames",
)


def load_manifest(game: Path) -> dict[str, Any]:
    """
    art/manifest.json of the ``game`` directory (app/public/game), each
    art3 entry with its detail merged back in.
    """
    path = game / MANIFEST
    if not path.is_file():
        return {"version": art2.VERSION, "assets": []}
    manifest = json.loads(path.read_text(encoding="utf-8"))
    detail_path = game / DETAIL
    if detail_path.is_file():
        detail = json.loads(detail_path.read_text(encoding="utf-8"))
        for e in manifest["assets"]:
            e.update(detail.get(e["id"], {}))
    return manifest


def split_detail(
    manifest: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """(the manifest without the detail, the detail by id)."""
    detail: dict[str, Any] = {}
    slim = []
    for e in manifest["assets"]:
        if e.get("importer") != IMPORTER:
            slim.append(e)
            continue
        slim.append({k: v for k, v in e.items() if k not in DETAIL_KEYS})
        detail[e["id"]] = {k: e[k] for k in DETAIL_KEYS if k in e}
    return {**manifest, "assets": slim}, detail


#: The icons' own small file: the shop and the bag read it at the app's
#: start without the whole manifest.
ICONS_FILE = "art/icons.json"


def icons_doc(manifest: dict[str, Any]) -> dict[str, Any]:
    """Item and UI icon frames with the geometry of the two sheets."""
    by_id = {e["id"]: e for e in manifest["assets"]}
    sheets = {}
    for sid in ("icon.items", "icon.ui"):
        e = by_id.get(sid)
        if e:
            sheets[sid] = {
                k: e[k] for k in ("file", "frame", "cols", "rows", "status")
            }
    return {
        "drafts_enabled": manifest.get("drafts_enabled", True),
        "sheets": sheets,
        **manifest["icons"],
    }


def write_manifest(game: Path, manifest: dict[str, Any]) -> None:
    slim, detail = split_detail(manifest)
    (game / ICONS_FILE).write_text(
        json.dumps(icons_doc(manifest), ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )
    (game / MANIFEST).write_text(
        json.dumps(slim, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )
    (game / DETAIL).write_text(
        json.dumps(detail, ensure_ascii=False, indent=1, sort_keys=True)
        + "\n",
        encoding="utf-8",
    )


def finish(
    manifest: dict[str, Any], mine: list[dict[str, Any]], root: Path
) -> None:
    """Merges art3's entries and registries into the manifest and writes it."""
    others = [e for e in manifest["assets"] if e.get("importer") != IMPORTER]
    mine = [e for e in mine if e["kind"] != "npc_icon"]
    icons = build_npc_icons(root, mine)
    manifest["assets"] = sorted(others + mine + icons, key=lambda e: e["id"])
    manifest.setdefault("drafts_enabled", True)
    manifest["chapters_lazy"] = bool(manifest.get("chapters_lazy", False))
    manifest["icons"] = build_icons(mine)
    manifest["npc_sprites"] = build_npcs(mine + icons)
    manifest["issues"] = ISSUES
    write_manifest(root, manifest)


def mine_of(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    return [e for e in manifest["assets"] if e.get("importer") == IMPORTER]


# ------------------------------------------------------------- package trees
def scan(root: Path) -> dict[str, Path]:
    """The pictures of an extracted package: relative path -> file."""
    found: dict[str, Path] = {}
    for p in sorted(root.rglob("*.png")):
        spec = match_path(p.relative_to(root).as_posix())
        if spec:
            found[spec.rel] = p
    return found


def extract(src: Path, into: Path) -> Path:
    """A directory, or a zip extracted (safely) into ``into``."""
    if src.is_dir():
        return src
    if not zipfile.is_zipfile(src):
        raise ValueError(f"{src}: not a directory or a zip")
    base = into.resolve()
    total = 0
    with zipfile.ZipFile(src) as z:
        for info in z.infolist():
            name = PurePosixPath(info.filename)
            if info.is_dir():
                continue
            if name.is_absolute() or ".." in name.parts:
                raise ValueError(f"{src}: unsafe name {info.filename}")
            if name.suffix.lower() not in (".png", ".json", ".txt"):
                continue
            total += info.file_size
            if total > 2_000_000_000:
                raise ValueError(f"{src}: too big")
            target = (base / info.filename).resolve()
            if base not in target.parents:
                raise ValueError(f"{src}: unsafe name {info.filename}")
            target.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info) as fh, open(target, "wb") as out:
                shutil.copyfileobj(fh, out)
    return into


# ------------------------------------------------------------- first import
def import_package(
    package: Path,
    root: Path = ART,
    *,
    seamless: Path | None = None,
    chapters: str = "auto",
) -> dict[str, Any]:
    """Imports every picture of a package; returns the manifest."""
    status = read_status(package)
    files = scan(package)
    if seamless:
        for p in sorted(seamless.glob("*.png")):
            rel = f"seamless_tiles/{p.name}"
            if classify(rel):
                files[rel] = p
    manifest = load_manifest(root.parent)
    old = {e["id"]: e for e in mine_of(manifest)}
    for e in old.values():
        (root.parent / e["file"]).unlink(missing_ok=True)
    mine: list[dict[str, Any]] = []
    bad: list[str] = []
    for rel, path in sorted(files.items()):
        st = status.get(rel)
        spec = classify(rel, st.grid if st and st.grid else None)
        assert spec
        res = process(spec, path, st, root.parent, old=old.get(spec.id))
        mine.append(res.entry)
        bad += [f"{rel}: {p}" for p in res.problems]
    manifest["assets"] = [
        e for e in manifest["assets"] if e.get("importer") != IMPORTER
    ]
    # chapters: lazy when everything together is too big for the app
    total = sum((root.parent / e["file"]).stat().st_size for e in mine)
    lazy = chapters == "lazy" or (
        chapters == "auto" and total > CHAPTER_BUDGET
    )
    manifest["chapters_lazy"] = lazy
    for e in mine:
        if e.get("chapter"):
            e["lazy"] = lazy
    finish(manifest, mine, root.parent)
    if bad:
        print("warnings:\n  " + "\n  ".join(bad), file=sys.stderr)
    return load_manifest(root.parent)


# ------------------------------------------------------------- the update
@dataclass
class Change:
    kind: str  # new | replaced | status | unchanged
    spec: Spec
    path: Path
    old: dict[str, Any] | None
    size: tuple[int, int]
    status: Status | None
    notes: list[str] = field(default_factory=list)


def plan_update(
    manifest: dict[str, Any], tree: dict[str, Path], status: dict[str, Status]
) -> list[Change]:
    old = {e["source"]["path"]: e for e in mine_of(manifest) if "source" in e}
    changes: list[Change] = []
    for rel, path in sorted(tree.items()):
        st = status.get(rel)
        spec = classify(rel, st.grid if st and st.grid else None)
        assert spec
        with Image.open(path) as im:
            size = im.size
        e = old.get(rel)
        if e is None:
            kind = "new"
        elif e["source"]["sha256"] != _sha(path):
            kind = "replaced"
        elif st and (spec.rule.status or _status_word(st.word)) != e["status"]:
            kind = "status"
        else:
            kind = "unchanged"
        ch = Change(kind, spec, path, e, size, st)
        if e is not None and kind != "unchanged":
            if list(size) != e["source"]["size"]:
                ch.notes.append(f"size {e['source']['size']} -> {list(size)}")
            if st:
                new = spec.rule.status or _status_word(st.word)
                if new != e["status"]:
                    ch.notes.append(f"status {e['status']} -> {new}")
        changes.append(ch)
    return changes


def validate(ch: Change, *, allow_smaller: bool) -> list[str]:
    """What stops a file from replacing the old one."""
    out: list[str] = []
    try:
        with Image.open(ch.path) as im:
            im.load()
            rgba = np.array(im.convert("RGBA"))
    except Exception as exc:  # a broken PNG
        return [f"cannot read the picture: {exc}"]
    if ch.old is not None and not allow_smaller:
        ow, oh = ch.old["source"]["size"]
        if ch.size[0] < ow or ch.size[1] < oh:
            out.append(
                f"smaller than before ({ch.size[0]}x{ch.size[1]} < {ow}x{oh});"
                " use --allow-smaller if that is meant"
            )
    if ch.spec.rule.alpha and not key.has_matte(rgba):
        out.append("no transparent pixel (the background is not cleared)")
    cols, rows = native_frames(ch.spec, ch.size)
    if cols * rows > 1 and ch.old is not None:
        if [cols, rows] != [ch.old["cols"], ch.old["rows"]]:
            out.append("the atlas grid changed")
    return out


def apply_update(
    changes: list[Change], manifest: dict[str, Any], root: Path
) -> list[str]:
    """Writes the changed files; returns what went wrong (nothing written then)."""
    todo = [c for c in changes if c.kind != "unchanged"]
    problems: list[str] = []
    with tempfile.TemporaryDirectory(prefix="art3-stage-") as tmp:
        stage = Path(tmp)
        results: list[Result] = []
        for ch in todo:
            res = process(ch.spec, ch.path, ch.status, stage, old=ch.old)
            problems += [f"{ch.spec.rel}: {p}" for p in res.problems]
            results.append(res)
        if problems:
            return problems
        mine = {e["id"]: e for e in mine_of(manifest)}
        for res in results:
            e = res.entry
            if e["id"] in mine and "lazy" in mine[e["id"]]:
                e["lazy"] = mine[e["id"]]["lazy"]
            elif e.get("chapter"):
                e["lazy"] = bool(manifest.get("chapters_lazy"))
            mine[e["id"]] = e
            dest = root.parent / e["file"]
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(stage / e["file"]), dest)
    manifest["assets"] = [
        e for e in manifest["assets"] if e.get("importer") != IMPORTER
    ]
    finish(manifest, list(mine.values()), root.parent)
    return []


def format_plan(changes: list[Change]) -> str:
    lines = []
    for ch in changes:
        if ch.kind == "unchanged":
            continue
        extra = "; ".join(ch.notes)
        lines.append(
            f"  {ch.kind:9} {ch.spec.id:42} {ch.path.name}"
            + (f"  ({extra})" if extra else "")
        )
    n = sum(1 for c in changes if c.kind == "unchanged")
    head = f"{len(lines)} to change, {n} unchanged"
    return head + ("\n" + "\n".join(lines) if lines else "")


def update(
    sources: list[Path],
    root: Path = ART,
    *,
    dry_run: bool = False,
    allow_smaller: bool = False,
    out=print,
) -> int:
    """The replace flow: diff, validate, apply. Returns the exit code."""
    manifest = load_manifest(root.parent)
    if not mine_of(manifest):
        out("art/manifest.json has no art3 pictures: run --package first")
        return 2
    with tempfile.TemporaryDirectory(prefix="art3-pkg-") as tmp:
        tree: dict[str, Path] = {}
        status: dict[str, Status] = {}
        for i, src in enumerate(sources):
            base = extract(Path(src), Path(tmp) / f"p{i}")
            tree.update(scan(base))
            status.update(read_status(base))
        changes = plan_update(manifest, tree, status)
        out(format_plan(changes))
        bad = 0
        for ch in changes:
            if ch.kind == "unchanged":
                continue
            for p in validate(ch, allow_smaller=allow_smaller):
                out(f"  PROBLEM {ch.spec.id}: {p}")
                bad += 1
        if bad:
            out("nothing was changed")
            return 1
        if dry_run:
            out("dry run: nothing was changed")
            return 0
        errs = apply_update(changes, manifest, root)
        if errs:
            for e in errs:
                out(f"  PROBLEM {e}")
            out("nothing was changed")
            return 1
        n = sum(1 for c in changes if c.kind != "unchanged")
        out(f"done: {n} pictures written, manifest updated")
        return 0


# ------------------------------------------------------------- checks, report
def problems(manifest: dict[str, Any], root: Path = OUT) -> list[str]:
    """What is wrong with art3's entries and registries."""
    out: list[str] = []
    ids = {e["id"] for e in manifest["assets"]}
    for e in mine_of(manifest):
        if e["status"] not in STATUSES:
            out.append(f"{e['id']}: bad status {e['status']}")
        for t in e["known_issues"]:
            if t not in ISSUES:
                out.append(f"{e['id']}: unknown issue {t}")
        if not (root / e["file"]).is_file():
            out.append(f"{e['id']}: missing file {e['file']}")
        if e["kind"] == "npc_icon":
            continue
        if "source" not in e or "path" not in e["source"]:
            out.append(f"{e['id']}: no source path")
        for f in e.get("feet", []):
            if not (0 <= f[0] <= e["frame"][0] and 0 <= f[1] <= e["frame"][1]):
                out.append(f"{e['id']}: a foot is outside the frame")
        if e.get("lazy") and not e["file"].startswith("art/chapters/"):
            out.append(f"{e['id']}: lazy, but not in art/chapters/")
    for k, v in manifest.get("icons", {}).get("items", {}).items():
        if v["asset"] not in ids:
            out.append(f"icon of {k}: unknown asset")
    for k, rec in manifest.get("npc_sprites", {}).items():
        for sid in rec["sheets"].values():
            if sid not in ids:
                out.append(f"npc {k}: unknown sheet {sid}")
        if "icon" in rec and rec["icon"] not in ids:
            out.append(f"npc {k}: unknown icon")
    if "drafts_enabled" not in manifest:
        out.append("no drafts_enabled flag")
    return out


def report(manifest: dict[str, Any], root: Path = OUT) -> str:
    """A table of status per pack, and the bytes."""
    rows: dict[str, dict[str, Any]] = {}
    for e in mine_of(manifest):
        r = rows.setdefault(
            e["pack"],
            {
                "n": 0,
                "bytes": 0,
                "accepted": 0,
                "draft": 0,
                "needs_revision": 0,
            },
        )
        r["n"] += 1
        r["bytes"] += (root / e["file"]).stat().st_size
        r[e["status"]] += 1
    lines = [
        f"{'pack':12} {'files':>5} {'ok':>4} {'draft':>5} {'repair':>6} {'MB':>6}"
    ]
    for pack, r in sorted(rows.items()):
        lines.append(
            f"{pack:12} {r['n']:5} {r['accepted']:4} {r['draft']:5} "
            f"{r['needs_revision']:6} {r['bytes'] / 1e6:6.2f}"
        )
    tot = sum(r["bytes"] for r in rows.values())
    lines.append(
        f"{'total':12} {sum(r['n'] for r in rows.values()):5} {'':4} {'':5} {'':6} {tot / 1e6:6.2f}"
    )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--package", type=Path, help="the unzipped checkpoint")
    parser.add_argument("--seamless", type=Path, help="the seamless tiles")
    parser.add_argument(
        "--chapters", choices=("auto", "bundled", "lazy"), default="auto"
    )
    parser.add_argument(
        "--update", type=Path, nargs="+", help="new files: zips or directories"
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--allow-smaller", action="store_true")
    parser.add_argument("--report", action="store_true")
    args = parser.parse_args(argv)
    if args.update:
        return update(
            args.update, dry_run=args.dry_run, allow_smaller=args.allow_smaller
        )
    if args.package:
        manifest = import_package(
            args.package, seamless=args.seamless, chapters=args.chapters
        )
        print(report(manifest))
        return 0
    if args.report:
        print(report(load_manifest(OUT)))
        return 0
    parser.error("--package, --update or --report is required")
    return 2


if __name__ == "__main__":
    sys.exit(main())
