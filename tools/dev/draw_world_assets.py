"""
Draws the small pixel-art assets of the first world chapter
(docs/kids/SDD_WORLD.md §2.6): two academy badges and a wallet prop.

Usage:
    python tools/dev/draw_world_assets.py
"""

from __future__ import annotations

import os
from pathlib import Path

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")

import pygame  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
NAGMON = ROOT / "mods" / "nagmon"
OUTLINE = (40, 32, 28)


def badge(path: Path, fill, rim, symbol) -> None:
    """A 24x24 hexagon badge with a symbol drawn by ``symbol(surface)``."""
    s = pygame.Surface((24, 24), pygame.SRCALPHA)
    hexagon = [(12, 1), (22, 6), (22, 17), (12, 22), (2, 17), (2, 6)]
    pygame.draw.polygon(s, rim, hexagon)
    inner = [(12, 3), (20, 7), (20, 16), (12, 20), (4, 16), (4, 7)]
    pygame.draw.polygon(s, fill, inner)
    pygame.draw.polygon(s, OUTLINE, hexagon, 1)
    symbol(s)
    path.parent.mkdir(parents=True, exist_ok=True)
    pygame.image.save(s, path)


def triangle(s) -> None:
    pts = [(12, 6), (17, 15), (7, 15)]
    pygame.draw.polygon(s, (255, 214, 92), pts)
    pygame.draw.polygon(s, OUTLINE, pts, 1)


def plus(s) -> None:
    gold = (255, 236, 160)
    pygame.draw.rect(s, OUTLINE, (10, 5, 4, 14))
    pygame.draw.rect(s, OUTLINE, (5, 10, 14, 4))
    pygame.draw.rect(s, gold, (11, 6, 2, 12))
    pygame.draw.rect(s, gold, (6, 11, 12, 2))


def wallet(path: Path) -> None:
    """A 16x32 static prop; the wallet lies in the bottom tile."""
    s = pygame.Surface((16, 32), pygame.SRCALPHA)
    pygame.draw.ellipse(s, (0, 0, 0, 60), (2, 27, 12, 4))
    pygame.draw.rect(s, OUTLINE, (2, 20, 12, 9))
    pygame.draw.rect(s, (150, 92, 52), (3, 21, 10, 7))
    pygame.draw.rect(s, (118, 68, 38), (3, 21, 10, 3))
    pygame.draw.rect(s, (238, 200, 90), (11, 23, 2, 2))
    path.parent.mkdir(parents=True, exist_ok=True)
    pygame.image.save(s, path)


def main() -> None:
    pygame.init()
    items = NAGMON / "gfx" / "items"
    badge(
        items / "nagmon_badge_granite.png",
        (150, 140, 128),
        (96, 88, 80),
        triangle,
    )
    badge(items / "nagmon_badge_mila.png", (255, 138, 91), (196, 90, 50), plus)
    wallet(NAGMON / "sprites_obj" / "nagmon_wallet.png")
    print("drawn")


if __name__ == "__main__":
    main()
