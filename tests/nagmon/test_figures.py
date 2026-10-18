# SPDX-License-Identifier: GPL-3.0
"""Figure rendering (SDD_FIGURES §3, rows 1-16 and 23)."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pygame
import pytest

from nagmon.ui.figures import (
    DEFAULT_THEME,
    FIGURE_KINDS,
    FigureTheme,
    render_figure,
)

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

SIZE = (240, 180)
EMOJI_RGB = (10, 200, 10)

# Several data variants per kind, including degenerate ones.
VARIANTS: dict[str, list[dict]] = {
    "objects": [
        {"emoji": "1f34e", "count": 7},
        {"emoji": "1f34e", "count": 0},
        {"emoji": "1f34e", "count": 40},
        {"emoji": "1f388", "groups": [3, 4]},
        {"emoji": "1f388", "groups": [0, 5]},
        {"coins": [10, 5, 2, 1], "currency": "ILS"},
        {"coins": [], "currency": "ILS"},
    ],
    "clock": [
        {"hour": 3, "minute": 0},
        {"hour": 12, "minute": 45},
        {"hour": 23, "minute": 59},
    ],
    "pie": [
        {"parts": 4, "shaded": 1},
        {"parts": 1, "shaded": 1},
        {"parts": 12, "shaded": 0},
    ],
    "bar_model": [
        {"parts": 5, "shaded": 2},
        {"parts": 1, "shaded": 0},
        {"parts": 20, "shaded": 20},
    ],
    "number_line": [
        {"min": 0, "max": 10, "point": 7},
        {"min": 0, "max": 1, "marks": [0, 0.25, 0.5, 0.75, 1], "point": 0.5},
        {"min": -100, "max": 100, "marks": 25},
        {"min": 5, "max": 5},
    ],
    "polygon": [
        {
            "points": [[0, 0], [4, 0], [4, 3]],
            "labels": {"side_0": "4", "side_1": "3", "side_2": "?"},
            "grid": True,
        },
        {
            "points": [[0, 0], [6, 0], [6, 2], [0, 2]],
            "labels": {"side_0": "a very very long side label here"},
            "name": "rectangle",
        },
        {"name": "hexagon", "labels": {"angle_0": "120°"}},
        {"points": [[0, 0]]},
    ],
    "circle": [
        {"r": 5, "show": "radius", "label": "5"},
        {"r": 2, "show": "diameter", "label": "4 ס״מ"},
        {"r": 0},
    ],
    "angle": [
        {"degrees": 45, "rotation": 0},
        {"degrees": 90, "rotation": 30, "label": "?"},
        {"degrees": 270, "rotation": 0, "label": None},
        {"degrees": 0},
    ],
    "grid_area": [
        {"width": 5, "height": 4, "cells": [[0, 0], [1, 0], [1, 1]]},
        {"width": 3, "height": 2},
        {"width": 0, "height": 0},
    ],
    "solid": [
        {"name": "cube", "dims": {"a": 3}},
        {"name": "cuboid", "dims": [2, 3, 4]},
        {"name": "cylinder", "dims": {"r": 2, "h": 5}},
        {"name": "cone", "dims": {"r": 3, "h": 4}},
        {"name": "sphere", "dims": {"r": 4}},
        {"name": "pyramid"},
        {"name": "prism", "dims": {"w": 4, "h": 3, "d": 5}},
    ],
    "coordinate": [
        {"range": 6, "points": [{"x": 2, "y": 3, "label": "A"}]},
        {
            "range": [-5, 5],
            "points": [{"x": -3, "y": 4, "label": "B"}, {"x": 2, "y": -1}],
        },
        {
            "range": [0, 100, 0, 50],
            "points": [
                {"x": i * 1.6, "y": i * 0.8, "label": f"P{i}"}
                for i in range(60)
            ],
        },
    ],
    "grid_path": [
        {
            "width": 5,
            "height": 4,
            "start": [0, 0],
            "moves": ["R", "R", "U"],
            "repeat": 2,
            "marks": {"🏠": [4, 3]},
        },
        {
            "width": 3,
            "height": 3,
            "start": [1, 1],
            "moves": ["L", "D3"],
            "show_path": True,
        },
        {"width": 4, "height": 4, "start": [0, 0], "moves": []},
    ],
    "pattern": [
        {"items": ["1f34e", "1f34c", "1f34e", "1f34c", "?"]},
        {"items": ["1", "2", "?", "4"] * 4},
        {"items": []},
    ],
    "grid_numbers": [
        {"grid": [[1, 2, 3], [4, None, 6]], "target": [1, 1]},
        {"grid": [[i * 10 + j for j in range(10)] for i in range(10)]},
        {"grid": []},
    ],
    "symmetry": [
        {"shape": "heart"},
        {"shape": "house", "axis": "both"},
        {"shape": [[0, 0], [2, 0], [1, 3]], "axis": "horizontal"},
        {"shape": "1f98b"},
        {"shape": "no-such-shape"},
    ],
}


class FakeEmoji:
    """Returns a solid square for any code; counts calls."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, int]] = []

    def get(self, code: str, size: int) -> pygame.Surface | None:
        self.calls.append((code, size))
        surf = pygame.Surface((size, size), pygame.SRCALPHA)
        surf.fill(EMOJI_RGB + (255,))
        return surf


