# SPDX-License-Identifier: GPL-3.0
"""
Smoother world tiles without redrawing (docs/kids/SDD_ART.md §2.11).

Usage:
    python tools/art/upscale_tiles.py [--only NAME ...] [--k 4]
        [--out REPO]

Each Tuxemon tileset of TILESETS is scaled k times with xBRZ
(``pixel_upscale.py``) and written to mods/nagmon/gfx/tilesets/ under
the same file name, so the game finds it before Tuxemon's (mod order).
The game sees a sheet k times its TSX size and scales each tile once to
the screen (tuxemon/graphics.py).

**Seams.** xBRZ looks two pixels past a tile's edge. On the sheet those
pixels belong to whatever tile sits next to it there, which is often not
what sits next to it on a map (a fence next to its end piece), and the
tile edges come out notched. So every tile is scaled on its own, in a
two-pixel frame: on each side and corner, the neighbour the maps use
most there (every TMX in mods/*/maps, same layer); a tile no map uses
keeps its neighbours from the sheet. The output depends only on the
sheets and the maps: re-running the tool gives the same files.

A development tool: it needs numpy, which the game itself never imports.
"""

from __future__ import annotations

import argparse
import base64
import gzip
import zlib
from collections import Counter, defaultdict
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path
from xml.etree import ElementTree

import numpy as np
import pixel_upscale
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
TSX_DIR = Path("mods/tuxemon/gfx/tilesets")
OUT_DIR = Path("mods/nagmon/gfx/tilesets")
MAP_DIRS = (Path("mods/tuxemon/maps"), Path("mods/nagmon/maps"))

#: Hearthrock, Route 1 and the two academies use the first eight; the
#: stairs are in the houses next to them. Together: every core_* sheet.
TILESETS = (
    "core_city_and_country",
    "core_outdoor",
    "core_set pieces",
    "core_buildings",
    "core_outdoor_water",
    "core_outdoor_nature",
    "core_indoor_floors",
    "core_indoor_walls",
    "core_indoor_stairs",
)

#: 64 pixels a tile: the phone (scale 7) enlarges it 1.75 times, smoothly.
K = 4
#: How far xBRZ looks past a pixel.
PAD = 2

FLIP_H = 1 << 31
FLIP_V = 1 << 30
FLIP_D = 1 << 29
GID_MASK = 0x0FFFFFFF

#: (dx, dy) of the eight neighbours.
DIRECTIONS = tuple(
    (dx, dy) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dx, dy) != (0, 0)
)

#: A tile on a map: (tileset name, tile id, flip flags); None is empty.
Tile = tuple[str, int, int]
Key = tuple[str, int, tuple[int, int]]
PixelsOf = Callable[[str, int], np.ndarray]


@dataclass(frozen=True)
class Tileset:
    name: str
    image: Path
    tile: int  # width = height
    columns: int
    count: int
    size: tuple[int, int]  # the image size the TSX states
    #: tile id -> the tile ids of its animation frames
    frames: dict[int, tuple[int, ...]]


def read_tileset(tsx: Path) -> Tileset:
    root = ElementTree.parse(tsx).getroot()
    image = root.find("image")
    if image is None:
        raise ValueError(f"{tsx}: no image")
    width = int(root.get("tilewidth", 0))
    if width != int(root.get("tileheight", 0)):
        raise ValueError(f"{tsx}: tiles must be square")
    frames = {}
    for tile in root.findall("tile"):
        anim = tile.find("animation")
        if anim is not None:
            frames[int(tile.get("id", 0))] = tuple(
                int(f.get("tileid", 0)) for f in anim.findall("frame")
            )
    return Tileset(
        name=tsx.stem,
        image=tsx.parent / image.get("source", ""),
        tile=width,
        columns=int(root.get("columns", 0)),
        count=int(root.get("tilecount", 0)),
        size=(int(image.get("width", 0)), int(image.get("height", 0))),
        frames=frames,
    )


def load_rgba(path: Path) -> np.ndarray:
    """A sheet as RGBA; every fully transparent pixel is (0, 0, 0, 0)."""
    with Image.open(path) as image:
        rgba = np.array(image.convert("RGBA"))
    rgba[rgba[..., 3] == 0] = 0
    return rgba


def load_png(path: Path) -> np.ndarray:
    with Image.open(path) as image:
        return np.array(image.convert("RGBA"))


class Sheets:
    """The Tuxemon tilesets, read when first asked for."""

    def __init__(self, repo: Path = REPO) -> None:
        self.dir = repo / TSX_DIR
        self._tilesets: dict[str, Tileset] = {}
        self._images: dict[str, np.ndarray] = {}

    def names(self) -> list[str]:
        return sorted(p.stem for p in self.dir.glob("*.tsx"))

    def tileset(self, name: str) -> Tileset:
        if name not in self._tilesets:
            self._tilesets[name] = read_tileset(self.dir / f"{name}.tsx")
        return self._tilesets[name]

    def image(self, name: str) -> np.ndarray:
        if name not in self._images:
            self._images[name] = load_rgba(self.tileset(name).image)
        return self._images[name]

    def pixels(self, name: str, tid: int) -> np.ndarray:
        return tile_pixels(self.image(name), self.tileset(name), tid)

    def frames(self) -> dict[str, dict[int, tuple[int, ...]]]:
        return {name: self.tileset(name).frames for name in self.names()}


