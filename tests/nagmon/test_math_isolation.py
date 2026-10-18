"""Math inside Hebrew text keeps its left-to-right order on screen."""

from __future__ import annotations

import pytest

from nagmon.ui.game_helpers import isolate_math
from tuxemon.ui.bidi import to_visual

LRI, PDI = "⁦", "⁩"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        pytest.param(
            "עודף: 20 - 9 = 11 ₪.",
            f"עודף: {LRI}20 - 9 = 11{PDI} ₪.",
            id="equation",
        ),
        pytest.param("כמה זה 7×8?", f"כמה זה {LRI}7×8{PDI}?", id="times"),
        pytest.param("3/4 מהעוגה", f"{LRI}3/4{PDI} מהעוגה", id="fraction"),
        pytest.param("יש 5 תפוחים", "יש 5 תפוחים", id="plain-number"),
        pytest.param(
            f"כמה זה {LRI}13 + 10{PDI}?",
            f"כמה זה {LRI}13 + 10{PDI}?",
            id="already-isolated",
        ),
        pytest.param("Hello 2 + 2", "Hello 2 + 2", id="no-hebrew"),
    ],
)
def test_isolate_math(text, expected):
    assert isolate_math(text) == expected


def test_equation_reads_left_to_right_in_hebrew_line():
    visual = to_visual(isolate_math("עודף: 20 - 9 = 11"), True)
    assert "20 - 9 = 11" in visual
