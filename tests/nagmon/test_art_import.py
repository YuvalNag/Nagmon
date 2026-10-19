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
