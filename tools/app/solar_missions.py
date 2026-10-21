# SPDX-License-Identifier: GPL-3.0
"""
The people of the solar-system trip as events: what they say, the one
question each of them asks, and one small mission in every zone.

Only what the app's event interpreter runs is used here
(``app/src/core/world/events.ts``): ``translated_dialog``,
``set_variable``, ``clear_variable``, ``modify_money``,
``nagmon_daily_count``, ``ask_quiz``; the conditions ``variable_set``,
``one_of`` and ``nagmon_daily_below``. The pattern is the one of the
gardener and the tourist of Hearthrock: a talk event says the facts and
asks the question; events gated on the answer's variable pay (up to
``DAILY_LIMIT`` times a day), say "free" or say "wrong".

A mission is a variable ``solar_<zone>_mission`` (not set: not begun;
``done``) and, at its end, ``solar_<zone>_done`` = ``yes``, the variable
the trip file names as the zone's ``done_variable``. The trip engine
marks the zone done on seeing it (or on three creatures caught, the
engine's own rule).

====== =============== ===========================================
zone   who             what
====== =============== ===========================================
moon   moon engineer   the craters of the log: one question
sun    owl, grey hood  the owl's shield filter: the grey hood has
                       it, bring it back, one question
rocky  rover driver    a drive of three stops, a question at each
giants sage            a riddle of the rings: one question
outer  grey hood       three cards to look at: one question
====== =============== ===========================================
"""

from __future__ import annotations

from itertools import product
from typing import Any

from tools.app.solar_layouts import dialog_id
from tools.app.solar_texts import DAILY_LIMIT, MISSION_COINS, QUIZ_COINS

SUBJECT = "science"
RIGHT = "correct:super:skip"
PREFIX = "nagmon_solar_"

#: zone -> the person who gives the mission
GIVER = {
    "moon": "moon_engineer",
    "sun": "owl",
    "rocky_planets": "rover_driver",
    "giants": "sage",
    "outer": "grey_hood",
}
ZONES = tuple(GIVER)

Cond = tuple[str, str, list[str]]
Act = tuple[str, list[Any]]
Spec = tuple[str, list[Cond], list[Act], list[tuple[str, list[str]]]]


def done_variable(zone: str) -> str:
    """The variable the trip file names as the zone's ``done_variable``."""
    return f"solar_{zone}_done"


def mission_variable(zone: str) -> str:
    return f"solar_{zone}_mission"


def _slug(short: str) -> str:
    return PREFIX + short


def _var(zone: str, short: str, tail: str) -> str:
    return f"nagmon_solar_{zone}_{short}_{tail}"


def _say(zone: str, short: str, part: str = "") -> Act:
    name = _slug(short) + (f"_{part}" if part else "")
    return ("translated_dialog", [dialog_id(zone, name), _slug(short)])


def _say_quiz(part: str, short: str) -> Act:
    return ("translated_dialog", [dialog_id("quiz", part), _slug(short)])


def _ask(variable: str) -> Act:
    return ("ask_quiz", [SUBJECT, variable])


def _right(variable: str) -> Cond:
    return ("is", "one_of", [variable, RIGHT])


def _talk(name: str, short: str, conds: list[Cond], acts: list[Act]) -> Spec:
    return (name, conds, acts, [("talk", [_slug(short)])])


def _auto(name: str, conds: list[Cond], acts: list[Act]) -> Spec:
    return (name, conds, acts, [])


def _daily_events(zone: str, short: str) -> list[Spec]:
    """The answer to the person's everyday question: coins, free, or wrong."""
    q = _var(zone, short, "q")
    key = f"solar_{zone}_{short}"
    who = f"{zone}/{short}"
    below = ("is", "nagmon_daily_below", [key, str(DAILY_LIMIT)])
    return [
        _auto(
            f"Good {who}",
            [_right(q), below],
            [
                ("clear_variable", [q]),
                ("modify_money", ["player", QUIZ_COINS]),
                ("nagmon_daily_count", [key]),
                _say_quiz("good", short),
            ],
        ),
        _auto(
            f"Good Free {who}",
            [
                _right(q),
                ("not", "nagmon_daily_below", [key, str(DAILY_LIMIT)]),
            ],
            [("clear_variable", [q]), _say_quiz("free", short)],
        ),
        _auto(
            f"Wrong {who}",
            [("is", "variable_set", [f"{q}:wrong"])],
            [("clear_variable", [q]), _say_quiz("wrong", short)],
        ),
    ]


