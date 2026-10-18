"""nagmon.learning must not import pygame or tuxemon (SDD_ARCHITECTURE s.2)."""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_no_pygame_or_tuxemon_imports():
    code = (
        "import sys; import nagmon.learning; "
        "from nagmon.learning.content import ContentLibrary; "
        "ContentLibrary.load(); "
        "bad = [m for m in sys.modules "
        "if m.split('.')[0] in ('pygame', 'tuxemon')]; "
        "print(','.join(bad))"
    )
    out = subprocess.run(
        [sys.executable, "-c", code],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    assert out.stdout.strip() == ""
