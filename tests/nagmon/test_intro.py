# SPDX-License-Identifier: GPL-3.0
"""The intro movie (docs/kids/SDD_ART.md §3, rows 22-29)."""

from __future__ import annotations

import os
from pathlib import Path
from types import SimpleNamespace

import pygame
import pytest

from nagmon.ui import intro

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")


# ------------------------------------------------------- pure functions


def test_frame_at_counts_by_time_and_ends():
    assert intro.frame_at(0.0, 12, 120) == 0
    assert intro.frame_at(0.5, 12, 120) == 6
    assert intro.frame_at(9.99, 12, 120) == 119
    assert intro.frame_at(10.0, 12, 120) is None
    assert intro.frame_at(0.0, 12, 0) is None


@pytest.mark.parametrize(
    ("screen", "rect"),
    [
        ((2400, 1080), (240, 0, 1920, 1080)),  # 20:9 phone: side bars
        ((1280, 720), (0, 0, 1280, 720)),  # same shape: fills it
        ((800, 600), (0, 75, 800, 450)),  # 4:3: bars above and below
    ],
)
def test_letterbox_keeps_the_shape(screen, rect):
    assert tuple(intro.letterbox((960, 540), screen)) == rect


def test_edge_color_comes_from_the_frame_edges():
    frame = pygame.Surface((40, 20))
    frame.fill((200, 200, 200))
    frame.fill((10, 20, 30), (0, 0, 2, 20))  # left edge
    frame.fill((30, 40, 50), (38, 0, 2, 20))  # right edge
    assert intro.edge_color(frame, sides=True) == (20, 30, 40)
    frame.fill((200, 200, 200))
    frame.fill((0, 0, 100), (0, 0, 40, 2))  # top edge
    frame.fill((0, 0, 200), (0, 18, 40, 2))  # bottom edge
    assert intro.edge_color(frame, sides=False) == (0, 0, 150)


def test_should_play_only_with_a_real_screen_and_frames():
    assert intro.should_play("x11", {}, 120)
    assert intro.should_play("android", {}, 120)
    assert not intro.should_play("dummy", {}, 120)
    assert not intro.should_play("", {}, 120)
    assert not intro.should_play("x11", {intro.NO_INTRO_ENV: "1"}, 120)
    assert not intro.should_play("x11", {}, 0)


# --------------------------------------------------------------- player


def fake_frames(tmp_path: Path, count: int = 24) -> list[Path]:
    paths = []
    for i in range(count):
        surf = pygame.Surface((32, 18))
        surf.fill((i * 10 % 256, 100, 100))
        path = tmp_path / f"{i + 1:04d}.png"
        pygame.image.save(surf, str(path))
        paths.append(path)
    return paths


def test_movie_loads_only_the_frame_it_shows(tmp_path):
    loads: list[str] = []

    def loader(path):
        loads.append(Path(path).name)
        return pygame.image.load(path)

    movie = intro.IntroMovie(fake_frames(tmp_path), fps=12, loader=loader)
    assert movie.frame() is not None
    assert movie.frame() is not None
    assert loads == ["0001.png"]
    movie.advance(0.25)
    movie.advance(0.25)
    movie.frame()
    assert loads == ["0001.png", "0007.png"]
    # A long stall (loading) moves the movie by MAX_STEP only.
    movie.advance(5.0)
    assert movie.elapsed == pytest.approx(0.5 + intro.MAX_STEP)
    while not movie.finished:
        movie.advance(0.1)
    assert movie.frame() is None
    assert movie.elapsed == pytest.approx(2.0, abs=0.11)


# ---------------------------------------------------------------- state


class FakeMusic:
    def __init__(self):
        self.calls: list[str] = []
        self.muted = False

    def pause(self):
        self.calls.append("pause")

    def unpause(self):
        self.calls.append("unpause")


class FakeClient:
    def __init__(self, names=()):
        self.current_music = FakeMusic()
        self.popped: list[object] = []
        self.pushed: list[str] = []
        self.removed: list[str] = []
        self.active_states = [SimpleNamespace(name=n) for n in names]

    def pop_state(self, state=None):
        self.popped.append(state)

    def push_state(self, name, **kwargs):
        self.pushed.append(name)

    def remove_state_by_name(self, name):
        self.removed.append(name)
        self.active_states = [s for s in self.active_states if s.name != name]


def make_player(tmp_path, client):
    return intro.IntroPlayer(
        client, intro.IntroMovie(fake_frames(tmp_path, 12)), audio=None
    )


def test_any_press_closes_the_intro_once(tmp_path):
    client = FakeClient()
    player = make_player(tmp_path, client)
    player.update(0.05)
    assert client.current_music.calls == ["pause"]
    player.press()
    player.press()
    player.update(0.05)
    assert player.done
    assert client.current_music.calls == ["pause", "unpause"]
    assert len(client.popped) == 1


def test_the_intro_closes_after_its_last_frame(tmp_path):
    client = FakeClient()
    player = make_player(tmp_path, client)
    for _ in range(12):
        player.update(0.1)
    assert player.done and len(client.popped) == 1


def test_the_frame_is_letterboxed_on_the_screen(tmp_path):
    player = make_player(tmp_path, FakeClient())
    screen = pygame.Surface((100, 30))
    screen.fill((255, 255, 255))
    player.draw(screen)
    # 32x18 scaled to 53x30 in the middle; the bars take the edge colour.
    assert screen.get_at((50, 15))[:3] == (0, 100, 100)
    assert screen.get_at((2, 15))[:3] == (0, 100, 100)


def test_start_intro_needs_a_screen(tmp_path, monkeypatch):
    frames = fake_frames(tmp_path, 3)
    monkeypatch.setattr(intro, "frame_paths", lambda folder=None: frames)
    client = FakeClient(["BackgroundState", "IntroState", "SplashState"])
    assert not intro.start_intro(client, driver="dummy", env={})
    assert client.pushed == [] and client.removed == []

    client = FakeClient(
        ["FadeInTransition", "SplashState", "IntroState", "BackgroundState"]
    )
    assert intro.start_intro(client, driver="x11", env={})
    assert client.removed == ["FadeInTransition", "SplashState"]
    assert client.pushed == ["NagmonIntroState"]


# --------------------------------------------------------------- assets


def test_the_intro_assets_are_in_the_mod():
    from PIL import Image

    paths = intro.frame_paths()
    assert len(paths) == 120
    with Image.open(paths[0]) as first:
        assert first.size == (960, 540)
        assert first.format == "JPEG"
    assert intro.INTRO_AUDIO.is_file()
    total = (
        sum(p.stat().st_size for p in paths) + intro.INTRO_AUDIO.stat().st_size
    )
    assert total < 12_000_000
