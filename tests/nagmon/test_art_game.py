# SPDX-License-Identifier: GPL-3.0
"""The game uses the new art (docs/kids/SDD_ART.md §3, rows 15-20)."""

from __future__ import annotations

import os
from functools import cache
from pathlib import Path

import pytest
import yaml
from PIL import Image

from tuxemon.script.parser import parse_action_string

ROOT = Path(__file__).resolve().parents[2]
MODS = ROOT / "mods"
NAGMON = MODS / "nagmon"
TUXEMON = MODS / "tuxemon"

#: NPC slug -> its new combat sheet, and its map sheet (SDD_ART §2.7,
#: §2.9).
NPC_SHEETS = {
    "nagmon_owl": ("nagmon_owl", "nagmon_owl"),
    "nagmon_cashier": ("nagmon_shopkeeper", "nagmon_shopkeeper"),
    "nagmon_tourist": ("nagmon_traveler", "nagmon_tourist"),
    "nagmon_gardener": ("nagmon_teacher", "nagmon_teacher"),
}
HD_MAP = (384, 1024)  # 8 x 48x128 (SDD_ART §2.6)


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


@cache
def po(locale: str) -> dict[str, str]:
    from babel.messages.pofile import read_po

    path = NAGMON / "l18n" / locale / "LC_MESSAGES" / "nagmon.po"
    with path.open("rb") as fh:
        return {m.id: m.string for m in read_po(fh) if m.id}


# ------------------------------------------------------------- monsters


def test_route_1_meets_only_the_trip_animals(moddata):
    original = yaml.safe_load(
        (TUXEMON / "db/encounter/spyder_citypark.yaml").read_text()
    )
    ours = [
        m.monster
        for m in moddata.database["encounter"]["nagmon_route1"].monsters
    ]
    own = {p.stem for p in (NAGMON / "db/monster").glob("*.yaml")}
    assert set(ours) <= own
    assert not {e["monster"] for e in original["monsters"]} & set(ours)
    # The table the Spyder maps share stays Tuxemon's.
    shared = moddata.database["encounter"]["spyder_citypark"].monsters
    assert [m.monster for m in shared] == [
        e["monster"] for e in original["monsters"]
    ]
    assert not (NAGMON / "db/encounter/spyder_citypark.yaml").exists()


def _tmx_encounters() -> dict[str, tuple[int, int, int, int]]:
    import xml.etree.ElementTree as ET

    root = ET.parse(TUXEMON / "maps/classic_route_1.tmx").getroot()
    tile = int(root.get("tilewidth"))
    out = {}
    for obj in root.iter("object"):
        acts = [
            p.get("value")
            for p in obj.iter("property")
            if p.get("name", "").startswith("act")
        ]
        if any(a.startswith("random_encounter") for a in acts):
            box = [
                int(float(obj.get(k))) // tile
                for k in ("x", "y", "width", "height")
            ]
            out[obj.get("name")] = tuple(box)
    return out


def test_only_our_route_1_uses_our_table():
    tmx = _tmx_encounters()
    assert len(tmx) == 3
    doc = yaml.safe_load((NAGMON / "maps/classic_route_1.yaml").read_text())
    replaced = {}
    for name, data in doc["events"].items():
        if "replaces" not in data:
            continue
        acts = data["actions"]
        assert any(
            a.startswith("random_encounter nagmon_route1,") for a in acts
        )
        box = (data["x"], data["y"], data["width"], data["height"])
        replaced[data["replaces"]] = box
    assert replaced == tmx


# ------------------------------------------------------------------ NPCs


@pytest.mark.parametrize("slug", sorted(NPC_SHEETS))
def test_chapter_one_npc_has_the_new_portraits(moddata, slug):
    sheet, sprite = NPC_SHEETS[slug]
    template = moddata.database["npc"][slug].template
    assert template.combat_sheet == sheet
    assert template.sprite_name == sprite
    if sprite.startswith("nagmon_"):
        with Image.open(NAGMON / "sprites" / f"{sprite}.png") as img:
            assert img.size == HD_MAP
    with Image.open(NAGMON / "gfx/sprites/player" / f"{sheet}.png") as img:
        assert img.size == (384, 192)  # HD: 3 x 128x64
        # Both views are drawn (the owl's back is its second portrait).
        alpha = img.getchannel("A")
        assert alpha.crop((0, 0, 192, 192)).getbbox() is not None
        assert alpha.crop((192, 0, 384, 192)).getbbox() is not None


def _speaker(msgid: str) -> str | None:
    for slug, prefix in (
        ("nagmon_owl", "nagmon_owl_"),
        ("nagmon_cashier", "nagmon_world_cashier_"),
        ("nagmon_tourist", "nagmon_world_tourist_"),
        ("nagmon_gardener", "nagmon_world_gardener_"),
    ):
        if msgid.startswith(prefix):
            return slug
    return None


