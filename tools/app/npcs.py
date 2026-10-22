# SPDX-License-Identifier: GPL-3.0
"""The people of the world: ``mods/nagmon/npcs`` as ``game/npcs.json``.

One YAML file for each person (``<slug>.yaml``, the persona card of
docs/app/WORLD_V2.md 5.1) and one file of shipped lines next to it
(``<slug>.lines.he.yaml``). The build checks both, so a typo stops the
build and not a child's game, and ships what the game needs while it
runs: the name, the role, the topics a child may tap, the schedule, how
friendship grows and the line pools. The persona card (voice,
personality, what the person never says, the ``ai`` and ``safety``
blocks) is checked and stays in the YAML for the live-line slice (W6):
this build has no model and no network.

The lines file is a mapping from a pool to a list of lines::

    greet_first:            # the first talk of the day
      - "בוקר טוב!"        # a plain line
      - {text: "...", when: {phase: [morning], friendship_min: 1}, gag: true, shape: weather}
    greet_again: [...]      # the second talk of the day
    idle: [...]             # the third talk and later
    farewell: [...]
    topic.weather: [...]    # the reply to a topic chip

A line's id is made from the person's short name, the pool and its place
in the list (``rina.gf.07``): it is what the child's memory keeps, so
lines are only ever added at the END of a pool.

The shape is read by ``app/src/core/world/npcs.ts``. Where people stand
is in the maps: ``placement:`` in ``mods/nagmon/maps/<map>.yaml`` gives
the named spots and how many people a map holds (``nagmon_placement`` in
the map's JSON).
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from tools.app.common import NAG, WORLD_MAPS, Output
from tools.app.content import read_yaml

NPC_DIR = NAG / "npcs"
MAPS_DIR = NAG / "maps"
SPRITES = NAG / "sprites"

#: WORLD_V2.md 5.3
ROLES = {
    "guide",
    "hint_giver",
    "shopkeeper",
    "healer",
    "tutor",
    "quest_giver",
    "trainer",
    "scientist",
    "collector",
    "rival_learner",
    "lost_kid",
    "mail_carrier",
    "crafter",
    "trader",
    "host",
    "wanderer",
    "animal",
    "robot",
    "boss",
    "storyteller",
    "gardener",
    "tourist",
    "baker",
    "carpenter",
    "pharmacist",
    "librarian",
    "ranger",
    "photographer",
    "chess_player",
    "newsboy",
    "tailor",
    "clockmaker",
    "scout",
    "fisher",
    "pilot",
    "engineer",
    "sage",
    "helper",
}
AGE_FEELS = {"child", "teen", "adult", "elder", "robot", "animal"}
REGISTERS = {"simple", "playful", "formal", "gentle"}
#: M main (60 to 80 lines in the full cast), R regular, W wanderer.
CLASSES = {"M": 3, "R": 2, "W": 1}
PHASES = ("morning", "afternoon", "evening", "night")
WEEKDAYS = ("sun", "mon", "tue", "wed", "thu", "fri", "sat")
GAINS = (
    "first_talk_today",
    "new_topic",
    "gift_loved",
    "gift_liked",
    "gift_ok",
    "quest_done",
)
POOLS = ("greet_first", "greet_again", "idle", "farewell")
POOL_CODE = {
    "greet_first": "gf",
    "greet_again": "ga",
    "idle": "id",
    "farewell": "fw",
}
#: The most topic chips a person offers (ages 5 to 7 tap, never type).
MAX_TOPICS = 4
#: A line: short, at most two sentences (WORLD_V2.md 4.3).
LINE_MAX = 90
LINE_SENTENCES = 2
#: A line id stays short: the child's memory holds eight of them.
ID_MAX = 28
HEBREW = re.compile(r"[א-ת]")
LATIN = re.compile(r"[A-Za-z]")


#: Things no shipped line says: family, fear, real brands (the parent's
#: rules: no family details, modest, kind, no moralising).
def _word(*words: str) -> re.Pattern[str]:
    """Whole Hebrew words only (a prefix letter such as ו or ה is allowed)."""
    body = "|".join(words)
    return re.compile(rf"(?<![א-ת])[והבלכמש]?(?:{body})(?![א-ת])")


FORBIDDEN = {
    "family": _word(
        "אמא", "אבא", "הורים", "אמך", "אביך", "אחיך", "אחותך", "אחי", "אחותי"
    ),
    "fear": _word("מפחיד", "פחד", "אימה", "מוות", "מת", "דם", "להרוג"),
    "brand": _word(
        "פוקימון", "מיינקראפט", "דיסני", "גוגל", "יוטיוב", "וואטסאפ"
    ),
    "moralising": re.compile(
        r"חייבים ל|צריך תמיד|אסור לך|ילד טוב|ילדה טובה|תהיה ילד"
    ),
}
SLUG = re.compile(r"^[a-z][a-z0-9_]{2,40}$")
TOPIC_ID = re.compile(r"^[a-z][a-z0-9_]{1,16}$")
IDENT = re.compile(r"^[a-z][a-z0-9_]{1,40}$")
EMOJI_CODE = re.compile(r"^[0-9a-f]{4,5}(-[0-9a-f]{4,5})*$")


def read_placement(name: str) -> dict[str, Any] | None:
    """``placement:`` of a map's YAML, checked: ``{max_npcs, spots}``, or None."""
    path = MAPS_DIR / f"{name}.yaml"
    if not path.is_file():
        return None
    doc = read_yaml(path)
    raw = doc.get("placement") if isinstance(doc, dict) else None
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError(f"{name}: placement is a mapping")
    spots = raw.get("spots")
    if not isinstance(spots, dict) or not spots:
        raise ValueError(f"{name}: placement needs spots")
    maximum = raw.get("max_npcs")
    if not isinstance(maximum, int) or not 1 <= maximum <= 20:
        raise ValueError(f"{name}: placement.max_npcs is 1 to 20")
    out: dict[str, list[Any]] = {}
    for spot, at in spots.items():
        if not IDENT.match(str(spot)):
            raise ValueError(f"{name}: bad spot name {spot!r}")
        if (
            not isinstance(at, list)
            or len(at) not in (2, 3)
            or not all(isinstance(n, int) and n >= 0 for n in at[:2])
            or (len(at) == 3 and at[2] not in ("up", "down", "left", "right"))
        ):
            raise ValueError(f"{name}: spot {spot}: [x, y] or [x, y, facing]")
        out[spot] = at
    return {"max_npcs": maximum, "spots": out}


