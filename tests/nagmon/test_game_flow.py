"""Pure helpers behind the profile screens (SDD_PROFILES_UI.md)."""

from __future__ import annotations

from pathlib import Path

import pytest

from nagmon.game_flow import (
    AVATARS,
    GRADE_NAMES_HE,
    avatar_by_key,
    avatar_keys,
    defaults_for_grade,
)

REPO = Path(__file__).resolve().parents[2]


def test_ten_grades_from_kindergarten_to_ninth():
    assert len(GRADE_NAMES_HE) == 10
    assert GRADE_NAMES_HE[0] == "גן"


def test_avatar_lookup_falls_back_to_the_old_first_boy():
    assert avatar_by_key("girl_light").combat_sheet == "heroine"
    # An unknown or corrupt key looks as it always did: the first boy of
    # the original list, not the newest first choice.
    assert avatar_by_key("nope").key == "boy_light"
    assert avatar_by_key("").sprite == "adventurer"
    assert "boy_dark" in avatar_keys()


@pytest.mark.parametrize("avatar", AVATARS, ids=lambda a: a.key)
def test_avatar_images_exist(avatar):
    sprites = [
        REPO / "mods" / mod / "sprites" for mod in ("nagmon", "tuxemon")
    ]
    portraits = [
        REPO / "mods" / mod / "gfx" / "sprites" / "player"
        for mod in ("nagmon", "tuxemon")
    ]
    assert any(
        list(d.glob(f"{avatar.sprite}*.png")) for d in sprites if d.exists()
    )
    assert any((d / f"{avatar.combat_sheet}.png").exists() for d in portraits)


def test_young_child_defaults():
    d = defaults_for_grade(1)
    assert d["language_level"] == 0
    assert d["settings"]["learning"]["timer"] is False
    assert d["settings"]["learning"]["max_choices"] == 3
    assert d["settings"]["tts"]["auto_read_questions"] is True


def test_older_child_defaults():
    d = defaults_for_grade(8)
    assert d["language_level"] == 3
    assert d["settings"]["learning"]["timer"] is True
    assert d["settings"]["tts"]["auto_read_questions"] is False


def test_grade_is_clamped():
    assert defaults_for_grade(-3)["grade"] == 0
    assert defaults_for_grade(12)["grade"] == 9