def tile_pixels(sheet: np.ndarray, ts: Tileset, tid: int) -> np.ndarray:
    t = ts.tile
    y, x = divmod(tid, ts.columns)
    return sheet[y * t : (y + 1) * t, x * t : (x + 1) * t]


# ------------------------------------------------------------ the maps


def _layer_gids(layer: ElementTree.Element) -> np.ndarray:
    data = layer.find("data")
    if data is None or data.text is None:
        raise ValueError("a layer without data")
    width, height = int(layer.get("width", 0)), int(layer.get("height", 0))
    encoding = data.get("encoding")
    if encoding == "csv":
        values = [int(v) for v in data.text.replace("\n", "").split(",")]
        gids = np.array(values, dtype=np.uint32)
    elif encoding == "base64":
        raw = base64.b64decode(data.text.strip())
        compression = data.get("compression")
        if compression == "zlib":
            raw = zlib.decompress(raw)
        elif compression == "gzip":
            raw = gzip.decompress(raw)
        elif compression:
            raise ValueError(f"unknown compression {compression}")
        gids = np.frombuffer(raw, dtype="<u4")
    else:
        raise ValueError(f"unknown layer encoding {encoding}")
    return gids.reshape(height, width)


def read_map(tmx: Path) -> tuple[list[tuple[int, str]], list[np.ndarray]]:
    """(firstgid, tileset name) in order, and the gids of each tile layer.
    A tileset inside the TMX (no source) has the name ""."""
    root = ElementTree.parse(tmx).getroot()
    tilesets = sorted(
        (int(ts.get("firstgid", 0)), Path(ts.get("source", "")).stem)
        for ts in root.findall("tileset")
    )
    layers = [_layer_gids(layer) for layer in root.iter("layer")]
    return tilesets, layers


def _decode(gid: int, tilesets: list[tuple[int, str]]) -> Tile | None:
    flags = gid & (FLIP_H | FLIP_V | FLIP_D)
    gid &= GID_MASK
    if gid == 0:
        return None
    first, name = max((f, n) for f, n in tilesets if f <= gid)
    return (name, gid - first, flags)


def neighbour_counts(
    maps: Iterable[Path], frames: dict[str, dict[int, tuple[int, ...]]]
) -> dict[Key, Counter]:
    """
    How often each unflipped tile has each neighbour, per direction, on
    the same layer. An animated tile counts frame by frame: frame i next
    to frame i of an animated neighbour with as many frames, otherwise
    next to the neighbour's first frame. Tilesets not in ``frames`` (one
    inside a TMX) are not counted.
    """
    counts: dict[Key, Counter] = defaultdict(Counter)

    def shown(tile: Tile | None, index: int, of: int) -> Tile | None:
        if tile is None:
            return None
        anim = frames[tile[0]].get(tile[1])
        if not anim:
            return tile
        return (tile[0], anim[index if len(anim) == of else 0], tile[2])

    for tmx in maps:
        tilesets, layers = read_map(tmx)
        decoded: dict[int, Tile | None] = {}

        def tile_at(gid: int) -> Tile | None:
            if gid not in decoded:
                decoded[gid] = _decode(gid, tilesets)
            return decoded[gid]

        for gids in layers:
            h, w = gids.shape
            for y, x in zip(*np.nonzero(gids)):
                tile = tile_at(int(gids[y, x]))
                if tile is None or tile[2] or tile[0] not in frames:
                    continue
                anim = frames[tile[0]].get(tile[1]) or (tile[1],)
                for d in DIRECTIONS:
                    nx, ny = x + d[0], y + d[1]
                    if not (0 <= nx < w and 0 <= ny < h):
                        continue
                    near = tile_at(int(gids[ny, nx]))
                    if near is not None and near[0] not in frames:
                        continue
                    for i, tid in enumerate(anim):
                        counts[(tile[0], tid, d)][
                            shown(near, i, len(anim))
                        ] += 1
    return counts


def _order(tile: Tile | None) -> tuple:
    return ("",) if tile is None else tile


def choose_neighbours(counts: dict[Key, Counter]) -> dict[Key, Tile | None]:
    """The neighbour the maps use most; a tie goes to the smallest."""
    return {
        key: min(c.items(), key=lambda kv: (-kv[1], _order(kv[0])))[0]
        for key, c in counts.items()
    }


def all_maps(repo: Path = REPO) -> list[Path]:
    return sorted(tmx for d in MAP_DIRS for tmx in (repo / d).glob("*.tmx"))


def neighbours(repo: Path, sheets: Sheets) -> dict[Key, Tile | None]:
    return choose_neighbours(neighbour_counts(all_maps(repo), sheets.frames()))


# --------------------------------------------------------- the scaling


