# SPDX-License-Identifier: GPL-3.0
"""The working objects: ``mods/nagmon/objects/*.yaml`` and the letters.

Slice W2 of ``docs/app/WORLD_V2.md`` (section 8): the PC, the mailbox, the
bookshelf and the library, the TV, the fridge and the notice board. Each
object is a definition (a picture, a place on a map, the kind of screen
it opens and what it holds) and the app reads them as
``game/objects.json``; the authored letters
(``mods/nagmon/mail/letters.yaml``) are ``game/mail.json``. Checked here
so a typo stops the build and not a child's game.

The maps make the props themselves (a ``create_npc`` event and a
``talk`` event that runs ``open_object <id>``, the way the daily chest
and the egg nest are made): the build reads those events and stops when
an object's place and the map disagree, so the two can never drift.
"""

from __future__ import annotations

import re
from typing import Any

from tools.app.common import NAG, WORLD_MAPS, Output
from tools.app.content import read_yaml

OBJECTS = NAG / "objects"
LETTERS = NAG / "mail" / "letters.yaml"
SPRITES = NAG / "sprites_obj"
MAPS = NAG / "maps"

SCREENS = ("pc", "mailbox", "bookshelf", "tv", "fridge", "board")
BOOK_MODES = ("daily", "library")
SLOTS = ("easy", "normal", "learning", "weekly")
#: One line on a screen: a headline, a goal, a creature's line.
LINE_MAX = 70
#: A letter's greeting (the fact is shown under it).
LETTER_MAX = 110
#: Mail pays at most this many coins a week (app/src/core/game/mail.ts COINS_PER_WEEK).
COINS_PER_WEEK = 20
SLUG = re.compile(r"[a-z][a-z0-9_]*")
CODE = re.compile(r"[0-9a-f]{4,5}(-[0-9a-f]{4,5})*")
PLACEHOLDER = re.compile(r"\{(\w+)\}")


def slug_of(object_id: str) -> str:
    """The prop's name on the map (app/src/core/game/objects.ts `objectSlug`)."""
    return f"nagmon_obj_{object_id}"


def load_objects() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for path in sorted(OBJECTS.glob("*.yaml")):
        doc = read_yaml(path)
        if not isinstance(doc, dict) or doc.get("id") != path.stem:
            raise ValueError(f"objects: {path.name}: the id is the file's name")
        out[doc["id"]] = doc
    return out


def _line(where: str, text: Any, limit: int = LINE_MAX) -> None:
    if not isinstance(text, str) or not text.strip() or "\n" in text:
        raise ValueError(f"objects: {where}: needs one line of text")
    if len(text) > limit:
        raise ValueError(f"objects: {where}: at most {limit} characters")


def _code(where: str, code: Any) -> None:
    if not isinstance(code, str) or not CODE.fullmatch(code):
        raise ValueError(f"objects: {where}: needs an emoji code")


def _map_events(name: str) -> list[dict[str, Any]]:
    path = MAPS / f"{name}.yaml"
    if not path.is_file():
        raise ValueError(f"objects: map {name} has no script")
    events = (read_yaml(path) or {}).get("events") or {}
    return [e for e in events.values() if isinstance(e, dict)]


def _acts(event: dict[str, Any]) -> list[tuple[str, list[str]]]:
    out = []
    for act in event.get("actions") or []:
        word, _, rest = str(act).partition(" ")
        out.append((word, rest.split(",") if rest else []))
    return out


def check_places(defs: dict[str, dict[str, Any]]) -> None:
    """Each place is made by the map's events, and no two props share a tile."""
    tiles: dict[tuple[str, int, int], str] = {}
    for oid, d in defs.items():
        seen_maps = set()
        for place in d["places"]:
            where = f"{oid} at {place}"
            if place.get("map") not in WORLD_MAPS:
                raise ValueError(f"objects: {where}: not a map of the world")
            x, y = place.get("x"), place.get("y")
            if not all(isinstance(v, int) and not isinstance(v, bool) and v >= 0 for v in (x, y)):
                raise ValueError(f"objects: {where}: x and y are tiles, 0 or more")
            if place["map"] in seen_maps:
                raise ValueError(f"objects: {oid} is twice on {place['map']}")
            seen_maps.add(place["map"])
            key = (place["map"], x, y)
            if key in tiles:
                raise ValueError(f"objects: {oid} and {tiles[key]} share the tile {key}")
            tiles[key] = oid
            events = _map_events(place["map"])
            slug = slug_of(oid)
            made = any(
                word == "create_npc" and args[:3] == [slug, str(x), str(y)]
                for e in events
                for word, args in _acts(e)
            )
            talks = any(
                any(str(b).split() == ["talk", slug] for b in e.get("behav") or [])
                and ("open_object", [oid]) in _acts(e)
                for e in events
            )
            if not made:
                raise ValueError(f"objects: {place['map']}: no event creates {slug} at {x},{y}")
            if not talks:
                raise ValueError(f"objects: {place['map']}: no event runs `open_object {oid}` when talking to {slug}")


