# SPDX-License-Identifier: GPL-3.0
"""WP11: every flagged portrait is replaced by a modest one (SDD_MODESTY)."""

from __future__ import annotations

from pathlib import Path

import pygame
import pytest
import yaml

REPO = Path(__file__).resolve().parents[2]
REVIEW = REPO / "content" / "modesty" / "sprites_review.yaml"
SRC = REPO / "mods" / "tuxemon" / "gfx" / "sprites" / "player"
DST = REPO / "mods" / "nagmon" / "gfx" / "sprites" / "player"


def _flagged_portraits() -> list[str]:
    review = yaml.safe_load(REVIEW.read_text(encoding="utf-8"))
    return sorted(
        Path(e["file"]).name
        for e in review["entries"]
        if e["kind"] == "portrait" and e["status"] in ("flag", "borderline")
    )


FLAGGED = _flagged_portraits()
FLAGGED_PARAMS = [pytest.param(n, id=n) for n in FLAGGED]
HEROINES = [
    pytest.param(p.name, id=p.name) for p in sorted(SRC.glob("heroine*.png"))
]


def test_review_lists_portraits():
    assert len(FLAGGED) >= 100


@pytest.mark.parametrize("name", FLAGGED_PARAMS)
def test_flagged_portrait_has_overlay_of_same_size(name):
    original = pygame.image.load(SRC / name)
    overlay = pygame.image.load(DST / name)
    assert overlay.get_size() == original.get_size()
    assert (DST / name).read_bytes() != (SRC / name).read_bytes()


@pytest.mark.parametrize("name", FLAGGED_PARAMS)
def test_overlay_wins_over_original_by_asset_lookup(name):
    import tuxemon.locale.locale  # noqa: F401  (populates asset roots)
    from tuxemon.constants.asset_loader import fetch_asset

    found = Path(fetch_asset("gfx", "sprites", "player", name))
    assert found == DST / name


def _colors(img: pygame.Surface, rows: range, xs: range) -> set:
    return {
        tuple(img.get_at((x, y)))[:3]
        for y in rows
        for x in xs
        if img.get_at((x, y)).a
    }


def _luma(c: tuple[int, int, int]) -> float:
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


@pytest.mark.parametrize("name", HEROINES)
def test_heroine_legs_are_covered(name):
    original = pygame.image.load(SRC / name)
    fixed = pygame.image.load(DST / name)
    # Front figure: bare legs sat on rows 42-53 between columns 86 and 102.
    rows, xs = range(44, 52), range(86, 103)
    skirt = _colors(original, range(35, 40), xs)
    # Skin tones are the light leg colours; dark ones are shared outlines.
    skin = {c for c in _colors(original, rows, xs) - skirt if _luma(c) >= 100}
    assert skin, "expected bare legs in the original"
    assert not skin & _colors(fixed, rows, xs)
