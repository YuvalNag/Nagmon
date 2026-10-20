# SPDX-License-Identifier: GPL-3.0
"""WP7: hook points before a technique/item is queued (SDD_QUIZ_GAMEPLAY)."""

from __future__ import annotations

from unittest.mock import MagicMock

from tuxemon.states.combat_menus import MainCombatMenuState


def _menu(opponents: int = 1) -> MainCombatMenuState:
    # Skip the heavy UI constructor; the hooks only need these attributes.
    menu = MainCombatMenuState.__new__(MainCombatMenuState)
    menu.client = MagicMock()
    menu.combat_session = MagicMock()
    menu.monster = MagicMock(name="monster")
    menu.character = MagicMock(name="character")
    menu.opponents = [MagicMock() for _ in range(opponents)]
    return menu


def test_default_technique_hook_proceeds_immediately():
    menu = _menu()
    proceed = MagicMock()
    menu.before_enqueue_technique(MagicMock(), MagicMock(), proceed)
    proceed.assert_called_once_with()


def test_default_item_hook_proceeds_immediately():
    menu = _menu()
    proceed = MagicMock()
    menu.before_enqueue_item(MagicMock(), MagicMock(), proceed)
    proceed.assert_called_once_with()


def test_finish_technique_queues_action_and_closes_menus():
    menu = _menu(opponents=2)
    tech, target = MagicMock(), MagicMock()
    menu._finish_enqueue_technique(tech, target)
    menu.combat_session.enqueue_action.assert_called_once_with(
        menu.monster, tech, target
    )
    removed = [c.args[0] for c in menu.client.remove_state_by_name.mock_calls]
    assert removed == ["CombatTargetMenuState", "Menu"]
    menu.client.pop_state.assert_called_once_with(menu)


def test_finish_item_queues_action_and_remembers_item():
    menu = _menu()
    item, target = MagicMock(slug="tuxeball"), MagicMock()
    item.behaviors.throwable = True
    menu._finish_enqueue_item(item, target)
    menu.combat_session.enqueue_action.assert_called_once_with(
        menu.character, item, target
    )
    assert menu.character.battle_last_used_item_slug == "tuxeball"
    removed = [c.args[0] for c in menu.client.remove_state_by_name.mock_calls]
    assert removed == ["MainCombatMenuState"]


def test_override_can_delay_queueing():
    class Delaying(MainCombatMenuState):
        name = "Delaying"
        pending = None

        def __init__(self, client, **kwargs):  # States must define both
            super().__init__(client, **kwargs)

        def before_enqueue_technique(self, technique, target, proceed):
            Delaying.pending = proceed

    menu = Delaying.__new__(Delaying)
    menu.__dict__.update(_menu().__dict__)
    menu.before_enqueue_technique(
        MagicMock(), MagicMock(), lambda: menu.combat_session.enqueue_action()
    )
    menu.combat_session.enqueue_action.assert_not_called()
    Delaying.pending()
    menu.combat_session.enqueue_action.assert_called_once()