def count(surface: pygame.Surface, rgb, rect=None) -> int:
    if rect is not None:
        surface = surface.subsurface(rect)
    mask = pygame.mask.from_threshold(
        surface, tuple(rgb[:3]) + (255,), (2, 2, 2, 255)
    )
    return mask.count()


def opaque(surface: pygame.Surface) -> int:
    return pygame.mask.from_surface(surface, 10).count()


def render(kind, data, size=SIZE, **kw):
    kw.setdefault("theme", DEFAULT_THEME)
    return render_figure(kind, data, size, **kw)


@pytest.fixture(autouse=True, scope="module")
def _pygame():
    pygame.init()
    yield


def test_all_spec_kinds_are_supported():
    assert set(VARIANTS) <= set(FIGURE_KINDS)


@pytest.mark.parametrize(
    "kind,data",
    [(k, d) for k, ds in VARIANTS.items() for d in ds],
    ids=[f"{k}-{i}" for k, ds in VARIANTS.items() for i in range(len(ds))],
)
def test_every_kind_renders_requested_size(kind, data):
    surf = render(kind, data, emoji_loader=FakeEmoji())
    assert surf.get_size() == SIZE
    assert surf.get_flags() & pygame.SRCALPHA
    assert opaque(surf) > 50


@pytest.mark.parametrize("kind", sorted(VARIANTS))
@pytest.mark.parametrize("size", [(8, 8), (600, 120), (90, 400)])
def test_odd_sizes_never_raise(kind, size):
    surf = render(kind, VARIANTS[kind][0], size=size)
    assert surf.get_size() == size


def test_pie_more_shading_means_more_fill():
    full = render("pie", {"parts": 6, "shaded": 6})
    one = render("pie", {"parts": 6, "shaded": 1})
    none = render("pie", {"parts": 6, "shaded": 0})
    f = DEFAULT_THEME.fill
    assert count(full, f) > 4 * count(one, f) > 0
    assert count(none, f) == 0


def test_bar_model_more_shading_means_more_fill():
    f = DEFAULT_THEME.fill
    full = count(render("bar_model", {"parts": 4, "shaded": 4}), f)
    one = count(render("bar_model", {"parts": 4, "shaded": 1}), f)
    assert full > 3 * one > 0


