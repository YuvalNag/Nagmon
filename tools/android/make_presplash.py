"""
The presplash: what Android shows while Python loads
(docs/kids/SDD_ANDROID.md §2.7). The intro's last frame (HD) at the
phone's size, 2400x1080, covering it (a little of the top and bottom is
cut), as a JPEG for buildozer.

Usage:
    python tools/android/make_presplash.py

Prints the colour of its edges, which ``stage.py`` names as
``PRESPLASH_COLOR`` (the background around it on another screen shape).
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageStat

REPO = Path(__file__).resolve().parents[2]
SOURCE = REPO / "mods" / "nagmon" / "gfx" / "intro" / "0120.jpg"
TARGET = REPO / "buildconfig" / "android" / "presplash.jpg"
SIZE = (2400, 1080)
QUALITY = 84


def cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """``image`` scaled to cover ``size`` without stretching, centred."""
    w, h = image.size
    scale = max(size[0] / w, size[1] / h)
    big = image.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    left = (big.width - size[0]) // 2
    top = (big.height - size[1]) // 2
    return big.crop((left, top, left + size[0], top + size[1]))


def edge_color(image: Image.Image) -> str:
    """The mean colour of the left and right edges, as #RRGGBB."""
    w, h = image.size
    strips = [image.crop((0, 0, 4, h)), image.crop((w - 4, 0, w, h))]
    means = [ImageStat.Stat(s.convert("RGB")).mean for s in strips]
    rgb = [round(sum(m[i] for m in means) / len(means)) for i in range(3)]
    return "#{:02X}{:02X}{:02X}".format(*rgb)


def make(source: Path = SOURCE, target: Path = TARGET) -> str:
    with Image.open(source) as frame:
        picture = cover(frame.convert("RGB"), SIZE)
    picture.save(target, "JPEG", quality=QUALITY, optimize=True)
    return edge_color(picture)


if __name__ == "__main__":
    color = make()
    print(f"{TARGET.relative_to(REPO)}: {TARGET.stat().st_size // 1024} KB")
    print(f"edge colour {color}")
