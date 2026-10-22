# SPDX-License-Identifier: GPL-3.0
"""The placeholder set: a flat stand-in for every picture of the manifest.

    python -m tools.app.placeholders            # write app/public/game/placeholders
    python -m tools.app.placeholders --check    # fail when they are not current

Slice A1 of docs/app/ART_DELIVERY.md. Every entry of ``art/manifest.json``
gets a PNG with the **same id's size, frame size and frame count** as the
real picture, so the code and the Phaser frame configs are identical for
both. The app shows a placeholder when the real file is not in the build
(``app/src/game/artSource.ts``), so the game never looks broken.

The look is flat shapes in a few colours (a paletted PNG, a few KB each):
bands for a backdrop, a rounded body for a creature, circles and a
rectangle for a person, a disc for a portrait, a rounded rectangle for a
UI piece, a growing and fading disc for an effect. They are drawn from
the entry's geometry and a colour picked from its id, **not** from the
family's pictures, so they hold no likeness of anyone. The credits list
them as "Nagmon placeholders (GPL-3.0)".

The generator reads only the manifest, so it runs without the real art
(a public CI build, or a synthetic test set with another ``seed``).
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
from pathlib import Path, PurePosixPath
from typing import Any

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[2]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))
from tools.app.common import OUT  # noqa: E402

DIR = "placeholders"
MANIFEST = "art/manifest.json"
#: All the placeholders together (the whole set, lazy chapters too).
BUDGET = 1_200_000

#: A colour per zone or subject word found in an id; else one per pack.
KEYS = {
    "moon": (118, 134, 168),
    "sun": (236, 160, 60),
    "rocky": (176, 112, 84),
    "giants": (72, 150, 160),
    "outer": (100, 96, 176),
    "hearthrock": (96, 160, 96),
    "night": (52, 60, 110),
    "math": (84, 132, 214),
    "geometry": (150, 104, 200),
    "hebrew": (218, 96, 96),
    "english": (96, 174, 120),
    "science": (62, 170, 170),
    "logic": (210, 150, 70),
}
SPARE = (
    (196, 120, 120),
    (120, 160, 200),
    (160, 190, 110),
    (200, 170, 100),
    (150, 130, 190),
    (110, 180, 170),
)
INK = (44, 38, 56)
WHITE = (250, 248, 242)

#: Kinds drawn without a see-through background.
OPAQUE = {
    "backdrop",
    "story",
    "title",
    "card",
    "background",
    "interior",
    "seamless",
    "tiles",
}
#: Whole-picture UI pieces.
PIECES = {"ui"}
#: Kinds whose frames are people or animals.
FIGURES = {
    "walk",
    "battle",
    "npc",
    "pose",
    "npc_icon",
    "cat",
    "enemy_parts",
    "avatar",
    "creature",
}


def placeholder_path(file: str) -> str:
    """Where the placeholder of a picture is, under ``game/``."""
    return f"{DIR}/{PurePosixPath(file).with_suffix('.png').as_posix()}"


def _colour(entry: dict[str, Any], seed: int) -> tuple[int, int, int]:
    low = entry["id"].lower() + " " + entry["file"].lower()
    for word, rgb in KEYS.items():
        if word in low:
            return rgb
    pack = str(entry.get("pack", entry["kind"]))
    digest = hashlib.sha256(f"{seed}:{pack}".encode()).digest()
    return SPARE[digest[0] % len(SPARE)]


def _mix(a: tuple[int, int, int], b: tuple[int, int, int], t: float):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


class Painter:
    """A paletted canvas: 0 background, 1 base, 2 dark, 3 light, 4 ink, 5 white."""

    BG, BASE, DARK, LIGHT, INK_, WHITE_ = range(6)

    def __init__(
        self,
        size: tuple[int, int],
        rgb: tuple[int, int, int],
        *,
        bg: tuple[int, int, int] | None,
    ) -> None:
        self.image = Image.new("P", size, 0)
        colours = [
            bg or (0, 0, 0),
            rgb,
            _mix(rgb, (0, 0, 0), 0.35),
            _mix(rgb, WHITE, 0.55),
            INK,
            WHITE,
        ]
        flat = [c for rgb_ in colours for c in rgb_]
        self.image.putpalette(flat)
        self.draw = ImageDraw.Draw(self.image)
        self.transparent = bg is None

    def save(self) -> bytes:
        buf = io.BytesIO()
        extra = {"transparency": 0} if self.transparent else {}
        self.image.save(buf, "PNG", optimize=True, **extra)
        return buf.getvalue()


def _cell(x: int, y: int, w: int, h: int) -> tuple[int, int, int, int]:
    return (x, y, x + w - 1, y + h - 1)


def _scene(p: Painter, box: tuple[int, int, int, int]) -> None:
    """Three bands: sky, far ground, near ground."""
    x0, y0, x1, y1 = box
    h = y1 - y0 + 1
    p.draw.rectangle((x0, y0, x1, y0 + h * 55 // 100), fill=Painter.LIGHT)
    p.draw.rectangle(
        (x0, y0 + h * 55 // 100 + 1, x1, y0 + h * 80 // 100), fill=Painter.BASE
    )
    p.draw.rectangle((x0, y0 + h * 80 // 100 + 1, x1, y1), fill=Painter.DARK)


def _blob(p: Painter, box: tuple[int, int, int, int], step: int = 0) -> None:
    """A rounded body with two eyes (a creature)."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0 + 1, y1 - y0 + 1
    pad = max(2, min(w, h) // 8)
    p.draw.ellipse(
        (x0 + pad, y0 + pad * 2, x1 - pad, y1 - pad), fill=Painter.BASE
    )
    r = max(2, min(w, h) // 14)
    ey = y0 + h * 2 // 5
    for ex in (x0 + w * 2 // 5, x0 + w * 3 // 5):
        p.draw.ellipse((ex - r, ey - r, ex + r, ey + r), fill=Painter.INK_)


def _person(p: Painter, box: tuple[int, int, int, int], step: int = 0) -> None:
    """A head (circle) on a body (rounded rectangle) with two feet."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0 + 1, y1 - y0 + 1
    cx = x0 + w // 2
    u = min(w, h // 2)
    head = max(3, u * 3 // 10)
    top = y0 + h // 8
    p.draw.ellipse(
        (cx - head, top, cx + head, top + 2 * head), fill=Painter.LIGHT
    )
    bw = u * 4 // 10
    by = top + 2 * head + 1
    p.draw.rounded_rectangle(
        (cx - bw, by, cx + bw, by + h * 3 // 8),
        radius=max(2, bw // 2),
        fill=Painter.BASE,
    )
    fy = by + h * 3 // 8 + 1
    lift = (step % 3 - 1) * max(1, h // 40)
    p.draw.rectangle(
        (cx - bw, fy, cx - bw // 4, min(y1, fy + h // 8) + lift),
        fill=Painter.DARK,
    )
    p.draw.rectangle(
        (cx + bw // 4, fy, cx + bw, min(y1, fy + h // 8) - lift),
        fill=Painter.DARK,
    )


def _disc(p: Painter, box: tuple[int, int, int, int], step: int = 0) -> None:
    """A disc with a face (a portrait)."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0 + 1, y1 - y0 + 1
    pad = max(2, min(w, h) // 10)
    p.draw.ellipse(
        (x0 + pad, y0 + pad, x1 - pad, y1 - pad), fill=Painter.LIGHT
    )
    r = max(2, min(w, h) // 16)
    for ex in (x0 + w * 2 // 5, x0 + w * 3 // 5):
        p.draw.ellipse(
            (ex - r, y0 + h * 2 // 5 - r, ex + r, y0 + h * 2 // 5 + r),
            fill=Painter.INK_,
        )
    p.draw.arc(
        (
            x0 + w * 3 // 10,
            y0 + h * 4 // 10,
            x1 - w * 3 // 10,
            y0 + h * 7 // 10,
        ),
        20,
        160,
        fill=Painter.INK_,
        width=max(1, r // 2),
    )


def _glow(
    p: Painter, box: tuple[int, int, int, int], step: int, frames: int
) -> None:
    """A disc that grows and thins out over the frames (an effect)."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0 + 1, y1 - y0 + 1
    t = (step + 1) / max(1, frames)
    r = int(min(w, h) * (0.12 + 0.34 * t))
    cx, cy = x0 + w // 2, y0 + h // 2
    p.draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=Painter.BASE)
    r2 = r // 3
    p.draw.ellipse((cx - r2, cy - r2, cx + r2, cy + r2), fill=Painter.LIGHT)


def _plaque(p: Painter, box: tuple[int, int, int, int], step: int = 0) -> None:
    """A rounded rectangle (a UI piece, a prop, a tile)."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0 + 1, y1 - y0 + 1
    pad = max(1, min(w, h) // 12)
    p.draw.rounded_rectangle(
        (x0 + pad, y0 + pad, x1 - pad, y1 - pad),
        radius=max(2, min(w, h) // 5),
        fill=Painter.BASE,
    )


def _draw_frame(
    p: Painter, entry: dict[str, Any], box: tuple[int, int, int, int], i: int
) -> None:
    kind = entry["kind"]
    if kind in OPAQUE and entry["id"] != "logo":
        if entry["frames"] > 1:
            _plaque(p, box)
        else:
            _scene(p, box)
    elif kind == "effect":
        _glow(p, box, i, entry["frames"])
    elif kind == "portrait":
        _disc(p, box, i)
    elif kind in FIGURES:
        _person(p, box, i)
    else:
        _plaque(p, box)


def make(entry: dict[str, Any], seed: int = 0) -> bytes:
    """The PNG of one entry's placeholder."""
    w, h = entry["size"]
    fw, fh = entry["frame"]
    rgb = _colour(entry, seed)
    kind = entry["kind"]
    additive = entry.get("blend") == "add"
    opaque = kind in OPAQUE and entry["id"] != "logo"
    if additive:
        bg: tuple[int, int, int] | None = (0, 0, 0)
    else:
        bg = _mix(rgb, WHITE, 0.8) if opaque else None
    p = Painter((w, h), rgb, bg=bg)
    if kind == "creature":
        for name, rect in entry.get("regions", {}).items():
            x, y, rw, rh = rect
            box = _cell(x, y, rw, rh)
            if name.startswith("menu"):
                _disc(p, box)
            else:
                _blob(p, box)
        return p.save()
    cols = entry["cols"]
    for i in range(entry["frames"]):
        box = _cell((i % cols) * fw, (i // cols) * fh, fw, fh)
        _draw_frame(p, entry, box, i)
    return p.save()


def generate(manifest: dict[str, Any], seed: int = 0) -> dict[str, bytes]:
    """``{path under game/: PNG bytes}`` for every entry of the manifest."""
    out: dict[str, bytes] = {}
    for e in manifest["assets"]:
        path = placeholder_path(e["file"])
        if path in out:
            raise ValueError(f"two pictures share the placeholder {path}")
        out[path] = make(e, seed)
    return out


def write(manifest: dict[str, Any], root: Path = OUT, seed: int = 0) -> int:
    """Writes the set under ``root`` (removing what is no longer listed)."""
    files = generate(manifest, seed)
    base = root / DIR
    for old in base.rglob("*.png") if base.is_dir() else []:
        if old.relative_to(root).as_posix() not in files:
            old.unlink()
    for rel, data in files.items():
        target = root / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.is_file() or target.read_bytes() != data:
            target.write_bytes(data)
    return sum(len(d) for d in files.values())


def problems(manifest: dict[str, Any], root: Path = OUT) -> list[str]:
    """What is wrong with the committed set: a missing, extra or mis-sized file, or the budget."""
    out: list[str] = []
    want: set[str] = set()
    total = 0
    for e in manifest["assets"]:
        rel = placeholder_path(e["file"])
        want.add(rel)
        path = root / rel
        if not path.is_file():
            out.append(f"missing placeholder {rel}")
            continue
        total += path.stat().st_size
        with Image.open(path) as im:
            if list(im.size) != e["size"]:
                out.append(f"{rel}: size {list(im.size)} != {e['size']}")
    base = root / DIR
    for p in sorted(base.rglob("*")) if base.is_dir() else []:
        rel = p.relative_to(root).as_posix()
        if p.is_file() and rel not in want:
            out.append(f"not in the manifest: {rel}")
    if total > BUDGET:
        out.append(f"placeholders are {total} bytes, over the {BUDGET} budget")
    return out


def build(out: Any, manifest: dict[str, Any]) -> dict[str, Any]:
    """Validates the committed set and registers it in the build."""
    bad = problems(manifest)
    if bad:
        raise ValueError("placeholders: " + "; ".join(bad[:8]))
    total = 0
    for e in manifest["assets"]:
        rel = placeholder_path(e["file"])
        out.add_copy(rel, OUT / rel, "placeholder")
        total += (OUT / rel).stat().st_size
    return {"placeholders": len(manifest["assets"]), "bytes": total}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    manifest = json.loads((OUT / MANIFEST).read_text("utf-8"))
    if args.check:
        bad = problems(manifest)
        print("\n".join(bad) if bad else "placeholders are current")
        return 1 if bad else 0
    n = write(manifest)
    print(f"{len(manifest['assets'])} placeholders, {n / 1e6:.3f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