def placements() -> dict[str, dict[str, Any]]:
    out = {}
    for name in WORLD_MAPS:
        found = read_placement(name)
        if found:
            out[name] = found
    return out


def _need(cond: bool, who: str, message: str) -> None:
    if not cond:
        raise ValueError(f"npcs: {who}: {message}")


def _list_of_str(value: Any, who: str, field: str) -> list[str]:
    _need(
        isinstance(value, list) and all(isinstance(v, str) for v in value),
        who,
        f"{field} is a list of words",
    )
    return value


def check_where(
    w: Any, who: str, field: str, spots_of: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    _need(isinstance(w, dict), who, f"{field}: needs {{map, spot|spots}}")
    name = w.get("map")
    _need(name in WORLD_MAPS, who, f"{field}: unknown map {name!r}")
    have = w.get("spot")
    pool = w.get("spots")
    _need(
        (have is None) != (pool is None),
        who,
        f"{field}: one of spot or spots",
    )
    names = [have] if have is not None else _list_of_str(pool, who, field)
    _need(bool(names), who, f"{field}: no spots")
    if name in spots_of:
        for spot in names:
            _need(
                spot in spots_of[name]["spots"],
                who,
                f"{field}: map {name} has no spot {spot!r}",
            )
    out: dict[str, Any] = {"map": name}
    if have is not None:
        out["spot"] = have
    else:
        out["spots"] = list(pool)
    return out


def check_when(when: Any, who: str, field: str) -> dict[str, Any]:
    _need(isinstance(when, dict), who, f"{field}: when is a mapping")
    out: dict[str, Any] = {}
    for key, value in when.items():
        if key == "phase":
            phases = value if isinstance(value, list) else [value]
            _need(
                all(p in PHASES for p in phases),
                who,
                f"{field}: phase is one of {PHASES}",
            )
            out["phase"] = list(phases)
        elif key == "days":
            days = value if isinstance(value, list) else [value]
            _need(
                all(d in WEEKDAYS for d in days),
                who,
                f"{field}: days are {WEEKDAYS}",
            )
            out["weekday"] = sorted(WEEKDAYS.index(d) for d in days)
        elif key == "every":
            _need(
                isinstance(value, int) and value >= 2,
                who,
                f"{field}: every is 2 or more",
            )
            out["every"] = value
        else:
            raise ValueError(f"npcs: {who}: {field}: unknown key {key!r}")
    return out


def check_schedule(
    sched: Any, who: str, anchor: bool, spots_of: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    _need(isinstance(sched, dict), who, "schedule is a mapping")
    known = {
        "default",
        "rules",
        "roam",
        "appears_if",
        "visit",
        "night",
        "fixed",
    }
    extra = set(sched) - known
    _need(not extra, who, f"schedule: unknown keys {sorted(extra)}")
    out: dict[str, Any] = {
        "default": None,
        "rules": [],
        "roam": None,
        "night": bool(sched.get("night", False)),
    }
    fixed = sched.get("fixed")
    if fixed is not None:
        # placed by the maps' own create_npc events, not by the resolver
        maps = (
            fixed.get("maps") or [fixed.get("map")]
            if isinstance(fixed, dict)
            else []
        )
        _need(
            bool(maps)
            and all(
                isinstance(m, str)
                and (m in WORLD_MAPS or m.startswith("solar_"))
                for m in maps
            ),
            who,
            "schedule.fixed needs {map} or {maps} of the world",
        )
        _need(
            not (set(sched) - {"fixed", "night"}),
            who,
            "a fixed person has no other schedule",
        )
        return out
    if sched.get("default") is not None:
        out["default"] = check_where(
            sched["default"], who, "default", spots_of
        )
    for i, rule in enumerate(sched.get("rules") or []):
        _need(
            isinstance(rule, dict) and "at" in rule,
            who,
            f"rule {i}: needs when and at",
        )
        at = rule["at"]
        out["rules"].append(
            {
                "when": check_when(rule.get("when") or {}, who, f"rule {i}"),
                "at": None
                if at is None
                else check_where(at, who, f"rule {i}.at", spots_of),
            }
        )
    roam = sched.get("roam")
    if roam is not None:
        _need(not anchor, who, "an anchor never roams")
        where = check_where(roam, who, "roam", spots_of)
        _need("spots" in where, who, "roam needs spots")
        out["roam"] = {"map": where["map"], "spots": where["spots"]}
    ap = sched.get("appears_if")
    if ap is not None:
        _need(isinstance(ap, dict), who, "appears_if is a mapping")
        _need(
            not (set(ap) - {"flag_all", "flag_none", "friendship"}),
            who,
            "appears_if: flag_all, flag_none, friendship",
        )
        out["appears_if"] = {}
        for key in ("flag_all", "flag_none"):
            if key in ap:
                out["appears_if"][key] = _list_of_str(ap[key], who, key)
        if "friendship" in ap:
            fr = ap["friendship"]
            _need(
                isinstance(fr, dict)
                and isinstance(fr.get("npc"), str)
                and isinstance(fr.get("min"), int)
                and 1 <= fr["min"] <= 3,
                who,
                "appears_if.friendship is {npc, min 1 to 3}",
            )
            out["appears_if"]["friendship"] = {
                "npc": fr["npc"],
                "min": fr["min"],
            }
    visit = sched.get("visit")
    if visit is not None:
        _need(
            isinstance(visit, dict)
            and isinstance(visit.get("every_days"), int)
            and isinstance(visit.get("stay_days"), int)
            and visit["every_days"] >= 2
            and 1 <= visit["stay_days"] < visit["every_days"],
            who,
            "visit is {every_days >= 2, stay_days < every_days}",
        )
        _need(not anchor, who, "an anchor is not a visitor")
        out["visit"] = {
            "every_days": visit["every_days"],
            "stay_days": visit["stay_days"],
        }
    if anchor:
        _need(
            out["default"] is not None,
            who,
            "an anchor has a default post",
        )
    else:
        _need(
            out["default"] is not None
            or out["roam"] is not None
            or out["rules"],
            who,
            "a person who is never anywhere",
        )
    return out


def check_topics(
    raw: Any, who: str, facts: set[str]
) -> tuple[list[dict[str, Any]], list[str]]:
    knows = raw if isinstance(raw, dict) else {}
    topics = knows.get("topics") or []
    _need(isinstance(topics, list), who, "knows.topics is a list")
    _need(len(topics) <= MAX_TOPICS, who, f"at most {MAX_TOPICS} topics")
    out = []
    seen: set[str] = set()
    for t in topics:
        _need(isinstance(t, dict), who, "a topic is {id, label_he, icon}")
        tid = t.get("id")
        _need(
            isinstance(tid, str) and TOPIC_ID.match(tid) is not None,
            who,
            f"bad topic id {tid!r}",
        )
        _need(tid not in seen, who, f"topic {tid} twice")
        seen.add(tid)
        label = t.get("label_he")
        _need(
            isinstance(label, str)
            and HEBREW.search(label) is not None
            and len(label) <= 22,
            who,
            f"topic {tid}: label_he is Hebrew, at most 22 characters",
        )
        icon = t.get("icon")
        _need(
            isinstance(icon, str) and EMOJI_CODE.match(icon) is not None,
            who,
            f"topic {tid}: icon is an emoji code",
        )
        unlock = t.get("unlock", 0)
        _need(
            isinstance(unlock, int) and 0 <= unlock <= 3,
            who,
            f"topic {tid}: unlock is 0 to 3",
        )
        out.append({"id": tid, "label": label, "icon": icon, "unlock": unlock})
    known = _list_of_str(knows.get("facts") or [], who, "knows.facts")
    for f in known:
        _need(f in facts, who, f"knows.facts: no fact {f!r} in facts.yaml")
    if "fact" in seen:
        _need(bool(known), who, "a fact topic needs knows.facts")
    return out, known


def check_relationship(raw: Any, who: str, topic_ids: list[str]) -> dict:
    rel = raw if isinstance(raw, dict) else {}
    gain = rel.get("gain") or {}
    _need(
        isinstance(gain, dict) and not (set(gain) - set(GAINS)),
        who,
        f"relationship.gain keys are {GAINS}",
    )
    defaults = {
        "first_talk_today": 1,
        "new_topic": 1,
        "gift_loved": 3,
        "gift_liked": 2,
        "gift_ok": 1,
        "quest_done": 3,
    }
    for k, v in gain.items():
        _need(
            isinstance(v, int) and 0 <= v <= 5,
            who,
            f"relationship.gain.{k} is 0 to 5",
        )
    levels = rel.get("levels", [0, 4, 10, 20])
    _need(
        isinstance(levels, list)
        and len(levels) == 4
        and levels[0] == 0
        and all(isinstance(n, int) for n in levels)
        and levels == sorted(set(levels)),
        who,
        "relationship.levels is 4 rising numbers from 0",
    )
    flags = _list_of_str(rel.get("memory_flags") or [], who, "memory_flags")
    _need(len(flags) <= 12, who, "at most 12 memory flags")
    for f in flags:
        _need(IDENT.match(f) is not None, who, f"bad memory flag {f!r}")
    return {
        "levels": levels,
        "gain": {**defaults, **gain},
        "flags": flags,
    }


def check_card(doc: dict[str, Any], who: str, items: set[str]) -> None:
    """The persona card: checked here, shipped in a later slice."""
    voice = doc.get("voice")
    _need(isinstance(voice, dict), who, "voice is a mapping")
    _need(
        isinstance(voice.get("style"), str) and voice["style"].strip(),
        who,
        "voice.style",
    )
    _need(
        voice.get("register") in REGISTERS,
        who,
        f"voice.register is one of {sorted(REGISTERS)}",
    )
    for key in ("quirks", "catchphrases"):
        _list_of_str(voice.get(key) or [], who, f"voice.{key}")
    pers = _list_of_str(doc.get("personality") or [], who, "personality")
    _need(len(pers) >= 1, who, "personality has a word")
    for key in ("doesnt_know", "never_says", "goals"):
        _list_of_str(doc.get(key) or [], who, key)
    likes = doc.get("likes") or {}
    _need(
        isinstance(likes, dict)
        and not (set(likes) - {"loved", "liked", "ok"}),
        who,
        "likes: loved, liked, ok (no dislikes)",
    )
    for tier, ids in likes.items():
        for i in _list_of_str(ids, who, f"likes.{tier}"):
            _need(i in items, who, f"likes.{tier}: no item {i!r}")
    offers = doc.get("offers") or {}
    _need(isinstance(offers, dict), who, "offers is a mapping")
    ai = doc.get("ai") or {}
    _need(isinstance(ai, dict), who, "ai is a mapping")
    _need(
        ai.get("enabled", False) is False or "intents" in ai,
        who,
        "ai.enabled needs intents",
    )
    share = ai.get("share", 0)
    _need(
        isinstance(share, (int, float)) and 0 <= share <= 1,
        who,
        "ai.share is 0 to 1",
    )
    safety = doc.get("safety") or {}
    _need(
        isinstance(safety, dict)
        and safety.get("age_min_band") in ("A", "B", "C"),
        who,
        "safety.age_min_band is A, B or C",
    )


def short_name(doc: dict[str, Any]) -> str:
    """The first part of a line's id: ``short`` or a trimmed slug."""
    if "short" in doc:
        return str(doc["short"])
    slug = str(doc["id"])
    for prefix in ("nagmon_solar_", "nagmon_house_", "nagmon_"):
        if slug.startswith(prefix):
            slug = slug[len(prefix) :]
            break
    return slug[:10].rstrip("_")


def sentences(text: str) -> int:
    """How many sentences: runs of . ! ? that end a clause (an ellipsis does not)."""
    text = re.sub(r"\.{3,}|…", ",", text.strip())
    return len(re.findall(r"[.!?]+(?=\s|$)", text)) or 1


def check_line_text(text: Any, who: str, where: str, latin: bool) -> str:
    _need(isinstance(text, str) and text.strip() != "", who, f"{where}: text")
    text = text.strip()
    _need("\n" not in text, who, f"{where}: one line")
    plain = re.sub(r"\{(hero|who|name)\}", "", text)
    _need(
        HEBREW.search(plain) is not None,
        who,
        f"{where}: a line is Hebrew",
    )
    shown = len(text.replace("{who}", "x" * 12).replace("{hero}", "xxxxx"))
    _need(
        shown <= LINE_MAX,
        who,
        f"{where}: {shown} characters, at most {LINE_MAX}: {text}",
    )
    _need(
        sentences(plain) <= LINE_SENTENCES,
        who,
        f"{where}: at most {LINE_SENTENCES} sentences: {text}",
    )
    for name, pattern in FORBIDDEN.items():
        _need(
            pattern.search(text) is None,
            who,
            f"{where}: not for a child's game ({name}): {text}",
        )
    if latin:
        ok = re.sub(r"[A-Za-z]", "", plain)
        _need(
            re.fullmatch(r"[א-ת\s.,!?:;'\"()\-–…׳״]*", ok) is not None,
            who,
            f"{where}: odd characters in {text!r}",
        )
    else:
        _need(
            LATIN.search(plain) is None
            and re.fullmatch(r"[א-ת\s.,!?:;'\"()\-–…׳״]*", plain) is not None,
            who,
            f"{where}: only Hebrew letters and plain marks in {text!r}",
        )
    return text


def check_lines(
    doc: Any, who: str, short: str, topic_ids: list[str], latin: bool
) -> dict[str, list[dict[str, Any]]]:
    _need(isinstance(doc, dict), who, "the lines file is a mapping of pools")
    pools: dict[str, list[dict[str, Any]]] = {}
    used: set[str] = set()
    for key, entries in doc.items():
        if key in POOLS:
            code, intent = POOL_CODE[key], key
        elif isinstance(key, str) and key.startswith("topic."):
            tid = key.split(".", 1)[1]
            _need(
                tid in topic_ids, who, f"{key}: no such topic in knows.topics"
            )
            code, intent = f"t-{tid}", f"topic:{tid}"
        else:
            raise ValueError(f"npcs: {who}: unknown pool {key!r}")
        _need(
            isinstance(entries, list) and entries,
            who,
            f"{key}: a list of lines",
        )
        out = []
        for n, entry in enumerate(entries, start=1):
            where = f"{key} #{n}"
            e = entry if isinstance(entry, dict) else {"text": entry}
            extra = set(e) - {"text", "when", "weight", "gag", "shape", "id"}
            _need(not extra, who, f"{where}: unknown keys {sorted(extra)}")
            text = check_line_text(e.get("text"), who, where, latin)
            lid = e.get("id") or f"{short}.{code}.{n:02d}"
            _need(
                isinstance(lid, str)
                and re.fullmatch(r"[A-Za-z0-9_.:-]{1,28}", lid) is not None,
                who,
                f"{where}: id {lid!r} is at most {ID_MAX} of letters, digits . _ : -",
            )
            _need(lid not in used, who, f"{where}: id {lid} twice")
            used.add(lid)
            line: dict[str, Any] = {"id": lid, "text": text}
            if "when" in e:
                w = e["when"]
                _need(isinstance(w, dict), who, f"{where}: when is a mapping")
                cond: dict[str, Any] = {}
                for k, v in w.items():
                    if k == "phase":
                        ph = v if isinstance(v, list) else [v]
                        _need(
                            all(p in PHASES for p in ph),
                            who,
                            f"{where}: phase is one of {PHASES}",
                        )
                        cond["phase"] = list(ph)
                    elif k == "days":
                        ds = v if isinstance(v, list) else [v]
                        _need(
                            all(d in WEEKDAYS for d in ds),
                            who,
                            f"{where}: days are {WEEKDAYS}",
                        )
                        cond["weekday"] = sorted(WEEKDAYS.index(d) for d in ds)
                    elif k in ("friendship_min", "friendship_max"):
                        _need(
                            isinstance(v, int) and 0 <= v <= 3,
                            who,
                            f"{where}: {k} is 0 to 3",
                        )
                        cond[k] = v
                    else:
                        raise ValueError(
                            f"npcs: {who}: {where}: unknown when {k!r}"
                        )
                line["when"] = cond
            if "weight" in e:
                _need(
                    isinstance(e["weight"], (int, float))
                    and 0 < e["weight"] <= 10,
                    who,
                    f"{where}: weight is above 0, up to 10",
                )
                line["weight"] = e["weight"]
            if e.get("gag"):
                line["gag"] = True
            if "shape" in e:
                _need(
                    isinstance(e["shape"], str)
                    and IDENT.match(e["shape"]) is not None,
                    who,
                    f"{where}: shape is a word",
                )
                line["shape"] = e["shape"]
            out.append(line)
        pools[intent] = out
    return pools


def load(
    check_art: bool = True,
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    """(the shipped people by slug, the persona cards by slug), checked."""
    from tools.app import db, economy

    spots_of = placements()
    items = {i["id"] for i in read_yaml(economy.SOURCE)["items"]}
    facts = set(read_yaml(economy.FACTS)["facts"])
    files = sorted(
        p
        for p in NPC_DIR.glob("*.yaml")
        if not p.name.endswith(".lines.he.yaml")
    )
    records = db.table("npc") if check_art else {}
    people: dict[str, dict[str, Any]] = {}
    cards: dict[str, dict[str, Any]] = {}
    shorts: dict[str, str] = {}
    for path in files:
        doc = read_yaml(path)
        who = path.stem
        _need(isinstance(doc, dict), who, "a mapping")
        _need(
            SLUG.match(str(doc.get("id", ""))) is not None
            and doc["id"] == who,
            who,
            "id is the file's name",
        )
        known = {
            "id",
            "short",
            "class",
            "name_he",
            "name_en",
            "role",
            "age_feel",
            "sprite",
            "portrait",
            "anchor",
            "priority",
            "allow_latin",
            "voice",
            "personality",
            "knows",
            "doesnt_know",
            "never_says",
            "goals",
            "likes",
            "schedule",
            "offers",
            "relationship",
            "not_with",
            "ai",
            "safety",
        }
        _need(
            not (set(doc) - known),
            who,
            f"unknown keys {sorted(set(doc) - known)}",
        )
        for need in (
            "name_he",
            "name_en",
            "role",
            "age_feel",
            "sprite",
            "class",
            "schedule",
        ):
            _need(need in doc, who, f"needs {need}")
        _need(
            isinstance(doc["name_he"], str)
            and HEBREW.search(doc["name_he"]) is not None
            and len(doc["name_he"]) <= 24,
            who,
            "name_he is Hebrew, at most 24 characters",
        )
        _need(
            isinstance(doc["name_en"], str) and doc["name_en"].isascii(),
            who,
            "name_en is English",
        )
        _need(doc["role"] in ROLES, who, f"unknown role {doc['role']!r}")
        _need(
            doc["age_feel"] in AGE_FEELS,
            who,
            f"age_feel is one of {sorted(AGE_FEELS)}",
        )
        _need(doc["class"] in CLASSES, who, "class is M, R or W")
        anchor = bool(doc.get("anchor", False))
        if check_art:
            _need(
                (SPRITES / f"{doc['sprite']}.png").is_file()
                or (NAG / "sprites_obj" / f"{doc['sprite']}.png").is_file()
                or doc["sprite"] == "rockitten",
                who,
                f"no picture {doc['sprite']}.png in mods/nagmon/sprites",
            )
            rec = records.get(who)
            _need(rec is not None, who, "no record in mods/nagmon/db/npc")
            _need(
                (rec.get("template") or {}).get("sprite_name")
                == doc["sprite"],
                who,
                "the db/npc record draws another sprite than this file says",
            )
        check_card(doc, who, items)
        topics, known_facts = check_topics(doc.get("knows"), who, facts)
        schedule = check_schedule(doc["schedule"], who, anchor, spots_of)
        short = short_name(doc)
        _need(
            short not in shorts,
            who,
            f"short name {short!r} is also {shorts.get(short)}",
        )
        shorts[short] = who
        lines_path = path.with_name(f"{who}.lines.he.yaml")
        _need(lines_path.is_file(), who, "needs a lines file")
        lines = check_lines(
            read_yaml(lines_path),
            who,
            short,
            [t["id"] for t in topics],
            bool(doc.get("allow_latin", False)),
        )
        rel = check_relationship(
            doc.get("relationship"), who, [t["id"] for t in topics]
        )
        not_with = _list_of_str(doc.get("not_with") or [], who, "not_with")
        people[who] = {
            "name": doc["name_he"],
            "name_en": doc["name_en"],
            "role": doc["role"],
            "age_feel": doc["age_feel"],
            "sprite": doc["sprite"],
            "anchor": anchor,
            "priority": int(doc.get("priority", CLASSES[doc["class"]])),
            "topics": topics,
            "facts": known_facts,
            "schedule": schedule,
            "relationship": rel,
            "not_with": not_with,
            "lines": lines,
        }
        cards[who] = doc
    for who, rec in people.items():
        for other in rec["not_with"]:
            _need(other in people, who, f"not_with: no person {other!r}")
        ap = rec["schedule"].get("appears_if", {}).get("friendship")
        if ap:
            _need(
                ap["npc"] in people,
                who,
                f"appears_if: no person {ap['npc']!r}",
            )
    return people, cards


def topic_codes() -> set[str]:
    """The pictures the topic chips use (the emoji build ships them)."""
    codes: set[str] = set()
    for path in sorted(NPC_DIR.glob("*.yaml")):
        if path.name.endswith(".lines.he.yaml"):
            continue
        doc = read_yaml(path)
        for t in (doc.get("knows") or {}).get("topics") or []:
            codes.add(t["icon"])
    return codes


def build(out: Output) -> dict[str, Any]:
    people, _ = load()
    out.add_json("npcs.json", {"version": 1, "npcs": people}, compact=True)
    lines = sum(
        len(p) for rec in people.values() for p in rec["lines"].values()
    )
    return {"people": len(people), "lines": lines}
