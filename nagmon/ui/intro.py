# SPDX-License-Identifier: GPL-3.0
"""
The intro movie (docs/kids/SDD_ART.md §2.4): still frames shown in time
with a sound track, one frame in memory at a time, letterboxed to the
screen, skipped by any press.

Pure pygame, so it runs headless in tests; the game state that wraps it
is ``mods/nagmon/states/nagmon_intro.py``.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any

import pygame

from nagmon import mod_dir

logger = logging.getLogger(__name__)

INTRO_DIR = mod_dir() / "gfx" / "intro"
INTRO_AUDIO = INTRO_DIR / "intro.ogg"
FPS = 12
#: A long frame (the game still loading) moves the movie this much only.
MAX_STEP = 0.25
#: After this many frames that would not load, the movie ends.
MAX_FAILURES = 3
#: Set to anything to start without the intro.
NO_INTRO_ENV = "NAGMON_NO_INTRO"
#: SDL video drivers without a screen to watch.
HEADLESS_DRIVERS = {"", "dummy", "offscreen"}
STATE_NAME = "NagmonIntroState"
BLACK = (0, 0, 0)


def frame_paths(folder: Path | None = None) -> list[Path]:
    """The frames in order (``0001.jpg``, ``0002.jpg``...)."""
    folder = INTRO_DIR if folder is None else folder
    if not folder.is_dir():
        return []
    return sorted(folder.glob("*.jpg"))


def frame_at(elapsed: float, fps: float, count: int) -> int | None:
    """The frame to show ``elapsed`` seconds in; ``None`` once it ended."""
    index = int(elapsed * fps + 1e-9)
    return index if 0 <= index < count else None


def letterbox(size: tuple[int, int], screen: tuple[int, int]) -> pygame.Rect:
    """``size`` scaled to fit ``screen`` without stretching, centred."""
    w, h = size
    sw, sh = screen
    scale = min(sw / w, sh / h)
    fw, fh = round(w * scale), round(h * scale)
    return pygame.Rect((sw - fw) // 2, (sh - fh) // 2, fw, fh)


def edge_color(frame: pygame.Surface, sides: bool) -> tuple[int, int, int]:
    """
    The mean colour of the frame's left and right edges (``sides``) or of
    its top and bottom edges: what the bars around it are painted.
    """
    w, h = frame.get_size()
    if sides:
        edges = [(0, 0, 2, h), (w - 2, 0, 2, h)]
    else:
        edges = [(0, 0, w, 2), (0, h - 2, w, 2)]
    colors = [pygame.transform.average_color(frame, rect) for rect in edges]
    return tuple(  # type: ignore[return-value]
        round(sum(c[i] for c in colors) / len(colors)) for i in range(3)
    )


def should_play(driver: str, env: Mapping[str, str], frames: int) -> bool:
    """Only on a real screen, when not switched off, with frames."""
    return (
        driver not in HEADLESS_DRIVERS
        and NO_INTRO_ENV not in env
        and frames > 0
    )


class IntroMovie:
    """The frames on a clock; only the frame on screen is loaded."""

    def __init__(
        self,
        paths: Sequence[Path],
        fps: float = FPS,
        loader: Callable[[str], pygame.Surface] = pygame.image.load,
    ) -> None:
        self.paths = list(paths)
        self.fps = fps
        self.loader = loader
        self.elapsed = 0.0
        self._index: int | None = None
        self._frame: pygame.Surface | None = None
        self._failed: set[int] = set()

    @property
    def index(self) -> int | None:
        """The frame due now (None once the movie is over)."""
        return frame_at(self.elapsed, self.fps, len(self.paths))

    @property
    def shown_index(self) -> int | None:
        """The frame actually on screen (an earlier one if one failed)."""
        return self._index

    @property
    def finished(self) -> bool:
        return self.index is None or len(self._failed) >= MAX_FAILURES

    def advance(self, dt: float) -> None:
        self.elapsed += max(0.0, min(dt, MAX_STEP))

    def frame(self) -> pygame.Surface | None:
        index = self.index
        if index is None:
            return None
        if index != self._index and index not in self._failed:
            try:
                frame = self.loader(str(self.paths[index]))
            except (OSError, pygame.error):
                # Once per frame: the previous one stays on screen, and
                # after a few the movie ends instead of logging every draw.
                self._failed.add(index)
                logger.warning(
                    "Intro frame %s did not load", self.paths[index]
                )
                return self._frame
            if pygame.display.get_surface() is not None:
                frame = frame.convert()
            self._index, self._frame = index, frame
        return self._frame


class IntroPlayer:
    """
    What the intro state does, apart from the state machine: starts the
    sound (pausing the menu music), draws, and closes itself once.
    """

    def __init__(
        self,
        client: Any,
        movie: IntroMovie,
        audio: Path | None = INTRO_AUDIO,
        volume: float = 1.0,
        owner: Any = None,
    ) -> None:
        self.client = client
        self.movie = movie
        self.audio = audio
        self.volume = volume
        self.owner = owner
        self.done = False
        self._started = False
        self._paused_music = False
        self._sound: Any = None
        self._scaled: tuple[Any, ...] | None = None

    def _music(self) -> Any:
        return getattr(self.client, "current_music", None)

    def start(self) -> None:
        self._started = True
        music = self._music()
        if music is not None and getattr(music, "is_playing", lambda: True)():
            music.pause()
            self._paused_music = True
        muted = bool(getattr(music, "muted", False))
        if self.audio is None or muted or not pygame.mixer.get_init():
            return
        try:
            self._sound = pygame.mixer.Sound(str(self.audio))
            self._sound.set_volume(self.volume)
            self._sound.play()
        except (OSError, pygame.error):
            logger.warning("Intro sound %s could not play", self.audio)
            self._sound = None

    def update(self, dt: float) -> None:
        if self.done:
            return
        if not self._started:
            self.start()
        self.movie.advance(dt)
        if self.movie.finished:
            self.finish()

    def press(self) -> None:
        """Any key, click or tap."""
        self.finish()

    def finish(self) -> None:
        if self.done:
            return
        self.done = True
        if self._sound is not None:
            self._sound.stop()
        if self._paused_music:
            self._music().unpause()
        self.client.pop_state(self.owner)

    def draw(self, surface: pygame.Surface) -> None:
        frame = self.movie.frame()
        if frame is None:
            surface.fill(BLACK)
            return
        screen = surface.get_size()
        key = (self.movie.shown_index, screen)
        if self._scaled is None or self._scaled[0] != key:
            rect = letterbox(frame.get_size(), screen)
            scaled = pygame.transform.scale(frame, rect.size)
            color = edge_color(frame, sides=rect.width < screen[0])
            self._scaled = (key, scaled, rect, color)
        _, scaled, rect, color = self._scaled
        surface.fill(color)
        surface.blit(scaled, rect)


def can_decode(path: Path) -> bool:
    """
    Whether this build of pygame reads the frames (JPEG needs SDL_image
    with JPEG; the phone's build is checked here, at launch, once).
    """
    if not pygame.image.get_extended():
        return False
    try:
        pygame.image.load(str(path))
    except (OSError, pygame.error):
        return False
    return True


def start_intro(
    client: Any,
    driver: str | None = None,
    env: Mapping[str, str] | None = None,
) -> bool:
    """
    At launch: when the intro can play, it takes the place of pygame's
    splash screen, above Tuxemon's "press a key" screen.
    """
    if driver is None:
        try:
            driver = pygame.display.get_driver()
        except pygame.error:
            driver = ""
    frames = frame_paths()
    if not should_play(
        driver, os.environ if env is None else env, len(frames)
    ):
        return False
    if not can_decode(frames[0]):
        logger.warning("This build cannot read the intro frames: no intro")
        return False
    names = [state.name for state in client.active_states]
    for name in ("FadeInTransition", "SplashState"):
        if name in names:
            client.remove_state_by_name(name)
    client.push_state(STATE_NAME)
    return True
