"""
The first world chapter, "the fog of forgetting" (docs/kids/SDD_WORLD.md §3).

Static checks over every Nagmon map script: actions, conditions,
strings, quiz topics, database slugs and positions. Plus the daily limit,
a simulation of the master test, and a headless smoke run of a new game.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from collections.abc import Iterator
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

from tuxemon.db import BoundingBox, Operator, SpatialCondition
from tuxemon.script.parser import (
    parse_action_string,
    parse_behav_string,
    parse_condition_string,
)

ROOT = Path(__file__).resolve().parents[2]
MODS = ROOT / "mods"
NAGMON = MODS / "nagmon"
TUXEMON = MODS / "tuxemon"
SCRIPTS = sorted((NAGMON / "maps").glob("*.yaml"))
NIQQUD = re.compile("[֑-ׇֽֿׁׂׅׄ]")
PLACEHOLDER = re.compile(r"\$\{\{[^}]+\}\}|\{[a-z_]+\}")
PAGE_MAX = 120


# ----------------------------------------------------------------- parsing
@dataclass
class Event:
    map_name: str  # e.g. "classic_hearthrock_city"
    name: str
    actions: list[tuple[str, list[str]]] = field(default_factory=list)
    conditions: list[tuple[str, str, list[str]]] = field(default_factory=list)
    behavs: list[tuple[str, list[str]]] = field(default_factory=list)


@cache
def events() -> tuple[Event, ...]:
    out: list[Event] = []
    for path in SCRIPTS:
        doc = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        for name, data in (doc.get("events") or {}).items():
            ev = Event(path.stem, name)
            for text in data.get("actions") or []:
                act, args = parse_action_string(text)
                ev.actions.append((act, list(args)))
            for text in data.get("conditions") or []:
                op, cond, args = parse_condition_string(text)
                ev.conditions.append((op, cond, list(args)))
            for text in data.get("behav") or []:
                beh, args = parse_behav_string(text)
                ev.behavs.append((beh, list(args)))
            out.append(ev)
    return tuple(out)


def all_actions() -> Iterator[tuple[Event, str, list[str]]]:
    for ev in events():
        for act, args in ev.actions:
            yield ev, act, args


def test_there_are_world_scripts():
    names = {p.stem for p in SCRIPTS}
    assert {
        "classic_hearthrock_city",
        "classic_route_1",
        "classic_gym_granite",
    } <= names
    assert len(events()) > 30


# --------------------------------------------------------- 1-2: managers
@cache
def managers():
    from tuxemon.event.eventaction import ActionManager
    from tuxemon.event.eventbehavior import BehaviorManager
    from tuxemon.event.eventcondition import ConditionManager

    return ActionManager(), ConditionManager(), BehaviorManager()


def test_every_action_exists_and_takes_its_parameters():
    actions, _, _ = managers()
    bad = []
    for ev, act, args in all_actions():
        if act not in actions.actions:
            bad.append(f"{ev.map_name}/{ev.name}: unknown action {act}")
        elif actions.get_action(act, args) is None:
            bad.append(f"{ev.map_name}/{ev.name}: bad args {act} {args}")
    assert not bad, "\n".join(bad)


def test_every_condition_and_behavior_exists():
    _, conditions, behaviors = managers()
    box = BoundingBox(x=0, y=0, width=1, height=1)
    bad = []
    for ev in events():
        for op, cond, args in ev.conditions:
            if op not in ("is", "not"):
                bad.append(f"{ev.name}: operator {op}")
            spatial = SpatialCondition(
                type=cond,
                parameters=args,
                box=box,
                operator=Operator.IS if op == "is" else Operator.NOT,
                name="c",
            )
            if conditions.get_condition(spatial) is None:
                bad.append(f"{ev.map_name}/{ev.name}: condition {cond} {args}")
        for beh, args in ev.behavs:
            if beh not in behaviors.behaviors:
                bad.append(f"{ev.name}: behavior {beh}")
    assert not bad, "\n".join(bad)


def test_every_event_can_start():
    """An event without conditions never runs; one with a talk is fine."""
    for ev in events():
        assert ev.conditions or ev.behavs, ev.name
        assert ev.actions, ev.name


# ------------------------------------------------------------- 3: strings
def _po(path: Path) -> dict[str, str]:
    from babel.messages.pofile import read_po

    with path.open("rb") as fh:
        catalog = read_po(fh)
    return {m.id: m.string for m in catalog if m.id}


@cache
def po_nagmon(locale: str) -> dict[str, str]:
    return _po(NAGMON / "l18n" / locale / "LC_MESSAGES" / "nagmon.po")


@cache
def po_base(locale: str) -> dict[str, str]:
    return _po(TUXEMON / "l18n" / locale / "LC_MESSAGES" / "base.po")


def known_msgid(msgid: str) -> bool:
    in_nagmon = msgid in po_nagmon("en_US") and msgid in po_nagmon("he_IL")
    in_base = msgid in po_base("en_US") and msgid in po_base("he_IL")
    return in_nagmon or in_base


def dialog_msgids() -> Iterator[tuple[Event, str]]:
    for ev, act, args in all_actions():
        if act == "translated_dialog":
            yield ev, args[0]
        elif act == "translated_dialog_choice":
            for key in args[0].split(":"):
                yield ev, key


def test_dialog_msgids_exist_in_both_languages():
    missing = [
        f"{ev.map_name}/{ev.name}: {key}"
        for ev, key in dialog_msgids()
        if not known_msgid(key)
    ]
    assert not missing, "\n".join(missing)


def test_nagmon_po_files_have_the_same_msgids():
    assert set(po_nagmon("en_US")) == set(po_nagmon("he_IL"))


def world_msgids() -> set[str]:
    """Strings this chapter added (dialogs and names it owns)."""
    keys = {key for _, key in dialog_msgids() if key in po_nagmon("he_IL")}
    keys |= {
        k
        for k in po_nagmon("he_IL")
        if k.startswith(("nagmon_world_", "nagmon_badge_", "nagmon_owl"))
    }
    return keys


def test_hebrew_world_strings_are_plain_and_short():
    he, en = po_nagmon("he_IL"), po_nagmon("en_US")
    bad = []
    for key in sorted(world_msgids()):
        text = he[key]
        if not text.strip():
            bad.append(f"{key}: empty")
        if NIQQUD.search(text):
            bad.append(f"{key}: niqqud")
        if "־" in text:
            bad.append(f"{key}: Hebrew maqaf (use '-')")
        for page in text.split("\n"):
            if len(page) > PAGE_MAX:
                bad.append(f"{key}: page of {len(page)} chars")
        if sorted(PLACEHOLDER.findall(text)) != sorted(
            PLACEHOLDER.findall(en[key])
        ):
            bad.append(f"{key}: placeholders differ from English")
        if not re.search("[א-ת]", text) and not key.startswith(
            "nagmon_world_en_"
        ):
            bad.append(f"{key}: no Hebrew")
    assert not bad, "\n".join(bad)


def test_player_is_addressed_gender_neutrally():
    """SDD_TRANSLATION §3: no gendered imperatives or adjectives to the player."""
    forbidden = re.compile(
        r"(^|\s)(אתה|תלך|תלכי|מוכן|מוכנה|בוא|בואי|קח|קחי|תודה לך גיבור)(\s|[.,!?]|$)"
    )
    he = po_nagmon("he_IL")
    bad = [k for k in world_msgids() if forbidden.search(he[k])]
    assert not bad, bad


# ---------------------------------------------------------- 4: quiz topics
@cache
def quiz_topics() -> tuple[set[str], set[str]]:
    learning = NAGMON / "learning"
    subjects = set(
        (
            yaml.safe_load(
                (learning / "subjects.yaml").read_text(encoding="utf-8")
            )
            or {}
        )["subjects"]
    )
    skills: set[str] = set()
    for path in (learning / "skills").glob("*.yaml"):
        doc = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        skills |= {s["id"] for s in doc.get("skills") or []}
    return subjects, skills


def test_ask_quiz_topics_are_subjects_or_skills():
    subjects, skills = quiz_topics()
    quizzes = [
        (ev, args) for ev, act, args in all_actions() if act == "ask_quiz"
    ]
    assert len(quizzes) >= 8
    bad = [
        f"{ev.name}: {args[0]}"
        for ev, args in quizzes
        if args[0] not in (skills if "." in args[0] else subjects)
    ]
    assert not bad, bad
    contexts = {args[2] for _, args in quizzes if len(args) > 2}
    assert contexts <= {"quest", "shop", "boss", "battle"}


# --------------------------------------------------------- 5: db slugs
@pytest.fixture(scope="module")
def moddata():
    import tuxemon.database.runtime  # noqa: F401  (validator)
    from tuxemon.constants.paths import mods_folder
    from tuxemon.database.data import ModData
    from tuxemon.database.loader import ModelLoader
    from tuxemon.database.utils import load_config
    from tuxemon.db import load_model_map

    cwd = os.getcwd()
    os.chdir(ROOT)  # mod_base_path is relative
    try:
        config = load_config((mods_folder / "db_config.yaml").as_posix())
        data = ModData(config, ModelLoader(load_model_map(config.model_map)))
        data.preload()
        data.load()
    finally:
        os.chdir(cwd)
    return data


def referenced_slugs() -> dict[str, set[str]]:
    refs: dict[str, set[str]] = {"monster": set(), "item": set(), "npc": set()}
    for ev, act, args in all_actions():
        if act == "add_monster":
            refs["monster"].add(args[0])
            if len(args) > 2:
                refs["npc"].add(args[2])
        elif act == "choice_monster":
            refs["monster"].update(args[0].split(":"))
        elif act == "add_item":
            refs["item"].add(args[0])
            if len(args) > 2:
                refs["npc"].add(args[2])
        elif act in ("create_npc", "remove_npc"):
            refs["npc"].add(args[0])
        elif act == "start_battle":
            refs["npc"].update(a for a in args[:2] if a != "player")
    for ev in events():
        for beh, args in ev.behavs:
            refs["npc"].add(args[0])
    refs["npc"].discard("player")
    return refs


def test_referenced_slugs_exist_in_the_merged_database(moddata):
    bad = []
    for table, slugs in referenced_slugs().items():
        for slug in sorted(slugs):
            if slug not in moddata.database[table]:
                bad.append(f"{table}: {slug}")
    assert not bad, bad


def test_new_npcs_and_items_have_names(moddata):
    bad = []
    for table, folder in (("npc", "npc"), ("item", "item")):
        for path in (NAGMON / "db" / folder).glob("*.yaml"):
            doc = yaml.safe_load(path.read_text(encoding="utf-8"))
            for entry in doc if isinstance(doc, list) else [doc]:
                slug = entry["slug"]
                assert slug in moddata.database[table], slug
                keys = [slug] + (
                    [f"{slug}_description"] if table == "item" else []
                )
                bad += [k for k in keys if not known_msgid(k)]
    assert not bad, bad


def test_db_config_lists_nagmon_tables():
    config = yaml.safe_load((MODS / "db_config.yaml").read_text())
    assert {"npc", "item"} <= set(config["mod_tables"]["nagmon"])


def test_badges_are_badges(moddata):
    for slug in ("nagmon_badge_granite", "nagmon_badge_mila"):
        item = moddata.database["item"][slug]
        assert str(getattr(item.category, "value", item.category)) == "badge"
        assert (NAGMON / item.sprite).exists() or (
            TUXEMON / item.sprite
        ).exists()


# ------------------------------------------------------- 6: positions
@cache
def tmx(map_file: str):
    """(width, height, collision tiles, teleport tiles) of a map."""
    import pytmx

    from tuxemon.map.loader import TMXMapLoader

    path = NAGMON / "maps" / map_file
    if not path.exists():
        path = TUXEMON / "maps" / map_file
    data = pytmx.TiledMap(str(path))
    tile = (data.tilewidth, data.tileheight)
    loader = TMXMapLoader.__new__(TMXMapLoader)
    collisions, _ = loader.load_collision_data(data, tile)
    doors: set[tuple[int, int]] = set()
    for obj in data.objects:
        props = getattr(obj, "properties", {}) or {}
        if obj.type == "event" and any(
            "teleport" in str(v)
            for k, v in props.items()
            if k.startswith("act")
        ):
            x0, y0 = int(obj.x // tile[0]), int(obj.y // tile[1])
            for i in range(max(1, int(obj.width // tile[0]))):
                for j in range(max(1, int(obj.height // tile[1]))):
                    doors.add((x0 + i, y0 + j))
    return data.width, data.height, set(collisions), doors


def positions() -> Iterator[tuple[str, str, int, int, bool]]:
    """(label, map file, x, y, is_npc) for every placed thing."""
    for ev, act, args in all_actions():
        here = f"{ev.map_name}.tmx"
        label = f"{ev.map_name}/{ev.name}: {act} {args}"
        if act == "create_npc":
            yield label, here, int(args[1]), int(args[2]), True
        elif act in ("teleport", "transition_teleport"):
            yield label, args[1], int(args[2]), int(args[3]), False
        elif act == "set_teleport_faint":
            yield label, args[1], int(args[2]), int(args[3]), False
    meta = yaml.safe_load((NAGMON / "mod.yaml").read_text())
    x, y = meta["starting_position"]
    yield "mod.yaml start", meta["starting_map"], x, y, False


def test_positions_are_inside_maps_and_walkable():
    bad = []
    for label, map_file, x, y, is_npc in positions():
        width, height, collisions, doors = tmx(map_file)
        if not (0 <= x < width and 0 <= y < height):
            bad.append(f"{label}: outside {width}x{height}")
        if (x, y) in collisions:
            bad.append(f"{label}: on a collision tile")
        if is_npc and (x, y) in doors:
            bad.append(f"{label}: NPC on a door")
    assert not bad, "\n".join(bad)


def test_npcs_do_not_share_a_tile():
    seen: dict[tuple[str, int, int], str] = {}
    bad = []
    for ev, act, args in all_actions():
        if act != "create_npc":
            continue
        key = (ev.map_name, int(args[1]), int(args[2]))
        if key in seen and seen[key] != args[0]:
            bad.append(f"{args[0]} and {seen[key]} at {key}")
        seen[key] = args[0]
    meta = yaml.safe_load((NAGMON / "mod.yaml").read_text())
    start = (Path(meta["starting_map"]).stem, *meta["starting_position"])
    assert start not in seen, f"an NPC stands on the start tile {start}"
    assert not bad, bad


def test_new_game_starts_in_hearthrock():
    meta = yaml.safe_load((NAGMON / "mod.yaml").read_text())
    assert meta["starting_map"] == "classic_hearthrock_city.tmx"


# ------------------------------------------------- 13: talks have NPCs
def test_every_talk_has_a_created_npc():
    created = {
        (ev.map_name, args[0])
        for ev, act, args in all_actions()
        if act == "create_npc"
    }
    tmx_npcs = {
        ("classic_gym_granite", "classic_gym_leader_granite"),
        ("classic_gym_mila", "classic_gym_leader_mila"),
    }
    bad = [
        f"{ev.map_name}/{ev.name}: {args[0]}"
        for ev in events()
        for beh, args in ev.behavs
        if beh == "talk" and (ev.map_name, args[0]) not in created | tmx_npcs
    ]
    assert not bad, bad


# ------------------------------------------------ 11: the daily limit
class Vars(dict):
    def set(self, key, value):
        self[key] = value

    def has(self, key):
        return key in self

    def remove(self, key):
        return self.pop(key, None) is not None

    def get_state(self):
        return dict(self)


@pytest.fixture
def day(monkeypatch):
    from mods.nagmon.event.conditions import nagmon_daily

    state = {"today": "2026-10-18"}
    monkeypatch.setattr(nagmon_daily, "today", lambda: state["today"])
    return state


def test_daily_limit_counts_today_only(day):
    from mods.nagmon.event.actions.nagmon_daily_count import (
        NagmonDailyCountAction,
    )
    from mods.nagmon.event.conditions.nagmon_daily import (
        NagmonDailyBelowCondition,
    )

    session = SimpleNamespace(player=SimpleNamespace(game_variables=Vars()))
    below = NagmonDailyBelowCondition("cashier", "3")
    for _ in range(3):
        assert below.test(session)
        before = dict(session.player.game_variables)
        below.test(session)
        assert dict(session.player.game_variables) == before  # no writes
        NagmonDailyCountAction("cashier").start(session)
    assert not below.test(session)
    assert NagmonDailyBelowCondition("tourist", "3").test(session)
    day["today"] = "2026-10-19"
    assert below.test(session)
    NagmonDailyCountAction("cashier").start(session)
    assert (
        session.player.game_variables["nagmon_daily_cashier"] == "2026-10-19:1"
    )


# ------------------------------------------- 12: master test simulation
SIMULATED_CONDITIONS = {"variable_set", "variable_is", "one_of"}
SIMULATED_ACTIONS = {"set_variable", "clear_variable", "variable_math"}


def simulate(
    map_name: str, variables: dict[str, str]
) -> tuple[Vars, list[str]]:
    """
    Run the variable-only events of a map until nothing changes. Events
    that also need a talk, a battle result or an NPC are skipped; their
    other actions are only recorded.
    """
    actions, conditions, _ = managers()
    box = BoundingBox(x=0, y=0, width=1, height=1)
    session = SimpleNamespace(
        player=SimpleNamespace(game_variables=Vars(variables))
    )
    fired: list[str] = []
    for _ in range(50):
        changed = False
        for ev in events():
            if ev.map_name != map_name or ev.behavs:
                continue
            if not ev.conditions or any(
                c not in SIMULATED_CONDITIONS for _, c, _ in ev.conditions
            ):
                continue
            ok = True
            for op, cond, args in ev.conditions:
                spatial = SpatialCondition(
                    type=cond,
                    parameters=args,
                    box=box,
                    operator=Operator.IS if op == "is" else Operator.NOT,
                    name="c",
                )
                inst = conditions.get_condition(spatial)
                assert inst is not None
                if inst.test(session) != (op == "is"):
                    ok = False
                    break
            if not ok:
                continue
            fired.append(ev.name)
            changed = True
            for act, args in ev.actions:
                if act in SIMULATED_ACTIONS:
                    action = actions.get_action(act, args)
                    assert action is not None
                    action.start(session)
                else:
                    fired.append(f"{ev.name}:{act}")
        if not changed:
            break
    return session.player.game_variables, fired


@pytest.mark.parametrize(
    ("answers", "passes"),
    [
        pytest.param(("correct", "super", "wrong"), True, id="two-right"),
        pytest.param(("correct", "correct", "correct"), True, id="all-right"),
        pytest.param(("wrong", "correct", "wrong"), False, id="one-right"),
        pytest.param(("wrong", "wrong", "wrong"), False, id="none-right"),
        pytest.param(("skip", "skip", "skip"), True, id="no-engine"),
    ],
)
@pytest.mark.parametrize("academy", ["granite", "mila"])
def test_master_test_needs_two_of_three(academy, answers, passes):
    start = {
        f"nagmon_{academy}_score": "0",
        f"nagmon_{academy}_test": "asked",
    }
    for i, word in enumerate(answers, start=1):
        start[f"nagmon_{academy}_q{i}"] = word
    variables, fired = simulate(f"classic_gym_{academy}", start)
    battles = [f for f in fired if f.endswith(":start_battle")]
    assert bool(battles) == passes, fired
    assert (variables.get(f"nagmon_{academy}_passed") == "yes") == passes
    # Every try is tidied up, so the master can be asked again.
    for i in (1, 2, 3):
        assert f"nagmon_{academy}_q{i}" not in variables
    assert f"nagmon_{academy}_test" not in variables


# --------------------------------------------- 14: headless smoke test
@pytest.mark.slow
@pytest.mark.pygame
def test_new_game_starts_in_hearthrock_with_the_child_name(tmp_path):
    env = dict(os.environ)
    env.update(
        HOME=str(tmp_path),
        SDL_VIDEODRIVER="dummy",
        SDL_AUDIODRIVER="dummy",
        PYTHONPATH=str(ROOT),
    )
    proc = subprocess.run(
        [sys.executable, str(ROOT / "tools/dev/world_tour.py"), "--smoke"],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=600,
    )
    lines = [ln for ln in proc.stdout.splitlines() if ln.startswith("{")]
    assert proc.returncode == 0 and lines, (
        proc.stdout[-3000:] + proc.stderr[-3000:]
    )
    result = json.loads(lines[-1])
    assert result["map"] == "classic_hearthrock_city"
    assert result["player_name"] == result["profile_name"] == "נועה"
    assert result["owl"] is True
    # The owl's portrait stands on the dialog (SDD_ART §2.2): half the
    # battle portrait, at the screen's scale.
    assert result["avatar"] is not None
    width, height = result["avatar"]
    assert width == height >= 64
    assert result["started"] == "yes"
    # The owl's cape (SDD_ART §2.8): none before the first badge; after
    # it, the owl the town makes again wears it.
    assert result["owl_sprite"] == "nagmon_owl"
    assert result["owl_sprite_after_badge"] == "nagmon_owl_caped"


# ------------------------------------------- new strings show at once
def test_newer_po_is_recompiled_even_hours_later(tmp_path):
    from tuxemon.locale.finder import LocaleInfo
    from tuxemon.locale.locale import TranslatorManager

    po, mo = tmp_path / "nagmon.po", tmp_path / "nagmon.mo"
    po.write_text("")
    mo.write_bytes(b"")
    os.utime(mo, (1_000_000, 1_000_000))
    os.utime(po, (1_000_000 + 3600, 1_000_000 + 3600))  # an hour newer
    info = LocaleInfo(
        locale="he_IL", category="LC_MESSAGES", domain="nagmon", path=po
    )
    manager = TranslatorManager.__new__(TranslatorManager)
    assert manager._should_compile_translation(info, mo, False)
    os.utime(mo, (1_000_000 + 7200, 1_000_000 + 7200))  # the .mo is newer
    assert not manager._should_compile_translation(info, mo, False)
