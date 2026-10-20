# SPDX-License-Identifier: GPL-3.0
"""Smoother world tiles with xBRZ (docs/kids/SDD_ART.md §2.11, rows 51-59)."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pygame
import pytest

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

REPO = Path(__file__).resolve().parents[2]
FIXTURES = Path(__file__).with_name("fixtures") / "xbrz"
TILESETS = REPO / "mods" / "tuxemon" / "gfx" / "tilesets"


@pytest.fixture(scope="module", autouse=True)
def display():
    pygame.init()
    if pygame.display.get_surface() is None:
        pygame.display.set_mode((640, 480))
    yield


@pytest.fixture(scope="module")
def tools():
    """The art tools (numpy only; the game never imports them)."""
    pytest.importorskip("numpy")
    sys.path.insert(0, str(REPO / "tools" / "art"))
    import pixel_upscale
    import upscale_tiles

    return SimpleNamespace(px=pixel_upscale, up=upscale_tiles)


def near(color, want, tol=4) -> bool:
    """smoothscale rounds a little (pygame): within a few levels."""
    return all(abs(a - b) <= tol for a, b in zip(color, want))


# ------------------------------------------------------------ 51-52 xBRZ


@pytest.mark.parametrize(
    ("name", "box"),
    [
        ("core_buildings", (96, 288, 160, 352)),  # a roof, diagonals
        ("core_outdoor_nature", (688, 0, 752, 64)),  # trees, transparency
    ],
)
def test_xbrz_matches_the_cpp_library(tools, name, box):
    import numpy as np
    from PIL import Image

    sheet = tools.up.load_rgba(TILESETS / f"{name}.png")
    crop = sheet[box[1] : box[3], box[0] : box[2]]
    want = np.asarray(Image.open(FIXTURES / f"{name}_x4.png").convert("RGBA"))
    got = tools.px.scale(crop, 4)
    assert got.shape == want.shape == (256, 256, 4)
    assert (got == want).all()


def test_xbrz_flat_colour_is_nearest_and_batches_are_independent(tools):
    import numpy as np

    flat = np.full((5, 6, 4), (10, 200, 30, 255), np.uint8)
    out = tools.px.scale(flat, 3)
    assert out.shape == (15, 18, 4)
    # inside, far from the transparent outside, nothing is blended
    assert (out[3:-3, 3:-3] == (10, 200, 30, 255)).all()

    rng = np.random.default_rng(1)
    a = rng.integers(0, 3, (2, 7, 7, 1), dtype=np.uint8) * 100
    a = np.concatenate([a, a, a, np.full_like(a, 255)], axis=-1)
    both = tools.px.scale(a, 4)
    assert (both[0] == tools.px.scale(a[0], 4)).all()
    assert (both[1] == tools.px.scale(a[1], 4)).all()
    with pytest.raises(ValueError):
        tools.px.scale(flat, 7)


# ------------------------------------------------------------ 53 framing


def _toy_tileset(tools, frames=None):
    """A 2x2 sheet of 4x4 tiles, each one flat colour."""
    import numpy as np

    ts = tools.up.Tileset(
        name="toy",
        image=Path("toy.png"),
        tile=4,
        columns=2,
        count=4,
        size=(8, 8),
        frames=frames or {},
    )
    sheet = np.zeros((8, 8, 4), np.uint8)
    colours = [
        (255, 0, 0, 255),
        (0, 255, 0, 255),
        (0, 0, 255, 255),
        (9, 9, 9, 255),
    ]
    for tid, c in enumerate(colours):
        y, x = divmod(tid, 2)
        sheet[y * 4 : y * 4 + 4, x * 4 : x * 4 + 4] = c
    sheet[4, 4] = (200, 200, 200, 255)  # tile 3: one odd pixel, top left
    return ts, sheet


def test_frame_takes_the_map_neighbour_or_the_sheet(tools):
    ts, sheet = _toy_tileset(tools)
    up = tools.up

    def pixels_of(name, tid):
        return up.tile_pixels(sheet, ts, tid)

    chosen = {
        ("toy", 0, (-1, 0)): ("toy", 3, up.FLIP_H),  # left: tile 3 flipped
        ("toy", 0, (0, 1)): None,  # below: nothing
    }
    framed = up.framed_tiles(ts, sheet, chosen, pixels_of)
    assert framed.shape == (4, 8, 8, 4)
    f = framed[0]
    # centre: the tile itself
    assert (f[2:6, 2:6] == (255, 0, 0, 255)).all()
    # left: the right strip of tile 3 mirrored, so its odd pixel is there
    assert tuple(f[2, 1]) == (200, 200, 200, 255)
    assert tuple(f[3, 1]) == (9, 9, 9, 255)
    # below: transparent
    assert (f[6:, 2:6] == 0).all()
    # right: from the sheet (tile 1); above: outside the sheet
    assert (f[2:6, 6:] == (0, 255, 0, 255)).all()
    assert (f[:2, 2:6] == 0).all()


def test_animated_frames_pair_with_the_neighbours_frames(tools, tmp_path):
    up = tools.up
    tmx = tmp_path / "m.tmx"
    # tiles 0 and 1 animated (frames 2,3 and 3,2); 0 left of 1
    tmx.write_text(
        '<map width="2" height="1" tilewidth="4" tileheight="4">'
        '<tileset firstgid="1" source="toy.tsx"/>'
        '<layer width="2" height="1"><data encoding="csv">1,2</data></layer>'
        "</map>"
    )
    frames = {"toy": {0: (2, 3), 1: (3, 2)}}
    counts = up.neighbour_counts([tmx], frames)
    assert counts[("toy", 2, (1, 0))] == {("toy", 3, 0): 1}
    assert counts[("toy", 3, (1, 0))] == {("toy", 2, 0): 1}
    assert counts[("toy", 3, (-1, 0))] == {("toy", 2, 0): 1}


# --------------------------------------------------------- 54 the counts


def test_neighbour_counts_on_a_small_map(tools, tmp_path):
    up = tools.up
    h = up.FLIP_H
    tmx = tmp_path / "m.tmx"
    rows = [f"1,1,{2 | h}", "0,1,2"]
    tmx.write_text(
        '<map width="3" height="2" tilewidth="4" tileheight="4">'
        '<tileset firstgid="1" source="../x/toy.tsx"/>'
        '<layer width="3" height="2"><data encoding="csv">'
        + ",\n".join(rows)
        + "</data></layer>"
        '<layer width="3" height="2"><data encoding="csv">'
        "0,0,0,0,0,3</data></layer>"
        "</map>"
    )
    counts = up.neighbour_counts([tmx], {"toy": {}})
    # tile 0 at (0,0), (1,0) and (1,1): to the right a 0 and a flipped 1,
    # and a 1
    assert counts[("toy", 0, (1, 0))] == {
        ("toy", 0, 0): 1,
        ("toy", 1, h): 1,
        ("toy", 1, 0): 1,
    }
    # below (0,0) is empty, below (1,0) is a 0; other layers do not count
    assert counts[("toy", 0, (0, 1))] == {None: 1, ("toy", 0, 0): 1}
    # the flipped tile 1 is no centre: only the plain one has a left
    assert counts[("toy", 1, (-1, 0))] == {("toy", 0, 0): 1}
    chosen = up.choose_neighbours(counts)
    # a tie of three: the smallest key, which is the plain tile 0
    assert chosen[("toy", 0, (1, 0))] == ("toy", 0, 0)
    assert chosen[("toy", 0, (0, 1))] is None


# ------------------------------------------------------ 55 the game files


@pytest.fixture(scope="module")
def neighbours(tools):
    sheets = tools.up.Sheets(REPO)
    return sheets, tools.up.neighbours(REPO, sheets)


@pytest.mark.parametrize(
    "name",
    [
        "core_city_and_country",
        "core_outdoor",
        "core_set pieces",
        "core_buildings",
        "core_outdoor_water",
        "core_outdoor_nature",
        "core_indoor_floors",
        "core_indoor_walls",
        "core_indoor_stairs",
    ],
)
def test_hd_tilesets_are_what_the_tool_makes(tools, neighbours, name):
    assert name in tools.up.TILESETS
    sheets, chosen = neighbours
    ts = sheets.tileset(name)
    path = tools.up.output_path(name)
    assert path.is_file(), "run tools/art/upscale_tiles.py"
    on_disk = tools.up.load_png(path)
    assert on_disk.shape == (ts.size[1] * 4, ts.size[0] * 4, 4)
    built = tools.up.upscale(name, 4, chosen, sheets)
    assert (on_disk == built).all(), f"{path}: re-run upscale_tiles.py"


# ------------------------------------------------------- 56-57 the loader


def _write(tmp_path, surf, name):
    path = tmp_path / name
    pygame.image.save(surf, str(path))
    return str(path)


def _tile_sheet(k: int) -> pygame.Surface:
    """Two 16x16 tiles side by side, k times: red with a blue top-left
    quarter, then green."""
    s = pygame.Surface((32 * k, 16 * k), pygame.SRCALPHA)
    s.fill((200, 30, 30, 255), (0, 0, 16 * k, 16 * k))
    s.fill((20, 20, 220, 255), (0, 0, 8 * k, 8 * k))
    s.fill((30, 200, 30, 255), (16 * k, 0, 16 * k, 16 * k))
    return s


def _old_loader(filename, scale, rect, flags):
    """scaled_image_loader as it was before HD tiles."""
    from pytmx.util_pygame import handle_transformation, smart_convert

    image = pygame.image.load(filename)
    image = pygame.transform.scale(
        image, [v * scale for v in image.get_size()]
    )
    tile = image.subsurface([v * scale for v in rect])
    if flags:
        tile = handle_transformation(tile, flags)
    return smart_convert(tile, None, True)


@pytest.mark.parametrize(
    "flags", [None, (1, 0, 0), (0, 1, 0), (0, 0, 1), (1, 1, 1)]
)
def test_native_tileset_loads_exactly_as_before(tmp_path, flags):
    from pytmx.pytmx import TileFlags

    from tuxemon.graphics import scaled_image_loader
    from tuxemon.scaling import DefaultScaling

    path = _write(tmp_path, _tile_sheet(1), "native.png")
    ts = SimpleNamespace(width=32, height=16)
    tf = TileFlags(*flags) if flags else None
    loader = scaled_image_loader(
        path, None, tileset=ts, scaling=DefaultScaling(3)
    )
    for rect in [(0, 0, 16, 16), (16, 0, 16, 16)]:
        new = loader(rect, tf)
        old = _old_loader(path, 3, rect, tf)
        assert new.get_size() == old.get_size() == (48, 48)
        assert pygame.image.tobytes(new, "RGBA") == pygame.image.tobytes(
            old, "RGBA"
        )
    # an image without a tileset (an image layer) loads whole, as before
    whole = scaled_image_loader(path, None, scaling=DefaultScaling(3))()
    assert whole.get_size() == (96, 48)


@pytest.mark.parametrize("scale", [3, 7])
def test_hd_tileset_scales_each_tile_once_to_the_screen(
    tmp_path, monkeypatch, scale
):
    from pytmx.pytmx import TileFlags

    from tuxemon import graphics
    from tuxemon.scaling import DefaultScaling

    calls = []
    real = graphics.smooth_resize

    def counting(surface, size):
        calls.append(surface.get_size())
        return real(surface, size)

    monkeypatch.setattr(graphics, "smooth_resize", counting)
    path = _write(tmp_path, _tile_sheet(4), "hd.png")
    ts = SimpleNamespace(width=32, height=16)
    loader = graphics.scaled_image_loader(
        path, None, tileset=ts, scaling=DefaultScaling(scale)
    )
    n = 16 * scale
    plain = loader((0, 0, 16, 16), None)
    assert plain.get_size() == (n, n)
    assert near(plain.get_at((1, 1)), (20, 20, 220))  # blue corner
    assert near(plain.get_at((n - 2, n - 2)), (200, 30, 30))
    # flipped left to right: the blue corner is top right
    flipped = loader((0, 0, 16, 16), TileFlags(1, 0, 0))
    assert near(flipped.get_at((n - 2, 1)), (20, 20, 220))
    assert near(flipped.get_at((1, 1)), (200, 30, 30))
    # flipped top to bottom: bottom left
    vflip = loader((0, 0, 16, 16), TileFlags(0, 1, 0))
    assert near(vflip.get_at((1, n - 2)), (20, 20, 220))
    green = loader((16, 0, 16, 16), None)
    assert near(green.get_at((n // 2, n // 2)), (30, 200, 30))
    # the first tile was scaled once, from the HD size, for both flags
    assert calls == [(64, 64), (64, 64)]


# ------------------------------------------------------- 58 mod order


def test_resolve_mod_path_prefers_the_higher_mod(tmp_path, monkeypatch):
    from tuxemon.constants import asset_loader

    a = tmp_path / "a" / "gfx"
    b = tmp_path / "b" / "gfx"
    a.mkdir(parents=True)
    b.mkdir(parents=True)
    (a / "both.png").write_bytes(b"a")
    (b / "both.png").write_bytes(b"b")
    (b / "only_b.png").write_bytes(b"b")
    monkeypatch.setattr(
        asset_loader, "_MOD_ASSET_ROOTS", (tmp_path / "a", tmp_path / "b")
    )
    asset_loader.fetch_asset.cache_clear()
    try:
        resolve = asset_loader.resolve_mod_path
        assert Path(resolve(str(b / "both.png"))) == a / "both.png"
        assert Path(resolve(str(b / "only_b.png"))) == b / "only_b.png"
        elsewhere = tmp_path / "x.png"
        assert resolve(str(elsewhere)) == str(elsewhere)
        # ".." in the path, as pytmx writes it
        odd = str(tmp_path / "b" / "maps" / ".." / "gfx" / "both.png")
        assert Path(resolve(odd)) == a / "both.png"
    finally:
        asset_loader.fetch_asset.cache_clear()


def test_the_game_finds_nagmons_tilesets():
    from tuxemon.constants import asset_loader

    tux = TILESETS / "core_outdoor.png"
    got = Path(asset_loader.resolve_mod_path(str(tux)))
    assert got == REPO / "mods" / "nagmon" / "gfx" / "tilesets" / tux.name
    other = TILESETS / "Tileset.png"  # not upscaled
    assert Path(asset_loader.resolve_mod_path(str(other))) == other


# ------------------------------------------------ 59 Hearthrock in the game


def test_hearthrock_loads_with_hd_tiles(monkeypatch):
    from tuxemon import graphics
    from tuxemon.constants import asset_loader
    from tuxemon.map.loader import TMXMapLoader
    from tuxemon.prepare import DISPLAY_CONTEXT

    tmx = str(
        REPO / "mods" / "tuxemon" / "maps" / "classic_hearthrock_city.tmx"
    )
    seen = []
    real = graphics.hd_factor

    def spy(size, native):
        k = real(size, native)
        seen.append(k)
        return k

    monkeypatch.setattr(graphics, "hd_factor", spy)
    hd = TMXMapLoader().load(tmx, DISPLAY_CONTEXT)
    assert 4 in seen

    s = DISPLAY_CONTEXT.scale
    images = [i for i in hd._data.images if i is not None]
    assert images and all(i.get_size() == (16 * s, 16 * s) for i in images)
    animated = [
        p for p in hd._data.tile_properties.values() if p.get("frames")
    ]
    assert animated
    for props in animated:
        for frame in props["frames"]:
            assert hd._data.images[frame.gid] is not None

    # The same map without the HD sheets: same collisions and events.
    monkeypatch.setattr(asset_loader, "resolve_mod_path", lambda p: p)
    monkeypatch.setattr(graphics, "resolve_mod_path", lambda p: p)
    seen.clear()
    old = TMXMapLoader().load(tmx, DISPLAY_CONTEXT)
    assert 4 not in seen
    assert hd.collision_map == old.collision_map
    assert hd.collision_lines_map == old.collision_lines_map
    assert len(hd.events) == len(old.events)
    assert len(hd._data.images) == len(old._data.images)
