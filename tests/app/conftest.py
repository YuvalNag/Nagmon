"""Shared fixtures for the app data build tests (tools/app)."""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

GAME = ROOT / "app" / "public" / "game"


@pytest.fixture(scope="session")
def built():
    """One in-memory build of everything: (Output, report)."""
    from tools.app.build_data import build

    return build()


@pytest.fixture(scope="session")
def game_json():
    """Reads a committed JSON file under app/public/game."""

    def read(rel):
        return json.loads((GAME / rel).read_text(encoding="utf-8"))

    return read
