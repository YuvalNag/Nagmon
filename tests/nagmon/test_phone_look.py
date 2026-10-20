"""
The look on a big phone screen (docs/kids/SDD_ANDROID.md §2.7): no
Tuxemon title screen, a battle across the whole 20:9 screen, HD twins
of Tuxemon's UI images.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pygame

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
