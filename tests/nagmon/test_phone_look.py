"""
The look on a big phone screen (docs/kids/SDD_ANDROID.md §2.7): no
Tuxemon title screen, a battle across the whole 20:9 screen, HD twins
of Tuxemon's UI images.
"""

from __future__ import annotations

import os
from unittest.mock import MagicMock

import pygame
import pytest

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

# ---------------------------------------------------------------- the title


def _intro_state(on_top: bool = True):
    from mods.nagmon.states.nagmon_intro import IntroState

    client = MagicMock()
    state = IntroState(client=client)
    client.current_state = state if on_top else object()
    return state, client


def test_the_game_registers_nagmons_intro_state():
    from tuxemon.constants.paths import LIBDIR
    from tuxemon.state.loader import StateLoader
    from tuxemon.state.repository import StateRepository

    repo = StateRepository.from_loader(StateLoader("tuxemon.states", LIBDIR))
    cls = repo.get_state("IntroState")
    assert cls.__module__ == "mods.nagmon.states.nagmon_intro"
    # The movie is still there, under its own name.
    assert repo.get_state("NagmonIntroState").__module__ == cls.__module__


def test_nagmons_intro_state_is_not_tuxemons_press_a_key_screen():
    from mods.nagmon.states.nagmon_intro import IntroState
    from tuxemon.states.intro_state import IntroState as TuxemonIntro

    assert not issubclass(IntroState, TuxemonIntro)
    state, client = _intro_state()
    # No "intro" animation (the girl in the short skirt) and no music.
    client.current_music.play.assert_not_called()
    surface = pygame.Surface((64, 36))
    surface.fill((1, 2, 3))
    state.draw(surface)
    assert surface.get_at((10, 10))[:3] == (1, 2, 3)


def test_on_top_it_goes_straight_to_the_title_once():
    state, client = _intro_state()
    state.update(0.016)
    state.update(0.016)
    client.queue_command.assert_called_once()
    client.queue_command.call_args[0][0]()
    client.replace_state.assert_called_once_with("StartState")


def test_under_the_intro_movie_it_waits():
    # At launch the movie is above it: replacing the *top* state would
    # close the movie instead.
    state, client = _intro_state(on_top=False)
    state.update(0.016)
    client.queue_command.assert_not_called()
    client.replace_state.assert_not_called()


def test_a_key_or_a_tap_is_swallowed():
    state, client = _intro_state()
    event = MagicMock(pressed=True)
    assert state.process_event(event) is None
    client.replace_state.assert_not_called()


# ----------------------------------------------------------- HD twins


@pytest.fixture
def display():
    pygame.init()
    if pygame.display.get_surface() is None:
        pygame.display.set_mode((640, 480))
    yield


@pytest.fixture
def mods(tmp_path, monkeypatch):
    """Two mods: "nagmon" before "tuxemon", as the game orders them."""
    from tuxemon.constants import asset_loader

    roots = (tmp_path / "nagmon", tmp_path / "tuxemon")
    for root in roots:
        (root / "gfx").mkdir(parents=True)
    monkeypatch.setattr(asset_loader, "_MOD_ASSET_ROOTS", roots)
    _forget()
    yield roots
    _forget()


def _forget() -> None:
    from tuxemon.constants.asset_loader import fetch_asset
    from tuxemon.graphics import fetch_hd_twin

    fetch_asset.cache_clear()
    fetch_hd_twin.cache_clear()


