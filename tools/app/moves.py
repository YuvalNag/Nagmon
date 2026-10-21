# SPDX-License-Identifier: GPL-3.0
"""The data of the new battle (docs/app/BATTLE_V3.md) as game JSON.

Sources (all YAML, all ours)::

    mods/nagmon/moves/moves.yaml      the 50 moves
    mods/nagmon/moves/statuses.yaml   the 14 statuses and the stat stages
    mods/nagmon/moves/intents.yaml    the 9 enemy intents, 5 temperaments
    mods/nagmon/moves/gifts.yaml      the 8 gifts
    mods/nagmon/battle/families.yaml  the 25 families (subject, bases, ...)
    mods/nagmon/battle/encounters.yaml guardians, master, Keepers
    mods/nagmon/battle/rules.yaml     the numbers of sections 5, 7 and 8
    mods/nagmon/trips/solar.yaml      zones, families, stages, master level
    mods/nagmon/db/encounter/*.yaml   the wild tables (made by the importer)

Built into ``app/public/game``: ``moves.json``, ``statuses.json``,
``intents.json``, ``gifts.json``, ``species_battle.json``,
``battle_encounters.json`` and ``battle_rules.json`` (shapes in
``app/src/core/data/battleTypes.ts``). Every reference is checked here, so
a typo stops the build and not a child's battle.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from pathlib import Path
from typing import Any

from tools.app.common import NAG, Output
from tools.app.content import read_yaml

MOVES = NAG / "moves" / "moves.yaml"
STATUSES = NAG / "moves" / "statuses.yaml"
INTENTS = NAG / "moves" / "intents.yaml"
GIFTS = NAG / "moves" / "gifts.yaml"
FAMILIES = NAG / "battle" / "families.yaml"
ENCOUNTERS = NAG / "battle" / "encounters.yaml"
RULES = NAG / "battle" / "rules.yaml"
TRIP = NAG / "trips" / "solar.yaml"
WILD = NAG / "db" / "encounter"
MONSTERS = NAG / "db" / "monster"
LESSONS = NAG / "lessons"

SUBJECTS = ("math", "geometry", "science", "english", "hebrew", "logic")
#: moves per subject, and the one for every creature (spec 3.2)
MOVES_PER_SUBJECT = {
    "math": 8,
    "geometry": 8,
    "science": 8,
    "english": 9,
    "hebrew": 8,
    "logic": 8,
    "any": 1,
}
TIERS = ("E", "N", "S", "U", "C", "K", "Q", "F", "W")
QUESTIONS = ("E", "N", "S", "none")
#: charges per battle by tier (spec 3.1; a few normal moves have 8)
CHARGES = {
    "E": {15},
    "N": {8, 10},
    "S": {6},
    "C": {10},
    "K": {8},
    "Q": {10},
}
LEARN_SOURCES = ("level", "lesson_card", "chest_card", "shop_card")
#: what a move's effect may be (and the keys each needs)
EFFECTS = {
    "status": ("status", "chance"),
    "weaken": ("stat", "stages", "chance", "rounds"),
    "boost": ("stats", "stages", "rounds"),
    "shield": ("share", "rounds"),
    "heal": ("share",),
    "regen": ("share", "rounds"),
    "cleanse": ("scope",),
    "mirror": ("soften", "return", "rounds"),
    "mark": ("subject", "rounds"),
    "finisher": ("per_mark", "same_subject", "two_different"),
    "reveal": ("weak_subject", "intents"),
    "focus": (),
    "echo": ("power_share",),
    "swap_boosts": ("copy_to_self",),
    "ignore_shield": (),
    "always_brilliant": (),
    "chain_bonus": ("steps",),
}
STATS = ("power", "guard", "speed")
TEMPERAMENTS = ("shy", "playful", "grumpy", "sleepy", "proud")
#: levels at which the default four equipped moves are listed
MILESTONES = (1, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20)
HE_LETTER = re.compile("[א-ת]")
#: child-facing Hebrew: names and one-liners stay short
NAME_MAX = 24
DESC_MAX = 45
#: no violence, however mildly (Hebrew and English); whole words
VIOLENCE_HE = (
    "הרג",
    "להרוג",
    "הורג",
    "מוות",
    "מת",
    "מתים",
    "דם",
    "נשק",
    "אקדח",
    "חרב",
    "פצע",
    "פצוע",
    "כאב",
    "מכה",
    "מכות",
    "חבטה",
    "תקיפה",
    "הרס",
    "להרוס",
    "פיצוץ",
    "פצצה",
)
VIOLENCE_EN = (
    "kill",
    "die",
    "dead",
    "death",
    "blood",
    "weapon",
    "gun",
    "sword",
    "wound",
    "hurt",
    "pain",
    "punch",
    "kick",
    "stab",
    "shoot",
    "bomb",
    "destroy",
    "defeat",
    "faint",
    "fainted",
    "knock",
)


# ----------------------------------------------------------------- helpers
def _fail(where: str, msg: str) -> ValueError:
    return ValueError(f"battle data: {where}: {msg}")


def _words(text: str) -> list[str]:
    return re.findall(r"[\w']+", text.lower())


def check_text(where: str, he: Any, *, limit: int) -> None:
    """A child-facing Hebrew text: Hebrew, short, kind."""
    if not isinstance(he, str) or not he.strip():
        raise _fail(where, "needs Hebrew text")
    if not HE_LETTER.search(he):
        raise _fail(where, f"{he!r} is not Hebrew")
    if len(he) > limit or "\n" in he:
        raise _fail(where, f"{he!r} is longer than {limit} characters")
    bad = set(_words(he)) & set(VIOLENCE_HE)
    if bad:
        raise _fail(where, f"violence word {sorted(bad)} in {he!r}")


def check_english(where: str, en: Any) -> None:
    if not isinstance(en, str) or not en.strip():
        raise _fail(where, "needs an English name")
    if HE_LETTER.search(en):
        raise _fail(where, f"{en!r} has Hebrew letters")
    bad = set(_words(en)) & set(VIOLENCE_EN)
    if bad:
        raise _fail(where, f"violence word {sorted(bad)} in {en!r}")


def _num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _int(v: Any) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


# ------------------------------------------------------------------ moves
def check_effects(
    where: str, effects: Any, statuses: set[str], moves: set[str] | None = None
) -> None:
    if not isinstance(effects, list):
        raise _fail(where, "effects is a list")
    for i, fx in enumerate(effects):
        kind = fx.get("type") if isinstance(fx, dict) else None
        if kind not in EFFECTS:
            raise _fail(f"{where}[{i}]", f"unknown effect type {kind!r}")
        for key in EFFECTS[kind]:
            if key not in fx:
                raise _fail(f"{where}[{i}]", f"{kind} needs {key}")
        if kind == "status":
            if fx["status"] not in statuses:
                raise _fail(f"{where}[{i}]", f"unknown status {fx['status']}")
            if not _num(fx["chance"]) or not 0 < fx["chance"] <= 1:
                raise _fail(f"{where}[{i}]", "chance is in (0, 1]")
        if kind in ("weaken",) and fx["stat"] not in STATS:
            raise _fail(f"{where}[{i}]", f"unknown stat {fx['stat']}")
        if kind == "boost" and not set(fx["stats"]) <= set(STATS):
            raise _fail(f"{where}[{i}]", f"unknown stats {fx['stats']}")
        if kind == "mark" and fx["subject"] not in SUBJECTS:
            raise _fail(f"{where}[{i}]", f"unknown subject {fx['subject']}")
        for key in ("share", "soften", "return", "power_share"):
            if key in fx and not (_num(fx[key]) and 0 < fx[key] <= 1):
                raise _fail(f"{where}[{i}]", f"{key} is in (0, 1]")


def check_moves(
    doc: Any, statuses: set[str], rules: dict[str, Any]
) -> list[dict[str, Any]]:
    moves = doc.get("moves") if isinstance(doc, dict) else None
    if not isinstance(moves, list) or len(moves) != 50:
        raise _fail("moves", "the catalogue has exactly 50 moves")
    ids: set[str] = set()
    numbers: list[int] = []
    for m in moves:
        mid = m.get("id")
        if not isinstance(mid, str) or not re.fullmatch(r"[a-z][a-z_]*", mid):
            raise _fail("moves", f"bad id {mid!r}")
        if mid in ids:
            raise _fail(mid, "repeated id")
        ids.add(mid)
        numbers.append(m.get("n"))
        check_text(mid, m.get("he"), limit=NAME_MAX)
        check_english(mid, m.get("en"))
        check_text(f"{mid}.desc_he", m.get("desc_he"), limit=DESC_MAX)
        if m.get("subject") not in (*SUBJECTS, "any"):
            raise _fail(mid, f"unknown subject {m.get('subject')!r}")
        tier = m.get("tier")
        if tier not in TIERS:
            raise _fail(mid, f"unknown tier {tier!r}")
        if m.get("question") not in QUESTIONS:
            raise _fail(mid, "question is E, N, S or none")
        if (m["question"] == "none") != (tier == "W" or mid == "echo"):
            raise _fail(mid, "only the Wiggle and Echo ask no question")
        power = m.get("power")
        if (power is None) != (tier == "U"):
            raise _fail(mid, "only utility moves have no power")
        if power is not None and not (_int(power) and 20 <= power <= 90):
            raise _fail(mid, "power is a whole number from 20 to 90")
        hits = m.get("hits")
        if hits != (3 if tier == "F" else 1):
            raise _fail(mid, "a Finale hits 3 times, others once")
        if tier == "F":
            if m.get("spark_cost") != rules["spark"]["max"]:
                raise _fail(mid, "a Finale costs the whole Spark meter")
            if m.get("charges") is not None:
                raise _fail(mid, "a Finale is paid by Spark, not charges")
        elif tier == "W":
            if m.get("charges") is not None:
                raise _fail(mid, "the Wiggle never runs out")
        else:
            ch = m.get("charges")
            if not (_int(ch) and 4 <= ch <= 15):
                raise _fail(mid, "charges are 4 to 15")
            allowed = CHARGES.get(tier)
            if allowed and ch not in allowed:
                raise _fail(mid, f"tier {tier} has {sorted(allowed)} charges")
        if m.get("priority", 0) != (1 if tier == "Q" else 0):
            raise _fail(mid, "only Quick moves have priority +1")
        if m.get("target") not in ("enemy", "self"):
            raise _fail(mid, "target is enemy or self")
        lvl = m.get("unlock_level")
        if not (_int(lvl) and 1 <= lvl <= 12):
            raise _fail(mid, "unlock_level is 1 to 12")
        src = m.get("learn_source")
        if (
            not isinstance(src, list)
            or not src
            or not set(src) <= set(LEARN_SOURCES)
        ):
            raise _fail(mid, f"learn_source is a list of {LEARN_SOURCES}")
        if not isinstance(m.get("animation"), str) or not m["animation"]:
            raise _fail(mid, "needs an animation note")
        check_effects(f"{mid}.effects", m.get("effects"), statuses)
        if "wrong" in m:
            check_effects(f"{mid}.wrong", m["wrong"], statuses)
        if "last_hit" in m:
            check_effects(f"{mid}.last_hit", m["last_hit"], statuses)
        # a utility move that does something must say what a wrong answer does
        if tier == "U" and mid != "echo" and "wrong" not in m:
            raise _fail(mid, "a utility move needs its wrong-answer version")
        if tier == "K" and not any(
            e["type"] == "finisher" for e in m["effects"]
        ):
            raise _fail(mid, "a finisher consumes Marks")
        if tier == "C" and not any(e["type"] == "mark" for e in m["effects"]):
            raise _fail(mid, "a chain starter puts a Mark")
    if sorted(numbers) != list(range(1, 51)):
        raise _fail("moves", "numbers run from 1 to 50 once each")
    counts = Counter(m["subject"] for m in moves)
    if dict(counts) != MOVES_PER_SUBJECT:
        raise _fail("moves", f"per subject {dict(counts)}")
    for sub in SUBJECTS:
        tiers = [m["tier"] for m in moves if m["subject"] == sub]
        if "F" not in tiers or "E" not in tiers or "N" not in tiers:
            raise _fail(
                sub, "every subject has an easy, a normal and a Finale"
            )
    return moves


# --------------------------------------------------------------- statuses
def check_statuses(doc: Any) -> list[dict[str, Any]]:
    rows = doc.get("statuses") if isinstance(doc, dict) else None
    if not isinstance(rows, list) or len(rows) != 14:
        raise _fail("statuses", "there are exactly 14 statuses")
    seen: set[str] = set()
    icons: set[str] = set()
    for s in rows:
        sid = s.get("id")
        if not isinstance(sid, str) or sid in seen:
            raise _fail("statuses", f"bad or repeated id {sid!r}")
        seen.add(sid)
        check_text(sid, s.get("he"), limit=NAME_MAX)
        check_english(sid, s.get("en"))
        check_text(f"{sid}.desc_he", s.get("desc_he"), limit=DESC_MAX)
        icon = s.get("icon")
        if (
            not isinstance(icon, str)
            or not icon.startswith("status_")
            or icon in icons
        ):
            raise _fail(sid, "needs its own icon id status_*")
        icons.add(icon)
        for key in ("shape", "color", "hex", "kind", "group", "cure"):
            if not s.get(key) and key != "cure":
                raise _fail(sid, f"needs {key}")
        if not isinstance(s.get("cure"), list):
            raise _fail(sid, "cure is a list")
        for side in ("enemy", "ours"):
            if not isinstance(s.get(side), dict):
                raise _fail(sid, f"needs a {side} rule")
        if not re.fullmatch(r"#[0-9a-f]{6}", str(s["hex"])):
            raise _fail(sid, "hex is #rrggbb")
    ns = sorted(s["n"] for s in rows)
    if ns != list(range(1, 15)):
        raise _fail("statuses", "numbers run from 1 to 14")
    return rows


# ---------------------------------------------------------------- intents
def check_intents(
    doc: Any, statuses: set[str]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rows = doc.get("intents") if isinstance(doc, dict) else None
    if not isinstance(rows, list) or len(rows) != 9:
        raise _fail("intents", "there are exactly 9 intents")
    ids = {r["id"] for r in rows}
    if len(ids) != 9:
        raise _fail("intents", "repeated id")
    icons: set[str] = set()
    for r in rows:
        iid = r["id"]
        check_text(iid, r.get("he"), limit=NAME_MAX)
        check_english(iid, r.get("en"))
        check_text(f"{iid}.desc_he", r.get("desc_he"), limit=DESC_MAX)
        icon = r.get("icon")
        if not str(icon).startswith("intent_") or icon in icons:
            raise _fail(iid, "needs its own icon id intent_*")
        icons.add(icon)
        if r.get("status") and r["status"] not in statuses:
            raise _fail(iid, f"unknown status {r['status']}")
        if r.get("band_a_replace") and r["band_a_replace"] not in ids:
            raise _fail(iid, "band_a_replace is an intent")
    temps = doc.get("temperaments")
    if not isinstance(temps, list) or [t["id"] for t in temps] != list(
        TEMPERAMENTS
    ):
        raise _fail("temperaments", f"exactly {TEMPERAMENTS}, in order")
    for t in temps:
        check_text(t["id"], t.get("he"), limit=NAME_MAX)
        check_english(t["id"], t.get("en"))
        w = t.get("weights")
        if not isinstance(w, dict) or not set(w) <= ids:
            raise _fail(t["id"], "weights name intents")
        if sum(w.values()) != 100:
            raise _fail(t["id"], f"weights add up to {sum(w.values())}")
    return rows, temps


# ------------------------------------------------------------------ gifts
def check_gifts(doc: Any) -> list[dict[str, Any]]:
    rows = doc.get("gifts") if isinstance(doc, dict) else None
    if not isinstance(rows, list) or len(rows) != 8:
        raise _fail("gifts", "there are exactly 8 gifts")
    if len({g["id"] for g in rows}) != 8:
        raise _fail("gifts", "repeated id")
    for g in rows:
        check_text(g["id"], g.get("he"), limit=NAME_MAX)
        check_english(g["id"], g.get("en"))
        check_text(f"{g['id']}.desc_he", g.get("desc_he"), limit=DESC_MAX)
        if not isinstance(g.get("effect"), dict) or not g["effect"].get(
            "kind"
        ):
            raise _fail(g["id"], "needs an effect with a kind")
    return rows


# -------------------------------------------------------------- the trip
def trip() -> dict[str, Any]:
    return read_yaml(TRIP)


def chains(t: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Every species of the trip: family, stage, zone, next form."""
    found: dict[str, dict[str, Any]] = {}
    for zone in t["zones"]:
        for base, evolved in zone["families"].items():
            chain = [base, *evolved]
            for stage, slug in enumerate(chain):
                if slug in found:
                    raise _fail(slug, "in two families")
                found[slug] = {
                    "family": base,
                    "stage": stage,
                    "zone": zone["id"],
                    "evolves_to": chain[stage + 1]
                    if stage + 1 < len(chain)
                    else None,
                    "evolves_from": chain[stage - 1] if stage else None,
                }
    return found


