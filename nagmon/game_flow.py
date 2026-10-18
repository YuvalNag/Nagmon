"""
Pure helpers behind the profile screens: the avatar list and the
defaults a new child gets from their grade (SDD_PROFILES_UI.md §2.3).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Avatar:
    key: str
    sprite: str  # overworld sprite name (mods/*/sprites)
    combat_sheet: str  # portrait (mods/*/gfx/sprites/player)
    gender: str  # "male" | "female"
    label_he: str


#: Characters a child may pick. All are modest (see SDD_MODESTY.md).
AVATARS: tuple[Avatar, ...] = (
    Avatar("boy_light", "adventurer", "adventurer", "male", "בן"),
    Avatar("boy_dark", "adventurerblack", "adventurerblack", "male", "בן"),
    Avatar("girl_light", "heroine", "heroine", "female", "בת"),
    Avatar("girl_dark", "brownheroine_brown", "heroineblack", "female", "בת"),
)

GRADE_NAMES_HE: tuple[str, ...] = (
    "גן",
    "כיתה א",
    "כיתה ב",
    "כיתה ג",
    "כיתה ד",
    "כיתה ה",
    "כיתה ו",
    "כיתה ז",
    "כיתה ח",
    "כיתה ט",
)


def avatar_by_key(key: str) -> Avatar:
    for avatar in AVATARS:
        if avatar.key == key:
            return avatar
    return AVATARS[0]


def avatar_keys() -> set[str]:
    return {a.key for a in AVATARS}


def defaults_for_grade(grade: int) -> dict[str, Any]:
    """
    Profile fields a new child starts with, from their grade. The parent
    can change all of them later.

    - Language ladder: Hebrew only before reading age, then step by step.
    - No timer under grade 3 (about age 9); research: time pressure helps
      no one young and can raise anxiety.
    - Read questions aloud until grade 2.
    - Fewer answer choices for the youngest.
    """
    grade = max(0, min(9, grade))
    if grade <= 1:
        level = 0
    elif grade <= 3:
        level = 1
    elif grade <= 6:
        level = 2
    else:
        level = 3
    return {
        "grade": grade,
        "language_level": level,
        "settings": {
            "learning": {
                "timer": grade >= 3,
                "max_choices": 3 if grade <= 1 else 4,
            },
            "tts": {"auto_read_questions": grade <= 2},
            "questions_per_battle": 3 if grade <= 1 else 5,
        },
    }
