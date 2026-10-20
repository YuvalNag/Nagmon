# SPDX-License-Identifier: GPL-3.0
"""
HD twins of Tuxemon's UI images, without redrawing
(docs/kids/SDD_ANDROID.md §2.7).

Usage:
    python tools/art/upscale_ui.py [--only TEXT ...] [--out REPO]

Each image of ``twins()`` is made 4 times bigger and written to
mods/nagmon/ under the same path with ``@4x`` before the extension
(``gfx/borders/borders@4x.png``). The game takes the twin instead of
Tuxemon's image and scales it once, smoothly, to the screen
(``tuxemon/graphics.py``: ``fetch_hd_twin``).

How:
- **xBRZ** (``pixel_upscale.py``): the battle backgrounds, islands, HUDs,
  party trays and icons. An opaque image is framed by its own edge
  pixels, so its corners do not round into transparency.
- **Nine-slice borders**: xBRZ on a box of 5x5 slices, as a big box is
  drawn; each slice is taken where it repeats, so a side or the middle
  repeats without a notch. The outer corners round.
- **Gradients**: their stripes (a white row, a coloured row) are
  averaged two rows at a time and scaled smoothly: no stripes.

Fully clear pixels take the colour of the nearest visible one
(``bleed``), so smooth scaling in the game leaves no dark fringe.

The output depends only on the images: re-running gives the same files.
A development tool: it needs numpy, which the game itself never imports.
"""

from __future__ import annotations

import argparse
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pixel_upscale
import yaml
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
SOURCE_MOD = Path("mods/tuxemon")
OUT_MOD = Path("mods/nagmon")
K = 4
#: How far xBRZ looks past a pixel.
PAD = 2

#: Not named in an environment: the double-battle HUDs (BattleHudModel).
EXTRA_XBRZ = (
    "gfx/ui/combat/double_player.png",
    "gfx/ui/combat/double_opponent.png",
)


#: Not twinned: the party icons fade in through a colorkey
#: (``convert_alpha_to_colorkey``), and smooth edges turn magenta there.
SKIP_PREFIXES = ("gfx/ui/icons/party/",)


@dataclass(frozen=True)
class Twin:
    source: str  # relative to a mod: gfx/...
    method: str  # "xbrz", "nine_slice" or "gradient"

    @property
    def target(self) -> str:
        path = Path(self.source)
        return path.with_name(f"{path.stem}@{K}x{path.suffix}").as_posix()


def _strings(node: object) -> Iterable[str]:
    if isinstance(node, dict):
        for value in node.values():
            yield from _strings(value)
    elif isinstance(node, list):
        for value in node:
            yield from _strings(value)
    elif isinstance(node, str):
        yield node


def environment_images(repo: Path = REPO) -> list[str]:
    """Every image a battle environment names (backgrounds, HUD...)."""
    found: set[str] = set()
    for path in sorted(
        (repo / SOURCE_MOD / "db" / "environment").glob("*.yaml")
    ):
        data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        graphics = data.get("battle_graphics", {})
        found.update(
            s
            for s in _strings(graphics)
            if s.endswith(".png") and s.startswith("gfx/")
        )
    return sorted(found)


def twins(repo: Path = REPO) -> list[Twin]:
    """What gets an HD twin, and how."""
    src = repo / SOURCE_MOD
    out = [
        Twin(rel, "xbrz")
        for rel in sorted({*environment_images(repo), *EXTRA_XBRZ})
        if (src / rel).is_file() and not rel.startswith(SKIP_PREFIXES)
    ]
    out += [
        Twin(p.relative_to(src).as_posix(), "nine_slice")
        for p in sorted((src / "gfx" / "borders").glob("*.png"))
    ]
    out += [
        Twin(p.relative_to(src).as_posix(), "gradient")
        for p in sorted(
            (src / "gfx" / "ui" / "background").glob("gradient_*.png")
        )
        if Image.open(p).size == (256, 144)
    ]
    return out


# ------------------------------------------------------------ the methods


def rgba(path: Path) -> np.ndarray:
    with Image.open(path) as image:
        return np.array(image.convert("RGBA"))


def xbrz(image: np.ndarray, k: int = K) -> np.ndarray:
    """xBRZ; an opaque image framed by its own edge (no round corners)."""
    if (image[..., 3] == 255).all():
        padded = np.pad(image, ((PAD, PAD), (PAD, PAD), (0, 0)), mode="edge")
        big = pixel_upscale.scale(padded, k)
        return big[PAD * k : -PAD * k, PAD * k : -PAD * k]
    return pixel_upscale.scale(image, k)


