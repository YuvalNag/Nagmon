# SPDX-License-Identifier: GPL-3.0
"""Twemoji image loader (SDD_FIGURES §2.3).

Codes look like Twemoji file names: lowercase hex code points joined by
"-", e.g. ``1f436`` or ``1f468-200d-1f469``. ``emoji:`` prefixes, ``U+``,
upper case, ``_`` separators and the emoji characters themselves are all
accepted. Missing images give ``None`` so the UI can show text instead.
"""

from __future__ import annotations

import logging
import re
from collections import OrderedDict
from pathlib import Path

import pygame

logger = logging.getLogger(__name__)

FE0F = "fe0f"
_HEX = re.compile(r"[0-9a-f]{1,6}")


def default_root() -> Path:
    """``mods/nagmon/gfx/emoji`` of this repository."""
    return Path(__file__).resolve().parents[2] / "mods/nagmon/gfx/emoji"


def normalize_code(code: str) -> str:
    """Return the canonical ``1f468-200d-1f469`` form, or ``""``."""
    text = (code or "").strip()
    if text.lower().startswith("emoji:"):
        text = text[6:].strip()
    if not text:
        return ""
    if any(ord(ch) > 0x7F for ch in text):
        return "-".join(f"{ord(ch):x}" for ch in text if not ch.isspace())
    text = text.lower().replace("u+", "")
    parts = [p for p in re.split(r"[-_\s]+", text) if p]
    return "-".join(p.lstrip("0") or "0" for p in parts)


def candidates(code: str) -> list[str]:
    """File stems to try, in order: as given, without fe0f, with fe0f."""
    norm = normalize_code(code)
    parts = norm.split("-") if norm else []
    if not parts or not all(_HEX.fullmatch(p) for p in parts):
        return []
    out = [norm]
    stripped = "-".join(p for p in parts if p != FE0F)
    if stripped:
        out.append(stripped)
        bare = stripped.split("-")
        out.append("-".join([bare[0], FE0F, *bare[1:]]))
    return list(dict.fromkeys(out))


class EmojiLoader:
    """Loads and scales Twemoji PNGs with a bounded LRU cache."""

    def __init__(self, root: Path | str, cache_size: int = 256) -> None:
        self.root = Path(root)
        self.cache_size = max(1, cache_size)
        self._cache: OrderedDict[tuple[str, int], pygame.Surface | None] = (
            OrderedDict()
        )

    def path_for(self, code: str) -> Path | None:
        """The image file for ``code``, or ``None``."""
        if not self.root.is_dir():
            return None
        for stem in candidates(code):
            path = self.root / f"{stem}.png"
            if path.is_file():
                return path
        return None

    def get(self, code: str, size: int) -> pygame.Surface | None:
        """The emoji scaled so its longer side is ``size`` pixels."""
        if size <= 0:
            return None
        key = (normalize_code(code), int(size))
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        surf = self._load(key[0], key[1])
        self._cache[key] = surf
        while len(self._cache) > self.cache_size:
            self._cache.popitem(last=False)
        return surf

    def _load(self, code: str, size: int) -> pygame.Surface | None:
        path = self.path_for(code)
        if path is None:
            return None
        try:
            image = pygame.image.load(str(path))
        except (pygame.error, OSError) as exc:
            logger.warning("emoji %s unreadable: %s", path, exc)
            return None
        if pygame.display.get_init() and pygame.display.get_surface():
            image = image.convert_alpha()
        w, h = image.get_size()
        scale = size / max(w, h, 1)
        new = (max(1, round(w * scale)), max(1, round(h * scale)))
        if image.get_bitsize() not in (24, 32):
            image = image.convert(32, pygame.SRCALPHA)
        return pygame.transform.smoothscale(image, new)
