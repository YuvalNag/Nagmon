# SPDX-License-Identifier: GPL-3.0
"""The quests: ``mods/nagmon/quests/*.yaml`` and ``rules.yaml``.

Slice W3 of ``docs/app/WORLD_V2.md`` (section 7). A quest is data: who
gives it, the steps (a conversation, a question of the learning engine, a
thing to bring, a choice), the reward and how it repeats. The app reads
them as ``game/quests.json`` (Hebrew only: the game is Hebrew; the English
of every line is checked here, kept in the YAML, and not shipped).

Rules the build holds (a typo stops the build, not a child's game):

* a step's ``enter`` and ``done`` lists use only actions the event
  interpreter already has (:data:`STEP_ACTIONS`; a test reads the
  interpreter's own list and checks they are in it), so a quest needs no
  new engine action;
* a choice step with a ``correct`` option lets a wrong pick try again, and
  a choice with none (the kindness scenes) pays the same whatever is
  chosen: an option carries no reward and no action;
* no score or points are ever said to the child (:data:`BANNED`), every
  line is one line, Hebrew has Hebrew letters and English has none;
* the numbers (the reward scale, the caps, the cooldowns) are in
  ``rules.yaml``, not in code.
"""

from __future__ import annotations

import re
from typing import Any

from tools.app.common import NAG, WORLD_MAPS, Output
from tools.app.content import read_yaml

QUESTS = NAG / "quests"
RULES = QUESTS / "rules.yaml"
NPCS = NAG / "npcs"
MAPS = NAG / "maps"

#: What a quest step may do besides its own kind: actions of the event
#: interpreter (app/src/core/world/events.ts ACTIONS).
STEP_ACTIONS = ("set_variable", "clear_variable", "give_item", "send_letter")
STEP_KINDS = ("say", "ask", "bring", "choose")
REPEATS = ("once", "pool", "weekly", "daily")
SLOTS = ("easy", "normal", "learning", "weekly")
BANDS = ("A", "B", "C")
UNLOCKS = ("board_slot",)
#: The most variants a pool needs at least (docs 7.4: at least 6).
MIN_POOL_VARIANTS = 6
#: One line on a card or in a dialog page.
LINE_MAX = 120
GOAL_MAX = 70
#: A quest's coins in all (steps and end) stay under this.
COINS_MAX = 120
SLUG = re.compile(r"[a-z][a-z0-9_]*")
CODE = re.compile(r"[0-9a-f]{4,5}(-[0-9a-f]{4,5})*")
HEBREW = re.compile(r"[֐-׿]")
#: Words a child never reads in a quest (no score, no failing).
BANNED = (
    "ניקוד",
    "נקודות",
    "ציון",
    "נכשל",
    "כישלון",
    "טעות",
    "score",
    "points",
    "wrong",
    "failed",
)
VAR = re.compile(r"nagmon_[a-z0-9_]+:[a-z0-9_]+")


def load_rules() -> dict[str, Any]:
    return read_yaml(RULES)


def load_quests() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for path in sorted(QUESTS.glob("q_*.yaml")):
        doc = read_yaml(path)
        if not isinstance(doc, dict) or doc.get("id") != path.stem:
            raise ValueError(f"quests: {path.name}: the id is the file's name")
        out[doc["id"]] = doc
    return out


def _whole(where: str, v: Any, low: int = 0) -> int:
    if not isinstance(v, int) or isinstance(v, bool) or v < low:
        raise ValueError(f"quests: {where}: a whole number, {low} or more")
    return v


