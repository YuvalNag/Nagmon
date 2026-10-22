"""The heroes build step: heroes.yaml is checked, then shipped as heroes.json."""

from __future__ import annotations

import copy
import json

import pytest

from tools.app import heroes
from tools.app.common import OUT, Output
from tools.app.content import read_yaml


def doc():
    return copy.deepcopy(read_yaml(heroes.SOURCE))


def manifest_for(d, *, extra=()):
    """A manifest with an entry for every art id of ``d`` (+ ``extra``)."""
    ids = set(extra)
    for h in d["heroes"]:
        ids.update(h["art"].values())
        for v in h.get("variants", []):
            ids.update(v.get("art", {}).values())
    out = []
    for i in sorted(ids):
        kind = i.split(".")[1]
        out.append(
            {
                "id": i,
                "kind": {"npc": "npc", "portrait": "portrait"}.get(
                    kind, "avatar"
                ),
                "file": f"x/{i}.png",
                "size": [48, 128] if kind == "npc" else [10, 10],
                "frame": [16, 32] if kind == "npc" else [10, 10],
            }
        )
    return {"assets": out}


def no_placeholders(_file):
    return True


def check(d, **kw):
    return heroes.validate(
        d,
        kw.pop("manifest", manifest_for(d)),
        kw.pop("has_placeholder", no_placeholders),
    )


def test_the_shipped_roster_is_valid_with_the_three_heroes():
    out = Output()
    assert heroes.build(out) == {"heroes": 3, "enabled": 3}
    built = json.loads(out.data["heroes.json"])
    assert [h["id"] for h in built["heroes"]] == [
        "boy_blue",
        "girl_teal",
        "girl_curly",
    ]
    assert built["fallback"] == "boy_blue"
    assert built["legacy"]["girl_dark"] == "girl_curly"


def test_the_committed_file_is_current():
    out = Output()
    heroes.build(out)
    assert (OUT / "heroes.json").read_bytes() == out.data["heroes.json"]


def test_files_are_resolved_from_the_manifest_for_the_app():
    out = Output()
    heroes.build(out)
    h = json.loads(out.data["heroes.json"])["heroes"][0]
    assert h["files"]["map"] == {
        "file": "sprites/npc/nagmon_hero_boy.png",
        "frame": [128, 256],
        "scale": 8,
    }
    assert h["files"]["face"]["file"] == "avatars/boy_blue.png"
    assert h["files"]["portrait"]["file"].startswith("sprites/portraits/")


def test_every_art_id_of_the_shipped_roster_has_a_placeholder():
    for h in doc()["heroes"]:
        for art_id in h["art"].values():
            assert heroes.art_entry(art_id) is not None, art_id


def test_a_missing_art_id_stops_the_build():
    d = doc()
    m = manifest_for(d)
    m["assets"] = [
        a for a in m["assets"] if a["id"] != d["heroes"][1]["art"]["map"]
    ]
    with pytest.raises(ValueError, match="sprite.npc.nagmon_hero_girl"):
        heroes.validate(d, m, no_placeholders)


def test_an_art_id_without_a_placeholder_stops_the_build():
    d = doc()
    with pytest.raises(ValueError, match="placeholder"):
        check(d, has_placeholder=lambda f: False)


def test_duplicate_ids_stop_the_build():
    d = doc()
    d["heroes"][1]["id"] = d["heroes"][0]["id"]
    with pytest.raises(ValueError, match="twice"):
        check(d)


def test_too_many_heroes_stop_the_build():
    d = doc()
    d["max_heroes"] = 2
    with pytest.raises(ValueError, match="at most 2"):
        check(d)


def test_the_roster_may_not_pass_twelve_even_if_it_says_so():
    d = doc()
    d["max_heroes"] = 40
    with pytest.raises(ValueError, match="max_heroes"):
        check(d)


def test_twelve_heroes_are_allowed():
    d = doc()
    base = d["heroes"][0]
    d["heroes"] = []
    for i in range(12):
        h = copy.deepcopy(base)
        h["id"] = f"hero_{i}"
        h["order"] = i
        h["art"] = {
            "map": f"sprite.npc.h{i}",
            "portrait": f"sprite.portrait.h{i}",
            "face": f"sprite.avatar.h{i}",
        }
        d["heroes"].append(h)
    d["fallback"] = "hero_0"
    d["legacy"] = {"old": "hero_3"}
    assert sum(h["enabled"] for h in check(d)["heroes"]) == 12


@pytest.mark.parametrize(
    "mutate,message",
    [
        (lambda d: d["heroes"][0].pop("name"), "name"),
        (lambda d: d["heroes"][0]["name"].pop("en"), "name.en"),
        (lambda d: d["heroes"][0]["art"].pop("face"), "art.face"),
        (lambda d: d["heroes"][0].update(id="Bad Id"), "id"),
        (lambda d: d["heroes"][0]["colors"].update(primary="blue"), "colors"),
        (lambda d: d["heroes"][0].update(order="first"), "order"),
        (lambda d: d["heroes"][0].update(enabled="yes"), "enabled"),
        (lambda d: d.update(fallback="nobody"), "fallback"),
        (lambda d: d["legacy"].update(old="nobody"), "legacy"),
        (lambda d: d["legacy"].update(boy_blue="girl_teal"), "legacy"),
    ],
)
def test_a_bad_entry_names_what_is_wrong(mutate, message):
    d = doc()
    mutate(d)
    with pytest.raises(ValueError, match=message):
        check(d)


def test_nobody_enabled_stops_the_build():
    d = doc()
    for h in d["heroes"]:
        h["enabled"] = False
    with pytest.raises(ValueError, match="enabled"):
        check(d)


def test_the_fallback_must_be_enabled():
    d = doc()
    d["heroes"][0]["enabled"] = False
    with pytest.raises(ValueError, match="fallback"):
        check(d)


def test_variants_are_checked_and_shipped_with_resolved_files():
    d = doc()
    d["heroes"][0]["variants"] = [
        {
            "id": "kippah",
            "kind": "head_covering",
            "name": {"he": "כיפה", "en": "Kippah"},
            "art": {"map": "sprite.npc.boy_kippah"},
        }
    ]
    m = manifest_for(d, extra=["sprite.npc.boy_kippah"])
    built = heroes.validate(d, m, no_placeholders)
    v = built["heroes"][0]["variants"][0]
    assert v["id"] == "kippah"
    assert v["files"]["map"]["file"] == "x/sprite.npc.boy_kippah.png"
    assert "face" not in v["files"]


def test_a_variant_with_unknown_art_or_a_repeated_id_stops_the_build():
    d = doc()
    variant = {
        "id": "kippah",
        "kind": "head_covering",
        "name": {"he": "כיפה", "en": "Kippah"},
        "art": {"map": "sprite.npc.nope"},
    }
    m = manifest_for(d)
    d["heroes"][0]["variants"] = [variant]
    with pytest.raises(ValueError, match="sprite.npc.nope"):
        check(d, manifest=m)
    variant["art"] = {}
    d["heroes"][0]["variants"] = [variant, dict(variant)]
    with pytest.raises(ValueError, match="twice"):
        check(d, manifest=m)


def test_the_art_pipeline_draws_the_same_three_avatars_as_before(built):
    """db/avatars.json (the sheets and cards) comes from the same roster."""
    out, _ = built
    avatars = json.loads(out.data["db/avatars.json"])
    assert [a["key"] for a in avatars["avatars"]] == [
        h["id"] for h in doc()["heroes"]
    ]
    assert avatars["fallback"] == doc()["fallback"]
    assert avatars["legacy"] == doc()["legacy"]