def wheel_weak(subject: str, wheel: list[str]) -> str:
    """The subject whose moves Sparkle against ``subject``: the one before it."""
    return wheel[(wheel.index(subject) - 1) % len(wheel)]


def check_families(
    doc: Any,
    t: dict[str, Any],
    moves: list[dict[str, Any]],
    gifts: set[str],
    rules: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    fams = doc.get("families") if isinstance(doc, dict) else None
    bases = {b for z in t["zones"] for b in z["families"]}
    if not isinstance(fams, dict) or set(fams) != bases or len(bases) != 25:
        raise _fail("families", "exactly the 25 families of solar.yaml")
    by_id = {m["id"]: m for m in moves}
    wheel = rules["wheel"]
    for fid, f in fams.items():
        if f.get("subject") not in SUBJECTS:
            raise _fail(fid, "unknown subject")
        weak = f.get("weak")
        if (
            not isinstance(weak, list)
            or len(weak) != 2
            or len(set(weak)) != 2
            or not set(weak) <= set(SUBJECTS)
            or f["subject"] in weak
        ):
            raise _fail(fid, "weak is two other subjects")
        if weak[0] != wheel_weak(f["subject"], wheel):
            raise _fail(fid, "the first weak subject is the wheel's")
        if f.get("temperament") not in TEMPERAMENTS:
            raise _fail(fid, "unknown temperament")
        b = f.get("bases")
        if (
            not isinstance(b, list)
            or len(b) != 4
            or not all(_int(x) and 7 <= x <= 14 for x in b)
        ):
            raise _fail(fid, "bases are four whole numbers, 7 to 14")
        rate = f.get("catch_rate")
        if not (_int(rate) and 100 <= rate <= 250):
            raise _fail(fid, "catch_rate is 100 to 250")
        if f.get("gift") not in gifts:
            raise _fail(fid, f"unknown gift {f.get('gift')}")
        sig = f.get("signature")
        if sig is not None:
            old, new = (
                by_id.get(sig.get("replace")),
                by_id.get(sig.get("with")),
            )
            if old is None or new is None:
                raise _fail(fid, "signature names unknown moves")
            if old["subject"] != f["subject"]:
                raise _fail(fid, "a signature replaces a home move")
            if old["tier"] not in ("U", "S") or old["unlock_level"] > 10:
                raise _fail(fid, "replace a utility or stretch move, up to 10")
            if new["tier"] != old["tier"] or new["subject"] in (
                f["subject"],
                "any",
            ):
                raise _fail(fid, "the new move is of another subject and tier")
    return fams


def learnset(
    family: dict[str, Any], moves: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """The moves a creature of the family learns, by level (spec 3.3)."""
    by_id = {m["id"]: m for m in moves}
    sig = family.get("signature")
    rows: list[dict[str, Any]] = []
    for m in moves:
        if m["subject"] != family["subject"]:
            continue
        if sig and m["id"] == sig["replace"]:
            rows.append(
                {
                    "level": m["unlock_level"],
                    "move": sig["with"],
                    "from": "signature",
                }
            )
        else:
            rows.append(
                {"level": m["unlock_level"], "move": m["id"], "from": "home"}
            )
    rows.append({"level": 1, "move": "little_wiggle", "from": "any"})
    del by_id
    rows.sort(key=lambda r: (r["level"], r["move"]))
    return rows


def auto_fill(
    known: list[str], by_id: dict[str, dict[str, Any]], slots: int = 4
) -> list[str]:
    """
    The four equipped moves a creature starts with at a level (spec 3.1:
    one of each role), in this order: the normal attack, the combo pair
    (starter, finisher), a utility move, a stretch move, the easy attack,
    a quick move; whatever is left by the newest. Empty slots show the
    Little Wiggle.
    """
    pool = [
        k
        for k in known
        if by_id[k]["tier"] not in ("F", "W")  # the Finale has its own slot
    ]
    pool.sort(key=lambda k: (by_id[k]["unlock_level"], k))
    chosen: list[str] = []

    def pick(tiers: tuple[str, ...], newest: bool = False) -> None:
        cands = [k for k in pool if by_id[k]["tier"] in tiers]
        if cands and len(chosen) < slots:
            chosen.append(cands[-1] if newest else cands[0])
            pool.remove(chosen[-1])

    pick(("N",))
    pick(("C",))
    pick(("K",))
    pick(("U",))
    pick(("S",))
    pick(("E",))
    pick(("Q",))
    while pool and len(chosen) < slots:
        chosen.append(pool.pop())
    return chosen + ["little_wiggle"] * (slots - len(chosen))


def stat_floor(base: float, level: int, *, pep: bool) -> int:
    add = 10 if pep else 8
    return math.floor(base * (level + add) / 4)


def stats(
    bases: list[int], stage: int, level: int, rules: dict[str, Any]
) -> list[int]:
    """Pep, Power, Guard, Speed (spec 5.1)."""
    mult = list(rules["stage_mult"].values())[stage]
    out = [stat_floor(bases[0] * mult, level, pep=True)]
    out += [stat_floor(b * mult, level, pep=False) for b in bases[1:]]
    return out


def fog(level: int, kind: str, band: str, length: str, rules: dict[str, Any]):
    base = math.floor(10 * (level + 10) / 4)
    return math.floor(
        base
        * rules["fog_kind"][kind]
        * rules["bands"][band]["fog"]
        * rules["length_knob"][length]
    )


def lesson_ids() -> set[str]:
    return {p.stem for p in LESSONS.glob("*.yaml")}


def species_battle(
    t: dict[str, Any],
    fams: dict[str, dict[str, Any]],
    moves: list[dict[str, Any]],
    rules: dict[str, Any],
) -> dict[str, Any]:
    by_id = {m["id"]: m for m in moves}
    chain = chains(t)
    lessons = lesson_ids()
    gates = rules["evolution"]
    out: dict[str, Any] = {}
    zone_lesson = {"moon": "moon", "sun": "solar_system"}
    for slug, c in chain.items():
        fam = fams[c["family"]]
        stage = c["stage"]
        learn = learnset(fam, moves)
        finale = next(
            m["id"]
            for m in moves
            if m["subject"] == fam["subject"] and m["tier"] == "F"
        )
        equipped = {
            str(lv): auto_fill(
                [r["move"] for r in learn if r["level"] <= lv], by_id
            )
            for lv in MILESTONES
        }
        evolve = None
        if c["evolves_to"]:
            evolve = {
                "to": c["evolves_to"],
                "level": gates["level"][stage],
                "know_how": gates["know_how"][stage],
                "stars": gates["stars"][stage],
                "hearts": gates["hearts"][stage],
                "lesson": zone_lesson.get(c["zone"]) if stage == 0 else None,
                "place": c["zone"] if stage == 1 else None,
            }
            if evolve["lesson"] and evolve["lesson"] not in lessons:
                raise _fail(slug, f"unknown lesson {evolve['lesson']}")
        rate = (
            fam["catch_rate"]
            if stage == 0
            else rules["befriend"]["stage_rate"][f"stage{stage}"]
        )
        out[slug] = {
            "family": c["family"],
            "stage": stage,
            "zone": c["zone"],
            "subject": fam["subject"],
            "weak": list(fam["weak"]),
            "temperament": fam["temperament"],
            "bases": list(fam["bases"]),
            "stage_mult": list(rules["stage_mult"].values())[stage],
            "catch_rate": rate,
            "gift": fam["gift"],
            "signature": fam.get("signature"),
            "learnset": learn,
            "finale": finale,
            "equipped": equipped,
            "evolves_from": c["evolves_from"],
            "evolves_to": c["evolves_to"],
            "evolve": evolve,
        }
    return out


# ---------------------------------------------------------- the encounters
def wild_tables(
    t: dict[str, Any], species: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    """The wild tables of the trip's zones and of route 1, with subject shares."""
    tables: dict[str, dict[str, Any]] = {}
    sources: dict[str, Path] = {"route1": WILD / "nagmon_route1.yaml"}
    for z in t["zones"]:
        sources[z["id"]] = WILD / f"{z['encounter']}.yaml"
    for zid, path in sources.items():
        rows = read_yaml(path)["monsters"]
        entries = []
        for r in rows:
            if r["monster"] not in species:
                raise _fail(zid, f"wild {r['monster']} has no battle record")
            if species[r["monster"]]["stage"] != 0:
                raise _fail(zid, f"wild {r['monster']} is not a basic form")
            entries.append(
                {
                    "species": r["monster"],
                    "weight": r["encounter_rate"],
                    "levels": list(r["level_range"]),
                    "subject": species[r["monster"]]["subject"],
                }
            )
        total = sum(e["weight"] for e in entries)
        share: dict[str, float] = {}
        for e in entries:
            share[e["subject"]] = share.get(e["subject"], 0) + e["weight"]
        lows = [e["levels"][0] for e in entries]
        highs = [e["levels"][1] for e in entries]
        tables[zid] = {
            "levels": [min(lows), max(highs)],
            "wild": [{k: v for k, v in e.items()} for e in entries],
            "subject_share": {
                s: round(share[s] / total, 3) for s in SUBJECTS if s in share
            },
        }
    return tables


def check_encounters(
    doc: Any,
    t: dict[str, Any],
    species: dict[str, Any],
    fams: dict[str, dict[str, Any]],
    intents: set[str],
    rules: dict[str, Any],
    tables: dict[str, dict[str, Any]],
    item_ids: set[str],
) -> dict[str, Any]:
    zones = {z["id"]: z for z in t["zones"]}
    guards = doc.get("guardians")
    if not isinstance(guards, list) or [g["zone"] for g in guards] != list(
        zones
    ):
        raise _fail("guardians", "one guardian per zone, in zone order")

    def check_phases(where: str, g: dict[str, Any], final: bool) -> None:
        phases = g.get("phases")
        if not isinstance(phases, list) or len(phases) != 3:
            raise _fail(where, "three phases")
        for i, p in enumerate(phases):
            if p.get("mixed"):
                continue
            cycle = p.get("cycle")
            if not cycle or not set(cycle) <= intents:
                raise _fail(where, f"phase {i + 1} cycle names intents")
            if i >= 1 and not (
                p.get("windup_every") or "big_puff" in p["cycle"]
            ):
                raise _fail(where, f"phase {i + 1} needs a windup")
            if p.get("windup_every") is not None and p["windup_every"] > (
                3 if i == 1 else 2
            ):
                raise _fail(where, f"phase {i + 1} windups come too rarely")

    for g in guards:
        zid = g["zone"]
        sp = species.get(g["species"])
        if sp is None or sp["zone"] != zid or sp["stage"] != 2:
            raise _fail(zid, "the guardian is a stage 2 creature of the zone")
        fam = fams[sp["family"]]
        if g["subject"] != fam["subject"] or g["weak"] != fam["weak"]:
            raise _fail(zid, "the guardian keeps its family's subjects")
        wild_max = zones[zid]["wild_levels"][1]
        if g["level_floor"] != wild_max + 1:
            raise _fail(
                zid, f"level floor is {wild_max + 1}, the zone's max+1"
            )
        check_phases(zid, g, False)
        card = g["reward"]["evolution_card"]
        if card not in item_ids:
            raise _fail(zid, f"unknown card {card}")
    m = doc.get("master") or {}
    master = t["master"]
    if m.get("species") != master["monster"]:
        raise _fail("master", "the master is the trip's master creature")
    floor = rules["enemy_level"]["master"]["floor"]
    if master["level"] != floor or m.get("level_floor") != floor:
        raise _fail("master", f"the master is level {floor} (spec 5.5)")
    outer = max(g["level_floor"] for g in guards)
    if master["level"] <= outer:
        raise _fail("master", "above every guardian")
    sp = species[m["species"]]
    fam = fams[sp["family"]]
    if m["subject"] != fam["subject"] or m["weak"] != fam["weak"]:
        raise _fail("master", "keeps its family's subjects")
    check_phases("master", m, True)
    if m["reward"]["evolution_card"] not in item_ids:
        raise _fail("master", "unknown card")
    # every zone's wild creatures stay below its guardian
    for zid, table in tables.items():
        if zid in zones and table["levels"] != zones[zid]["wild_levels"]:
            raise _fail(zid, "wild levels follow solar.yaml")
        if zid in zones and table["levels"][1] >= next(
            g["level_floor"] for g in guards if g["zone"] == zid
        ):
            raise _fail(zid, "wild creatures are below the guardian")
    return doc


def with_numbers(
    doc: dict[str, Any],
    species: dict[str, Any],
    rules: dict[str, Any],
) -> dict[str, Any]:
    """The guardians and the master with their stats and Fog at the floor."""
    out = {**doc, "guardians": [], "master": dict(doc["master"])}
    for g in [*doc["guardians"], doc["master"]]:
        sp = species[g["species"]]
        floor = g["level_floor"]
        kind = "master" if g is doc["master"] else "guardian"
        row = dict(g)
        row["kind"] = kind
        row["stats_at_floor"] = stats(sp["bases"], sp["stage"], floor, rules)
        row["fog_at_floor"] = {
            band: fog(floor, kind, band, "normal", rules)
            for band in rules["bands"]
        }
        if kind == "master":
            out["master"] = row
        else:
            out["guardians"].append(row)
    return out


# -------------------------------------------------------------------- build
def load() -> dict[str, Any]:
    """Every source, read and checked; the data the build writes."""
    rules = read_yaml(RULES)
    status_doc = read_yaml(STATUSES)
    statuses = check_statuses(status_doc)
    status_ids = {s["id"] for s in statuses}
    moves = check_moves(read_yaml(MOVES), status_ids, rules)
    intents, temps = check_intents(read_yaml(INTENTS), status_ids)
    gifts = check_gifts(read_yaml(GIFTS))
    t = trip()
    fams = check_families(
        read_yaml(FAMILIES), t, moves, {g["id"] for g in gifts}, rules
    )
    species = species_battle(t, fams, moves, rules)
    check_monsters_on_disk(species)
    tables = wild_tables(t, species)
    from tools.app import economy

    item_ids = {i["id"] for i in read_yaml(economy.SOURCE)["items"]}
    enc = check_encounters(
        read_yaml(ENCOUNTERS),
        t,
        species,
        fams,
        {i["id"] for i in intents},
        rules,
        tables,
        item_ids,
    )
    return {
        "rules": rules,
        "status_doc": status_doc,
        "statuses": statuses,
        "moves": moves,
        "intents": intents,
        "temperaments": temps,
        "gifts": gifts,
        "families": fams,
        "species": species,
        "tables": tables,
        "encounters": with_numbers(enc, species, rules),
        "trip": t,
    }


def check_monsters_on_disk(species: dict[str, Any]) -> None:
    """Every species has its database record, and the stage agrees."""
    names = {"basic": 0, "stage1": 1, "stage2": 2}
    for slug, sp in species.items():
        path = MONSTERS / f"{slug}.yaml"
        if not path.is_file():
            raise _fail(slug, "no mods/nagmon/db/monster record")
        stage = read_yaml(path).get("stage")
        if names.get(stage) != sp["stage"]:
            raise _fail(
                slug, f"stage {stage} in the record, {sp['stage']} here"
            )


def build(out: Output) -> dict[str, Any]:
    d = load()
    version = 1
    out.add_json(
        "moves.json",
        {
            "version": version,
            "moves": [{k: v for k, v in m.items()} for m in d["moves"]],
        },
        compact=True,
    )
    sd = d["status_doc"]
    out.add_json(
        "statuses.json",
        {
            "version": version,
            "stage_rules": sd["stage_rules"],
            "statuses": d["statuses"],
        },
        compact=True,
    )
    out.add_json(
        "intents.json",
        {
            "version": version,
            "intents": d["intents"],
            "temperaments": d["temperaments"],
        },
        compact=True,
    )
    out.add_json(
        "gifts.json", {"version": version, "gifts": d["gifts"]}, compact=True
    )
    out.add_json(
        "species_battle.json",
        {
            "version": version,
            "families": d["families"],
            "species": d["species"],
        },
        compact=True,
    )
    enc = d["encounters"]
    out.add_json(
        "battle_encounters.json",
        {
            "version": version,
            "zones": d["tables"],
            "guardians": enc["guardians"],
            "master": enc["master"],
            "keepers": enc["keepers"],
        },
        compact=True,
    )
    out.add_json("battle_rules.json", d["rules"], compact=True)
    return {
        "moves": len(d["moves"]),
        "statuses": len(d["statuses"]),
        "intents": len(d["intents"]),
        "gifts": len(d["gifts"]),
        "species": len(d["species"]),
        "families": len(d["families"]),
    }
