# SPDX-License-Identifier: GPL-3.0
"""
Damage with "knowledge power": a correct answer before the attack
multiplies the damage (docs/kids/SDD_QUIZ_GAMEPLAY.md §2.3).

Same as Tuxemon's damage effect, plus the quiz multiplier the battle menu
stores in a combat variable.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from tuxemon import formula
from tuxemon.core.core_effect import CoreEffect, TechEffectResult
from tuxemon.core.effects.damage import MULTI_TARGET_MODIFIER

if TYPE_CHECKING:
    from collections.abc import Sequence

    from tuxemon.monster.monster import Monster
    from tuxemon.session import Session
    from tuxemon.technique.technique import Technique

SUPER = 2.0
COMBO_FROM = 1.75


def quiz_message(mult: float) -> str | None:
    """The battle message msgid for a quiz multiplier, if any."""
    if mult >= SUPER + 0.25:
        return "quiz_combo"
    if mult >= SUPER:
        return "quiz_super"
    if mult >= COMBO_FROM:
        return "quiz_combo"
    if mult > 1.0:
        return "quiz_critical"
    return None


@dataclass
class DamageEffect(CoreEffect):
    """
    Applies damage to one or more target monsters, multiplied by the
    answer to the question asked before the attack (if any).
    """

    name = "damage"

    def apply_tech_target(
        self, session: Session, tech: Technique, user: Monster, target: Monster
    ) -> TechEffectResult:
        combat = session.client.combat_session
        key = f"quiz_mult_{user.instance_id.hex}"
        quiz = float(combat.get_variable(key) or 1.0)
        if quiz != 1.0:
            combat.set_variable(key, None)
        factors = {"quiz": quiz} if quiz != 1.0 else None

        damage = 0
        mult = 1.0
        targets: list[Monster] = []
        enemy_side: Sequence[Monster] = []

        hit = combat.get_tech_hit(user)
        tech.hit = tech.accuracy >= hit

        if tech.hit:
            targets = combat.get_targets(tech, user, target)
            enemy_side = combat.get_own_monsters(target)

        spread = sum(1 for m in targets if m in enemy_side) > 1

        for monster in targets:
            dmg, m = formula.simple_damage_calculate(
                tech, user, monster, factors
            )
            if spread and monster in enemy_side:
                dmg = int(dmg * MULTI_TARGET_MODIFIER)
            monster.current_hp = max(0, monster.current_hp - dmg)
            if monster == target:
                damage, mult = dmg, m
            else:
                combat.enqueue_damage(user, monster, dmg)

        extras = []
        message = quiz_message(quiz)
        if message and tech.hit:
            extras.append(message)
        return TechEffectResult(
            name=tech.name,
            damage=damage,
            element_multiplier=mult,
            should_tackle=bool(damage),
            success=bool(damage),
            extras=extras,
        )