def _plain(zone: str, short: str) -> list[Spec]:
    """A person with facts and the everyday question."""
    q = _var(zone, short, "q")
    return [
        _talk(
            f"Talk {zone}/{short}",
            short,
            [],
            [_say(zone, short), _ask(q)],
        ),
        *_daily_events(zone, short),
    ]


def _mission_end(
    zone: str, short: str, good: Act, wrong: Act, variable: str
) -> list[Spec]:
    """Pays the mission once, marks it and the zone done; or tries again."""
    who = f"{zone}/{short}"
    return [
        _auto(
            f"Mission Good {who}",
            [_right(variable)],
            [
                ("clear_variable", [variable]),
                ("set_variable", [f"{mission_variable(zone)}:done"]),
                ("set_variable", [f"{done_variable(zone)}:yes"]),
                ("modify_money", ["player", MISSION_COINS[zone]]),
                good,
            ],
        ),
        _auto(
            f"Mission Wrong {who}",
            [("is", "variable_set", [f"{variable}:wrong"])],
            [("clear_variable", [variable]), wrong],
        ),
    ]


def _giver_after(zone: str, short: str) -> Spec:
    """Once the mission is done the giver is a person like the others."""
    q = _var(zone, short, "q")
    return _talk(
        f"Talk {zone}/{short} after",
        short,
        [("is", "variable_set", [f"{mission_variable(zone)}:done"])],
        [_say(zone, short), _ask(q)],
    )


def _moon() -> list[Spec]:
    zone, short = "moon", GIVER["moon"]
    mq = _var(zone, short, "mq")
    return [
        _talk(
            f"Talk {zone}/{short}",
            short,
            [("not", "variable_set", [mission_variable(zone)])],
            [_say(zone, short), _say(zone, short, "ask"), _ask(mq)],
        ),
        _giver_after(zone, short),
        *_mission_end(
            zone,
            short,
            _say(zone, short, "good"),
            _say_quiz("mission_wrong", short),
            mq,
        ),
        *_daily_events(zone, short),
        *_plain(zone, "owl"),
    ]


def _sun() -> list[Spec]:
    zone, short = "sun", GIVER["sun"]
    m = mission_variable(zone)
    q, mq = _var(zone, short, "q"), _var(zone, short, "mq")
    hello = _say(zone, short)
    return [
        _talk(
            f"Talk {zone}/{short} begin",
            short,
            [("not", "variable_set", [m])],
            [
                hello,
                _say(zone, short, "ask"),
                ("set_variable", [f"{m}:asked"]),
                _ask(q),
            ],
        ),
        _talk(
            f"Talk {zone}/{short} waiting",
            short,
            [("is", "variable_set", [f"{m}:asked"])],
            [hello, _say(zone, short, "wait"), _ask(q)],
        ),
        _talk(
            f"Talk {zone}/{short} found",
            short,
            [("is", "variable_set", [f"{m}:found"])],
            [hello, _say(zone, short, "found"), _ask(mq)],
        ),
        _giver_after(zone, short),
        *_mission_end(
            zone,
            short,
            _say(zone, short, "good"),
            _say_quiz("mission_wrong", short),
            mq,
        ),
        *_daily_events(zone, short),
        # the grey hood has the filter: it is "found" when the child is sent to her
        _talk(
            f"Talk {zone}/grey_hood facts",
            "grey_hood",
            [],
            [_say(zone, "grey_hood")],
        ),
        _talk(
            f"Talk {zone}/grey_hood filter",
            "grey_hood",
            [("is", "variable_set", [f"{m}:asked"])],
            [
                _say(zone, "grey_hood", "filter"),
                ("set_variable", [f"{m}:found"]),
            ],
        ),
        _talk(
            f"Talk {zone}/grey_hood question",
            "grey_hood",
            [],
            [_ask(_var(zone, "grey_hood", "q"))],
        ),
        *_daily_events(zone, "grey_hood"),
    ]


