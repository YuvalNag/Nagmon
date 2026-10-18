# SPDX-License-Identifier: GPL-3.0
"""Emoji image loader and Twemoji assets (SDD_FIGURES §3, rows 17-22)."""

from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import patch

import pygame
import pytest
from nagmon.ui.emoji import EmojiLoader, default_root, normalize_code

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")


def _png(path: Path, size=(72, 72), rgb=(200, 50, 50)) -> None:
    surf = pygame.Surface(size, pygame.SRCALPHA)
    surf.fill(rgb + (255,))
    pygame.image.save(surf, str(path))


@pytest.fixture
def root(tmp_path: Path) -> Path:
    pygame.init()
    _png(tmp_path / "1f436.png")
    _png(tmp_path / "1f468-200d-1f469-200d-1f467.png")
    _png(tmp_path / "2764.png")  # Twemoji drops fe0f here
    _png(tmp_path / "1f3f3-fe0f-200d-1f308.png")  # ...but keeps it here
    _png(tmp_path / "wide.png", size=(144, 72))
    return tmp_path


@pytest.mark.parametrize(
    "raw",
    ["emoji:1f436", "1f436", "1F436", " emoji:1F436 ", "U+1F436", "🐶"],
)
def test_normalize_code(raw):
    assert normalize_code(raw) == "1f436"


def test_normalize_multi_codepoint():
    assert normalize_code("emoji:1F468_200D_1F469") == "1f468-200d-1f469"
    assert normalize_code("👨‍👩") == "1f468-200d-1f469"
    assert normalize_code("") == ""


def test_get_simple(root):
    surf = EmojiLoader(root).get("emoji:1f436", 48)
    assert surf is not None and surf.get_size() == (48, 48)


def test_get_multi_codepoint(root):
    loader = EmojiLoader(root)
    assert loader.get("1f468-200d-1f469-200d-1f467", 32) is not None


def test_fe0f_dropped_when_file_has_none(root):
    assert EmojiLoader(root).get("2764-fe0f", 32) is not None
    assert EmojiLoader(root).get("❤️", 32) is not None


def test_fe0f_added_when_file_has_it(root):
    assert EmojiLoader(root).get("1f3f3-200d-1f308", 32) is not None


def test_missing_emoji_returns_none(root):
    loader = EmojiLoader(root)
    assert loader.get("1f9ff-1f9ff", 32) is None
    assert loader.get("", 32) is None
    assert loader.get("emoji:", 32) is None
    assert loader.get("not hex!", 32) is None


def test_missing_root_returns_none(tmp_path):
    assert EmojiLoader(tmp_path / "nope").get("1f436", 32) is None


def test_cache_returns_same_object_without_reloading(root):
    loader = EmojiLoader(root)
    first = loader.get("1f436", 40)
    with patch("pygame.image.load", side_effect=AssertionError):
        again = loader.get("emoji:1f436", 40)
        miss_again = loader.get("1f9ff", 40)
        loader.get("1f9ff", 40)
    assert again is first
    assert miss_again is None
    assert loader.get("1f436", 20) is not first


def test_cache_is_bounded(root):
    loader = EmojiLoader(root, cache_size=2)
    a = loader.get("1f436", 10)
    loader.get("1f436", 11)
    loader.get("1f436", 12)
    assert loader.get("1f436", 10) is not a


def test_aspect_ratio_kept_in_square(root):
    surf = EmojiLoader(root).get("wide", 36)
    assert surf is not None and max(surf.get_size()) == 36
    assert surf.get_size() == (36, 18)


def test_bad_size_returns_none(root):
    assert EmojiLoader(root).get("1f436", 0) is None


# Codes used by the arithmetic generators (names.OBJECTS) and common words.
REQUIRED = [
    "1f34e", "1f388", "1f33c", "1f41f", "1f36a", "1f4d5", "1f426",
    "1f333", "1f697", "1f353", "1f34c", "1f41e", "1f98b", "1f436",
    "1f408", "1faa8", "1fa91", "1f44b", "1f3e0", "2b50",
]  # fmt: skip


def test_bundled_twemoji_assets():
    root = default_root()
    if not root.is_dir():
        pytest.skip("Twemoji assets are not bundled")
    pngs = list(root.glob("*.png"))
    assert len(pngs) > 300
    assert (root / "LICENSE.md").is_file()
    loader = EmojiLoader(root)
    pygame.init()
    for code in REQUIRED:
        assert loader.get(code, 24) is not None, code
    # Twemoji file name keeps fe0f inside ZWJ sequences, drops it otherwise
    assert loader.get("emoji:2764-fe0f", 24) is not None
