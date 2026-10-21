"""credits.json: every shipped file with all its authors and licences."""

import json
from pathlib import PurePosixPath

import pytest

from tools.app import credits

ADAPTED = "CC BY-SA 4.0, adapted (xBRZ x4)"


def data(built, rel):
    out, _ = built
    return json.loads(out.data[rel])


def asset(built, path):
    doc = data(built, "credits.json")
    return next(a for a in doc["assets"] if a["path"] == path)


def matcher():
    text = credits.ATTRIBUTIONS.read_text(encoding="utf-8")
    return credits.Matcher(credits.parse_attributions(text))


def test_every_shipped_asset_has_authors_and_licences(built):
    out, _ = built
    doc = data(built, "credits.json")
    listed = {a["path"]: a for a in doc["assets"]}
    for path in out.paths():
        if PurePosixPath(path).suffix == ".json" and not path.startswith(
            "maps/"
        ):
            continue
        assert path in listed, path
        item = listed[path]
        if item["kind"] == "licence":
            continue
        assert item["licence"], path
        assert item["licences"], path
        assert item["authors"] or not item["matched"], path
        for entry_id in item["credits"]:
            assert entry_id in doc["entries"]


def test_atlas_keeps_every_licence_and_author_of_its_tilesets(built):
    atlas = asset(built, "atlas/classic_hearthrock_city.png")
    assert atlas["licence"] == ADAPTED
    assert "CC BY-SA 4.0" in atlas["licences"]
    assert "CC BY 3.0" in atlas["licences"]
    assert "CC0 / public domain" in atlas["licences"]
    assert "George_" in atlas["authors"]
    assert "rubberduck" in " ".join(atlas["authors"])
    assert len(atlas["credits"]) >= 3


def test_atlas_credit_notes_the_repainted_healing_center_sign(built):
    atlas = asset(built, "atlas/classic_hearthrock_city.png")
    assert "heart" in atlas["note"]


def test_entries_keep_their_full_text_for_the_credits_screen(built):
    doc = data(built, "credits.json")
    town = asset(built, "audio/music/JRPG_town_loop.ogg")
    entry = doc["entries"][town["credits"][0]]
    assert "Yubatake" in entry["text"]
    assert "](" in entry["markdown"]
    assert town["licence"] == "CC BY 3.0"


def test_owner_art_is_not_marked_with_a_licence(built):
    owl = asset(built, "sprites/npc/nagmon_owl.png")
    assert owl["licence"] == credits.OWNER["licence"]


def test_maps_stay_flagged_without_a_source_entry(built):
    city = asset(built, "maps/classic_hearthrock_city.json")
    assert city["matched"] is False
    assert city["licence"].startswith("unknown")


def test_licence_texts_ship(built):
    out, _ = built
    for path in credits.LICENSE_FILES:
        assert path in out.paths()


@pytest.mark.parametrize(
    ("kind", "src", "title"),
    [
        ("animation", "animations/technique/debian_64.png", "Debian_64"),
        ("animation", "animations/technique/drip_blue.png", "Drip Animations"),
        (
            "animation",
            "animations/technique/lightning_claw_large.png",
            "Lightning Claw",
        ),
        ("sound", "sounds/monster/Growl1.ogg", "Foom_0.wav"),
        ("sound", "sounds/monster/reverse_Tux.ogg", "Tux Sound"),
        ("sound", "sounds/monster/Insekt001.ogg", "Insekt.ogg"),
        (
            "sound",
            "sounds/interface/originals/"
            "50561__broumbroum__sf3-sfx-menu-select.ogg",
            "sf3-sfx-menu-select",
        ),
    ],
)
def test_matcher_finds_the_entry_of_a_file(kind, src, title):
    item = credits.Asset("x", [f"mods/tuxemon/{src}"], kind)
    info = credits.credit_for(item, matcher())
    assert info["matched"], src
    entry = next(e for e in matcher().entries if e.id == info["credits"][0])
    assert entry.title == title


def test_attribution_entries_are_split_with_authors_and_licences():
    text = (
        "### Items\n\n"
        '* ["Potion"](https://x) by\n[Someone](https://y)\n'
        "is licensed under [CC BY-SA 4.0](https://z)\n"
        '["Base"](https://b) by Another is licensed under CC BY 3.0\n\n'
        '* ["Ball"] By Other, licensed under CC0\n'
    )
    entries = credits.parse_attributions(text)
    assert [e.title for e in entries] == ["Potion", "Ball"]
    assert entries[0].section == "Items"
    assert entries[0].authors == ["Someone", "Another"]
    assert entries[0].licences == ["CC BY-SA 4.0", "CC BY 3.0"]
    assert entries[1].licences == ["CC0 / public domain"]


def test_adapted_art_says_how_in_its_own_field(built):
    doc = data(built, "credits.json")
    by_path = {a["path"]: a for a in doc["assets"]}
    # owner art has no licence yet: nothing to adapt in it
    wallet = by_path["sprites/objects/nagmon_wallet.png"]
    assert wallet["adapted"] == "xBRZ x4"
    assert wallet["licence"] == credits.OWNER["licence"]
    # the atlases are the xBRZ x4 tiles
    atlas = by_path["atlas/classic_hearthrock_city.png"]
    assert atlas["adapted"] == "xBRZ x4"
    # a picture shipped as it is
    assert by_path["sprites/npc/nagmon_owl.png"]["adapted"] == ""
    for item in doc["assets"]:
        if not credits.is_real_licence(item["licence"]):
            assert "adapted (" not in item["licence"], item["path"]


def test_only_real_licences_are_real():
    assert credits.is_real_licence("CC BY-SA 4.0")
    assert not credits.is_real_licence(
        "unknown: not listed in ATTRIBUTIONS.md"
    )
    assert not credits.is_real_licence(credits.OWNER["licence"])
    assert not credits.is_real_licence("")