def _halves(size):
    w, h = size
    return (
        pygame.Rect(0, 0, w // 2 - 4, h),
        pygame.Rect(w // 2 + 4, 0, w - w // 2 - 4, h),
        pygame.Rect(0, 0, w, h // 2 - 4),
        pygame.Rect(0, h // 2 + 4, w, h - h // 2 - 4),
    )


def test_clock_hour_hand_direction():
    left, right, _, _ = _halves((200, 200))
    hh = DEFAULT_THEME.hour_hand
    three = render("clock", {"hour": 3, "minute": 0}, size=(200, 200))
    nine = render("clock", {"hour": 9, "minute": 0}, size=(200, 200))
    assert count(three, hh, right) > 5 * max(1, count(three, hh, left))
    assert count(nine, hh, left) > 5 * max(1, count(nine, hh, right))


def test_clock_minute_hand_direction():
    _, _, top, bottom = _halves((200, 200))
    mh = DEFAULT_THEME.minute_hand
    noon = render("clock", {"hour": 12, "minute": 0}, size=(200, 200))
    half = render("clock", {"hour": 6, "minute": 30}, size=(200, 200))
    assert count(noon, mh, top) > 5 * max(1, count(noon, mh, bottom))
    assert count(half, mh, bottom) > 5 * max(1, count(half, mh, top))


def test_objects_count_scales_with_n():
    few = render(
        "objects", {"emoji": "x", "count": 3}, emoji_loader=FakeEmoji()
    )
    many = render(
        "objects", {"emoji": "x", "count": 9}, emoji_loader=FakeEmoji()
    )
    assert count(few, EMOJI_RGB) > 0
    assert count(many, EMOJI_RGB) != count(few, EMOJI_RGB)


def test_objects_loader_receives_code_and_count():
    loader = FakeEmoji()
    render("objects", {"emoji": "1f34e", "count": 5}, emoji_loader=loader)
    assert loader.calls and all(c == "1f34e" for c, _ in loader.calls)


def test_objects_groups_draw_all_items():
    loader = FakeEmoji()
    surf = render(
        "objects", {"emoji": "x", "groups": [2, 3]}, emoji_loader=loader
    )
    assert count(surf, EMOJI_RGB) > 0
    one = render(
        "objects", {"emoji": "x", "count": 1}, emoji_loader=FakeEmoji()
    )
    # each item is smaller than a lone item but there are five of them
    assert count(surf, EMOJI_RGB) > count(one, EMOJI_RGB) * 0.3


def test_objects_without_loader_still_draws():
    surf = render("objects", {"emoji": "1f34e", "count": 4}, emoji_loader=None)
    assert opaque(surf) > 200


def test_coins_are_golden():
    surf = render("objects", {"coins": [10, 5, 1], "currency": "ILS"})
    assert count(surf, DEFAULT_THEME.coin) > 300


def test_grid_numbers_highlights_target():
    data = {"grid": [[1, 2], [3, None]], "target": [1, 1]}
    surf = render("grid_numbers", data, size=(200, 200))
    acc = DEFAULT_THEME.accent
    w, h = surf.get_size()
    bottom_right = pygame.Rect(w // 2 + 4, h // 2 + 4, w // 2 - 8, h // 2 - 8)
    top_left = pygame.Rect(4, 4, w // 2 - 8, h // 2 - 8)
    assert count(surf, acc, bottom_right) > 200
    assert count(surf, acc, top_left) == 0


def test_grid_area_fill_proportional_to_cells():
    f = DEFAULT_THEME.fill
    three = count(
        render(
            "grid_area",
            {"width": 4, "height": 3, "cells": [[0, 0], [1, 0], [2, 0]]},
        ),
        f,
    )
    six = count(
        render(
            "grid_area",
            {
                "width": 4,
                "height": 3,
                "cells": [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
            },
        ),
        f,
    )
    assert 1.7 < six / three < 2.3


def test_grid_area_cell_origin_is_bottom_left():
    f = DEFAULT_THEME.fill
    surf = render(
        "grid_area",
        {"width": 2, "height": 2, "cells": [[0, 0]]},
        size=(200, 200),
    )
    _, _, top, bottom = _halves((200, 200))
    assert count(surf, f, bottom) > 0 and count(surf, f, top) == 0


def test_number_line_point_position():
    acc = DEFAULT_THEME.accent
    surf = render(
        "number_line", {"min": 0, "max": 10, "point": 10}, size=(300, 100)
    )
    left, right, _, _ = _halves((300, 100))
    assert count(surf, acc, right) > 20
    assert count(surf, acc, left) == 0


def test_text_transform_is_applied_to_labels():
    seen: list[str] = []

    def tf(text: str) -> str:
        seen.append(text)
        return text

    render(
        "circle",
        {"r": 3, "show": "radius", "label": "רדיוס"},
        text_transform=tf,
    )
    assert "רדיוס" in seen


@pytest.mark.parametrize(
    "kind,data",
    [
        ("no_such_kind", {}),
        ("clock", {"hour": "abc"}),
        ("polygon", {"points": "garbage"}),
        ("pie", None),
    ],
)
def test_placeholder_never_raises(kind, data):
    surf = render(kind, data)
    assert surf.get_size() == SIZE
    assert opaque(surf) > 0


def test_rendering_is_deterministic():
    data = VARIANTS["coordinate"][1]
    a = render("coordinate", data)
    b = render("coordinate", data)
    assert pygame.image.tobytes(a, "RGBA") == pygame.image.tobytes(b, "RGBA")


def test_custom_theme_is_used():
    theme = FigureTheme(fill=(1, 2, 250))
    surf = render("pie", {"parts": 2, "shaded": 2}, theme=theme)
    assert count(surf, (1, 2, 250)) > 500


def test_figures_module_does_not_import_tuxemon():
    code = (
        "import sys, nagmon.ui.figures, nagmon.ui.emoji;"
        "bad=[m for m in sys.modules if m.split('.')[0]=='tuxemon'];"
        "assert not bad, bad"
    )
    root = Path(__file__).resolve().parents[2]
    subprocess.run([sys.executable, "-c", code], check=True, cwd=root)


def test_contact_sheet_builds(tmp_path):
    import importlib.util

    root = Path(__file__).resolve().parents[2]
    path = root / "tools" / "figures" / "contact_sheet.py"
    spec = importlib.util.spec_from_file_location("contact_sheet", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    out = tmp_path / "sheet.png"
    module.build_contact_sheet(out)
    img = pygame.image.load(str(out))
    assert img.get_width() >= 800 and img.get_height() >= 600


@pytest.mark.parametrize(
    "name", ["pyramid_3", "pyramid_4", "pyramid_6", "prism_3", "prism_5"]
)
def test_generator_solids_with_n_sided_base_are_drawn(name, caplog):
    # geometry.solid_count asks about "pyramid_4", "prism_5"...; these
    # used to fall through to "unknown solid" and showed an empty frame.
    surf = render("solid", {"name": name})
    assert "not drawn" not in caplog.text
    assert opaque(surf) > 50


def test_solid_count_figures_are_known():
    import random

    from nagmon.learning.content import ContentLibrary

    lib = ContentLibrary.load()
    rng = random.Random(3)
    names = set()
    for _ in range(60):
        q = lib.generate("geometry.solids.count", rng)
        names.add(q.figure.data["name"])
    for name in names:
        surf = render("solid", {"name": name})
        assert opaque(surf) > 50, name
