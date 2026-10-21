"""Pure logic behind the question screen (docs/kids/SDD_QUIZ_GAMEPLAY.md)."""

from __future__ import annotations

from pathlib import Path

import pytest

from nagmon.quiz_flow import (
    BattleQuizBudget,
    LetterTiles,
    NumberPad,
    OrderPicker,
    SubjectMap,
    combo_bonus,
    power_with_combo,
)

REPO = Path(__file__).resolve().parents[2]
SUBJECTS = REPO / "mods" / "nagmon" / "learning" / "subjects.yaml"


@pytest.fixture
def smap() -> SubjectMap:
    return SubjectMap.load(SUBJECTS)


def test_every_tuxemon_element_has_a_subject(smap):
    elements = {
        p.stem
        for p in (REPO / "mods" / "tuxemon" / "db" / "element").glob("*.yaml")
    }
    assert elements <= set(smap.element_to_subject)


def test_subject_for_types_uses_first_known_type(smap):
    assert smap.subject_for(["fire"]) == "math"
    assert smap.subject_for(["unknown", "earth"]) == "geometry"
    assert smap.subject_for([]) == "math"  # default


def test_child_override_wins(smap):
    assert smap.subject_for(["fire"], {"fire": "english"}) == "english"


def test_a_monster_can_have_its_own_subject(smap):
    # Hebrew has no element (docs/kids/SDD_ART.md §2.10): its monsters
    # ask Hebrew whatever their technique's type.
    assert smap.subject_for(["normal"], monster="ringlet") == "hebrew"
    assert smap.subject_for(["fire"], {"fire": "english"}, "saturnip") == (
        "hebrew"
    )
    assert smap.subject_for(["normal"], monster="lunibble") == "english"
    assert smap.subject_for(["normal"]) == "english"


def test_the_parent_choice_comes_first(smap):
    # 1. the parent's choice for this monster, 2. the monster's own
    # subject, 3. the technique's type (with the parent's choice for it).
    choice = {"ringlet": "math", "normal": "logic"}
    assert smap.subject_for(["normal"], choice, "ringlet") == "math"
    assert smap.subject_for(["normal"], {"normal": "logic"}, "ringlet") == (
        "hebrew"
    )
    assert smap.subject_for(["normal"], choice, "lunibble") == "logic"


def test_subject_titles_and_colors(smap):
    assert smap.title("science") == "מדעים"
    assert smap.color("math").startswith("#")
    assert smap.title("nope") == "nope"


def test_combo_bonus_every_third_correct():
    assert [combo_bonus(n) for n in range(7)] == [0, 0, 0, 0.5, 0, 0, 0.5]


def test_power_with_combo():
    assert power_with_combo(1.5, streak=3) == pytest.approx(2.0)
    assert power_with_combo(1.5, streak=2) == pytest.approx(1.5)
    assert power_with_combo(1.0, streak=0) == pytest.approx(1.0)


def test_battle_budget_caps_questions():
    budget = BattleQuizBudget(limit=2)
    assert budget.take() and budget.take()
    assert not budget.take()
    assert budget.asked == 2


def test_battle_budget_zero_means_no_questions():
    assert not BattleQuizBudget(limit=0).take()


@pytest.mark.parametrize(
    ("keys", "shown"),
    [
        pytest.param(["1", "2"], "12", id="digits"),
        pytest.param(["1", ".", "5"], "1.5", id="decimal"),
        pytest.param(["3", "/", "4"], "3/4", id="fraction"),
        pytest.param(["-", "7"], "-7", id="negative"),
        pytest.param(["1", "2", "back"], "1", id="backspace"),
        pytest.param([".", ".", "5"], ".5", id="one-dot"),
        pytest.param(["5", "-"], "5", id="minus-only-first"),
        pytest.param(["/", "1"], "1", id="no-leading-slash"),
    ],
)
def test_number_pad(keys, shown):
    pad = NumberPad(max_len=8)
    for k in keys:
        pad.press(k)
    assert pad.text == shown


def test_number_pad_max_length():
    pad = NumberPad(max_len=3)
    for k in "12345":
        pad.press(k)
    assert pad.text == "123"


def test_order_picker_collects_unique_ids_and_undo():
    picker = OrderPicker(["a", "b", "c"])
    picker.pick("b")
    picker.pick("b")  # ignored
    picker.pick("a")
    assert picker.picked == ["b", "a"]
    assert not picker.complete
    picker.undo()
    picker.pick("c")
    picker.pick("a")
    assert picker.complete and picker.picked == ["b", "c", "a"]


def test_letter_tiles_spell_and_undo():
    tiles = LetterTiles(list("tac"))
    for i in (2, 1, 0):  # c, a, t
        tiles.pick(i)
    assert tiles.word == "cat"
    tiles.pick(0)  # used already
    assert tiles.word == "cat"
    tiles.undo()
    assert tiles.word == "ca" and tiles.available(0)