#: Which slice (0, 1, 2) each of the five slices of a big box is.
BOX = (0, 1, 1, 1, 2)
#: Where in the big box each slice is taken: in the middle of its run.
TAKE = {0: 0, 1: 2, 2: 4}


def nine_slice(image: np.ndarray, k: int = K) -> np.ndarray:
    """A 3x3 border, scaled as the box it draws (see the module doc)."""
    h, w = image.shape[:2]
    th, tw = h // 3, w // 3
    if (th * 3, tw * 3) != (h, w):
        raise ValueError(f"a border must be 3x3 equal slices, not {w}x{h}")

    def cell(row: int, col: int) -> np.ndarray:
        return image[row * th : (row + 1) * th, col * tw : (col + 1) * tw]

    box = np.concatenate(
        [np.concatenate([cell(r, c) for c in BOX], axis=1) for r in BOX],
        axis=0,
    )
    big = pixel_upscale.scale(box, k)
    out = np.zeros((h * k, w * k, 4), dtype=np.uint8)
    for r in range(3):
        for c in range(3):
            y, x = TAKE[r] * th * k, TAKE[c] * tw * k
            out[
                r * th * k : (r + 1) * th * k, c * tw * k : (c + 1) * tw * k
            ] = big[y : y + th * k, x : x + tw * k]
    return out


def gradient(image: np.ndarray, k: int = K) -> np.ndarray:
    """The stripes averaged two rows at a time, then scaled smoothly."""
    h, w = image.shape[:2]
    even = image[: h - h % 2].astype(np.float32)
    pairs = (even[0::2] + even[1::2]) / 2
    small = Image.fromarray(np.round(pairs).astype(np.uint8), "RGBA")
    return np.array(small.resize((w * k, h * k), Image.BICUBIC))


def _neighbour(array: np.ndarray, dy: int, dx: int) -> np.ndarray:
    """``array`` moved so (y, x) holds (y + dy, x + dx); outside is 0."""
    out = np.zeros_like(array)
    h, w = array.shape[:2]
    ys = slice(max(0, -dy), h - max(0, dy))
    xs = slice(max(0, -dx), w - max(0, dx))
    yt = slice(max(0, dy), h - max(0, -dy))
    xt = slice(max(0, dx), w - max(0, -dx))
    out[ys, xs] = array[yt, xt]
    return out


def bleed(image: np.ndarray) -> np.ndarray:
    """
    Every fully clear pixel takes the colour of the nearest pixel that is
    not (its alpha stays 0). Smooth scaling mixes clear pixels into the
    edge; with their colour black, a HUD got a dark fringe.
    """
    out = image.copy()
    rgb = out[..., :3]
    known = image[..., 3] > 0
    if not known.any():
        return out
    while not known.all():
        grown = known.copy()
        for dy, dx in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            near = _neighbour(known, dy, dx)
            take = near & ~grown
            rgb[take] = _neighbour(rgb, dy, dx)[take]
            grown |= take
        if (grown == known).all():
            break
        known = grown
    return out


METHODS: dict[str, Callable[[np.ndarray], np.ndarray]] = {
    "xbrz": xbrz,
    "nine_slice": nine_slice,
    "gradient": gradient,
}


def make(twin: Twin, repo: Path = REPO, out: Path = REPO) -> Path:
    image = rgba(repo / SOURCE_MOD / twin.source)
    big = METHODS[twin.method](image)
    target = out / OUT_MOD / twin.target
    target.parent.mkdir(parents=True, exist_ok=True)
    if (big[..., 3] == 255).all():
        picture = Image.fromarray(big, "RGBA").convert("RGB")  # smaller
    else:
        picture = Image.fromarray(bleed(big), "RGBA")
    picture.save(target, optimize=True)
    return target


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--only", nargs="*", default=[])
    parser.add_argument("--out", type=Path, default=REPO)
    args = parser.parse_args()
    total = 0
    for twin in twins():
        if args.only and not any(text in twin.source for text in args.only):
            continue
        target = make(twin, out=args.out)
        total += target.stat().st_size
        print(
            f"{twin.method:10} {twin.target} {target.stat().st_size // 1024} KB"
        )
    print(f"total {total / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
