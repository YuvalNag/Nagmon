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

#: Base form, evolution, subject (mods/nagmon/learning/subjects.yaml).
FAMILIES = (
    ("geometrion", "polygonos", "geometry"),
    ("alphabel", "lexicon", "english"),
)
NEW_MONSTERS = [m for base, evo, _ in FAMILIES for m in (base, evo)]

#: NPC slug -> its new combat sheet, and the overworld sprite it keeps.
NPC_SHEETS = {
    "nagmon_owl": ("nagmon_owl", "professor"),
    "nagmon_cashier": ("nagmon_shopkeeper", "shopkeeper"),
    "nagmon_tourist": ("nagmon_traveler", "cooldude"),
    "nagmon_gardener": ("nagmon_teacher", "florist"),
}


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


@pytest.mark.parametrize("slug", NEW_MONSTERS)
def test_new_monster_loads_with_its_sheet(moddata, slug):
    monster = moddata.database["monster"][slug]
    assert monster.sprites.sheet == f"gfx/sprites/battle/{slug}-sheet"
    sheet = NAGMON / "gfx" / "sprites" / "battle" / f"{slug}-sheet.png"
    with Image.open(sheet) as img:
        assert img.size == (128, 88)


@pytest.mark.parametrize(("base", "evo", "subject"), FAMILIES)
def test_families_evolve_and_practise_their_subject(
    moddata, base, evo, subject
):
    db = moddata.database
    first, second = db["monster"][base], db["monster"][evo]
    assert [(e.monster_slug, e.at_level) for e in first.evolutions] == [
        (evo, 16)
    ]
    assert str(first.stage.value) == "basic"
    assert str(second.stage.value) == "stage1"
    subjects = yaml.safe_load((NAGMON / "learning/subjects.yaml").read_text())
    elements = set(subjects["subjects"][subject]["elements"])
    for monster in (first, second):
        assert set(monster.types) <= elements, monster.slug
        for move in monster.moveset:
            assert move.technique in db["technique"], move.technique
        # Most of what it learns asks about its own subject.
        own = [
            m
            for m in monster.moveset
            if set(db["technique"][m.technique].types) & elements
        ]
        assert len(own) >= len(monster.moveset) // 2, monster.slug


@pytest.mark.parametrize("slug", NEW_MONSTERS)
def test_new_monster_strings_in_both_languages(moddata, slug):
    species = moddata.database["monster"][slug].species
    for locale in ("en_US", "he_IL"):
        for key in (slug, f"{slug}_description", f"cat_{species}"):
            assert po(locale).get(key), f"{locale}: {key}"
    # Names stay in English letters (docs/kids/SDD_WORLD.md §2.8).
    assert po("he_IL")[slug] == po("en_US")[slug]


def test_route_1_meets_the_new_monsters_and_keeps_the_old(moddata):
    table = moddata.database["encounter"]["spyder_citypark"]
    found = [m.monster for m in table.monsters]
    original = yaml.safe_load(
        (TUXEMON / "db/encounter/spyder_citypark.yaml").read_text()
    )
    for entry in original["monsters"]:
        assert entry["monster"] in found
    assert {"geometrion", "alphabel"} <= set(found)
    tmx = (TUXEMON / "maps/classic_route_1.tmx").read_text()
    assert "random_encounter spyder_citypark" in tmx


# ------------------------------------------------------------------ NPCs


@pytest.mark.parametrize("slug", sorted(NPC_SHEETS))
def test_chapter_one_npc_has_the_new_portraits(moddata, slug):
    sheet, sprite = NPC_SHEETS[slug]
    template = moddata.database["npc"][slug].template
    assert template.combat_sheet == sheet
    assert template.sprite_name == sprite
    with Image.open(NAGMON / "gfx/sprites/player" / f"{sheet}.png") as img:
        assert img.size == (128, 64)
        # Both views are drawn (the owl's back is its second portrait).
        alpha = img.getchannel("A")
        assert alpha.crop((0, 0, 64, 64)).getbbox() is not None
        assert alpha.crop((64, 0, 128, 64)).getbbox() is not None


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
        assert img.size == (64, 64)
