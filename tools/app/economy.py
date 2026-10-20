# SPDX-License-Identifier: GPL-3.0
"""The economy: ``mods/nagmon/economy/items.yaml`` as ``game/economy.json``.

The Bag's items, their prices and their effects, checked here so a typo
stops the build and not a child's game. The shape is read by
``app/src/core/game/items.ts``.
"""

from __future__ import annotations

from typing import Any

from tools.app.common import NAG, Output
from tools.app.content import read_yaml

SOURCE = NAG / "economy" / "items.yaml"

KINDS = {"net", "snack", "tonic", "helper", "key"}
HELPERS = {"hint", "fifty", "pass"}
#: What each kind must say about itself.
REQUIRED = {
    "net": ("seal_less",),
    "snack": ("hearts", "xp"),
    "tonic": ("boost_answers",),
    "helper": ("helper",),
    "key": (),
}


def check(doc: Any) -> dict[str, Any]:
    if not isinstance(doc, dict) or not isinstance(doc.get("items"), list):
        raise ValueError("economy: needs a list of items")
    tabs = doc.get("tabs")
    if not isinstance(tabs, list) or len(tabs) != 3:
        raise ValueError("economy: the Bag has three tabs")
    seen: set[str] = set()
    for item in doc["items"]:
        iid = item.get("id")
        if not isinstance(iid, str) or not iid or iid in seen:
            raise ValueError(f"economy: bad or repeated id {iid!r}")
        seen.add(iid)
        if item.get("tab") not in tabs:
            raise ValueError(f"economy: {iid}: unknown tab {item.get('tab')!r}")
        kind = item.get("kind")
        if kind not in KINDS:
            raise ValueError(f"economy: {iid}: unknown kind {kind!r}")
        price = item.get("price")
        if not isinstance(price, int) or isinstance(price, bool) or price < 0:
            raise ValueError(f"economy: {iid}: the price is a whole number, 0 or more")
        if not item.get("icon"):
            raise ValueError(f"economy: {iid}: needs an icon")
        for key in REQUIRED[kind]:
            if key not in item:
                raise ValueError(f"economy: {iid}: a {kind} needs {key}")
        if kind == "helper" and item["helper"] not in HELPERS:
            raise ValueError(f"economy: {iid}: unknown helper {item['helper']!r}")
        if kind != "key" and price == 0:
            raise ValueError(f"economy: {iid}: only key items are free")
    for iid in doc.get("starter_kit", {}):
        if iid not in seen:
            raise ValueError(f"economy: starter kit has unknown item {iid}")
    spare = doc.get("spare_net", {}).get("item")
    if spare not in seen:
        raise ValueError("economy: the spare net must be an item")
    if not isinstance(doc.get("seal_coins"), int):
        raise ValueError("economy: seal_coins is a whole number")
    stack = doc.get("stack_limit")
    if not isinstance(stack, int) or stack < 1:
        raise ValueError("economy: stack_limit must be 1 or more")
    return doc


def build(out: Output) -> dict[str, Any]:
    doc = check(read_yaml(SOURCE))
    out.add_json("economy.json", doc, compact=True)
    return {"items": len(doc["items"])}