def check_rules(r: Any) -> dict[str, Any]:
    if not isinstance(r, dict):
        raise ValueError("quests: rules needs a mapping")
    scale = r.get("scale")
    if not isinstance(scale, dict) or set(scale) != {
        "XS",
        "S",
        "M",
        "L",
        "XL",
    }:
        raise ValueError("quests: rules.scale is XS, S, M, L and XL")
    values = [_whole(f"rules.scale.{k}", v, 1) for k, v in scale.items()]
    if values != sorted(values):
        raise ValueError("quests: rules.scale grows from XS to XL")
    for key in (
        "active_max",
        "hint_after",
        "lesser_after",
        "repeat_free_per_week",
    ):
        _whole(f"rules.{key}", r.get(key), 1)
    if r["hint_after"] >= r["lesser_after"]:
        raise ValueError("quests: the hint comes before the lesser form")
    for key in ("lesser_coins_pct", "repeat_coins_pct"):
        if not 0 <= _whole(f"rules.{key}", r.get(key)) <= 100:
            raise ValueError(f"quests: rules.{key} is 0 to 100")
    b = r.get("board")
    if not isinstance(b, dict):
        raise ValueError("quests: rules.board needs a mapping")
    for key in (
        "history",
        "giver_gap",
        "variant_cooldown",
        "giver_week_max",
        "weak_pct",
        "weekly_day",
    ):
        _whole(f"rules.board.{key}", b.get(key))
    if b["weekly_day"] > 6 or b["weak_pct"] > 100:
        raise ValueError(
            "quests: rules.board weekly_day is 0 to 6, weak_pct 0 to 100"
        )
    if b["history"] < max(b["giver_gap"], b["variant_cooldown"]) + 3:
        raise ValueError(
            "quests: rules.board.history is shorter than the gaps"
        )
    bands = r.get("bands")
    if (
        not isinstance(bands, dict)
        or set(bands) != {"A", "B"}
        or bands["A"] >= bands["B"]
    ):
        raise ValueError(
            "quests: rules.bands is A and B (the last grade of each band)"
        )
    solar = r.get("solar_missions")
    if not isinstance(solar, dict) or set(solar) != {
        "moon",
        "sun",
        "rocky_planets",
        "giants",
        "outer",
    }:
        raise ValueError("quests: rules.solar_missions names the five zones")
    for zone, coins in solar.items():
        _whole(f"rules.solar_missions.{zone}", coins, 1)
    props = r.get("props")
    if not isinstance(props, dict) or not props:
        raise ValueError("quests: rules.props names the props")
    for slug, t in props.items():
        _text(f"rules.props.{slug}", t, 30)
    places = r.get("places")
    if not isinstance(places, dict) or set(places) != {
        "maps",
        "spots",
        "prop_maps",
        "away",
    }:
        raise ValueError(
            "quests: rules.places is maps, spots, prop_maps and away"
        )
    for name in ("maps", "spots"):
        if not isinstance(places[name], dict) or not places[name]:
            raise ValueError(f"quests: rules.places.{name} names places")
        for key, t in places[name].items():
            _text(f"rules.places.{name}.{key}", t, 40)
    for slug, m in places["prop_maps"].items():
        if m not in places["maps"] or m not in WORLD_MAPS or slug not in props:
            raise ValueError(
                f"quests: rules.places.prop_maps.{slug}: a prop with a named map of the world"
            )
    _text("rules.places.away", places["away"], 50)
    lines = r.get("lines")
    if not isinstance(lines, dict) or set(lines) != {
        "owl",
        "later",
        "hint",
        "retry",
        "lesser",
        "accept",
        "decline",
    }:
        raise ValueError(
            "quests: rules.lines is owl, later, hint, retry, lesser, accept and decline"
        )
    for key, t in lines.items():
        _text(
            f"rules.lines.{key}",
            t,
            70 if key in ("accept", "decline") else LINE_MAX,
        )
    return r


def _text(where: str, t: Any, limit: int = LINE_MAX) -> dict[str, str]:
    if not isinstance(t, dict) or set(t) != {"he", "en"}:
        raise ValueError(f"quests: {where}: needs he and en")
    for lang in ("he", "en"):
        s = t[lang]
        if not isinstance(s, str) or not s.strip() or "\n" in s:
            raise ValueError(f"quests: {where}.{lang}: needs one line of text")
        if len(s) > limit:
            raise ValueError(
                f"quests: {where}.{lang}: at most {limit} characters"
            )
        if "{" in s:
            raise ValueError(f"quests: {where}.{lang}: no placeholders")
    if not HEBREW.search(t["he"]):
        raise ValueError(f"quests: {where}.he: needs Hebrew letters")
    if HEBREW.search(t["en"]):
        raise ValueError(f"quests: {where}.en: English has no Hebrew letters")
    for word in BANNED:
        if word in t["he"] or word in t["en"].lower():
            raise ValueError(
                f"quests: {where}: never says {word!r} to a child"
            )
    return t


