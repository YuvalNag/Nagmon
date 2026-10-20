"""Shared fixtures for the Nagmon learning-engine tests (pure Python)."""

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class FakeClock:
    """Injected clock: a float time that tests advance explicitly."""

    def __init__(self, start: float = 1_800_000_000.0) -> None:
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture(autouse=True)
def _no_app_log_after_the_test():
    """Starting the game (rules.apply) starts the app's log on the root
    logger; it must not outlive the test."""
    yield
    from nagmon.field_data import app_log

    if app_log.current() is not None:
        app_log.uninstall()


@pytest.fixture(scope="session")
def library():
    from nagmon.learning.content import ContentLibrary

    return ContentLibrary.load()