def flipped(pixels: np.ndarray, flags: int) -> np.ndarray:
    """A tile as Tiled shows it with these flip flags."""
    if flags & FLIP_D:
        pixels = pixels.transpose(1, 0, 2)
    if flags & FLIP_H:
        pixels = pixels[:, ::-1]
    if flags & FLIP_V:
        pixels = pixels[::-1]
    return pixels


def _span(d: int, t: int, p: int) -> tuple[int, int, int, int]:
    """Along one axis: where in the frame, and which part of the
    neighbour, for a neighbour at offset d."""
    if d < 0:
        return 0, p, t - p, t
    if d > 0:
        return t + p, t + 2 * p, 0, p
    return p, t + p, 0, t


def framed_tiles(
    ts: Tileset,
    sheet: np.ndarray,
    chosen: dict[Key, Tile | None],
    pixels_of: PixelsOf,
) -> np.ndarray:
    """
    Every tile of the sheet in a PAD-pixel frame: its neighbours on the
    sheet, except on each side where the maps choose one.
    Returns (count, t + 2 PAD, t + 2 PAD, 4).
    """
    t, p = ts.tile, PAD
    rows = ts.count // ts.columns
    grid = sheet[: rows * t, : ts.columns * t]
    padded = np.pad(grid, ((p, p), (p, p), (0, 0)))
    out = np.empty((ts.count, t + 2 * p, t + 2 * p, 4), np.uint8)
    empty = np.zeros((t, t, 4), np.uint8)
    for tid in range(ts.count):
        y, x = divmod(tid, ts.columns)
        out[tid] = padded[y * t : y * t + t + 2 * p, x * t : x * t + t + 2 * p]
        for d in DIRECTIONS:
            key = (ts.name, tid, d)
            if key not in chosen:
                continue
            n = chosen[key]
            block = (
                empty if n is None else flipped(pixels_of(n[0], n[1]), n[2])
            )
            y0, y1, ny0, ny1 = _span(d[1], t, p)
            x0, x1, nx0, nx1 = _span(d[0], t, p)
            out[tid, y0:y1, x0:x1] = block[ny0:ny1, nx0:nx1]
    return out


def bleed(rgba: np.ndarray, steps: int = 2) -> np.ndarray:
    """
    Fully transparent pixels next to visible ones (up to ``steps`` away)
    take their colour and stay transparent: the game's smooth scaling
    then blends no black into the edges of trees and roofs.
    """
    out = rgba.copy()
    known = out[..., 3] > 0
    for _ in range(steps):
        before, colour = known.copy(), out[..., :3].copy()
        for dy, dx in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            # the neighbour at (y + dy, x + dx)
            src = (
                slice(max(dy, 0), out.shape[0] + min(dy, 0)),
                slice(max(dx, 0), out.shape[1] + min(dx, 0)),
            )
            dst = (
                slice(max(-dy, 0), out.shape[0] + min(-dy, 0)),
                slice(max(-dx, 0), out.shape[1] + min(-dx, 0)),
            )
            take = before[src] & ~known[dst]
            out[..., :3][dst][take] = colour[src][take]
            known[dst] |= take
    return out


def upscale(
    name: str,
    k: int,
    chosen: dict[Key, Tile | None],
    sheets: Sheets,
    batch: int = 512,
) -> np.ndarray:
    """The HD sheet of tileset ``name``: exactly k times its TSX size."""
    ts = sheets.tileset(name)
    sheet = sheets.image(name)
    t, p = ts.tile, PAD
    w, h = ts.size
    if sheet.shape[:2] != (h, w):
        raise ValueError(f"{name}: the image is not the size in the TSX")
    # Outside the tile grid (core_buildings is 47.5 tiles wide) nothing
    # is ever shown: plain nearest.
    out = np.repeat(np.repeat(sheet, k, 0), k, 1)
    framed = framed_tiles(ts, sheet, chosen, sheets.pixels)
    for start in range(0, ts.count, batch):
        part = pixel_upscale.scale(framed[start : start + batch], k)
        inner = part[:, p * k : (p + t) * k, p * k : (p + t) * k]
        for i, tile in enumerate(inner, start):
            y, x = divmod(i, ts.columns)
            out[y * t * k : (y + 1) * t * k, x * t * k : (x + 1) * t * k] = (
                tile
            )
    return bleed(out)


def output_path(name: str, repo: Path = REPO) -> Path:
    return repo / OUT_DIR / f"{name}.png"


def save(rgba: np.ndarray, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(path, compress_level=9)


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--only", nargs="*", default=())
    parser.add_argument("--k", type=int, default=K)
    parser.add_argument(
        "--out", type=Path, default=REPO, help="write under this folder"
    )
    args = parser.parse_args(argv)
    sheets = Sheets(REPO)
    chosen = neighbours(REPO, sheets)
    for name in tuple(args.only) or TILESETS:
        rgba = upscale(name, args.k, chosen, sheets)
        path = output_path(name, args.out)
        save(rgba, path)
        print(f"{path}: {rgba.shape[1]}x{rgba.shape[0]}")


if __name__ == "__main__":
    main()
