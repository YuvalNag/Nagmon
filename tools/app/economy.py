# SPDX-License-Identifier: GPL-3.0
"""The economy: ``mods/nagmon/economy/items.yaml`` as ``game/economy.json``.

The Bag's items, their prices and their effects, checked here so a typo
stops the build and not a child's game. The shape is read by
``app/src/core/game/items.ts``.
"""

from __future__ import annotations

import re
from typing import Any

from tools.app.common import NAG, Output
from tools.app.content import read_yaml

SOURCE = NAG / "economy" / "items.yaml"
LOOT = NAG / "economy" / "loot.yaml"
FACTS = NAG / "economy" / "facts.yaml"

KINDS = {
    "net",
    "snack",
    "tonic",
    "helper",
    "key",
    # BATTLE_V3: the app's items.ts does not know these yet and leaves them
    # out of the Bag until the engine reads them
    "medicine",
    "befriend_tool",
    "evolution_card",
}
#: kinds the shop of today shelves by themselves (app/src/core/game/shop.ts)
OLD_SHELF = {
    "net": "nets",
    "snack": "snacks",
    "tonic": "snacks",
    "helper": "helpers",
}
SHELF_SIZE = 6
MEDICINE_EFFECTS = {"heal_pep", "cleanse", "wake", "refill_charges"}
TOOL_SCOPES = {"any", "subject", "zone"}
CARDS = {"zone", "subject", "bright", "rainbow"}
SOLD_AFTER = re.compile(r"(guardians:[1-9]|guardian:[a-z_]+|keeper:1)")
HELPERS = {"hint", "fifty", "pass"}
#: What each kind must say about itself.
REQUIRED = {
    "net": ("seal_less",),
    "snack": ("hearts", "xp"),
    "tonic": ("boost_answers",),
    "helper": ("helper",),
    "key": (),
    "medicine": ("effect", "name_he", "name_en", "desc_he"),
    "befriend_tool": ("tool_mult", "scope", "name_he", "name_en", "desc_he"),
    "evolution_card": ("card", "name_he", "name_en", "desc_he"),
}


def check_new_kind(
    iid: str, item: dict[str, Any], doc: dict[str, Any]
) -> None:
    """The items of the new battle: medicine, befriend tools, cards."""
    from tools.app import moves

    kind = item["kind"]
    if kind in OLD_SHELF.values() or kind not in (
        "medicine",
        "befriend_tool",
        "evolution_card",
    ):
        return
    moves.check_text(f"item {iid}.name", item["name_he"], limit=moves.NAME_MAX)
    moves.check_text(f"item {iid}.desc", item["desc_he"], limit=moves.DESC_MAX)
    moves.check_english(f"item {iid}", item["name_en"])
    if "sold_after" in item and not SOLD_AFTER.fullmatch(item["sold_after"]):
        raise ValueError(f"economy: {iid}: bad sold_after")
    if kind == "medicine":
        eff = item["effect"]
        if eff not in MEDICINE_EFFECTS:
            raise ValueError(f"economy: {iid}: unknown effect {eff!r}")
        if eff in ("heal_pep", "wake"):
            share = item.get("heal_share")
            if not isinstance(share, (int, float)) or not 0 < share <= 1:
                raise ValueError(f"economy: {iid}: heal_share is in (0, 1]")
        # the parent's rule: only medicine that wakes a dozing friend may
        if bool(item.get("heals_dozing")) != (eff == "wake"):
            raise ValueError(f"economy: {iid}: only wake medicine wakes")
    if kind == "befriend_tool":
        mult = item["tool_mult"]
        if not isinstance(mult, (int, float)) or not 1 <= mult <= 3:
            raise ValueError(f"economy: {iid}: tool_mult is 1 to 3")
        if item["scope"] not in TOOL_SCOPES:
            raise ValueError(f"economy: {iid}: unknown scope")
        if (item["scope"] == "any") != ("scope_id" not in item):
            raise ValueError(f"economy: {iid}: scope_id for subject and zone")
    if kind == "evolution_card" and item["card"] not in CARDS:
        raise ValueError(f"economy: {iid}: unknown card {item['card']!r}")


def shelf_of(item: dict[str, Any]) -> str | None:
    """The shelf an item stands on, or None when it is not sold."""
    if item.get("sold") is False or item["price"] <= 0:
        return None
    return item.get("shelf") or OLD_SHELF.get(item["kind"])


