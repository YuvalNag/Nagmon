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
LOOT = NAG / "economy" / "loot.yaml"

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


#: What a prize may be, and the items a hint and an egg stand for.
PRIZE_KEYS = ("coins", "item", "hint", "egg")
HINT_ITEM = "hint_feather"
EGG_ITEM = "mystery_egg"
REPEATS = {"daily", "once"}


def _whole(v: Any) -> bool:
    return isinstance(v, int) and not isinstance(v, bool) and v >= 1


def check_prize(prize: Any, items: set[str], where: str) -> None:
    if not isinstance(prize, dict):
        raise ValueError(f"loot: {where}: a prize is a mapping")
    keys = [k for k in PRIZE_KEYS if k in prize]
    if len(keys) != 1:
        raise ValueError(f"loot: {where}: a prize is exactly one of {PRIZE_KEYS}")
    kind = keys[0]
    if not _whole(prize[kind]) and kind != "item":
        raise ValueError(f"loot: {where}: {kind} is a whole number, 1 or more")
    if kind == "item":
        if prize["item"] not in items:
            raise ValueError(f"loot: {where}: unknown item {prize['item']!r}")
        if not _whole(prize.get("n", 1)):
            raise ValueError(f"loot: {where}: n is a whole number, 1 or more")
    if kind == "egg" and prize["egg"] != 1:
        raise ValueError(f"loot: {where}: an egg is {{egg: 1}}")
    extra = set(prize) - {kind, "n"}
    if extra:
        raise ValueError(f"loot: {where}: unknown keys {sorted(extra)}")


def check_loot(doc: Any, items: set[str]) -> dict[str, Any]:
    if not isinstance(doc, dict):
        raise ValueError("loot: needs a mapping")
    for needed in (HINT_ITEM, EGG_ITEM):
        if needed not in items:
            raise ValueError(f"loot: the economy needs the item {needed}")
    gifts = doc.get("daily_gift")
    if not isinstance(gifts, list) or not gifts:
        raise ValueError("loot: daily_gift is a list of prizes")
    for i, prize in enumerate(gifts):
        check_prize(prize, items, f"daily_gift[{i}]")
    chests = doc.get("chests")
    if not isinstance(chests, dict) or not chests:
        raise ValueError("loot: chests is a mapping of chest ids")
    for cid, chest in chests.items():
        if not isinstance(cid, str) or not cid.replace("_", "").isalnum():
            raise ValueError(f"loot: bad chest id {cid!r}")
        if chest.get("repeat") not in REPEATS:
            raise ValueError(f"loot: {cid}: repeat is one of {sorted(REPEATS)}")
        prizes = chest.get("prizes")
        if not isinstance(prizes, list) or not prizes:
            raise ValueError(f"loot: {cid}: needs a list of prizes")
        for i, prize in enumerate(prizes):
            check_prize(prize, items, f"{cid}.prizes[{i}]")
        if "consolation" not in chest:
            raise ValueError(f"loot: {cid}: needs a consolation prize (nobody leaves with nothing)")
        check_prize(chest["consolation"], items, f"{cid}.consolation")
    return doc


def build(out: Output) -> dict[str, Any]:
    doc = check(read_yaml(SOURCE))
    out.add_json("economy.json", doc, compact=True)
    loot = check_loot(read_yaml(LOOT), {i["id"] for i in doc["items"]})
    out.add_json("loot.json", loot, compact=True)
    return {"items": len(doc["items"]), "chests": len(loot["chests"])}