def test_their_dialogues_show_their_portrait():
    lines = 0
    bad = []
    for path in sorted((NAGMON / "maps").glob("*.yaml")):
        doc = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        for name, data in (doc.get("events") or {}).items():
            for text in data.get("actions") or []:
                act, args = parse_action_string(text)
                if act != "translated_dialog":
                    continue
                speaker = _speaker(args[0])
                if speaker is None:
                    continue
                lines += 1
                if len(args) < 2 or args[1] != speaker:
                    bad.append(f"{path.stem}/{name}: {text}")
    assert lines >= 30
    assert not bad, bad


def test_owl_screen_portrait_exists():
    from mods.nagmon.states import nagmon_owl

    with Image.open(nagmon_owl.OWL_PORTRAIT) as img:
        assert img.size == (192, 192)
    surf = nagmon_owl.owl_portrait(1080)
    assert surf is not None and surf.get_height() == 1080 // 5


# --------------------------------------------- the owl's cape (§2.8)

TOWN = NAGMON / "maps" / "classic_hearthrock_city.yaml"
CAPE = "set_template nagmon_owl,nagmon_owl_caped,nagmon_owl"


def _town_events():
    from tuxemon.script.parser import parse_condition_string

    doc = yaml.safe_load(TOWN.read_text(encoding="utf-8"))
    out = []
    for name, data in doc["events"].items():
        conds = [
            parse_condition_string(c) for c in data.get("conditions") or []
        ]
        out.append((name, conds, list(data.get("actions") or []), data))
    return out


def _holds(state: dict, op: str, cond: str, args: list[str]) -> bool | None:
    if cond == "variable_set":
        key, _, value = args[0].partition(":")
        vars_ = state["vars"]
        held = vars_.get(key) == value if value else key in vars_
    elif cond == "char_exists" and args[0] == "nagmon_owl":
        held = state["owl"] is not None
    else:
        return None  # not modelled: the event does not fire here
    return held == (op == "is")


def simulate(state: dict, rounds: int = 5) -> dict:
    """
    The town's owl events, run as the event engine would: an event whose
    conditions hold runs its actions. Only what the cape needs is
    modelled (variables, the owl existing, its map sprite); events with
    other conditions or a talk behaviour never fire here.
    """
    for _ in range(rounds):
        for _name, conds, actions, data in _town_events():
            if data.get("behav"):
                continue
            if not all(_holds(state, *c) for c in conds):
                continue
            for text in actions:
                act, args = parse_action_string(text)
                if act == "create_npc" and args[0] == "nagmon_owl":
                    state["owl"] = "nagmon_owl"  # its template's sprite
                elif act == "set_template" and args[0] == "nagmon_owl":
                    state["owl"] = args[1]
                elif act == "set_variable":
                    key, _, value = args[0].partition(":")
                    state["vars"][key] = value
                elif act == "translated_dialog":
                    state["said"].append(args[0])
    return state


def test_the_owl_wears_its_cape_after_the_first_badge():
    # Before the badge: the owl as it was.
    state = {"vars": {"nagmon_started": "yes"}, "owl": None, "said": []}
    state = simulate(state)
    assert state["owl"] == "nagmon_owl"
    # The badge: the owl congratulates, talks about its cape, wears it.
    state["vars"]["academy_granite_done"] = "yes"
    state = simulate(state)
    assert state["owl"] == "nagmon_owl_caped"
    assert state["said"][-2:] == [
        "nagmon_owl_congrats_granite",
        "nagmon_owl_cape",
    ]
    # Reloading the town (or a save): the owl is created again, caped.
    state["owl"] = None
    state["said"] = []
    state = simulate(state)
    assert state["owl"] == "nagmon_owl_caped"
    assert state["said"] == []


def test_the_cape_line_and_the_caped_sheet_exist():
    for locale in ("en_US", "he_IL"):
        assert po(locale).get("nagmon_owl_cape"), locale
    with Image.open(NAGMON / "sprites" / "nagmon_owl_caped.png") as img:
        assert img.size == HD_MAP
    text = TOWN.read_text(encoding="utf-8")
    assert text.count(CAPE) == 2


# ------------------------------------------ second batch (SDD_ART §2.9)


@pytest.mark.parametrize(
    ("slug", "sprite", "sheet"),
    [
        ("nagmon_gardener", "nagmon_teacher", "nagmon_teacher"),
        ("classic_gym_leader_granite", "nagmon_granite", "nagmon_granite"),
    ],
)
def test_teacher_and_granite_wear_their_new_sheets(
    moddata, slug, sprite, sheet
):
    template = moddata.database["npc"][slug].template
    assert (template.sprite_name, template.combat_sheet) == (sprite, sheet)
    with Image.open(NAGMON / "sprites" / f"{sprite}.png") as img:
        assert img.size == HD_MAP
    with Image.open(NAGMON / "gfx/sprites/player" / f"{sheet}.png") as img:
        assert img.size == (384, 192)


