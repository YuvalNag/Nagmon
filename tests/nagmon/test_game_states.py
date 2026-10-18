# SPDX-License-Identifier: GPL-3.0
"""Robustness of Nagmon's game screens (states built without a display)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from mods.nagmon.states.nagmon_quiz import QuizState
from nagmon import runtime as runtime_mod


@pytest.fixture
def no_runtime():
    runtime_mod.set_runtime(None)
    yield
    runtime_mod.set_runtime(None)


def _quiz(engine) -> QuizState:
    quiz = QuizState.__new__(QuizState)
    quiz.engine = engine
    return quiz


def test_unknown_skill_in_a_map_script_shows_no_question(no_runtime):
    engine = MagicMock()
    engine.next_question.side_effect = KeyError("math.no.such.skill")
    quiz = _quiz(engine)
    assert (
        quiz._next_question(None, "math.no.such.skill", None, "quest") is None
    )


def test_saving_errors_after_an_answer_do_not_break_the_quiz(no_runtime):
    rt = MagicMock()
    rt.on_answer.side_effect = OSError("disk full")
    runtime_mod.set_runtime(rt)
    quiz = _quiz(MagicMock())
    quiz._reward(SimpleNamespace(coins=0))  # must not raise
    rt.on_answer.assert_called_once()


def _start_state(on_top: bool):
    from mods.nagmon.states.nagmon_start import StartState

    state = StartState.__new__(StartState)
    state.client = MagicMock()
    state.client.current_state = state if on_top else object()
    return state


def test_idle_title_menu_still_returns_to_the_intro():
    state = _start_state(on_top=True)
    state._on_afk_threshold("IntroState")
    state.client.replace_state.assert_called_once_with("IntroState")


def test_idle_child_on_who_plays_is_not_sent_to_the_intro():
    # "Who is playing?" (or the parent area) sits on top of the title
    # menu; replacing *it* with the intro stacked a second title menu.
    state = _start_state(on_top=False)
    state._on_afk_threshold("IntroState")
    state.client.replace_state.assert_not_called()


class _Watcher:
    def __init__(self, *decisions) -> None:
        self.decisions = list(decisions)

    def update(self, dt, *, at_natural_break):
        return self.decisions.pop(0) if self.decisions else None


def _world(watcher, *, top: bool, battle: bool):
    from mods.nagmon.states.nagmon_world import WorldState

    world = WorldState.__new__(WorldState)
    world.client = MagicMock()
    world.client.current_state = world if top else object()
    world.client.active_state_names = (
        ["CombatState", "WorldState"] if battle else ["WorldState"]
    )
    world.watcher = watcher
    world._pending_stop = None
    world._pending_note = None
    return world


def _decision(action_name: str, grace: int = 0):
    from nagmon.family.screentime import Action, Decision

    return Decision(Action[action_name], message_he="msg", grace_seconds=grace)


def test_screen_time_stop_waits_for_the_battle_to_end(monkeypatch):
    from mods.nagmon.states import nagmon_world

    dialogs = MagicMock()
    monkeypatch.setattr(nagmon_world, "open_dialog", dialogs)
    world = _world(_Watcher(_decision("MUST_STOP")), top=False, battle=True)
    world._watch_screen_time(1.0)
    # No autosave and no stop in the middle of the fight...
    world.client.event_engine.execute_action.assert_not_called()
    dialogs.assert_not_called()
    # ...but as soon as the battle is over.
    world.client.active_state_names = ["WorldState"]
    world._watch_screen_time(1.0)
    world.client.event_engine.execute_action.assert_called_once_with(
        "autosave"
    )
    dialogs.assert_called_once()
    assert world.watcher is None


def test_reminder_waits_for_a_natural_pause(monkeypatch):
    from mods.nagmon.states import nagmon_world

    dialogs = MagicMock()
    monkeypatch.setattr(nagmon_world, "open_dialog", dialogs)
    world = _world(_Watcher(_decision("WARN_SOON")), top=False, battle=True)
    world._watch_screen_time(1.0)
    dialogs.assert_not_called()  # not on top of the battle menu
    world.client.current_state = world
    world.client.active_state_names = ["WorldState"]
    world._watch_screen_time(1.0)
    dialogs.assert_called_once_with(world.client, ["msg"])


def test_closing_the_window_ends_the_session(monkeypatch, tmp_path):
    from mods.nagmon import rules

    registered = []
    monkeypatch.setattr(rules.atexit, "register", registered.append)
    monkeypatch.setattr(rules, "data_root", lambda: tmp_path / "nagmon")
    monkeypatch.setattr(rules, "build_runtime", lambda: MagicMock())
    monkeypatch.setattr(rules, "switch_to_hebrew", lambda: None)
    try:
        rules.NagmonStartupRule(MagicMock(), MagicMock()).apply()
        assert registered == [rules.stop_play_at_exit]
        rt = runtime_mod.get_runtime()
        rules.stop_play_at_exit()
        rt.stop_play.assert_called_once()
        # Errors at exit are logged, never raised.
        rt.stop_play.side_effect = OSError("disk full")
        rules.stop_play_at_exit()
    finally:
        runtime_mod.set_runtime(None)


def test_restoring_a_player_whose_name_is_taken_does_not_crash(monkeypatch):
    from mods.nagmon.states import profiles
    from nagmon.family.profiles import ProfileError

    store = MagicMock()
    store.list_trash.return_value = [
        SimpleNamespace(entry="p1-1", name="נועה")
    ]
    store.restore.side_effect = ProfileError("name taken")
    runtime_mod.set_runtime(SimpleNamespace(store=store))
    said = []
    monkeypatch.setattr(
        profiles, "choose", lambda client, options, **kw: options[0][1]()
    )
    monkeypatch.setattr(
        profiles, "say", lambda client, text, then=None: said.append(text)
    )
    try:
        menu = profiles.ParentMenuState.__new__(profiles.ParentMenuState)
        menu.client = MagicMock()
        menu.restore()
    finally:
        runtime_mod.set_runtime(None)
    store.restore.assert_called_once_with("p1-1")
    assert said == [profiles.T.translate("nagmon_restore_failed")]
