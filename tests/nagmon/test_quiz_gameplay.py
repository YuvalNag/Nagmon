"""WP7: questions in battle and capture (docs/kids/SDD_QUIZ_GAMEPLAY.md)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from mods.nagmon.effects.capture import KnowledgeCaptureEffect
from mods.nagmon.effects.damage import DamageEffect, quiz_message
from mods.nagmon.states.nagmon_combat import (
    ASKED_KEY,
    CAPTURE_KEY,
    MainCombatMenuState,
    quiz_mult_key,
)
from nagmon import runtime as runtime_mod


class FakeCombat:
    def __init__(self) -> None:
        self.vars: dict[str, object] = {}
        self.hits: dict[object, float] = {}
        self.damage_log: list = []

    def set_variable(self, key, value):
        self.vars[key] = value

    def get_variable(self, key):
        return self.vars.get(key)

    def set_tech_hit(self, monster, value=None):
        self.hits[monster] = value

    def get_tech_hit(self, monster):
        return self.hits.get(monster, 0.0)

    def get_targets(self, tech, user, target):
        return [target]

    def get_own_monsters(self, target):
        return [target]

    def enqueue_damage(self, user, monster, dmg):
        self.damage_log.append((user, monster, dmg))


class Mon:
    """A hashable stand-in for a monster."""

    def __init__(self, hp: int = 1000) -> None:
        self.instance_id = uuid4()
        self.current_hp = hp


def _session(combat: FakeCombat) -> SimpleNamespace:
    return SimpleNamespace(
        client=SimpleNamespace(combat_session=combat), player=MagicMock()
    )


@pytest.mark.parametrize(
    ("mult", "expected"),
    [
        pytest.param(1.0, None, id="plain"),
        pytest.param(1.5, "quiz_critical", id="correct"),
        pytest.param(2.0, "quiz_super", id="super-or-combo"),
        pytest.param(2.5, "quiz_combo", id="super-combo"),
    ],
)
def test_quiz_message(mult, expected):
    assert quiz_message(mult) == expected


def _damage(quiz_mult: float | None) -> tuple[int, list, FakeCombat]:
    combat = FakeCombat()
    user = Mon()
    target = Mon()
    tech = SimpleNamespace(accuracy=1.0, name="Ram", hit=False)
    if quiz_mult is not None:
        combat.set_variable(quiz_mult_key(user), quiz_mult)
    with patch(
        "mods.nagmon.effects.damage.formula.simple_damage_calculate",
        side_effect=lambda t, u, m, f=None: (
            int(40 * (f or {}).get("quiz", 1.0)),
            1.0,
        ),
    ):
        result = DamageEffect().apply_tech_target(
            _session(combat), tech, user, target
        )
    return result.damage, result.extras, combat


def test_damage_without_question_is_unchanged():
    damage, extras, _ = _damage(None)
    assert damage == 40 and extras == []


def test_correct_answer_multiplies_damage_once():
    damage, extras, combat = _damage(1.5)
    assert damage == 60
    assert extras == ["quiz_critical"]
    assert all(v is None for v in combat.vars.values())


def test_skip_keeps_plain_damage():
    damage, extras, _ = _damage(1.0)
    assert damage == 40 and extras == []


def test_capture_multiplies_device_bonus():
    combat = FakeCombat()
    combat.set_variable(CAPTURE_KEY, 1.6)
    seen = {}

    def shake(target, status, ball):
        seen["ball"] = ball
        return 1.0

    effect = KnowledgeCaptureEffect()
    with (
        patch(
            "mods.nagmon.effects.capture.formula.calculate_status_modifier",
            return_value=1.0,
        ),
        patch(
            "mods.nagmon.effects.capture.formula.calculate_capdev_modifier",
            return_value=2.0,
        ),
        patch(
            "mods.nagmon.effects.capture.formula.shake_check",
            side_effect=shake,
        ),
        patch(
            "mods.nagmon.effects.capture.formula.capture",
            return_value=(False, 2),
        ),
        patch.object(KnowledgeCaptureEffect, "_handle_capture_failure"),
    ):
        result = effect.apply_item_target(
            _session(combat), MagicMock(name="ball"), MagicMock()
        )
    assert seen["ball"] == pytest.approx(3.2)
    assert result.extras == ["quiz_capture_boost"]
    assert combat.get_variable(CAPTURE_KEY) is None


# ------------------------------------------------------------- battle menu


def _menu(limit: int = 5) -> tuple[MainCombatMenuState, FakeCombat]:
    menu = MainCombatMenuState.__new__(MainCombatMenuState)
    menu.client = MagicMock()
    combat = FakeCombat()
    menu.combat_session = combat
    menu.monster = Mon()
    menu.character = MagicMock()
    menu.opponents = [MagicMock()]
    return menu, combat


@pytest.fixture
def active_runtime():
    rt = SimpleNamespace(
        engine=object(),
        active=SimpleNamespace(settings={"questions_per_battle": 2}),
    )
    runtime_mod.set_runtime(rt)  # type: ignore[arg-type]
    yield rt
    runtime_mod.set_runtime(None)


def _tech(effect: bool = True) -> SimpleNamespace:
    return SimpleNamespace(
        has_effect=lambda name: effect and name == "damage",
        types=SimpleNamespace(current=[SimpleNamespace(slug="fire")]),
    )


def test_no_runtime_means_plain_battle():
    menu, _ = _menu()
    proceed = MagicMock()
    menu.before_enqueue_technique(_tech(), MagicMock(), proceed)
    proceed.assert_called_once()
    menu.client.push_state.assert_not_called()


def test_attack_pushes_quiz_for_the_type_subject(active_runtime):
    menu, _ = _menu()
    proceed = MagicMock()
    menu.before_enqueue_technique(_tech(), MagicMock(), proceed)
    proceed.assert_not_called()
    name, kwargs = (
        menu.client.push_state.call_args.args[0],
        menu.client.push_state.call_args.kwargs,
    )
    assert name == "QuizState"
    assert kwargs["subject"] == "math"  # fire -> math
    assert kwargs["context"] == "battle"


def test_correct_answer_sets_multiplier_and_sure_hit(active_runtime):
    menu, combat = _menu()
    proceed = MagicMock()
    menu.before_enqueue_technique(_tech(), MagicMock(), proceed)
    done = menu.client.push_state.call_args.kwargs["on_result"]
    done(SimpleNamespace(correct=True, power_multiplier=1.5, streak=3))
    assert combat.get_variable(quiz_mult_key(menu.monster)) == 2.0
    assert combat.hits[menu.monster] == 0.0
    proceed.assert_called_once()


def test_skip_attacks_normally(active_runtime):
    menu, combat = _menu()
    proceed = MagicMock()
    menu.before_enqueue_technique(_tech(), MagicMock(), proceed)
    menu.client.push_state.call_args.kwargs["on_result"](None)
    assert combat.get_variable(quiz_mult_key(menu.monster)) == 1.0
    assert menu.monster not in combat.hits
    proceed.assert_called_once()


def test_question_budget_per_battle(active_runtime):
    menu, combat = _menu()
    for _ in range(3):
        menu.before_enqueue_technique(_tech(), MagicMock(), MagicMock())
    assert menu.client.push_state.call_count == 2
    assert combat.get_variable(ASKED_KEY) == 2


def test_non_damage_technique_asks_nothing(active_runtime):
    menu, _ = _menu()
    proceed = MagicMock()
    menu.before_enqueue_technique(_tech(effect=False), MagicMock(), proceed)
    proceed.assert_called_once()


def test_capture_question_sets_multiplier(active_runtime):
    menu, combat = _menu()
    proceed = MagicMock()
    item = SimpleNamespace(category="capture")
    menu.before_enqueue_item(item, SimpleNamespace(catch_rate=100.0), proceed)
    menu.client.push_state.call_args.kwargs["on_result"](
        SimpleNamespace(correct=True)
    )
    assert combat.get_variable(CAPTURE_KEY) == 1.6
    proceed.assert_called_once()


def test_rare_monster_needs_a_chain_of_three(active_runtime):
    active_runtime.active.settings["questions_per_battle"] = 9
    menu, combat = _menu()
    proceed = MagicMock()
    item = SimpleNamespace(category="capture")
    menu.before_enqueue_item(item, SimpleNamespace(catch_rate=10.0), proceed)
    answered = menu.client.push_state.call_args.kwargs["on_result"]
    answered(SimpleNamespace(correct=True))
    answered(SimpleNamespace(correct=False))
    answered(SimpleNamespace(correct=True))
    assert menu.client.queue_command.call_count == 2
    assert combat.get_variable(CAPTURE_KEY) == pytest.approx(1.8)
    proceed.assert_called_once()


def test_non_capture_item_asks_nothing(active_runtime):
    menu, _ = _menu()
    proceed = MagicMock()
    menu.before_enqueue_item(
        SimpleNamespace(category="potion"), MagicMock(), proceed
    )
    proceed.assert_called_once()


def test_game_loads_nagmon_effects_over_tuxemon():
    from tuxemon.constants.paths import CORE_EFFECT_PATH, ROOT_PACKAGE_NAME
    from tuxemon.core.core_effect import CoreEffect
    from tuxemon.core.core_manager import EffectManager

    manager = EffectManager(
        CoreEffect, CORE_EFFECT_PATH, root_package_name=ROOT_PACKAGE_NAME
    )
    assert manager.classes["damage"] is DamageEffect
    assert manager.classes["capture"] is KnowledgeCaptureEffect
    # Other effects still come from Tuxemon.
    assert manager.classes["heal"].__module__.startswith("tuxemon.")


def test_game_loads_nagmon_states():
    from tuxemon.constants.paths import LIBDIR
    from tuxemon.state.loader import StateLoader
    from tuxemon.state.repository import StateRepository

    repo = StateRepository.from_loader(StateLoader("tuxemon.states", LIBDIR))
    for name in (
        "QuizState",
        "ProfileSelectState",
        "ParentMenuState",
        "MainCombatMenuState",
        "StartState",
    ):
        assert repo.get_state(name).__module__.startswith("mods.nagmon")


def test_world_state_is_watched_for_screen_time():
    from tuxemon.constants.paths import LIBDIR
    from tuxemon.state.loader import StateLoader
    from tuxemon.state.repository import StateRepository

    repo = StateRepository.from_loader(StateLoader("tuxemon.states", LIBDIR))
    world = repo.get_state("WorldState")
    assert world.__module__ == "mods.nagmon.states.nagmon_world"


def test_unused_boost_does_not_carry_into_an_unasked_attack(active_runtime):
    # A boosted attack that never happened (the monster fainted first)
    # must not power up a later attack once the question budget is spent.
    menu, combat = _menu()
    combat.set_variable(quiz_mult_key(menu.monster), 1.5)
    combat.set_variable(ASKED_KEY, 2)  # budget used up
    proceed = MagicMock()
    menu.before_enqueue_technique(_tech(), MagicMock(), proceed)
    proceed.assert_called_once()
    assert combat.get_variable(quiz_mult_key(menu.monster)) is None


@pytest.mark.parametrize(
    ("menu_height", "size"),
    [
        pytest.param(720, 72, id="pc-720"),
        pytest.param(1080, 108, id="poco-f3-1080"),
        pytest.param(300, 48, id="never-tiny"),
    ],
)
def test_answer_pictures_grow_with_the_screen(menu_height, size):
    """A fixed 72px picture would shrink on a sharper phone screen."""
    from mods.nagmon.states.nagmon_quiz import answer_picture_size

    assert answer_picture_size(menu_height) == size


# ---------------------------- a monster's own subject (SDD_ART §2.10)


def _scrollo_attack(rt, settings=None, enabled=None):
    rt.active.settings.update(settings or {})
    rt.engine = SimpleNamespace(
        learner=SimpleNamespace(enabled_subjects=enabled)
    )
    menu, _ = _menu()
    menu.monster.slug = "scrollo"
    normal = SimpleNamespace(
        has_effect=lambda name: name == "damage",
        types=SimpleNamespace(current=[SimpleNamespace(slug="normal")]),
    )
    menu.before_enqueue_technique(normal, MagicMock(), MagicMock())
    return menu.client.push_state.call_args.kwargs["subject"]


def test_a_hebrew_monster_asks_hebrew(active_runtime):
    # normal would be English; Scrollo is a Hebrew monster.
    assert _scrollo_attack(active_runtime) == "hebrew"


def test_the_parent_choice_for_that_monster_wins(active_runtime):
    settings = {"element_subjects": {"scrollo": "math", "normal": "logic"}}
    assert _scrollo_attack(active_runtime, settings) == "math"


def test_a_subject_the_child_has_off_is_not_asked(active_runtime):
    # Hebrew is off for this child: the engine picks one that is on.
    assert _scrollo_attack(active_runtime, enabled=("math",)) is None
    assert _scrollo_attack(active_runtime, enabled=("hebrew",)) == "hebrew"
