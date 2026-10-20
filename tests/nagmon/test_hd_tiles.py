# SPDX-License-Identifier: GPL-3.0
"""Smoother world tiles with xBRZ (docs/kids/SDD_ART.md §2.11, rows 51-59)."""

from __future__ import annotations

import logging
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
    sheet[5, 1] = 0  # tile 2: one transparent pixel
    return ts, sheet


def test_frame_takes_the_map_neighbour_or_the_sheet(tools):
    ts, sheet = _toy_tileset(tools)
    up = tools.up

    def pixels_of(name, tid):
        return up.tile_pixels(sheet, ts, tid)

    chosen = {
        ("toy", 0, (-1, 0)): ("toy", 3, up.FLIP_H),  # left: tile 3 flipped
        ("toy", 0, (0, 1)): None,  # below: nothing
        ("toy", 0, (1, 1)): None,  # below right: nothing
        ("toy", 2, (1, 0)): None,  # right of the see-through tile
    }
    framed = up.framed_tiles(ts, sheet, chosen, pixels_of)
    assert framed.shape == (4, 8, 8, 4)
    f = framed[0]
    # centre: the tile itself
    assert (f[2:6, 2:6] == (255, 0, 0, 255)).all()
    # left: the right strip of tile 3 mirrored, so its odd pixel is there
    assert tuple(f[2, 1]) == (200, 200, 200, 255)
    assert tuple(f[3, 1]) == (9, 9, 9, 255)
    # below, below right: nothing, and the tile is opaque: its own edge
    # repeated, not tile 3's odd pixel from the sheet
    assert (f[6:, 2:] == (255, 0, 0, 255)).all()
    # right: from the sheet (tile 1); above: outside the sheet
    assert (f[2:6, 6:] == (0, 255, 0, 255)).all()
    assert (f[:2, 2:6] == 0).all()
    # a tile with a see-through pixel: nothing is transparent
    assert (framed[2][2:6, 6:] == 0).all()


def test_frame_skips_a_neighbour_of_another_tile_size(tools):
    import numpy as np

    ts, sheet = _toy_tileset(tools)
    up = tools.up
    chosen = {("toy", 0, (1, 0)): ("big", 0, 0)}
    big = np.full((8, 8, 4), 77, np.uint8)
    framed = up.framed_tiles(
        ts, sheet, chosen, lambda name, tid: big if name == "big" else None
    )
    # right: still tile 1 from the sheet
    assert (framed[0][2:6, 6:] == (0, 255, 0, 255)).all()


def test_bleed_colours_clear_pixels_near_the_edge(tools):
    import numpy as np

    img = np.zeros((1, 9, 4), np.uint8)
    img[0, 0] = (10, 20, 30, 255)
    out = tools.up.bleed(img, 4)
    assert (out[0, :5, :3] == (10, 20, 30)).all()
    assert (out[0, 5:] == 0).all()
    assert (out[0, 1:, 3] == 0).all()  # still transparent
    assert tuple(out[0, 0]) == (10, 20, 30, 255)


def test_a_gid_below_every_tileset_names_the_map(tools, tmp_path):
    tmx = tmp_path / "bad.tmx"
    tmx.write_text(
        '<map width="1" height="1" tilewidth="4" tileheight="4">'
        '<tileset firstgid="5" source="toy.tsx"/>'
        '<layer width="1" height="1"><data encoding="csv">2</data></layer>'
        "</map>"
    )
    with pytest.raises(ValueError, match="bad.tmx"):
        tools.up.neighbour_counts([tmx], {"toy": {}})


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


# -------------------------------------------------- 55, 67 the game files


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
    on_disk = tools.up.load_rgba(path, clean=False)
    assert on_disk.shape == (ts.size[1] * 4, ts.size[0] * 4, 4)
    why = tools.up.stale(name, chosen, sheets)
    assert why is None, why


def test_a_map_edit_says_to_rebuild_the_sheets(tools, tmp_path):
    up = tools.up
    tiles = tmp_path / up.TSX_DIR
    tiles.mkdir(parents=True)
    (tiles / "toy.tsx").write_text(
        '<tileset name="toy" tilewidth="4" tileheight="4" tilecount="4"'
        ' columns="2"><image source="toy.png" width="8" height="8"/>'
        "</tileset>"
    )
    _, sheet = _toy_tileset(tools)
    up.save(sheet, tiles / "toy.png")
    sheets = up.Sheets(tmp_path)
    out = up.output_path("toy", tmp_path)
    up.save(up.upscale("toy", 4, {}, sheets), out)
    assert up.stale("toy", {}, sheets, tmp_path) is None
    # a map now puts tile 3 left of tile 0
    moved = {("toy", 0, (-1, 0)): ("toy", 3, 0)}
    why = up.stale("toy", moved, sheets, tmp_path)
    assert why == f"{out}: maps changed: re-run tools/art/upscale_tiles.py"
    out.unlink()
    assert up.stale("toy", {}, sheets, tmp_path).endswith(
        "missing: run tools/art/upscale_tiles.py"
    )