def _monster_slugs() -> set[str]:
    from tools.app import db

    return set(db.app_monsters()) | db.nagmon_slugs("monster")


def check_objects(defs: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    if not defs:
        raise ValueError("objects: needs at least one object")
    for oid, d in defs.items():
        if not SLUG.fullmatch(oid):
            raise ValueError(f"objects: bad id {oid!r}")
        if d.get("screen") not in SCREENS:
            raise ValueError(f"objects: {oid}: screen is one of {SCREENS}")
        _line(f"{oid}.title_he", d.get("title_he"), 30)
        sprite = d.get("sprite")
        if not isinstance(sprite, str) or not (SPRITES / f"{sprite}.png").is_file():
            raise ValueError(f"objects: {oid}: the picture {sprite!r} is not in sprites_obj")
        if not isinstance(d.get("places"), list) or not d["places"]:
            raise ValueError(f"objects: {oid}: needs a place")
        screen = d["screen"]
        if screen == "bookshelf" and d.get("mode") not in BOOK_MODES:
            raise ValueError(f"objects: {oid}: mode is one of {BOOK_MODES}")
        if screen == "pc":
            _check_people(oid, d.get("people"))
        if screen == "fridge":
            _check_snacks(oid, d.get("snacks"))
        if screen == "tv":
            _check_tv(oid, d)
        if screen == "board":
            _check_board(oid, d.get("postings"))
    check_places(defs)
    return defs


def _check_people(oid: str, people: Any) -> None:
    if not isinstance(people, list) or not people:
        raise ValueError(f"objects: {oid}: needs a directory of people")
    seen: set[str] = set()
    for p in people:
        slug = p.get("slug") if isinstance(p, dict) else None
        if not isinstance(slug, str) or not SLUG.fullmatch(slug) or slug in seen:
            raise ValueError(f"objects: {oid}: bad or repeated person {slug!r}")
        seen.add(slug)
        _line(f"{oid}.{slug}.name_he", p.get("name_he"), 30)
        _line(f"{oid}.{slug}.offers_he", p.get("offers_he"), 40)
        _code(f"{oid}.{slug}.emoji", p.get("emoji"))


def _check_snacks(oid: str, snacks: Any) -> None:
    if not isinstance(snacks, list) or len(snacks) < 3:
        raise ValueError(f"objects: {oid}: the fridge needs at least three snacks")
    seen: set[str] = set()
    for s in snacks:
        sid = s.get("id") if isinstance(s, dict) else None
        if not isinstance(sid, str) or not SLUG.fullmatch(sid) or sid in seen:
            raise ValueError(f"objects: {oid}: bad or repeated snack {sid!r}")
        seen.add(sid)
        _line(f"{oid}.{sid}.name_he", s.get("name_he"), 20)
        _code(f"{oid}.{sid}.emoji", s.get("emoji"))


def _check_tv(oid: str, d: dict[str, Any]) -> None:
    news = d.get("news")
    if not isinstance(news, list) or len(set(news)) != len(news) or len(news) < 3:
        raise ValueError(f"objects: {oid}: needs at least three different headlines")
    for i, headline in enumerate(news):
        _line(f"{oid}.news[{i}]", headline)
    creatures = d.get("creatures")
    if not isinstance(creatures, dict) or not creatures:
        raise ValueError(f"objects: {oid}: needs creatures of the day")
    known = _monster_slugs()
    for species, text in creatures.items():
        if species not in known:
            raise ValueError(f"objects: {oid}: unknown creature {species!r}")
        _line(f"{oid}.{species}", text)


def _check_board(oid: str, postings: Any) -> None:
    if not isinstance(postings, list):
        raise ValueError(f"objects: {oid}: needs postings")
    seen: set[str] = set()
    for p in postings:
        pid = p.get("id") if isinstance(p, dict) else None
        if not isinstance(pid, str) or not SLUG.fullmatch(pid) or pid in seen:
            raise ValueError(f"objects: {oid}: bad or repeated posting {pid!r}")
        seen.add(pid)
        if p.get("slot") not in SLOTS:
            raise ValueError(f"objects: {oid}: {pid}: slot is one of {SLOTS}")
        _line(f"{oid}.{pid}.goal_he", p.get("goal_he"))
        _line(f"{oid}.{pid}.giver_he", p.get("giver_he"), 30)
        _code(f"{oid}.{pid}.emoji", p.get("emoji"))
    for slot in SLOTS:
        mine = [p for p in postings if p["slot"] == slot]
        givers = {p["giver_he"] for p in mine}
        # three different givers in a slot: a day's three cards can always be from three different people
        if slot != "weekly" and len(givers) < 3:
            raise ValueError(f"objects: {oid}: the {slot} slot needs three givers")
        if slot == "weekly" and not mine:
            raise ValueError(f"objects: {oid}: needs a weekly posting")


def check_letters(doc: Any, facts: set[str], items: set[str]) -> dict[str, Any]:
    if not isinstance(doc, dict):
        raise ValueError("letters: needs a mapping")
    senders = doc.get("senders")
    if not isinstance(senders, dict) or not senders:
        raise ValueError("letters: needs senders")
    for slug, s in senders.items():
        if not SLUG.fullmatch(str(slug)):
            raise ValueError(f"letters: bad sender {slug!r}")
        _line(f"{slug}.name_he", s.get("name_he"), 30)
        _code(f"{slug}.emoji", s.get("emoji"))
    if not any(s.get("always") for s in senders.values()):
        raise ValueError("letters: someone must be known from the start (always: true)")

    def check_gift(where: str, gift: Any) -> None:
        if not isinstance(gift, dict) or len(gift) != 1 and set(gift) != {"item", "n"}:
            raise ValueError(f"letters: {where}: a gift is coins or an item")
        if "coins" in gift:
            c = gift["coins"]
            if not isinstance(c, int) or isinstance(c, bool) or not 1 <= c <= COINS_PER_WEEK:
                raise ValueError(f"letters: {where}: coins are 1 to {COINS_PER_WEEK}")
        elif gift.get("item") not in items:
            raise ValueError(f"letters: {where}: unknown item {gift.get('item')!r}")

    gifts = doc.get("gifts")
    if not isinstance(gifts, list) or not gifts:
        raise ValueError("letters: needs the postcard gifts")
    for i, g in enumerate(gifts):
        check_gift(f"gifts[{i}]", g)
    if not any("item" in g for g in gifts):
        raise ValueError("letters: the gifts need an item (the coin cap falls back to it)")
    letters = doc.get("letters")
    if not isinstance(letters, dict) or not letters:
        raise ValueError("letters: needs letters")
    for lid, letter in letters.items():
        if not SLUG.fullmatch(str(lid)):
            raise ValueError(f"letters: bad id {lid!r}")
        if letter.get("from") not in senders:
            raise ValueError(f"letters: {lid}: unknown sender {letter.get('from')!r}")
        kind = letter.get("kind")
        if kind not in ("postcard", "event"):
            raise ValueError(f"letters: {lid}: kind is postcard or event")
        variants = letter.get("variants")
        if not isinstance(variants, list) or len(variants) != 3:
            raise ValueError(f"letters: {lid}: three variants")
        for i, v in enumerate(variants):
            where = f"{lid}[{i}]"
            _line(f"letters: {where}", v.get("text_he"), LETTER_MAX)
            for name in PLACEHOLDER.findall(v["text_he"]):
                if name != "name":
                    raise ValueError(f"letters: {where}: only {{name}} is put in")
            if "fact" in v and v["fact"] not in facts:
                raise ValueError(f"letters: {where}: unknown fact {v['fact']!r}")
            if v.get("recall") and "fact" not in v:
                raise ValueError(f"letters: {where}: a recall question needs a fact")
            if "gift" in v:
                check_gift(where, v["gift"])
    return doc


def emoji_codes() -> set[str]:
    """The pictures the objects and the letters use (the emoji build ships them)."""
    codes: set[str] = set()
    for d in load_objects().values():
        for key in ("people", "snacks", "postings"):
            codes |= {x["emoji"] for x in d.get(key) or []}
    codes |= {s["emoji"] for s in read_yaml(LETTERS)["senders"].values()}
    return codes


def build(out: Output) -> dict[str, Any]:
    from tools.app import economy

    defs = check_objects(load_objects())
    facts = set(read_yaml(economy.FACTS)["facts"])
    items = {i["id"] for i in read_yaml(economy.SOURCE)["items"]}
    mail = check_letters(read_yaml(LETTERS), facts, items)
    out.add_json("objects.json", {"objects": defs}, compact=True)
    out.add_json("mail.json", mail, compact=True)
    return {"objects": len(defs), "letters": len(mail["letters"])}
