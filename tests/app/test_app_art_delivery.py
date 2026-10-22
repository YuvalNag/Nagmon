"""Art delivery A1 (docs/app/ART_DELIVERY.md): pack and status, sprite entries, placeholders."""

import json
from pathlib import PurePosixPath

import pytest
from PIL import Image

from tools.app import art2, art3, art_sprites, credits, placeholders
from tools.app.common import OUT


@pytest.fixture(scope="module")
def manifest():
    return json.loads((OUT / art2.MANIFEST).read_text())


# ------------------------------------------------------------ manifest


def test_every_entry_has_a_pack_and_a_status(manifest):
    for e in manifest["assets"]:
        assert e.get("pack"), e["id"]
        assert e.get("status") in art3.STATUSES, e["id"]


def test_ids_and_files_are_unique(manifest):
    ids = [e["id"] for e in manifest["assets"]]
    files = [e["file"] for e in manifest["assets"]]
    assert len(set(ids)) == len(ids)
    assert len(set(files)) == len(files)


def test_the_manifest_is_current_with_the_sprites_on_disk():
    assert art_sprites.is_current()


def test_sprite_entries_cover_monsters_people_portraits_avatars(manifest):
    mine = [e for e in manifest["assets"] if e.get("importer") == "sprites"]
    kinds = {
        k: sum(1 for e in mine if e["kind"] == k)
        for k in art_sprites.SPRITE_PACKS
    }
    monsters = json.loads((OUT / "db" / "monsters.json").read_text())
    assert kinds["creature"] == sum(
        1 for m in monsters.values() if m.get("sprites")
    )
    assert kinds["npc"] == len(
        list((OUT / "sprites/npc").glob("nagmon_*.png"))
    )
    assert kinds["portrait"] == len(
        list((OUT / "sprites/portraits").glob("nagmon_*.png"))
    )
    assert kinds["avatar"] == len(list((OUT / "avatars").glob("*.png")))
    for e in mine:
        with Image.open(OUT / e["file"]) as im:
            assert list(im.size) == e["size"], e["id"]
        assert (
            e["size"][0] % e["frame"][0] == 0
            and e["size"][1] % e["frame"][1] == 0
        )
        assert e["frames"] == e["cols"] * e["rows"]


def test_creature_entries_keep_the_regions_of_the_record(manifest):
    e = next(
        x for x in manifest["assets"] if x["id"] == "sprite.monster.asterchip"
    )
    assert e["regions"]["front"] == [0, 0, 256, 256]
    assert set(e["regions"]) == {"front", "back", "menu1", "menu2"}


def test_a_tuxemon_sprite_is_not_listed(manifest):
    files = {e["file"] for e in manifest["assets"]}
    assert "sprites/npc/rockitten.png" not in files


def test_every_listed_sprite_is_owner_art_by_the_credits_rule(built):
    """A0: the creature sheets (and the other sprites) are owner art, none is Tuxemon's."""
    out, _ = built
    doc = json.loads(out.data["credits.json"])
    by_path = {a["path"]: a for a in doc["assets"]}
    manifest = json.loads(out.data["art/manifest.json"])
    mine = [e for e in manifest["assets"] if e.get("importer") == "sprites"]
    assert mine
    for e in mine:
        assert by_path[e["file"]]["author"] == credits.OWNER["author"], e["id"]
        assert all(
            s.startswith(("mods/nagmon/", "app/public/game/art/"))
            for s in by_path[e["file"]]["sources"]
        ), e["id"]
        assert not any(
            s.startswith("mods/tuxemon/")
            for s in by_path[e["file"]]["sources"]
        )


def test_stamp_fills_art2_entries_only_where_missing():
    m = {
        "assets": [
            {"id": "a", "kind": "backdrop"},
            {"id": "b", "kind": "ui", "pack": "mine", "status": "draft"},
            {
                "id": "c",
                "kind": "walk",
                "importer": "art3",
                "pack": "x",
                "status": "draft",
            },
        ]
    }
    art_sprites.stamp(m)
    a, b, c = m["assets"]
    assert (a["pack"], a["status"]) == ("backdrops", "accepted")
    assert (b["pack"], b["status"]) == ("mine", "draft")
    assert c["pack"] == "x"


def test_art3_leaves_the_sprite_entries_alone(manifest):
    slim, detail = art3.split_detail(json.loads(json.dumps(manifest)))
    mine = [e for e in slim["assets"] if e.get("importer") == "sprites"]
    assert mine and all("source" not in d for d in detail.values())
    assert all(e["id"] not in detail for e in mine)
    assert not [
        e for e in art3.mine_of(manifest) if e.get("importer") == "sprites"
    ]


def test_sync_keeps_other_importers_and_is_idempotent(manifest):
    once = art_sprites.sync(json.loads(json.dumps(manifest)))
    twice = art_sprites.sync(json.loads(json.dumps(once)))
    assert once == twice
    ours = {
        e["id"] for e in manifest["assets"] if e.get("importer") != "sprites"
    }
    assert ours == {
        e["id"] for e in once["assets"] if e.get("importer") != "sprites"
    }


# ------------------------------------------------------------ placeholders


def test_the_committed_placeholders_match_the_manifest(manifest):
    assert placeholders.problems(manifest) == []


def test_every_id_has_a_placeholder_with_the_same_size(manifest):
    for e in manifest["assets"]:
        path = OUT / placeholders.placeholder_path(e["file"])
        with Image.open(path) as im:
            assert list(im.size) == e["size"], e["id"]


def test_the_placeholders_fit_the_budget(manifest):
    total = sum(
        (OUT / placeholders.placeholder_path(e["file"])).stat().st_size
        for e in manifest["assets"]
    )
    assert total <= 1_200_000
    assert placeholders.BUDGET == 1_200_000