def _texts(
    where: str, ts: Any, least: int = 1, limit: int = LINE_MAX
) -> list[dict[str, str]]:
    if not isinstance(ts, list) or len(ts) < least or len(ts) > 4:
        raise ValueError(f"quests: {where}: {least} to 4 variants")
    return [_text(f"{where}[{i}]", t, limit) for i, t in enumerate(ts)]


def npc_slugs() -> set[str]:
    return {p.stem for p in NPCS.glob("*.yaml") if ".lines." not in p.name}


def prop_slugs() -> set[str]:
    """Props a quest may talk to: the ones the maps create (``create_npc``)."""
    props: set[str] = set()
    for name in WORLD_MAPS:
        path = MAPS / f"{name}.yaml"
        if not path.is_file():
            continue
        for e in ((read_yaml(path) or {}).get("events") or {}).values():
            for act in e.get("actions") or [] if isinstance(e, dict) else []:
                word, _, rest = str(act).partition(" ")
                if word == "create_npc":
                    props.add(rest.split(",")[0])
    return props


def _actions(
    where: str, acts: Any, items: set[str], letters: set[str]
) -> list[str]:
    if acts is None:
        return []
    if not isinstance(acts, list):
        raise ValueError(f"quests: {where}: a list of actions")
    for a in acts:
        word, _, rest = str(a).partition(" ")
        args = rest.split(",") if rest else []
        if word not in STEP_ACTIONS:
            raise ValueError(
                f"quests: {where}: {word!r} is not an action quests may use {STEP_ACTIONS}"
            )
        if word in ("set_variable", "clear_variable") and (
            len(args) != 1
            or not VAR.fullmatch(args[0])
            and word == "set_variable"
        ):
            raise ValueError(
                f"quests: {where}: {a!r} needs one nagmon_<name>:<value>"
            )
        if word == "give_item" and (
            len(args) != 2 or args[0] not in items or not args[1].isdigit()
        ):
            raise ValueError(
                f"quests: {where}: {a!r} needs a known item and a number"
            )
        if word == "send_letter" and (
            len(args) != 1 or args[0] not in letters
        ):
            raise ValueError(f"quests: {where}: {a!r} needs a known letter")
    return [str(a) for a in acts]


def reward(
    where: str,
    r: Any,
    scale: dict[str, int],
    items: set[str],
    *,
    friendship_ok: bool = True,
) -> dict[str, Any]:
    if not isinstance(r, dict) or set(r) - {"coins", "items", "friendship"}:
        raise ValueError(f"quests: {where}: coins, items, friendship")
    out: dict[str, Any] = {"coins": 0, "items": [], "friendship": False}
    if "coins" in r:
        c = r["coins"]
        out["coins"] = (
            scale[c]
            if isinstance(c, str) and c in scale
            else _whole(f"{where}.coins", c, 1)
        )
    for it in r.get("items") or []:
        if not isinstance(it, dict) or it.get("id") not in items:
            raise ValueError(f"quests: {where}: unknown item {it!r}")
        out["items"].append(
            {
                "id": it["id"],
                "n": _whole(f"{where}.items.n", it.get("n", 1), 1),
            }
        )
    if r.get("friendship"):
        if r["friendship"] is not True or not friendship_ok:
            raise ValueError(
                f"quests: {where}: friendship is true here or left out"
            )
        out["friendship"] = True
    return out