# --------------------------------------------------- 56-57, 64 the loader


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


def _old_loader(filename, scale, rect, flags, colorkey=None):
    """scaled_image_loader as it was before HD tiles."""
    from pytmx.util_pygame import handle_transformation, smart_convert

    image = pygame.image.load(filename)
    image = pygame.transform.scale(
        image, [v * scale for v in image.get_size()]
    )
    tile = image.subsurface([v * scale for v in rect])
    if flags:
        tile = handle_transformation(tile, flags)
    key = pygame.Color(f"#{colorkey}") if colorkey else None
    return smart_convert(tile, key, True)


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


def test_a_colorkey_tileset_keeps_its_native_sheet(tmp_path, monkeypatch):
    """Smoothing before the colorkey would leave fringes of the key colour
    around every tile: such a tileset (``trans=`` in the TSX) loads its
    own sheet, as before, even when an HD copy exists."""
    from tuxemon import graphics
    from tuxemon.scaling import DefaultScaling

    native = _tile_sheet(1)
    native.fill((255, 0, 255, 255), (4, 4, 8, 8))  # the colorkey
    path = _write(tmp_path, native, "keyed.png")
    hd = _write(tmp_path, _tile_sheet(4), "keyed_hd.png")
    monkeypatch.setattr(graphics, "resolve_mod_path", lambda p: hd)
    ts = SimpleNamespace(width=32, height=16)
    loader = graphics.scaled_image_loader(
        path, "ff00ff", tileset=ts, scaling=DefaultScaling(3)
    )
    for rect in [(0, 0, 16, 16), (16, 0, 16, 16)]:
        new = loader(rect, None)
        old = _old_loader(path, 3, rect, None, colorkey="ff00ff")
        assert new.get_size() == old.get_size() == (48, 48)
        assert pygame.image.tobytes(new, "RGBA") == pygame.image.tobytes(
            old, "RGBA"
        )
    # the key colour is see-through, with no pink left at its edge
    tile = loader((0, 0, 16, 16), None)
    assert tile.get_colorkey()[:3] == (255, 0, 255)
    assert tile.get_at((12, 12))[:3] == (255, 0, 255)
    assert tile.get_at((11, 11))[:3] == (20, 20, 220)


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


# --------------------------------------------------- 58, 65 mod order


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
    monkeypatch.setattr(asset_loader, "_HAS_POPULATED", True)
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


def test_resolve_mod_path_warns_once_before_the_mods_are_known(
    monkeypatch, caplog
):
    from tuxemon.constants import asset_loader

    monkeypatch.setattr(asset_loader, "_HAS_POPULATED", False)
    monkeypatch.setattr(asset_loader, "_WARNED_UNPOPULATED", False)
    with caplog.at_level(logging.DEBUG, logger=asset_loader.__name__):
        for name in ("a.png", "b.png", "c.png"):
            assert asset_loader.resolve_mod_path(name) == name
    warnings = [
        r
        for r in caplog.records
        if r.levelno >= logging.WARNING and "[Resolve]" in r.getMessage()
    ]
    assert len(warnings) == 1


def test_the_game_finds_nagmons_tilesets():
    from tuxemon.constants import asset_loader
    from tuxemon.user_config import CONFIG

    asset_loader.fetch_mod_asset_roots(CONFIG)  # as the game does

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
    from tuxemon.user_config import CONFIG

    asset_loader.fetch_mod_asset_roots(CONFIG)  # as the game does
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


def test_images_without_a_tileset_are_not_looked_up_again(
    tmp_path, monkeypatch
):
    from tuxemon import graphics
    from tuxemon.scaling import DefaultScaling

    def boom(path):
        raise AssertionError("looked up by mod order")

    monkeypatch.setattr(graphics, "resolve_mod_path", boom)
    path = _write(tmp_path, _tile_sheet(4), "layer.png")
    # an image layer, or a tile's own image: as before, whatever its size
    image = graphics.scaled_image_loader(
        path, None, scaling=DefaultScaling(2)
    )()
    assert image.get_size() == (256, 128)


# --------------------------------------------- 66 maps kept on a phone


@pytest.mark.parametrize(
    ("env", "size"),
    [
        pytest.param({}, 10, id="pc"),
        pytest.param({"ANDROID_ARGUMENT": "/data/app"}, 2, id="phone"),
    ],
)
def test_a_phone_keeps_two_maps_in_memory(monkeypatch, env, size):
    """An outdoor map holds ~190MB of tiles at scale 7 (SDD_ART §2.12):
    ten of them do not fit in a phone."""
    from tuxemon.map.loader import MapLoader
    from tuxemon.platform import mobile

    for name in mobile.P4A_VARIABLES:
        monkeypatch.delenv(name, raising=False)
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    assert mobile.map_cache_size() == size
    assert MapLoader(context=None).cache_size == size
    assert MapLoader(context=None, cache_size=5).cache_size == 5
