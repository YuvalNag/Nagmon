# SPDX-License-Identifier: GPL-3.0
"""The art import tool (docs/kids/SDD_ART.md §3, rows 1-14)."""

from __future__ import annotations

import io
import sys
from pathlib import Path

import pytest

np = pytest.importorskip("numpy")
pytest.importorskip("scipy")

from PIL import Image  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "tools" / "art"))

import import_art as ia  # noqa: E402

GREYS = (92, 150)
CELL = 12


def checker(w: int, h: int, greys=GREYS, cell: int = CELL) -> np.ndarray:
    ys, xs = np.mgrid[0:h, 0:w]
    dark = ((xs // cell + ys // cell) % 2).astype(bool)
    out = np.empty((h, w, 3), np.uint8)
    out[...] = greys[1]
    out[dark] = greys[0]
    return out


def as_jpeg(rgb: np.ndarray, quality: int = 90) -> np.ndarray:
    buf = io.BytesIO()
    Image.fromarray(rgb).save(buf, "JPEG", quality=quality)
    return np.asarray(Image.open(buf).convert("RGB"))


def sheet_with_sprite() -> np.ndarray:
    """A red body at (40..80, 30..90), a blue square floating above it,
    and a white label below the box we will ask for."""
    rgb = checker(160, 140)
    rgb[30:90, 40:80] = (200, 40, 40)
    rgb[30:90, 40] = (20, 10, 10)  # a dark outline column
    rgb[12:20, 90:98] = (40, 60, 220)
    rgb[118:126, 40:100] = (255, 255, 255)
    return rgb


# ------------------------------------------------------------ 1-3 keying


def test_checker_greys_are_found_after_jpeg():
    bg = ia.detect_background(as_jpeg(checker(200, 120)))
    assert bg.kind == "checker"
    assert len(bg.greys) == 2
    for found, want in zip(sorted(bg.greys), GREYS):
        assert abs(found - want) <= 4


def test_flat_magenta_is_found():
    rgb = np.zeros((50, 60, 3), np.uint8)
    rgb[...] = ia.MAGENTA
    rgb[20:30, 20:30] = (10, 200, 10)
    assert ia.detect_background(rgb).kind == "magenta"


def test_background_mask_keys_squares_and_their_seams_only():
    rgb = checker(48, 48).astype(np.int16)
    rgb[0:2, :] = 121  # a JPEG seam between the two greys
    rgb[20:30, 20:30] = (200, 40, 40)  # a red sprite
    rgb[30:34, 20:30] = (40, 40, 40)  # its dark grey outline
    mask = ia.background_mask(rgb, ia.Background("checker", GREYS))
    assert mask[0:2].all()
    assert mask[5, 5] and mask[5, 15]
    assert not mask[20:30, 20:30].any()
    assert not mask[30:34, 20:30].any()


# --------------------------------------------------------- 4-8 components


def test_part_takes_floating_pieces_and_leaves_labels():
    rgb = as_jpeg(sheet_with_sprite())
    bg = ia.detect_background(rgb)
    part = ia.find_part(ia._rgb(rgb), bg, (30, 8, 110, 100))
    x0, y0, x1, y1 = part.box
    assert x0 <= 41 and y0 <= 13 and x1 >= 96 and y1 >= 88
    assert y1 < 118  # the label is out
    alpha = np.asarray(part.image)[..., 3]
    # Between the body and the floating square: transparent checker.
    assert alpha[40 - y0, 85 - x0] == 0
    assert alpha[40 - y0, 60 - x0] == 255


def test_white_inside_the_box_goes_only_when_asked():
    rgb = checker(120, 100)
    rgb[20:80, 20:60] = (60, 160, 60)
    rgb[30:40, 70:100] = (250, 250, 250)  # a white text-like blob
    bg = ia.Background("checker", GREYS)
    kept = ia.find_part(rgb.astype(np.int16), bg, (10, 10, 110, 90))
    dropped = ia.find_part(
        rgb.astype(np.int16), bg, (10, 10, 110, 90), drop_white=True
    )
    assert kept.box[2] >= 100
    assert dropped.box[2] <= 60


def test_frame_lines_are_cleared():
    rgb = checker(140, 120)
    rgb[10:14, 5:135] = 20  # top
    rgb[106:110, 5:135] = 20  # bottom
    rgb[10:110, 5:9] = 20  # left
    rgb[10:110, 131:135] = 20  # right
    rgb[40:106, 50:90] = (180, 120, 60)  # stands on the bottom line
    bg = ia.Background("checker", GREYS)
    region = (0, 0, 140, 120)
    framed = ia.find_part(rgb.astype(np.int16), bg, region)
    clean = ia.find_part(rgb.astype(np.int16), bg, region, lines=True)
    assert framed.box == (5, 10, 135, 110)
    x0, y0, x1, y1 = clean.box
    assert (x0, y0, x1) == (50, 40, 90) and 103 <= y1 <= 106


def test_magenta_sheet_is_cut_without_pink_edges():
    rgb = np.zeros((60, 80, 3), np.uint8)
    rgb[...] = ia.MAGENTA
    rgb[10:50, 20:40] = (30, 90, 200)
    rgb = as_jpeg(rgb, 95)
    part = ia.find_part(ia._rgb(rgb), ia.Background("magenta"), (0, 0, 80, 60))
    assert part.box == (20, 10, 40, 50)
    px = np.asarray(part.image)
    opaque = px[px[..., 3] == 255][:, :3].astype(int)
    pink = (opaque[:, 0] > 150) & (opaque[:, 2] > 150) & (opaque[:, 1] < 100)
    assert not pink.any()


def test_only_small_holes_are_filled():
    mask = np.zeros((40, 40), bool)
    mask[5:35, 5:35] = True
    mask[10:12, 10:12] = False  # 4 px: a grey detail
    mask[18:30, 18:30] = False  # 144 px: real background
    out = ia.fill_small_holes(mask, 20)
    assert out[10:12, 10:12].all()
    assert not out[18:30, 18:30].any()


# ------------------------------------------------------------ 9-11 cells


def solid(w: int, h: int, color=(200, 50, 50, 255)) -> Image.Image:
    return Image.new("RGBA", (w, h), color)


@pytest.mark.parametrize("resample", ["box", "nearest"])
def test_place_centres_and_stands_on_the_bottom(resample):
    out = ia.place(solid(40, 20), (64, 64), resample=resample)
    assert out.size == (64, 64)
    alpha = np.asarray(out)[..., 3]
    ys, xs = np.nonzero(alpha)
    assert (xs.min(), xs.max()) == (0, 63)
    assert ys.max() == 63 and ys.min() == 32
    assert set(np.unique(alpha)) <= {0, 255}
    middle = ia.place(solid(40, 20), (64, 64), align="center")
    ys, _ = np.nonzero(np.asarray(middle)[..., 3])
    assert (ys.min(), ys.max()) == (16, 47)


def test_box_drops_a_thin_fringe_and_keeps_flat_colour():
    img = np.zeros((90, 90, 4), np.uint8)
    img[3:87, 3:87] = (40, 160, 220, 255)
    img[2, 3:87] = (128, 128, 128, 255)  # one grey seam pixel thick
    out = np.asarray(ia.place(Image.fromarray(img), (30, 30)))
    assert out[0, 15, 3] == 0  # the seam is gone
    assert tuple(out[15, 15]) == (40, 160, 220, 255)


def test_monster_sheet_layout_and_shared_scale():
    parts = {
        "front": solid(128, 128, (255, 0, 0, 255)),
        "back": solid(64, 64, (0, 255, 0, 255)),
        "menu1": solid(48, 48, (0, 0, 255, 255)),
        "menu2": solid(48, 48, (255, 255, 0, 255)),
    }
    sheet = ia.assemble(ia.MONSTER, parts)
    assert sheet.size == (128, 88)
    px = np.asarray(sheet)
    assert tuple(px[10, 10][:3]) == (255, 0, 0)
    # The back keeps the front's scale (0.5): 32x32 at the bottom.
    back = px[0:64, 64:128, 3]
    ys, xs = np.nonzero(back)
    assert (ys.max() - ys.min() + 1, xs.max() - xs.min() + 1) == (32, 32)
    assert tuple(px[80, 10][:3]) == (0, 0, 255)
    assert tuple(px[80, 34][:3]) == (255, 255, 0)
    combat = ia.assemble(
        ia.COMBAT, {"back": parts["back"], "front": parts["front"]}
    )
    assert combat.size == (128, 64)
    assert tuple(np.asarray(combat)[63, 20][:3]) == (0, 255, 0)


# -------------------------------------------------------- 12-14 manifest


def test_manifest_matches_the_game_files():
    entries = ia.load_manifest()
    assert entries
    cache = {}
    for entry in entries:
        src = ia.SOURCES / entry.source
        assert src.is_file(), src
        cache.setdefault(entry.source, Image.open(src))
        built = np.asarray(ia.build(entry, cache[entry.source]))
        for rel in [entry.output, *entry.copies]:
            on_disk = np.asarray(Image.open(REPO / rel).convert("RGBA"))
            assert on_disk.shape == built.shape, rel
            assert (on_disk == built).all(), f"{rel}: re-run import_art.py"


def test_cli_writes_only_what_was_asked(tmp_path):
    src = tmp_path / "src"
    src.mkdir()
    Image.fromarray(as_jpeg(sheet_with_sprite())).save(src / "sheet.jpg")
    (tmp_path / "manifest.yaml").write_text(
        "outputs:\n"
        "  - {name: a, source: sheet.jpg, layout: single, size: [32, 32],"
        " boxes: {image: [30, 8, 110, 100]}, output: gfx/a.png}\n"
        "  - {name: b, source: sheet.jpg, layout: single, size: [16, 16],"
        " boxes: {image: [30, 8, 110, 100]}, output: gfx/b.png}\n"
    )
    out = tmp_path / "out"
    ia.main(
        [
            "--manifest",
            str(tmp_path / "manifest.yaml"),
            "--sources",
            str(src),
            "--out",
            str(out),
            "--only",
            "b",
        ]
    )
    assert not (out / "gfx/a.png").exists()
    assert Image.open(out / "gfx/b.png").size == (16, 16)


def test_intro_frames_command():
    args = ia.intro_frames_command(Path("in.mp4"), Path("tmp/%03d.png"))
    text = " ".join(args)
    assert args[0] == "ffmpeg"
    assert "fps=12" in text and "scale=960:540" in text
    assert "-an" in args


# ------------------------------------------- 30-33 map sheets and HD


def grid_sheet(cols=3, rows=4, cell=(60, 90)) -> np.ndarray:
    """Magenta, one figure per cell; its colour says where it came from,
    and figures of different cells have different heights."""
    rgb = np.zeros((rows * cell[1], cols * cell[0], 3), np.uint8)
    rgb[...] = ia.MAGENTA
    for r in range(rows):
        for c in range(cols):
            x0, y0 = c * cell[0] + 20, r * cell[1] + 20
            height = 40 + 5 * c
            rgb[y0 : y0 + height, x0 : x0 + 20] = (
                40 * r + 10,
                60 * c + 10,
                90,
            )
    return rgb


def test_map_layout_takes_cells_from_where_the_manifest_says():
    sheet = Image.fromarray(grid_sheet())
    plain = ia.Entry("m", "s", "o", ia.MAP, {}, grid=(3, 4))
    swapped = ia.Entry(
        "m",
        "s",
        "o",
        ia.MAP,
        {},
        grid=(3, 4),
        take={"r2c3": "r3c3", "r3c3": "r2c3"},
    )
    boxes = plain.resolve_boxes(sheet.size)
    assert boxes["r1c1"] == (0, 0, 60, 90) and boxes["r4c3"] == (
        120,
        270,
        180,
        360,
    )
    out = swapped.resolve_boxes(sheet.size)
    assert out["r2c3"] == boxes["r3c3"] and out["r3c3"] == boxes["r2c3"]
    assert out["r2c1"] == boxes["r2c1"]
    built = np.asarray(ia.build(swapped, sheet))
    # r2c3 (row 2, column 3 of 16x32 cells) has the colour of source r3c3.
    cell = built[32:64, 32:48]
    colors = {tuple(p[:3]) for p in cell.reshape(-1, 4) if p[3] == 255}
    assert (90, 130, 90) in colors and (50, 130, 90) not in colors


def test_fill_sets_the_tallest_figure_height():
    parts = {
        name: solid(20, 40 + 5 * (int(name[-1]) - 1)) for name in ia.MAP.cells
    }
    sheet = np.asarray(ia.assemble(ia.MAP.scaled(8), parts, "hd", fill=0.75))
    heights = []
    for name, cell in ia.MAP.scaled(8).cells.items():
        alpha = sheet[cell.y : cell.y + cell.h, cell.x : cell.x + cell.w, 3]
        ys = np.nonzero(alpha.any(1))[0]
        heights.append(ys.max() - ys.min() + 1)
        assert (
            ys.max() == cell.h - 1 - 1 or ys.max() == cell.h - 1
        )  # feet down
    assert max(heights) in range(190, 193)  # 0.75 of 256, less the edge
    assert min(heights) < max(heights)  # one scale, not one per frame


def test_hd_resample_is_hard_eroded_and_never_pink():
    img = np.zeros((100, 100, 4), np.uint8)
    img[10:90, 10:90] = (60, 120, 200, 255)
    img[10:90, 10:12] = (250, 30, 250, 255)  # a magenta-tinted rim
    out = np.asarray(ia.place(Image.fromarray(img), (100, 100), resample="hd"))
    alpha = out[..., 3]
    assert set(np.unique(alpha)) <= {0, 255}
    opaque = out[alpha == 255][:, :3].astype(int)
    pink = (opaque[:, 0] - opaque[:, 1] > 30) & (
        opaque[:, 2] - opaque[:, 1] > 30
    )
    assert not pink.any()
    # one pixel eroded at the edge
    assert (
        ia.place(Image.fromarray(img), (100, 100), resample="hd").getbbox()[1]
        > np.nonzero(img[..., 3].any(1))[0].min()
    )


def test_game_sheets_are_whole_multiples_of_their_layout():
    for entry in ia.load_manifest():
        with Image.open(REPO / entry.output) as img:
            assert img.size == entry.layout.size, entry.name
        if entry.k > 1:
            native = (
                entry.layout.size[0] // entry.k,
                entry.layout.size[1] // entry.k,
            )
            assert native in {(48, 128), (128, 64), (128, 88)}, entry.name


def test_a_frame_line_counts_against_the_box_not_the_window():
    # A 60 px line in a 200 px window: short for the window, long for a
    # 100 px box, so it is a frame line of that box.
    fg = np.zeros((200, 200), bool)
    rgb = np.full((200, 200, 3), 150, np.int16)
    fg[100:103, 70:130] = True
    rgb[100:103, 70:130] = 20
    assert ia.remove_lines(fg, rgb)[101].any()
    assert not ia.remove_lines(fg, rgb, box=(100, 100))[101].any()
