# SPDX-License-Identifier: GPL-3.0
"""The phone app's icons, made from the Nagmon badge (the owner's logo).

Source: ``app/public/game/art/title/logo.webp``, the round badge with the
Nagmon reading a book (512 px, transparent). It is cropped to its own
outline and scaled, never redrawn. If a source still has a magenta matte,
``tools/app/art3_key.py`` clears it first.

Writes (all under ``app/``):

* ``android/.../res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher_foreground.png``
  108/162/216/324/432 px: the adaptive icon's foreground. The badge fits the
  66 dp safe circle (the launcher may mask the outer 18 dp on each side).
* ``ic_launcher_monochrome.png``: the same layer as one flat shape
  for themed icons (Android 13+): the badge without its dark disc.
* ``ic_launcher.png`` / ``ic_launcher_round.png``: the pre-Android 8 icons,
  48/72/96/144/192 px (rounded square / circle) with the badge on the
  background colour.
* ``values/ic_launcher_background.xml``: the adaptive background colour.
* ``drawable*/splash.png``: the launch picture (badge on the background
  colour, same sizes as before).
* ``public/favicon.png`` (32), ``public/icon-192.png``, ``public/icon-512.png``
  for the web page and its manifest.

The app's name ("נגמון", Nagmon) is in ``strings.xml`` and is
not touched. Run ``python -m tools.app.icons`` (``--check`` fails when a
file differs from what the script would write).
"""

from __future__ import annotations

import argparse
import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from tools.app import art3_key

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "app"
RES = APP / "android" / "app" / "src" / "main" / "res"
SOURCE = APP / "public" / "game" / "art" / "title" / "logo.webp"

#: The adaptive background: a light mint that the badge's gold rim and its
#: dark teal disc both stand out from.
BACKGROUND = "#CFF3E8"
#: A pixel with alpha above this is part of the badge (its outline box).
ALPHA_EDGE = 40

#: density -> scale to the 1x (mdpi) size
DENSITIES = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0,
             "xxxhdpi": 4.0}
ADAPTIVE_DP = 108
LEGACY_DP = 48
#: The badge's longer side as a fraction of the adaptive canvas: 62/108
#: leaves it inside the 66 dp safe circle (it is round, wings included).
ADAPTIVE_FILL = 60 / 108
LEGACY_FILL = 0.84
SPLASH_FILL = 0.38
#: Monochrome: pixels darker than this are the disc, not the figure.
MONO_LUMA = 75

WEB_SIZES = {"favicon.png": 32, "icon-192.png": 192, "icon-512.png": 512}


def hex_rgb(color: str) -> tuple[int, int, int]:
    return (int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16))


def load_badge(path: Path = SOURCE) -> Image.Image:
    """The badge, RGBA, cropped to its outline (no matte, no margin)."""
    im = Image.open(path).convert("RGBA")
    arr = np.array(im)
    if art3_key.pink_pixels(arr):
        arr, _ = art3_key.clean_matte(arr)
        im = Image.fromarray(arr, "RGBA")
    box = im.getchannel("A").point(
        lambda v: 255 if v > ALPHA_EDGE else 0
    ).getbbox()
    if box is None:
        raise SystemExit(f"{path}: nothing opaque")
    return im.crop(box)


def fit(badge: Image.Image, longer: int) -> Image.Image:
    """The badge scaled so that its longer side is ``longer`` px."""
    k = longer / max(badge.size)
    size = (max(1, round(badge.width * k)), max(1, round(badge.height * k)))
    return badge.resize(size, Image.LANCZOS)


