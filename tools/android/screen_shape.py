# SPDX-License-Identifier: GPL-3.0
"""
Checks and shows emulator screenshots (docs/kids/SDD_ANDROID.md §5).

``screen_shape.py shape FILE`` prints WIDTHxHEIGHT of a PNG and exits 1
when it is taller than wide (the game must fill the screen sideways).
``screen_shape.py show FILE`` prints a small JPEG of it as base64 between
marker lines, so a screenshot can be read from the job log alone.
Standard library only, except ``show``, which needs Pillow.
"""

from __future__ import annotations

import base64
import io
import struct
import sys
from pathlib import Path

BEGIN = "----- screenshot {name} (jpeg, base64) -----"
END = "----- end screenshot -----"


def png_size(data: bytes) -> tuple[int, int]:
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValueError("not a PNG")
    width, height = struct.unpack(">II", data[16:24])
    return width, height


def thumbnail(data: bytes, width: int = 720) -> bytes:
    from PIL import Image

    image = Image.open(io.BytesIO(data)).convert("RGB")
    if image.width > width:
        image = image.resize(
            (width, round(image.height * width / image.width))
        )
    out = io.BytesIO()
    image.save(out, "JPEG", quality=70)
    return out.getvalue()


def main(argv: list[str]) -> int:
    command, path = argv[1], Path(argv[2])
    data = path.read_bytes()
    if command == "shape":
        width, height = png_size(data)
        print(f"{width}x{height}")
        return 1 if height > width else 0
    if command == "show":
        print(BEGIN.format(name=path.name))
        print(base64.b64encode(thumbnail(data)).decode())
        print(END)
        return 0
    raise SystemExit(f"unknown command {command}")


if __name__ == "__main__":
    sys.exit(main(sys.argv))
