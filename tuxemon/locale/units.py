# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
"""Translatable labels for units of measure and levels."""

from __future__ import annotations

from tuxemon.locale.locale import T


def unit_label(unit: str) -> str:
    """
    Translated label of a unit of measure (``U_KG`` and friends).

    Unknown units are returned unchanged.
    """
    msgid = f"unit_{unit.lower()}"
    label = T.translate(msgid)
    return unit if label == msgid else label


def format_measure(value: object, unit: str) -> str:
    """A value with its unit, e.g. ``12kg`` (en_US) or ``12 ק״ג`` (he_IL)."""
    return T.format(
        "measure_value", {"value": value, "unit": unit_label(unit)}
    )


def level_label(level: int, spaced: bool = False) -> str:
    """Short level label: ``Lv.5`` (or ``Lv. 5`` when ``spaced``)."""
    msgid = "level_short_spaced" if spaced else "level_short"
    return T.format(msgid, {"level": level})