def _step(
    qid: str, i: int, s: Any, q: dict[str, Any], ctx: dict[str, Any]
) -> dict[str, Any]:
    where = f"{qid}.steps[{i}]"
    if not isinstance(s, dict) or s.get("kind") not in STEP_KINDS:
        raise ValueError(f"quests: {where}: kind is one of {STEP_KINDS}")
    npc = s.get("npc")
    if npc not in ctx["npcs"] | ctx["props"]:
        raise ValueError(
            f"quests: {where}: {npc!r} is not a person or a prop of the maps"
        )
    out: dict[str, Any] = {
        "kind": s["kind"],
        "npc": npc,
        "todo": _text(f"{where}.todo", s.get("todo"), GOAL_MAX)["he"],
    }
    out["say"] = (
        [t["he"] for t in _texts(f"{where}.say", s.get("say"), 1)]
        if s.get("say")
        else []
    )
    if s["kind"] != "choose" and not out["say"]:
        raise ValueError(f"quests: {where}: needs something to say")
    out["after_days"] = _whole(f"{where}.after_days", s.get("after_days", 0))
    out["later"] = bool(s.get("later", False))
    out["enter"] = _actions(
        f"{where}.enter", s.get("enter"), ctx["items"], ctx["letters"]
    )
    out["done"] = _actions(
        f"{where}.done", s.get("done"), ctx["items"], ctx["letters"]
    )
    if "reward" in s:
        out["reward"] = reward(
            f"{where}.reward", s["reward"], ctx["scale"], ctx["items"]
        )
    if s["kind"] == "ask":
        if s.get("topic") not in ctx["subjects"]:
            raise ValueError(
                f"quests: {where}: topic is one of {sorted(ctx['subjects'])}"
            )
        out["topic"] = s["topic"]
    elif s["kind"] == "bring":
        if s.get("item") not in ctx["items"]:
            raise ValueError(
                f"quests: {where}: unknown item {s.get('item')!r}"
            )
        out["item"] = s["item"]
        out["n"] = _whole(f"{where}.n", s.get("n"), 1)
        out["wait"] = _text(f"{where}.wait", s.get("wait"))["he"]
    elif s["kind"] == "choose":
        out["prompt"] = _text(f"{where}.prompt", s.get("prompt"))["he"]
        opts = s.get("options")
        if not isinstance(opts, list) or not 2 <= len(opts) <= 4:
            raise ValueError(f"quests: {where}: 2 to 4 options")
        ids: list[str] = []
        out["options"] = []
        for j, o in enumerate(opts):
            ow = f"{where}.options[{j}]"
            if not isinstance(o, dict) or set(o) - {"id", "label", "reply"}:
                # an option carries no reward and no action: every option pays the same (SEL, docs 7.5)
                raise ValueError(
                    f"quests: {ow}: only id, label and reply (an option pays and does nothing)"
                )
            if (
                not isinstance(o.get("id"), str)
                or not SLUG.fullmatch(o["id"])
                or o["id"] in ids
            ):
                raise ValueError(f"quests: {ow}: needs its own id")
            ids.append(o["id"])
            out["options"].append(
                {
                    "id": o["id"],
                    "label": _text(f"{ow}.label", o.get("label"), 40)["he"],
                    "reply": _text(f"{ow}.reply", o.get("reply"))["he"],
                }
            )
        if "correct" in s:
            if q.get("sel"):
                raise ValueError(
                    f"quests: {where}: a kindness quest has no right option"
                )
            if s["correct"] not in ids:
                raise ValueError(
                    f"quests: {where}: correct is one of the options"
                )
            out["correct"] = s["correct"]
            out["hint"] = _text(f"{where}.hint", s.get("hint"))["he"]
        elif s.get("free"):
            out["free"] = True
        elif not q.get("sel"):
            raise ValueError(
                f"quests: {where}: a choice with no right option is a kindness quest (sel: true)"
            )
    return out


