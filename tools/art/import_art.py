# SPDX-License-Identifier: GPL-3.0
"""
Turns a generated art sheet into game-size PNGs (docs/kids/SDD_ART.md).

Usage:
    python tools/art/import_art.py [--only NAME ...] [--preview DIR]
        [--intro] [--manifest tools/art/manifest.yaml]
        [--sources art_sources] [--out REPO]

Every entry of the manifest names a source sheet, a layout and, for each
cell of the layout, an approximate box on the sheet. The tool keys out
the background (a drawn checkerboard or flat #FF00FF), finds the sprite
inside each box by connected components, crops it, scales it into its
cell (an average over the opaque pixels with hard edges: pixel art stays
sharp, the JPEG noise goes) and writes the sheet where the game finds
it. ``--preview`` also saves a 4x picture of every
result on a contrasting background, to look at before using it.

A development tool: it needs numpy and scipy, which the game itself
never imports.
"""

from __future__ import annotations

import argparse
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import yaml
from PIL import Image
from scipy import ndimage

REPO = Path(__file__).resolve().parents[2]
MANIFEST = Path(__file__).with_name("manifest.yaml")
SOURCES = REPO / "art_sources"

Box = tuple[int, int, int, int]  # x0, y0, x1, y1 (x1, y1 exclusive)

MAGENTA = (255, 0, 255)


@dataclass(frozen=True)
class Cell:
    """Where a part goes on the output sheet, and how it sits there."""

    x: int
    y: int
    w: int
    h: int
    #: Parts with the same group share one scale (front and back of a
    #: monster stay the same size).
    group: str = ""
    align: str = "bottom"  # bottom | center


@dataclass(frozen=True)
class Layout:
    size: tuple[int, int]
    cells: Mapping[str, Cell]


#: Tuxemon's monster sheet: front and back 64x64 on top, two 24x24 menu
#: frames below (MonsterSpritesModel in tuxemon/db.py).
MONSTER = Layout(
    (128, 88),
    {
        "front": Cell(0, 0, 64, 64, "battle"),
        "back": Cell(64, 0, 64, 64, "battle"),
        "menu1": Cell(0, 64, 24, 24, "menu"),
        "menu2": Cell(24, 64, 24, 24, "menu"),
    },
)

#: An NPC's combat sheet: back on the left, front on the right
#: (tuxemon/entity/sheet.py).
COMBAT = Layout(
    (128, 64),
    {
        "back": Cell(0, 0, 64, 64, "battle"),
        "front": Cell(64, 0, 64, 64, "battle"),
    },
)

LAYOUTS: dict[str, Layout] = {"monster": MONSTER, "combat": COMBAT}


def single(width: int, height: int, align: str = "center") -> Layout:
    """One picture filling the whole output (an icon, a portrait)."""
    return Layout(
        (width, height), {"image": Cell(0, 0, width, height, "", align)}
    )


# ---------------------------------------------------------------- keying


@dataclass(frozen=True)
class Background:
    """``checker`` with its two greys, or flat ``magenta``."""

    kind: str
    greys: tuple[int, ...] = ()


def _rgb(image: Image.Image | np.ndarray) -> np.ndarray:
    if isinstance(image, Image.Image):
        image = np.asarray(image.convert("RGB"))
    return image.astype(np.int16)


