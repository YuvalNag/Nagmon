"""The phone app's icons: sizes, safe zone, transparency, up to date."""

from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from tools.app import icons

RES = icons.RES
DENS = icons.DENSITIES
ADAPTIVE = {d: round(108 * k) for d, k in DENS.items()}
LEGACY = {d: round(48 * k) for d, k in DENS.items()}


def rgba(path: Path) -> np.ndarray:
    return np.array(Image.open(path).convert("RGBA"))


def test_expected_sizes():
    assert ADAPTIVE == {"mdpi": 108, "hdpi": 162, "xhdpi": 216,
                        "xxhdpi": 324, "xxxhdpi": 432}
    assert LEGACY == {"mdpi": 48, "hdpi": 72, "xhdpi": 96,
                      "xxhdpi": 144, "xxxhdpi": 192}


@pytest.mark.parametrize("d", DENS)
def test_every_icon_file_exists_with_its_size(d):
    base = RES / f"mipmap-{d}"
    for name in ("ic_launcher_foreground", "ic_launcher_monochrome"):
        assert Image.open(base / f"{name}.png").size == (ADAPTIVE[d],) * 2
    for name in ("ic_launcher", "ic_launcher_round"):
        assert Image.open(base / f"{name}.png").size == (LEGACY[d],) * 2


@pytest.mark.parametrize("d", DENS)
def test_foreground_is_transparent_and_inside_the_safe_zone(d):
    a = rgba(RES / f"mipmap-{d}" / "ic_launcher_foreground.png")
    n = a.shape[0]
    assert a[0, 0, 3] == 0 and a[-1, -1, 3] == 0
    ys, xs = np.nonzero(a[..., 3] > 0)
    # the launcher may mask all but the middle 72/108; its safe circle is
    # 66/108 across: every opaque pixel is inside it
    cy = cx = (n - 1) / 2
    r = np.hypot(ys - cy, xs - cx).max()
    assert r <= n * 66 / 108 / 2 + 1, (r, n)
    # and the badge is big, not a speck
    assert r >= n * 0.25


@pytest.mark.parametrize("d", DENS)
def test_legacy_icons_are_opaque_inside_and_round_has_no_corners(d):
    base = RES / f"mipmap-{d}"
    sq = rgba(base / "ic_launcher.png")
    rd = rgba(base / "ic_launcher_round.png")
    n = sq.shape[0]
    assert sq[n // 2, n // 2, 3] == 255 and rd[n // 2, n // 2, 3] == 255
    assert rd[0, 0, 3] == 0 and rd[0, -1, 3] == 0
    assert rd[n // 2, 0, 3] > 0


def test_monochrome_is_a_flat_white_shape():
    a = rgba(RES / "mipmap-xxxhdpi" / "ic_launcher_monochrome.png")
    on = a[..., 3] > 0
    assert on.any() and (~on).any()
    assert (a[on][:, :3] == 255).all()


def test_adaptive_xml_and_background():
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        x = (RES / "mipmap-anydpi-v26" / name).read_text()
        assert "@mipmap/ic_launcher_foreground" in x
        assert "@mipmap/ic_launcher_monochrome" in x
        assert "@color/ic_launcher_background" in x
    bg = (RES / "values" / "ic_launcher_background.xml").read_text()
    assert icons.BACKGROUND in bg
    # the old Capacitor vectors are gone
    assert not (RES / "drawable" / "ic_launcher_foreground.xml").exists()


def test_app_name_is_unchanged():
    s = (RES / "values" / "strings.xml").read_text()
    assert '<string name="app_name">נגמון</string>' in s


def test_splash_has_the_badge_in_every_size():
    files = sorted(RES.glob("drawable*/splash.png"))
    assert len(files) == 11
    for p in files:
        im = Image.open(p)
        assert im.mode == "RGB"
        w, h = im.size
        assert im.getpixel((2, 2)) == icons.hex_rgb(icons.BACKGROUND)
        assert im.getpixel((w // 2, h // 2)) != icons.hex_rgb(icons.BACKGROUND)


def test_web_icons():
    for name, px in icons.WEB_SIZES.items():
        im = Image.open(icons.APP / "public" / name)
        assert im.size == (px, px) and im.mode == "RGBA"
    html = (icons.APP / "index.html").read_text()
    assert 'href="favicon.png"' in html


def test_source_is_the_badge_and_magenta_is_keyed(tmp_path):
    b = icons.load_badge()
    assert max(b.size) > 300
    # a source with a magenta matte gives the same badge shape
    src = Image.open(icons.SOURCE).convert("RGBA")
    a = np.array(src)
    a[a[..., 3] == 0] = (255, 0, 255, 0)
    p = tmp_path / "m.png"
    Image.fromarray(a, "RGBA").save(p)
    assert icons.load_badge(p).size == b.size


def test_files_are_what_the_script_writes():
    """The committed files are the script's output (run it to refresh)."""
    assert icons.run(check=True) == []