def check_shelves(doc: dict[str, Any]) -> None:
    shelves = doc.get("shelves")
    if not isinstance(shelves, list) or len(set(shelves)) != len(shelves):
        raise ValueError("economy: shelves is a list of shelf ids")
    counts: dict[str, int] = {}
    for item in doc["items"]:
        shelf = shelf_of(item)
        if shelf is None:
            continue
        if shelf not in shelves:
            raise ValueError(f"economy: {item['id']}: unknown shelf {shelf!r}")
        counts[shelf] = counts.get(shelf, 0) + 1
    for shelf, n in counts.items():
        if n > SHELF_SIZE:
            raise ValueError(f"economy: shelf {shelf} holds {n}, at most 6")


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
            raise ValueError(
                f"economy: {iid}: unknown tab {item.get('tab')!r}"
            )
        kind = item.get("kind")
        if kind not in KINDS:
            raise ValueError(f"economy: {iid}: unknown kind {kind!r}")
        price = item.get("price")
        if not isinstance(price, int) or isinstance(price, bool) or price < 0:
            raise ValueError(
                f"economy: {iid}: the price is a whole number, 0 or more"
            )
        if not item.get("icon"):
            raise ValueError(f"economy: {iid}: needs an icon")
        for key in REQUIRED[kind]:
            if key not in item:
                raise ValueError(f"economy: {iid}: a {kind} needs {key}")
        if kind == "helper" and item["helper"] not in HELPERS:
            raise ValueError(
                f"economy: {iid}: unknown helper {item['helper']!r}"
            )
        if kind != "key" and price == 0 and item.get("sold") is not False:
            raise ValueError(f"economy: {iid}: only key items are free")
        check_new_kind(iid, item, doc)
    check_shelves(doc)
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
        raise ValueError(
            f"loot: {where}: a prize is exactly one of {PRIZE_KEYS}"
        )
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
            raise ValueError(
                f"loot: {cid}: repeat is one of {sorted(REPEATS)}"
            )
        prizes = chest.get("prizes")
        if not isinstance(prizes, list) or not prizes:
            raise ValueError(f"loot: {cid}: needs a list of prizes")
        for i, prize in enumerate(prizes):
            check_prize(prize, items, f"{cid}.prizes[{i}]")
        if "consolation" not in chest:
            raise ValueError(
                f"loot: {cid}: needs a consolation prize (nobody leaves with nothing)"
            )
        check_prize(chest["consolation"], items, f"{cid}.consolation")
    return doc


#: A sign shows one short line.
FACT_MAX = 70


def check_facts(doc: Any) -> dict[str, Any]:
    facts = doc.get("facts") if isinstance(doc, dict) else None
    if not isinstance(facts, dict) or not facts:
        raise ValueError("facts: needs a mapping of facts")
    for fid, fact in facts.items():
        if not isinstance(fid, str) or not fid.replace("_", "").isalnum():
            raise ValueError(f"facts: bad id {fid!r}")
        code = fact.get("emoji") if isinstance(fact, dict) else None
        if not isinstance(code, str) or not code:
            raise ValueError(f"facts: {fid}: needs an emoji code")
        text = fact.get("text_he")
        if not isinstance(text, str) or not text.strip():
            raise ValueError(f"facts: {fid}: needs a line of text")
        if len(text) > FACT_MAX or "\n" in text:
            raise ValueError(
                f"facts: {fid}: one line, at most {FACT_MAX} characters"
            )
    return doc


def fact_codes() -> set[str]:
    """The pictures the facts use (the emoji build ships them)."""
    return {f["emoji"] for f in read_yaml(FACTS)["facts"].values()}


def build(out: Output) -> dict[str, Any]:
    out.add_json("facts.json", check_facts(read_yaml(FACTS)), compact=True)
    doc = check(read_yaml(SOURCE))
    out.add_json("economy.json", doc, compact=True)
    loot = check_loot(read_yaml(LOOT), {i["id"] for i in doc["items"]})
    out.add_json("loot.json", loot, compact=True)
    return {
        "items": len(doc["items"]),
        "chests": len(loot["chests"]),
        "facts": len(read_yaml(FACTS)["facts"]),
    }
