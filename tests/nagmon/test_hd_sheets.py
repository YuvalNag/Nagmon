# SPDX-License-Identifier: GPL-3.0
"""HD sheets: one smooth scale to the screen (SDD_ART §2.6, rows 37-41)."""

from __future__ import annotations

import os

import pygame
import pytest

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")


@pytest.fixture(scope="module", autouse=True)
def display():
    pygame.init()
    if pygame.display.get_surface() is None:
        pygame.display.set_mode((640, 480))
    yield


def near(color, want, tol=4) -> bool:
    """smoothscale rounds a little (pygame): within a few levels."""
    return all(abs(a - b) <= tol for a, b in zip(color, want))


def sheet(size, k=1, color=(200, 40, 40, 255)) -> pygame.Surface:
    """A sheet whose every native pixel is a k x k block."""
    surf = pygame.Surface((size[0] * k, size[1] * k), pygame.SRCALPHA)
    surf.fill(color)
    return surf


# ------------------------------------------------------------ row 37-38


@pytest.mark.parametrize(
    ("size", "native", "k"),
    [
        ((384, 1024), (48, 128), 8),
        ((48, 128), (48, 128), 1),
        ((96, 256), (48, 128), 2),
        ((100, 256), (48, 128), 1),  # not a multiple
        ((96, 384), (48, 128), 1),  # not the same in both directions
        ((24, 64), (48, 128), 1),  # smaller
    ],
)
def test_hd_factor(size, native, k):
    from tuxemon.graphics import hd_factor

    assert hd_factor(size, native) == k


def test_scale_sheet_keeps_native_sheets_as_before():
    from tuxemon.graphics import scale_sheet, scale_surface

    surf = sheet((48, 128))
    surf.fill((0, 0, 255, 255), (0, 0, 1, 1))
    old = scale_surface(surf, 7)
    new = scale_sheet(surf, (48, 128), 7)
    assert new.get_size() == old.get_size() == (336, 896)
    # nearest: the corner pixel is a sharp 7x7 block
    assert new.get_at((6, 6)) == old.get_at((6, 6)) == (0, 0, 255, 255)
    assert new.get_at((7, 7)) == (200, 40, 40, 255)


def test_scale_sheet_scales_hd_once_to_the_screen():
    from tuxemon.graphics import scale_sheet

    hd = sheet((48, 128), k=8)
    out = scale_sheet(hd, (48, 128), 7)
    assert out.get_size() == (336, 896)
    assert near(out.get_at((100, 100)), (200, 40, 40, 255))


# ---------------------------------------------------------------- row 39


def test_map_sheet_loader_uses_the_rule(monkeypatch):
    from tuxemon.map import view

    hd = sheet((48, 128), k=8)
    monkeypatch.setattr(view, "load_image", lambda path: hd)
    monkeypatch.setattr(view, "sprite_cache", {})
    out = view.load_and_scale_with_cache("sprites/x_hd.png", (48, 128))
    s = view.DISPLAY_CONTEXT.scale
    assert out.get_size() == (48 * s, 128 * s)
    # Cached by path, as before.
    assert view.load_and_scale_with_cache("sprites/x_hd.png", (48, 128)) is out


def test_a_tuxemon_map_sheet_loads_as_before(monkeypatch):
    from tuxemon.graphics import load_and_scale
    from tuxemon.map import view

    monkeypatch.setattr(view, "sprite_cache", {})
    old = load_and_scale("sprites/professor.png")
    new = view.load_and_scale_with_cache("sprites/professor.png", (48, 128))
    assert new.get_size() == old.get_size()
    assert pygame.image.tobytes(new, "RGBA") == pygame.image.tobytes(
        old, "RGBA"
    )


# ---------------------------------------------------------------- row 40


def test_combat_sheet_native_is_unchanged(monkeypatch):
    from tuxemon.entity import sheet as sheet_mod

    monkeypatch.setattr(
        sheet_mod, "load_raw_image", lambda p: sheet((128, 64))
    )
    cs = sheet_mod.CombatSheet("x.png", 64, 64)
    assert cs.front().get_size() == (64, 64)
    assert cs.back().get_size() == (64, 64)
    assert cs.front(5).get_size() == (320, 320)


def test_combat_sheet_hd(monkeypatch):
    from tuxemon.entity import sheet as sheet_mod

    hd = sheet((128, 64), k=3)
    hd.fill((0, 200, 0, 255), (192, 0, 192, 192))  # the front half
    monkeypatch.setattr(sheet_mod, "load_raw_image", lambda p: hd)
    cs = sheet_mod.CombatSheet("x.png", 64, 64)
    assert cs.front().get_size() == (64, 64)
    assert cs.back().get_size() == (64, 64)
    big = cs.front(5)
    assert big.get_size() == (320, 320)
    assert near(big.get_at((160, 160)), (0, 200, 0, 255))
    assert near(cs.back(5).get_at((160, 160)), (200, 40, 40, 255))


def test_combat_sheet_still_rejects_a_wrong_size(monkeypatch):
    from tuxemon.entity import sheet as sheet_mod

    monkeypatch.setattr(
        sheet_mod, "load_raw_image", lambda p: sheet((100, 64))
    )
    with pytest.raises(ValueError):
        sheet_mod.CombatSheet("x.png", 64, 64)


# ---------------------------------------------------------------- row 41

RECTS = dict(
    front_rect=(0, 0, 64, 64),
    back_rect=(64, 0, 64, 64),
    menu1_rect=(0, 64, 24, 24),
    menu2_rect=(24, 64, 24, 24),
)


def handler(monkeypatch, surf):
    from tuxemon import graphics
    from tuxemon.monster.sprite import MonsterSpriteHandler

    monkeypatch.setattr(graphics, "load_raw_image", lambda p: surf)
    return MonsterSpriteHandler(slug="x", sheet_path="x.png", **RECTS)


@pytest.mark.parametrize("k", [1, 3])
def test_monster_sheet_slices_and_scales(monkeypatch, k):
    surf = sheet((128, 88), k=k)
    surf.fill((0, 0, 200, 255), (64 * k, 0, 64 * k, 64 * k))  # the back
    h = handler(monkeypatch, surf)
    front = h.get_sprite("front", scale=2).image
    back = h.get_sprite("back", scale=2).image
    assert front.get_size() == back.get_size() == (128, 128)
    assert near(back.get_at((64, 64)), (0, 0, 200, 255))
    assert near(front.get_at((64, 64)), (200, 40, 40, 255))
    assert h.get_sprite("front", scale=1).image.get_size() == (64, 64)
    menu = h.get_sprite("menu", scale=3)
    assert menu.image.get_size() == (72, 72)
    sizes = {k2: s.get_size() for k2, s in h.load_sprites(2).items()}
    assert sizes == {
        "front": (128, 128),
        "back": (128, 128),
        "menu01": (48, 48),
        "menu02": (48, 48),
    }