def check_quest(qid: str, q: Any, ctx: dict[str, Any]) -> dict[str, Any]:
    if not SLUG.fullmatch(qid):
        raise ValueError(f"quests: bad id {qid!r}")
    unknown = set(q) - {
        "id",
        "giver",
        "giver_he",
        "type",
        "emoji",
        "title",
        "subject",
        "offer",
        "board",
        "repeat",
        "variants",
        "steps",
        "reward",
        "unlocks",
        "sel",
        "grade_min",
    }
    if unknown:
        raise ValueError(f"quests: {qid}: unknown keys {sorted(unknown)}")
    giver = q.get("giver")
    if giver not in ctx["npcs"] | ctx["props"]:
        raise ValueError(
            f"quests: {qid}: the giver {giver!r} is not a person or a prop"
        )
    out: dict[str, Any] = {
        "id": qid,
        "giver": giver,
        "sel": bool(q.get("sel", False)),
    }
    if giver in ctx["props"]:
        out["giver_name"] = _text(
            f"{qid}.giver_he", {"he": q.get("giver_he"), "en": "box"}, 30
        )["he"]
    if not isinstance(q.get("type"), str) or not SLUG.fullmatch(q["type"]):
        raise ValueError(f"quests: {qid}: needs a type")
    out["type"] = q["type"]
    if not isinstance(q.get("emoji"), str) or not CODE.fullmatch(q["emoji"]):
        raise ValueError(f"quests: {qid}: needs an emoji code")
    out["emoji"] = q["emoji"]
    out["title"] = _text(f"{qid}.title", q.get("title"), 40)["he"]
    if "subject" in q:
        if q["subject"] not in ctx["subjects"]:
            raise ValueError(
                f"quests: {qid}: unknown subject {q['subject']!r}"
            )
        out["subject"] = q["subject"]
    out["grade_min"] = _whole(f"{qid}.grade_min", q.get("grade_min", 0))
    o = q.get("offer")
    if not isinstance(o, dict) or set(o) - {"at", "ask", "lines"}:
        raise ValueError(f"quests: {qid}: offer is at, ask, lines")
    at = o.get("at", giver)
    if at not in ctx["npcs"] | ctx["props"]:
        raise ValueError(
            f"quests: {qid}: offer.at {at!r} is not a person or a prop"
        )
    ask = o.get("ask", True)
    if not isinstance(ask, bool):
        raise ValueError(f"quests: {qid}: offer.ask is true or false")
    out["offer"] = {
        "at": at,
        "ask": ask,
        "lines": [
            t["he"]
            for t in _texts(f"{qid}.offer", o.get("lines"), 2 if ask else 1)
        ],
    }
    rep = q.get("repeat")
    if not isinstance(rep, dict) or rep.get("kind") not in REPEATS:
        raise ValueError(f"quests: {qid}: repeat.kind is one of {REPEATS}")
    out["repeat"] = {
        "kind": rep["kind"],
        "cooldown_days": _whole(
            f"{qid}.repeat.cooldown_days", rep.get("cooldown_days", 0)
        ),
        "variant_cooldown": _whole(
            f"{qid}.repeat.variant_cooldown", rep.get("variant_cooldown", 0)
        ),
    }
    variants = q.get("variants") or []
    out["variants"] = []
    seen: set[str] = set()
    for i, v in enumerate(variants):
        vw = f"{qid}.variants[{i}]"
        if (
            not isinstance(v, dict)
            or v.get("band") not in BANDS
            or not isinstance(v.get("id"), str)
            or v["id"] in seen
        ):
            raise ValueError(
                f"quests: {vw}: needs its own id and a band {BANDS}"
            )
        seen.add(v["id"])
        out["variants"].append(
            {
                "id": v["id"],
                "band": v["band"],
                "text": _text(vw, {"he": v.get("he"), "en": v.get("en")})[
                    "he"
                ],
            }
        )
    if rep["kind"] == "pool":
        if len(variants) < MIN_POOL_VARIANTS:
            raise ValueError(
                f"quests: {qid}: a pool quest has at least {MIN_POOL_VARIANTS} variants"
            )
        if {v["band"] for v in variants} != set(BANDS):
            raise ValueError(
                f"quests: {qid}: the variants cover the bands {BANDS}"
            )
        if not out["repeat"]["variant_cooldown"]:
            raise ValueError(
                f"quests: {qid}: a pool quest has a variant_cooldown"
            )
    b = q.get("board")
    if b is not None:
        if (
            not isinstance(b, dict)
            or set(b) - {"slot", "goal"}
            or b.get("slot") not in SLOTS
        ):
            raise ValueError(
                f"quests: {qid}: board is slot ({SLOTS}) and goal"
            )
        out["board"] = {
            "slot": b["slot"],
            "goal": _text(f"{qid}.board.goal", b.get("goal"), GOAL_MAX)["he"],
        }
    steps = q.get("steps")
    if not isinstance(steps, list) or not steps or len(steps) > 6:
        raise ValueError(f"quests: {qid}: 1 to 6 steps")
    out["steps"] = [_step(qid, i, s, q, ctx) for i, s in enumerate(steps)]
    if out["steps"][0].get("after_days"):
        raise ValueError(
            f"quests: {qid}: the first step cannot wait for a day"
        )
    out["reward"] = reward(
        f"{qid}.reward", q.get("reward") or {}, ctx["scale"], ctx["items"]
    )
    if q.get("unlocks") is not None:
        if q["unlocks"] not in UNLOCKS:
            raise ValueError(f"quests: {qid}: unlocks is one of {UNLOCKS}")
        out["unlocks"] = q["unlocks"]
    coins = out["reward"]["coins"] + sum(
        s.get("reward", {}).get("coins", 0) for s in out["steps"]
    )
    if coins > COINS_MAX:
        raise ValueError(
            f"quests: {qid}: {coins} coins in all is over {COINS_MAX}"
        )
    if out["sel"]:
        # kindness: no right answer anywhere, and nothing to pay a particular option
        if any("correct" in s for s in out["steps"]) or not any(
            s["kind"] == "choose" for s in out["steps"]
        ):
            raise ValueError(
                f"quests: {qid}: a kindness quest is made of free choices"
            )
    return out