def magenta_mask(rgb: np.ndarray, tol: int = 90) -> np.ndarray:
    """True where the pixel is (JPEG-blurred) #FF00FF."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (r > 255 - tol) & (b > 255 - tol) & (g < tol) & (abs(r - b) < tol)


def detect_background(image: Image.Image | np.ndarray) -> Background:
    """
    Reads the background from the sheet's outer border: flat magenta, or
    the two greys of a drawn checkerboard.
    """
    rgb = _rgb(image)
    edge = np.concatenate(
        [
            rgb[:4].reshape(-1, 3),
            rgb[-4:].reshape(-1, 3),
            rgb[:, :4].reshape(-1, 3),
            rgb[:, -4:].reshape(-1, 3),
        ]
    )
    if magenta_mask(edge).mean() > 0.5:
        return Background("magenta")
    value = edge.max(1)
    grey = value[(edge.max(1) - edge.min(1)) < 16]
    hist = np.bincount(grey, minlength=256).astype(float)
    hist = np.convolve(hist, np.ones(5), mode="same")
    first = int(hist.argmax())
    far = hist.copy()
    far[max(0, first - 24) : first + 25] = 0
    if far.max() < hist.max() * 0.1:
        return Background("checker", (first,))
    second = int(far.argmax())
    return Background("checker", tuple(sorted((first, second))))


def background_mask(
    rgb: np.ndarray, background: Background, tol: int = 16, sat: int = 16
) -> np.ndarray:
    """
    True on background pixels. For a checkerboard: low saturation and a
    value near one of the greys, or between them (the JPEG blur at the
    edges of the squares).
    """
    if background.kind == "magenta":
        return magenta_mask(rgb)
    value = rgb.max(-1)
    low_sat = (value - rgb.min(-1)) < sat
    lo, hi = min(background.greys), max(background.greys)
    return low_sat & (value >= lo - tol) & (value <= hi + tol)


def white_mask(rgb: np.ndarray, white: int = 225) -> np.ndarray:
    """Near-white pixels: the labels drawn on the sheet."""
    return rgb.min(-1) > white


def remove_lines(
    fg: np.ndarray, rgb: np.ndarray, min_frac: float = 0.5, dark: int = 90
) -> np.ndarray:
    """
    Clears straight dark frame lines: rows (and columns) holding a run of
    dark pixels longer than ``min_frac`` of the box, with the blurred
    pixel on each side of the line.
    """
    fg = fg.copy()
    is_dark = rgb.max(-1) < dark
    for axis in (0, 1):
        grid = is_dark if axis == 0 else is_dark.T
        out = fg if axis == 0 else fg.T
        need = int(grid.shape[1] * min_frac)
        for i, row in enumerate(grid):
            run = _longest_run(row)
            if run is None or run[1] - run[0] < need:
                continue
            a, b = run
            out[max(0, i - 1) : i + 2, a:b] = False
    return fg


def _longest_run(row: np.ndarray) -> tuple[int, int] | None:
    padded = np.concatenate([[False], row, [False]])
    edges = np.flatnonzero(padded[1:] != padded[:-1])
    if len(edges) == 0:
        return None
    starts, stops = edges[::2], edges[1::2]
    i = int((stops - starts).argmax())
    return int(starts[i]), int(stops[i])


# ------------------------------------------------------------- components


@dataclass
class Part:
    """A sprite cut from a sheet: its pixels and its box on the sheet."""

    image: Image.Image
    box: Box


def find_part(
    rgb: np.ndarray,
    background: Background,
    region: Box,
    *,
    min_area: int = 20,
    inside: float = 0.5,
    lines: bool = False,
    drop_white: bool = False,
    opening: int = 1,
    holes: int = 0,
    margin: int = 12,
) -> Part:
    """
    The sprite in ``region`` (an approximate box): every component with
    at least ``inside`` of its pixels in the region, so floating pieces
    come along and labels next to it do not. Returns it cropped to the
    union of those components, with them as the only opaque pixels.
    Enclosed gaps up to ``holes`` pixels are filled back: grey details
    inside a sprite (the keys of a cash register) look like background.
    """
    h, w = rgb.shape[:2]
    x0, y0, x1, y1 = region
    # Look a little beyond the region, so a sprite touching its edge is
    # cut whole and the "inside" share can be measured.
    wx0, wy0 = max(0, x0 - margin), max(0, y0 - margin)
    wx1, wy1 = min(w, x1 + margin), min(h, y1 + margin)
    sub = rgb[wy0:wy1, wx0:wx1]
    fg = ~background_mask(sub, background)
    if drop_white:
        fg &= ~white_mask(sub)
    if lines:
        fg = remove_lines(fg, sub)
    if opening:
        fg = ndimage.binary_opening(fg, iterations=opening)
    labels, count = ndimage.label(fg, structure=np.ones((3, 3)))
    if count == 0:
        raise ValueError(f"nothing found in {region}")
    ids = np.arange(1, count + 1)
    area = ndimage.sum(fg, labels, ids)
    in_region = np.zeros_like(fg)
    in_region[y0 - wy0 : y1 - wy0, x0 - wx0 : x1 - wx0] = True
    area_in = ndimage.sum(in_region, labels, ids)
    keep = ids[(area >= min_area) & (area_in >= inside * area)]
    if len(keep) == 0:
        raise ValueError(f"no sprite in {region}")
    mask = np.isin(labels, keep)
    if holes:
        mask = fill_small_holes(mask, holes)
    ys, xs = np.nonzero(mask)
    bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    rgba = np.zeros((by1 - by0, bx1 - bx0, 4), np.uint8)
    rgba[..., :3] = sub[by0:by1, bx0:bx1]
    rgba[..., 3] = np.where(mask[by0:by1, bx0:bx1], 255, 0)
    box = (int(wx0 + bx0), int(wy0 + by0), int(wx0 + bx1), int(wy0 + by1))
    return Part(Image.fromarray(rgba, "RGBA"), box)


def fill_small_holes(mask: np.ndarray, max_area: int) -> np.ndarray:
    """``mask`` with its enclosed gaps of up to ``max_area`` pixels set."""
    gaps = ndimage.binary_fill_holes(mask) & ~mask
    labels, count = ndimage.label(gaps)
    if count == 0:
        return mask
    ids = np.arange(1, count + 1)
    area = ndimage.sum(gaps, labels, ids)
    return mask | np.isin(labels, ids[area <= max_area])


# ---------------------------------------------------------------- scaling


def fit_scale(size: tuple[int, int], cell: tuple[int, int]) -> float:
    """The largest scale that fits ``size`` into ``cell``."""
    return min(cell[0] / size[0], cell[1] / size[1])


def place(
    image: Image.Image,
    cell: tuple[int, int],
    scale: float | None = None,
    align: str = "bottom",
    resample: str = "box",
) -> Image.Image:
    """
    Scales ``image`` into a transparent ``cell``: centred across, at the
    bottom (feet on the ground) or in the middle.
    """
    scale = fit_scale(image.size, cell) if scale is None else scale
    w = max(1, min(cell[0], round(image.width * scale)))
    h = max(1, min(cell[1], round(image.height * scale)))
    if resample == "box":
        small = _box(image, (w, h))
    else:
        filters = {"nearest": Image.NEAREST, "lanczos": Image.LANCZOS}
        small = image.resize((w, h), filters[resample])
    if resample != "lanczos":
        # Pixel art: every pixel fully opaque or fully transparent.
        alpha = small.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
        small.putalpha(alpha)
    out = Image.new("RGBA", cell, (0, 0, 0, 0))
    x = (cell[0] - w) // 2
    y = cell[1] - h if align == "bottom" else (cell[1] - h) // 2
    out.alpha_composite(small, (x, y))
    return out


def _box(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """
    Averages each output pixel over the source pixels it covers, counting
    only opaque ones: the JPEG noise and the thin fringe at the edges
    (less than half a pixel) disappear, the colours stay the sprite's.
    """
    rgba = np.asarray(image.convert("RGBA")).astype(np.float32)
    alpha = rgba[..., 3:] / 255.0
    premul = np.concatenate([rgba[..., :3] * alpha, alpha * 255.0], -1)
    channels = [
        np.asarray(
            Image.fromarray(premul[..., i], "F").resize(size, Image.BOX)
        )
        for i in range(4)
    ]
    out = np.stack(channels, -1)
    a = out[..., 3:]
    rgb = np.where(a > 0, out[..., :3] * 255.0 / np.maximum(a, 1e-6), 0)
    result = np.concatenate([rgb, a], -1)
    return Image.fromarray(np.clip(result + 0.5, 0, 255).astype(np.uint8))


def assemble(
    layout: Layout,
    parts: Mapping[str, Image.Image],
    resample: str = "box",
) -> Image.Image:
    """Builds the output sheet; parts of one group share a scale."""
    missing = set(layout.cells) - set(parts)
    if missing:
        raise ValueError(f"missing parts: {sorted(missing)}")
    scales: dict[str, float] = {}
    for name, cell in layout.cells.items():
        s = fit_scale(parts[name].size, (cell.w, cell.h))
        if cell.group:
            scales[cell.group] = min(scales.get(cell.group, s), s)
    sheet = Image.new("RGBA", layout.size, (0, 0, 0, 0))
    for name, cell in layout.cells.items():
        scale = scales.get(cell.group) if cell.group else None
        img = place(parts[name], (cell.w, cell.h), scale, cell.align, resample)
        sheet.alpha_composite(img, (cell.x, cell.y))
    return sheet


def preview(sheet: Image.Image, zoom: int = 4) -> Image.Image:
    """``sheet`` enlarged on a green that no sprite here uses."""
    big = sheet.resize(
        (sheet.width * zoom, sheet.height * zoom), Image.NEAREST
    )
    out = Image.new("RGBA", big.size, (40, 170, 90, 255))
    out.alpha_composite(big)
    return out


# --------------------------------------------------------------- manifest


@dataclass
class Entry:
    """One output file: which boxes of which source go where."""

    name: str
    source: str
    output: str
    layout: Layout
    boxes: dict[str, Box]
    options: dict = field(default_factory=dict)
    resample: str = "box"
    #: Also written to these paths (the same picture).
    copies: list[str] = field(default_factory=list)


def _layout(data: Mapping) -> Layout:
    kind = data["layout"]
    if kind in LAYOUTS:
        return LAYOUTS[kind]
    if kind == "single":
        w, h = data["size"]
        return single(int(w), int(h), data.get("align", "center"))
    raise ValueError(f"unknown layout {kind!r}")


def load_manifest(path: Path = MANIFEST) -> list[Entry]:
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    entries = []
    for item in data["outputs"]:
        boxes = {k: tuple(int(n) for n in v) for k, v in item["boxes"].items()}
        entries.append(
            Entry(
                name=item["name"],
                source=item["source"],
                output=item["output"],
                layout=_layout(item),
                boxes=boxes,  # type: ignore[arg-type]
                options=dict(item.get("options", {})),
                resample=item.get("resample", "box"),
                copies=list(item.get("copies", [])),
            )
        )
    return entries


def build(entry: Entry, sheet: Image.Image) -> Image.Image:
    """The output picture of one manifest entry."""
    rgb = _rgb(sheet)
    background = detect_background(rgb)
    parts = {
        name: find_part(rgb, background, box, **entry.options).image
        for name, box in entry.boxes.items()
    }
    return assemble(entry.layout, parts, entry.resample)


def run(
    entries: Iterable[Entry],
    sources: Path = SOURCES,
    repo: Path = REPO,
    preview_dir: Path | None = None,
    only: Sequence[str] = (),
) -> list[Path]:
    written = []
    cache: dict[str, Image.Image] = {}
    for entry in entries:
        if only and entry.name not in only:
            continue
        if entry.source not in cache:
            cache[entry.source] = Image.open(sources / entry.source)
        result = build(entry, cache[entry.source])
        for rel in [entry.output, *entry.copies]:
            out = repo / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            result.save(out, optimize=True)
            written.append(out)
        if preview_dir is not None:
            preview_dir.mkdir(parents=True, exist_ok=True)
            zoom = 4 if max(result.size) <= 256 else 1
            preview(result, zoom).save(preview_dir / f"{entry.name}.png")
    return written


# ------------------------------------------------------------------ intro

INTRO_SOURCE = "intro.mp4"
INTRO_DIR = Path("mods/nagmon/gfx/intro")
INTRO_FPS = 12
INTRO_SIZE = (960, 540)
INTRO_QUALITY = 85


def intro_frames_command(source: Path, pattern: Path) -> list[str]:
    """ffmpeg: the video as still frames, fewer and smaller."""
    w, h = INTRO_SIZE
    return [
        "ffmpeg",
        "-v",
        "error",
        "-y",
        "-i",
        str(source),
        "-an",
        "-vf",
        f"fps={INTRO_FPS},scale={w}:{h}:flags=lanczos",
        str(pattern),
    ]


def intro_audio_command(source: Path, target: Path) -> list[str]:
    """ffmpeg: the sound track as Ogg Vorbis (pygame plays it)."""
    return [
        "ffmpeg",
        "-v",
        "error",
        "-y",
        "-i",
        str(source),
        "-vn",
        "-c:a",
        "libvorbis",
        "-q:a",
        "3",
        str(target),
    ]


def convert_intro(source: Path, out_dir: Path) -> list[Path]:
    """
    ``out_dir`` gets ``0001.jpg``... (JPEG, quality 85) and ``intro.ogg``.
    Old frames are removed first, so a shorter video leaves none behind.
    """
    import subprocess
    import tempfile

    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.jpg"):
        old.unlink()
    written = []
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(
            intro_frames_command(source, Path(tmp) / "%04d.png"), check=True
        )
        for png in sorted(Path(tmp).glob("*.png")):
            target = out_dir / f"{png.stem}.jpg"
            Image.open(png).convert("RGB").save(
                target, quality=INTRO_QUALITY, optimize=True
            )
            written.append(target)
    audio = out_dir / "intro.ogg"
    subprocess.run(intro_audio_command(source, audio), check=True)
    written.append(audio)
    return written


def main(argv: Sequence[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--sources", type=Path, default=SOURCES)
    parser.add_argument(
        "--out", type=Path, default=REPO, help="root to write under"
    )
    parser.add_argument("--preview", type=Path, default=None)
    parser.add_argument("--only", nargs="*", default=())
    parser.add_argument(
        "--intro", action="store_true", help="also convert intro.mp4"
    )
    args = parser.parse_args(argv)
    written = run(
        load_manifest(args.manifest),
        sources=args.sources,
        repo=args.out,
        preview_dir=args.preview,
        only=args.only,
    )
    if args.intro:
        written += convert_intro(
            args.sources / INTRO_SOURCE, args.out / INTRO_DIR
        )
    for path in written:
        print("wrote", path)


if __name__ == "__main__":
    main()
