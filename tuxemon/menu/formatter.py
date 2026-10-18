# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
from __future__ import annotations

from tuxemon.locale.locale import T


def currency_symbol() -> str:
    """The translated currency symbol (msgid ``currency_symbol``)."""
    return T.translate("currency_symbol")


class CurrencyFormatter:
    """
    Formats a monetary value with a currency symbol.

    ``symbol=None`` uses the translated symbol at format time.
    """

    def __init__(
        self,
        symbol: str | None = None,
        position: str = "before",
        width: int = 4,
    ) -> None:
        self._symbol = symbol
        self.position = position
        self.width = width

    @property
    def symbol(self) -> str:
        return self._symbol if self._symbol is not None else currency_symbol()

    @symbol.setter
    def symbol(self, value: str | None) -> None:
        self._symbol = value

    def format(self, amount: int) -> str:
        amount_str = f"{amount:>{self.width}}"
        if self.position == "before":
            return f"{self.symbol}{amount_str}"
        else:
            return f"{amount_str}{self.symbol}"


class QuantityFormatter:
    """
    Formats a quantity value with a quantity symbol.

    ``symbol=None`` uses the translated symbol at format time.
    """

    def __init__(self, symbol: str | None = None) -> None:
        self._symbol = symbol

    @property
    def symbol(self) -> str:
        if self._symbol is not None:
            return self._symbol
        return T.translate("quantity_symbol")

    @symbol.setter
    def symbol(self, value: str | None) -> None:
        self._symbol = value

    def format(self, quantity: int) -> str:
        return f"{self.symbol} {quantity}"