def test_the_committed_placeholders_are_what_the_generator_draws(manifest):
    # pixels, not bytes: another Pillow may encode the same picture differently
    for e in manifest["assets"][::7]:
        with Image.open(OUT / placeholders.placeholder_path(e["file"])) as got:
            want = placeholders.make(e)
            from io import BytesIO

            with Image.open(BytesIO(want)) as w:
                assert (
                    got.convert("RGBA").tobytes()
                    == w.convert("RGBA").tobytes()
                ), e["id"]


def test_the_generator_is_deterministic_and_the_seed_changes_the_look(
    manifest,
):
    e = next(x for x in manifest["assets"] if x["kind"] == "ui")
    assert placeholders.make(e) == placeholders.make(e)
    other = dict(
        e, id="ui_zzz_pack", file="art/ui/zzz.webp", pack="other-pack"
    )
    assert placeholders.make(other, seed=1)[:0] == b""  # runs
    sizes = {
        Image.open(__import__("io").BytesIO(placeholders.make(other, seed=s)))
        .getpalette()[3:6]
        .__str__()
        for s in range(6)
    }
    assert len(sizes) > 1


def test_additive_placeholders_are_opaque_black_and_keyed_ones_see_through(
    manifest,
):
    add = next(e for e in manifest["assets"] if e.get("blend") == "add")
    keyed = next(e for e in manifest["assets"] if e["kind"] == "walk")
    scene = next(e for e in manifest["assets"] if e["kind"] == "backdrop")
    with Image.open(OUT / placeholders.placeholder_path(add["file"])) as im:
        assert im.convert("RGBA").getpixel((0, 0)) == (0, 0, 0, 255)
    with Image.open(OUT / placeholders.placeholder_path(keyed["file"])) as im:
        assert im.convert("RGBA").getpixel((0, 0))[3] == 0
    with Image.open(OUT / placeholders.placeholder_path(scene["file"])) as im:
        assert im.convert("RGBA").getpixel((0, 0))[3] == 255


def test_the_generator_needs_only_the_manifest(tmp_path):
    """A synthetic manifest (no real files) gets a full set with the same geometry."""
    synthetic = {
        "assets": [
            {
                "id": "t.sheet",
                "kind": "walk",
                "file": "art/t/sheet.webp",
                "size": [96, 128],
                "frame": [32, 32],
                "frames": 12,
                "cols": 3,
                "rows": 4,
            },
            {
                "id": "t.bg",
                "kind": "backdrop",
                "file": "art/t/bg.webp",
                "size": [160, 90],
                "frame": [160, 90],
                "frames": 1,
                "cols": 1,
                "rows": 1,
            },
            {
                "id": "t.mon",
                "kind": "creature",
                "file": "sprites/monsters/t-sheet.png",
                "size": [64, 44],
                "frame": [64, 44],
                "frames": 1,
                "cols": 1,
                "rows": 1,
                "regions": {
                    "front": [0, 0, 32, 32],
                    "back": [32, 0, 32, 32],
                    "menu1": [0, 32, 12, 12],
                },
            },
        ]
    }
    written = placeholders.write(synthetic, tmp_path, seed=9)
    assert written > 0
    assert placeholders.problems(synthetic, tmp_path) == []
    with Image.open(
        tmp_path / "placeholders/sprites/monsters/t-sheet.png"
    ) as im:
        assert im.size == (64, 44)


def test_problems_finds_a_missing_wrong_or_extra_placeholder(
    manifest, tmp_path
):
    small = {"assets": manifest["assets"][:2]}
    placeholders.write(small, tmp_path)
    assert placeholders.problems(small, tmp_path) == []
    first = tmp_path / placeholders.placeholder_path(
        small["assets"][0]["file"]
    )
    first.unlink()
    Image.new("P", (3, 3)).save(
        tmp_path / placeholders.placeholder_path(small["assets"][1]["file"])
    )
    (tmp_path / "placeholders/stray.png").write_bytes(b"x")
    found = " | ".join(placeholders.problems(small, tmp_path))
    assert (
        "missing placeholder" in found
        and "size" in found
        and "not in the manifest" in found
    )


def test_the_budget_is_enforced(manifest, tmp_path, monkeypatch):
    small = {"assets": manifest["assets"][:3]}
    placeholders.write(small, tmp_path)
    monkeypatch.setattr(placeholders, "BUDGET", 10)
    assert any("budget" in p for p in placeholders.problems(small, tmp_path))


def test_two_pictures_cannot_share_a_placeholder():
    e = {
        "id": "a",
        "kind": "ui",
        "file": "art/x.webp",
        "size": [8, 8],
        "frame": [8, 8],
        "frames": 1,
        "cols": 1,
        "rows": 1,
    }
    f = dict(e, id="b", file="art/x.png")
    with pytest.raises(ValueError):
        placeholders.generate({"assets": [e, f]})


def test_placeholders_are_credited_as_the_projects_own(built):
    out, _ = built
    doc = json.loads(out.data["credits.json"])
    item = next(
        a for a in doc["assets"] if a["path"].startswith("placeholders/")
    )
    assert (
        item["licence"] == "GPL-3.0"
        and item["author"] == "Nagmon placeholders"
    )
    assert PurePosixPath(item["path"]).suffix == ".png"


def test_the_placeholders_ship_in_the_build(built, manifest):
    out, report = built
    for e in manifest["assets"]:
        assert placeholders.placeholder_path(e["file"]) in out.paths()
    assert report["art2"]["placeholders"]["placeholders"] == len(
        manifest["assets"]
    )