def _context() -> dict[str, Any]:
    from tools.app import economy
    from tools.app.objects import LETTERS

    rules = check_rules(load_rules())
    items = {i["id"] for i in read_yaml(economy.SOURCE)["items"]}
    letters = set(read_yaml(LETTERS)["letters"])
    subjects = set(_subjects())
    return {
        "rules": rules,
        "scale": rules["scale"],
        "items": items,
        "letters": letters,
        "subjects": subjects,
        "npcs": npc_slugs(),
        "props": prop_slugs(),
    }


def _subjects() -> list[str]:
    from tools.app.content import LEARNING

    return list(read_yaml(LEARNING / "subjects.yaml")["subjects"])


def check_all(
    raw: dict[str, dict[str, Any]], ctx: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    if not raw:
        raise ValueError("quests: needs at least one quest")
    quests = {qid: check_quest(qid, q, ctx) for qid, q in raw.items()}
    # the people who give quests and the people's own files agree (offers.quests)
    offered: dict[str, set[str]] = {}
    for qid, q in quests.items():
        if q["offer"]["at"] in ctx["npcs"]:
            offered.setdefault(q["offer"]["at"], set()).add(qid)
    for slug in ctx["npcs"]:
        doc = read_yaml(NPCS / f"{slug}.yaml") or {}
        listed = set((doc.get("offers") or {}).get("quests") or [])
        if listed != offered.get(slug, set()):
            raise ValueError(
                f"quests: {slug}: offers.quests {sorted(listed)} does not match the quests offered there {sorted(offered.get(slug, set()))}"
            )
    # a pool of boards: every slot that has quests has at least two givers, so a day can always vary
    for slot in ("easy", "normal", "learning"):
        mine = [
            q
            for q in quests.values()
            if q.get("board", {}).get("slot") == slot
        ]
        if mine and len({q["giver"] for q in mine}) < 2:
            raise ValueError(f"quests: the {slot} slot needs two givers")
    return quests


def emoji_codes() -> set[str]:
    return {q["emoji"] for q in load_quests().values()}


def build(out: Output) -> dict[str, Any]:
    ctx = _context()
    quests = check_all(load_quests(), ctx)
    rules = ctx["rules"]
    shipped_rules = {
        k: v
        for k, v in rules.items()
        if k not in ("solar_missions", "props", "lines", "places")
    }
    from tools.app import npcs as npcs_build

    pl = rules["places"]
    shipped_rules["placements"] = npcs_build.placements()
    shipped_rules["places"] = {
        "maps": {k: t["he"] for k, t in pl["maps"].items()},
        "spots": {k: t["he"] for k, t in pl["spots"].items()},
        "prop_maps": pl["prop_maps"],
        "away": pl["away"]["he"],
    }
    shipped_rules["props"] = {k: t["he"] for k, t in rules["props"].items()}
    shipped_rules["lines"] = {k: t["he"] for k, t in rules["lines"].items()}
    for slug in {s["npc"] for q in quests.values() for s in q["steps"]} | {
        q["offer"]["at"] for q in quests.values()
    }:
        if slug in ctx["props"] and slug not in rules["props"]:
            raise ValueError(
                f"quests: the prop {slug} has no name in rules.props"
            )
    out.add_json(
        "quests.json", {"rules": shipped_rules, "quests": quests}, compact=True
    )
    return {
        "quests": len(quests),
        "steps": sum(len(q["steps"]) for q in quests.values()),
    }