def _save(surface: pygame.Surface, path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pygame.image.save(surface, str(path))


def _checker(size, k=1) -> pygame.Surface:
    """A checkerboard whose every native pixel is a k x k block."""
    w, h = size
    surf = pygame.Surface((w * k, h * k))
    for y in range(h):
        for x in range(w):
            color = (200, 40, 40) if (x + y) % 2 else (40, 40, 200)
            surf.fill(color, (x * k, y * k, k, k))
    return surf


def test_the_twin_name():
    from tuxemon.graphics import hd_twin_name

    assert hd_twin_name("gfx/borders/borders.png") == (
        "gfx/borders/borders@4x.png"
    )


def test_a_twin_is_found_by_mod_order(mods, display):
    from tuxemon.graphics import fetch_hd_twin

    nagmon, tuxemon = mods
    _save(_checker((6, 6)), tuxemon / "gfx" / "box.png")
    assert fetch_hd_twin("gfx/box.png") is None
    _save(_checker((6, 6), 4), nagmon / "gfx" / "box@4x.png")
    _forget()
    assert fetch_hd_twin("gfx/box.png") == (
        (nagmon / "gfx" / "box@4x.png").as_posix()
    )


def test_load_and_scale_gives_the_same_size_from_a_twin(mods, display):
    from tuxemon.graphics import load_and_scale

    nagmon, tuxemon = mods
    _save(_checker((18, 12)), tuxemon / "gfx" / "box.png")
    before = load_and_scale("gfx/box.png", 7)
    _save(_checker((18, 12), 4), nagmon / "gfx" / "box@4x.png")
    _forget()
    after = load_and_scale("gfx/box.png", 7)
    assert before.get_size() == after.get_size() == (126, 84)
    # the twin's colours, smoothly scaled: the middle of a block is it
    assert after.get_at((3, 3))[:3] == before.get_at((3, 3))[:3]


def test_without_a_twin_the_pixels_do_not_change(mods, display):
    from tuxemon.graphics import load_and_scale, load_image, scale_surface

    _, tuxemon = mods
    _save(_checker((18, 12)), tuxemon / "gfx" / "box.png")
    old = scale_surface(load_image("gfx/box.png"), 7)
    new = load_and_scale("gfx/box.png", 7)
    assert pygame.image.tobytes(old, "RGB") == pygame.image.tobytes(new, "RGB")


# ------------------------------------------------------- the battle background


def _environment(background: str, scale: int):
    from tuxemon.environment import Environment

    data = MagicMock()
    data.get_battle_graphics.return_value.background = background
    context = MagicMock()
    context.scale = scale
    return Environment(data, context)


def _background(width=256, height=108) -> pygame.Surface:
    """Green, with a red column in the middle and a blue top row."""
    surf = pygame.Surface((width, height))
    surf.fill((0, 160, 0))
    surf.fill((220, 0, 0), (width // 2 - 2, 0, 4, height))
    surf.fill((0, 0, 220), (0, 0, width, 1))
    return surf


@pytest.mark.parametrize(
    "twin",
    [pytest.param(False, id="native"), pytest.param(True, id="hd_twin")],
)
def test_the_battle_background_covers_a_20_9_screen(mods, display, twin):
    nagmon, tuxemon = mods
    _save(_background(), tuxemon / "gfx" / "bg.png")
    if twin:
        hd = pygame.transform.scale(_background(), (1024, 432))
        _save(hd, nagmon / "gfx" / "bg@4x.png")
    surf = _environment("gfx/bg.png", 7).prepare_background((2400, 1080))
    assert surf.get_size() == (2400, 1080)
    # no black column at the right edge, anywhere
    for y in range(0, 1080, 40):
        assert surf.get_at((2399, y))[:3] != (0, 0, 0), y
    # not stretched: the middle of the picture is the middle of the screen
    row = [surf.get_at((x, 500))[:3] for x in range(2400)]
    reds = [x for x, c in enumerate(row) if c[0] > 150 and c[1] < 80]
    assert reds and abs((reds[0] + reds[-1]) / 2 - 1200) <= 6
    # the width of the red column grew by 2400/256, as the height did
    assert abs(len(reds) - 4 * 2400 / 256) <= 3


def test_the_battle_background_on_a_16_9_screen_is_as_before(mods, display):
    from tuxemon.graphics import scale_surface

    _, tuxemon = mods
    _save(_background(), tuxemon / "gfx" / "bg.png")
    surf = _environment("gfx/bg.png", 7).prepare_background((1792, 1008))
    old = scale_surface(_background(), 7)
    assert surf.get_at((5, 0))[:3] == (0, 0, 220)  # the top row is kept
    assert pygame.image.tobytes(
        surf.subsurface((0, 0, 1792, 756)), "RGB"
    ) == pygame.image.tobytes(old.convert(surf), "RGB")
    # under the picture, its last row goes on (the menu covers it)
    assert surf.get_at((5, 1000))[:3] == (0, 160, 0)
