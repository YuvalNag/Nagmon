"""The owner's map pictures for the people and props that have one."""

import json

import pytest
from PIL import Image

from tools.app import skins
from tools.app.common import OUT

NPCS = json.loads((OUT / "db/npcs.json").read_text())


def test_matched_people_use_their_own_sheet():
    for slug, person in skins.PEOPLE.items():
        rec = NPCS[slug]["sprites"]
        assert rec["map"] == f"sprites/npc/{person}_map.png"
        assert (
            rec["frame"] == [256, 256] and rec["scale"] == skins.PERSON_SCALE
        )
        with Image.open(OUT / rec["map"]) as im:
            assert im.size == (3 * 256, 4 * 256)


def test_people_are_taken_from_accepted_art_only():
    manifest = json.loads((OUT / "art/manifest.json").read_text())[
        "npc_sprites"
    ]
    for person in skins.PEOPLE.values():
        assert manifest[person]["status"] == "accepted"
        assert set(manifest[person]["sheet_status"].values()) == {"accepted"}


@pytest.mark.parametrize(
    "slug",
    [
        "nagmon_carpenter",  # a builder is drawn, not a carpenter
        "nagmon_gardener",  # the farmer is a man
        "nagmon_scout",  # the scout girl's sheet needs revision
        "nagmon_house_nurse",  # her portrait is the teacher's: the guard would flag it
        "nagmon_chess_haim",
        "nagmon_kid",
    ],
)
def test_uncertain_matches_keep_the_borrowed_picture(slug):
    assert "_map.png" not in NPCS[slug]["sprites"]["map"]


def test_props_are_one_tile_wide_and_stand_ins_stay_for_the_rest():
    for slug in skins.PROPS:
        rec = NPCS[slug]["sprites"]
        assert rec["scale"] == skins.PROP_SCALE
        assert rec["frame"][0] / rec["scale"] == 16  # one tile at 1x
        with Image.open(OUT / rec["map"]) as im:
            assert list(im.size) == rec["frame"]
    for slug in ("nagmon_obj_pc", "nagmon_obj_tv", "nagmon_obj_fridge"):
        assert NPCS[slug]["sprites"]["map"].endswith(
            f"{slug.replace('_obj', '')}.png"
        )


def test_a_person_that_is_not_ready_is_left_alone(monkeypatch):
    monkeypatch.setattr(skins, "person_ready", lambda person: False)
    assert skins.override(None, "nagmon_baker") is None
    assert skins.override(None, "nagmon_kid") is None
