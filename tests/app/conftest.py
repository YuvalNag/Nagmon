"""Shared fixtures for the app data build tests (tools/app)."""

import os
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


@pytest.fixture(scope="session")
def built():
    """
    One in-memory build of everything: (Output, report).

    The build imports tuxemon, which writes its config and cache under
    HOME: it runs with a HOME of its own, removed after the session.
    """
    from tools.app.build_data import build

    with tempfile.TemporaryDirectory(prefix="nagmon-app-test-") as home:
        old = os.environ.get("HOME")
        os.environ["HOME"] = home
        try:
            result = build()
        finally:
            if old is None:
                del os.environ["HOME"]
            else:
                os.environ["HOME"] = old
        yield result