def test_granite_keeps_his_words_and_other_monks_stay(moddata):
    granite = moddata.database["npc"]["classic_gym_leader_granite"]
    words = granite.speech.model_dump(mode="json")["profile"]["default"]
    assert words["pre_battle"] == "classic_gym_leader_granite_pre"
    assert words["post_battle_lose"] == "classic_gym_leader_granite_post"
    pyra = moddata.database["npc"]["classic_gym_leader_pyra"].template
    assert (pyra.sprite_name, pyra.combat_sheet) == ("monk", "monk")


def test_the_new_heroes_come_first_and_old_keys_stay():
    from nagmon.game_flow import AVATARS, avatar_by_key

    keys = [a.key for a in AVATARS]
    assert keys[:2] == ["boy_blue", "girl_teal"]
    old = {
        "boy_light": ("adventurer", "adventurer"),
        "boy_dark": ("adventurerblack", "adventurerblack"),
        "girl_light": ("heroine", "heroine"),
        "girl_dark": ("brownheroine_brown", "heroineblack"),
    }
    for key, (sprite, sheet) in old.items():
        a = avatar_by_key(key)
        assert (a.key, a.sprite, a.combat_sheet) == (key, sprite, sheet)
    for key, name in (
        ("boy_blue", "nagmon_hero_boy"),
        ("girl_teal", "nagmon_hero_girl"),
    ):
        a = avatar_by_key(key)
        assert a.sprite == a.combat_sheet == name
        with Image.open(NAGMON / "sprites" / f"{name}.png") as img:
            assert img.size == HD_MAP
        with Image.open(NAGMON / "gfx/sprites/player" / f"{name}.png") as img:
            assert img.size == (384, 384)  # HD 3 x 128x128, like heroine


def test_owl_screen_loads_its_portrait_once(monkeypatch):
    import pygame

    from mods.nagmon.states import nagmon_owl

    loads = []
    real = pygame.image.load

    def counting(path, *args):
        loads.append(path)
        return real(path, *args)

    nagmon_owl.owl_portrait.cache_clear()
    monkeypatch.setattr(pygame.image, "load", counting)
    first = nagmon_owl.owl_portrait(720)
    for _ in range(5):  # the screen rebuilds on every question
        assert nagmon_owl.owl_portrait(720) is first
    assert len(loads) == 1


# ------------------------------------------- third batch (SDD_ART §2.10)

BATCH3_NPCS = [
    ("classic_gym_leader_mila", "nagmon_mila"),
    ("nagmon_granny", "nagmon_granny"),
    ("nagmon_kid", "nagmon_kid"),
    ("nagmon_route1_trainer", "nagmon_mailcarrier"),
]


@pytest.mark.parametrize(("slug", "name"), BATCH3_NPCS)
def test_batch3_npcs_wear_their_sheets(moddata, slug, name):
    template = moddata.database["npc"][slug].template
    assert (template.sprite_name, template.combat_sheet) == (name, name)
    with Image.open(NAGMON / "sprites" / f"{name}.png") as img:
        assert img.size == HD_MAP
    with Image.open(NAGMON / "gfx/sprites/player" / f"{name}.png") as img:
        assert img.size == (384, 192)


def test_mila_keeps_her_words_and_the_other_masters_stay(moddata):
    mila = moddata.database["npc"]["classic_gym_leader_mila"]
    words = mila.speech.model_dump(mode="json")["profile"]["default"]
    assert words["pre_battle"] == "classic_gym_leader_mila_pre"
    pyra = moddata.database["npc"]["classic_gym_leader_pyra"].template
    assert pyra.sprite_name == "monk"


def test_girl_curly_is_a_third_hero():
    from nagmon.game_flow import AVATARS, avatar_by_key

    keys = [a.key for a in AVATARS]
    assert keys[:2] == ["boy_blue", "girl_teal"]
    assert "girl_curly" in keys
    a = avatar_by_key("girl_curly")
    assert (a.sprite, a.combat_sheet, a.gender) == (
        "nagmon_hero_curly",
        "nagmon_hero_curly",
        "female",
    )
    with Image.open(NAGMON / "sprites" / "nagmon_hero_curly.png") as img:
        assert img.size == HD_MAP
    with Image.open(
        NAGMON / "gfx/sprites/player/nagmon_hero_curly.png"
    ) as img:
        assert img.size == (384, 384)
