# SPDX-License-Identifier: GPL-3.0
"""The emulator check fails on a portrait game and shows its screenshots."""

import base64
import io
import sys
from pathlib import Path

import pytest
from PIL import Image

sys.path.insert(
    0, str(Path(__file__).resolve().parents[2] / "tools" / "android")
)
import screen_shape  # noqa: E402


def png(width: int, height: int) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (width, height), (10, 200, 30)).save(out, "PNG")
    return out.getvalue()


def test_reads_the_png_size():
    assert screen_shape.png_size(png(2400, 1080)) == (2400, 1080)


def test_rejects_other_files():
    with pytest.raises(ValueError):
        screen_shape.png_size(b"GIF89a" + b"\0" * 30)


@pytest.mark.parametrize(
    ("size", "code"),
    [((2400, 1080), 0), ((1080, 2400), 1), ((1000, 1000), 0)],
)
def test_shape_fails_when_the_game_stands_upright(
    tmp_path, capsys, size, code
):
    shot = tmp_path / "screen.png"
    shot.write_bytes(png(*size))
    assert screen_shape.main(["x", "shape", str(shot)]) == code
    assert capsys.readouterr().out.strip() == f"{size[0]}x{size[1]}"


def test_show_prints_a_small_jpeg_between_markers(tmp_path, capsys):
    shot = tmp_path / "screen-last.png"
    shot.write_bytes(png(2400, 1080))
    assert screen_shape.main(["x", "show", str(shot)]) == 0
    lines = capsys.readouterr().out.splitlines()
    assert lines[0] == screen_shape.BEGIN.format(name="screen-last.png")
    assert lines[-1] == screen_shape.END
    image = Image.open(io.BytesIO(base64.b64decode(lines[1])))
    assert image.format == "JPEG" and image.size == (720, 324)


def test_show_without_pillow_says_so(tmp_path, capsys, monkeypatch):
    shot = tmp_path / "screen.png"
    shot.write_bytes(png(10, 5))

    def no_pillow(data: bytes) -> bytes:
        raise ImportError("PIL")

    monkeypatch.setattr(screen_shape, "thumbnail", no_pillow)
    assert screen_shape.main(["x", "show", str(shot)]) == 1
    assert "Pillow is not installed" in capsys.readouterr().out


def test_usage():
    with pytest.raises(SystemExit):
        screen_shape.main(["x"])