def drive_combinations() -> tuple[
    list[tuple[int, ...]], list[tuple[int, ...]]
]:
    """The eight ways three answers can go: (two or more right, fewer)."""
    good = [c for c in product((1, 0), repeat=3) if sum(c) >= 2]
    weak = [c for c in product((1, 0), repeat=3) if sum(c) < 2]
    return good, weak


def _rocky() -> list[Spec]:
    zone, short = "rocky_planets", GIVER["rocky_planets"]
    m = mission_variable(zone)
    stops = [_var(zone, short, f"d{i}") for i in (1, 2, 3)]
    out: list[Spec] = [
        _talk(
            f"Talk {zone}/{short}",
            short,
            [("not", "variable_set", [m])],
            [
                _say(zone, short),
                _say(zone, short, "ask"),
                *[("clear_variable", [v]) for v in stops],
                *[_ask(v) for v in stops],
            ],
        ),
        _giver_after(zone, short),
        *_daily_events(zone, short),
    ]
    clear: list[Act] = [("clear_variable", [v]) for v in stops]
    good, weak = drive_combinations()
    for label, combos in (("good", good), ("weak", weak)):
        for combo in combos:
            conds: list[Cond] = [("is", "variable_set", [stops[2]])]
            conds += [
                ("is" if r else "not", "one_of", [v, RIGHT])
                for v, r in zip(stops, combo)
            ]
            acts = list(clear)
            if label == "good":
                acts += [
                    ("set_variable", [f"{m}:done"]),
                    ("set_variable", [f"{done_variable(zone)}:yes"]),
                    ("modify_money", ["player", MISSION_COINS[zone]]),
                ]
            acts.append(_say(zone, short, label))
            out.append(
                _auto(f"Drive {label} {''.join(map(str, combo))}", conds, acts)
            )
    out += _plain(zone, "sage") + _plain(zone, "owl")
    return out


def _giants() -> list[Spec]:
    zone, short = "giants", GIVER["giants"]
    mq = _var(zone, short, "mq")
    return [
        _talk(
            f"Talk {zone}/{short}",
            short,
            [("not", "variable_set", [mission_variable(zone)])],
            [_say(zone, short), _say(zone, short, "ask"), _ask(mq)],
        ),
        _giver_after(zone, short),
        *_mission_end(
            zone,
            short,
            _say(zone, short, "good"),
            _say(zone, short, "wrong"),
            mq,
        ),
        *_daily_events(zone, short),
        *_plain(zone, "moon_engineer"),
        *_plain(zone, "owl"),
    ]


def _outer() -> list[Spec]:
    zone, short = "outer", GIVER["outer"]
    mq = _var(zone, short, "mq")
    return [
        _talk(
            f"Talk {zone}/{short}",
            short,
            [("not", "variable_set", [mission_variable(zone)])],
            [
                _say(zone, short),
                _say(zone, short, "ask"),
                *[_say(zone, short, f"card{i}") for i in (1, 2, 3)],
                _ask(mq),
            ],
        ),
        _giver_after(zone, short),
        *_mission_end(
            zone,
            short,
            _say(zone, short, "good"),
            _say_quiz("mission_wrong", short),
            mq,
        ),
        *_daily_events(zone, short),
        *_plain(zone, "rover_driver"),
        *_plain(zone, "owl"),
    ]


def _station() -> list[Spec]:
    zone, short = "station", "astronomer"
    everything = [
        ("is", "variable_set", [f"{done_variable(z)}:yes"]) for z in ZONES
    ]
    return [
        _talk(f"Talk {zone}/{short} hello", short, [], [_say(zone, short)]),
        _talk(
            f"Talk {zone}/{short} how", short, [], [_say(zone, short, "how")]
        ),
        _talk(
            f"Talk {zone}/{short} ready",
            short,
            everything,
            [_say(zone, short, "ready")],
        ),
        _talk(
            f"Talk {zone}/{short} question",
            short,
            [],
            [_ask(_var(zone, short, "q"))],
        ),
        *_daily_events(zone, short),
        *_plain(zone, "mila"),
    ]


BUILDERS = {
    "moon": _moon,
    "sun": _sun,
    "rocky_planets": _rocky,
    "giants": _giants,
    "outer": _outer,
    "station": _station,
}


def zone_events(zone: str) -> list[Spec]:
    """Every talk and answer event of a zone's people (or the station's)."""
    return BUILDERS[zone]()
