# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
"""Formerly hard-coded strings now come from the catalogue.

English output must stay byte-for-byte identical to the old literals.
"""

import pytest

from tuxemon.locale import units
from tuxemon.locale.locale import T
from tuxemon.locale.units import format_measure, level_label, unit_label
from tuxemon.menu.formatter import CurrencyFormatter, QuantityFormatter
from tuxemon.platform.const.sizes import (
    U_CM,
    U_FT,
    U_KG,
    U_KM,
    U_LB,
    U_M,
    U_MI,
    U_T,
)
from tuxemon.ui.menu_options import ChoiceOption


@pytest.fixture
def hebrew(monkeypatch):
    """Route T.translate/T.format to the Hebrew catalogue."""
    monkeypatch.setattr(
        T,
        "translate",
        lambda msgid, domain=None: T.translate_in(msgid, "he_IL"),
    )
    monkeypatch.setattr(
        T,
        "format",
        lambda text, parameters=None, domain=None: T.format_in(
            text, "he_IL", parameters
        ),
    )


def test_level_labels_english():
    assert level_label(5) == "Lv.5"
    assert level_label(5, spaced=True) == "Lv. 5"
    assert T.format("level_up_range", {"start": 3, "end": 4}) == "Lv.3 → Lv.4"


def test_level_labels_hebrew(hebrew):
    assert level_label(5) == "רמה 5"
    assert T.format("level_up_range", {"start": 3, "end": 4}) == (
        "מרמה 3 לרמה 4"
    )


@pytest.mark.parametrize(
    "unit",
    [
        pytest.param(u, id=u)
        for u in (U_KM, U_MI, U_KG, U_T, U_M, U_LB, U_CM, U_FT)
    ],
)
def test_units_english_identical(unit):
    assert unit_label(unit) == unit
    assert format_measure(12, unit) == f"12{unit}"


def test_units_hebrew(hebrew):
    assert unit_label(U_KG) == "ק״ג"
    assert format_measure(12, U_KG) == "12 ק״ג"


def test_unknown_unit_passthrough():
    assert units.unit_label("parsec") == "parsec"


def test_currency_english_identical():
    assert CurrencyFormatter().format(10) == "$  10"
    assert CurrencyFormatter(position="after").format(5) == "   5$"
    assert CurrencyFormatter(symbol="€").format(1) == "€   1"


def test_currency_hebrew(hebrew):
    assert CurrencyFormatter().format(10) == "₪  10"


def test_quantity_english_identical():
    assert QuantityFormatter().format(3) == "x 3"


def test_quantity_hebrew(hebrew):
    assert QuantityFormatter().format(3) == "× 3"


def test_option_default_text():
    assert ChoiceOption(key="A").display_text == "Option a"
    assert ChoiceOption().display_text == "Option Unnamed"


def test_option_default_text_hebrew(hebrew):
    assert ChoiceOption(key="a").display_text == "אפשרות a"


def test_unknown_location():
    from tuxemon.map.manager import MapManager

    manager = MapManager.__new__(MapManager)
    manager.current_map = None
    assert manager.map_name == "Unknown Location"