def centered(
    badge: Image.Image, canvas: int | tuple[int, int], fill: float,
    bg: tuple[int, int, int] | None = None,
) -> Image.Image:
    w, h = (canvas, canvas) if isinstance(canvas, int) else canvas
    out = Image.new(
        "RGBA", (w, h), (*bg, 255) if bg else (0, 0, 0, 0)
    )
    b = fit(badge, round(min(w, h) * fill))
    out.alpha_composite(b, ((w - b.width) // 2, (h - b.height) // 2))
    return out


def foreground(badge: Image.Image, px: int) -> Image.Image:
    return centered(badge, px, ADAPTIVE_FILL)


def monochrome(badge: Image.Image, px: int) -> Image.Image:
    """White figure on transparent; the dark disc is left out."""
    fg = np.array(foreground(badge, px)).astype(np.float32)
    luma = fg[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
    a = fg[..., 3] * np.clip((luma - MONO_LUMA) / 25.0, 0.0, 1.0)
    out = np.zeros(fg.shape, np.uint8)
    out[..., :3] = 255
    out[..., 3] = a.round().astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def legacy(badge: Image.Image, px: int, round_: bool) -> Image.Image:
    """Pre-Android 8: a rounded square or a circle with the badge in it."""
    s = px * 4
    base = centered(badge, s, LEGACY_FILL, hex_rgb(BACKGROUND))
    mask = Image.new("L", (s, s), 0)
    d = ImageDraw.Draw(mask)
    if round_:
        d.ellipse((0, 0, s - 1, s - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, s - 1, s - 1), radius=round(s * 0.18),
                            fill=255)
    base.putalpha(mask)
    return base.resize((px, px), Image.LANCZOS)


def splash(badge: Image.Image, size: tuple[int, int]) -> Image.Image:
    return centered(badge, size, SPLASH_FILL, hex_rgb(BACKGROUND)).convert(
        "RGB"
    )


def png_bytes(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def background_xml() -> str:
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        f'    <color name="ic_launcher_background">{BACKGROUND}</color>\n'
        "</resources>"
    )


def splash_sizes(res: Path = RES) -> dict[Path, tuple[int, int]]:
    """Every launch picture that exists, with its pixel size."""
    out = {}
    for p in sorted(res.glob("drawable*/splash.png")):
        with Image.open(p) as im:
            out[p] = im.size
    return out


def outputs(
    badge: Image.Image, res: Path = RES, app: Path = APP
) -> dict[Path, bytes]:
    """Every file the script writes: path -> content."""
    files: dict[Path, bytes] = {}
    for name, k in DENSITIES.items():
        d = res / f"mipmap-{name}"
        files[d / "ic_launcher_foreground.png"] = png_bytes(
            foreground(badge, round(ADAPTIVE_DP * k))
        )
        files[d / "ic_launcher_monochrome.png"] = png_bytes(
            monochrome(badge, round(ADAPTIVE_DP * k))
        )
        px = round(LEGACY_DP * k)
        files[d / "ic_launcher.png"] = png_bytes(legacy(badge, px, False))
        files[d / "ic_launcher_round.png"] = png_bytes(legacy(badge, px, True))
    files[res / "values" / "ic_launcher_background.xml"] = (
        background_xml().encode()
    )
    for p, size in splash_sizes(res).items():
        files[p] = png_bytes(splash(badge, size))
    for name, px in WEB_SIZES.items():
        files[app / "public" / name] = png_bytes(
            centered(badge, px, 0.96 if px <= 64 else 0.86)
        )
    return files


def adaptive_xml() -> str:
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android='
        '"http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/ic_launcher_background"/>\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
        '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n'
        "</adaptive-icon>"
    )


def run(check: bool = False) -> list[Path]:
    """Writes the files (or, with ``check``, only lists the ones that differ)."""
    badge = load_badge()
    files = outputs(badge)
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        files[RES / "mipmap-anydpi-v26" / name] = adaptive_xml().encode()
    changed = []
    for p, data in files.items():
        if not p.exists() or p.read_bytes() != data:
            changed.append(p)
            if not check:
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(data)
    return changed


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true",
                    help="exit 1 when a file differs from the script's output")
    args = ap.parse_args(argv)
    changed = run(check=args.check)
    for p in changed:
        print(("differs: " if args.check else "wrote: ") + str(
            p.relative_to(ROOT)))
    if not changed:
        print("icons are up to date")
    return 1 if (args.check and changed) else 0


if __name__ == "__main__":
    sys.exit(main())
