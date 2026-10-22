"""The third batch of owner art: the importer, the registries, the update flow.

The synthetic packages below have the layout of the ChatGPT checkpoint
(package-relative paths, a magenta matte under a hard alpha, an
ASSET_STATUS.json), at toy sizes.
"""

import json
import shutil
import zipfile
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from tools.app import art3
from tools.app.common import OUT

MATTE = (255, 0, 255, 0)


def sheet(cols: int, rows: int, cell: int, color, *, feet: int | None = None):
    """RGBA cells with a rectangle of ``color`` on a transparent matte."""
    arr = np.zeros((rows * cell, cols * cell, 4), np.uint8)
    arr[...] = MATTE
    bottom = feet if feet is not None else cell - 8
    for r in range(rows):
        for c in range(cols):
            y0, x0 = r * cell, c * cell
            arr[y0 + 8 : y0 + bottom, x0 + 20 : x0 + cell - 20] = (*color, 255)
    return arr


def write(root: Path, rel: str, arr: np.ndarray) -> Path:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr).save(path)
    return path


def status_doc(root: Path, items: dict[str, str]) -> None:
    doc = {
        "assets": [
            {
                "path": rel,
                "status": word,
                "qa_note": "FRONT leading feet reversed"
                if word == "needs_revision"
                else "",
                "atlas_grid": None,
            }
            for rel, word in items.items()
        ]
    }
    (root / "ASSET_STATUS.json").write_text(json.dumps(doc))


PEOPLE = "group1_people/art_inbox/nagmon_testy"
ICONS = "group4_icons/icons/icons_items.png"
CH = "chapter_sea/art_inbox/sea_guide/map_a.png"
TILES = "chapter_sea/tiles/sea_hub.png"


def make_package(root: Path) -> Path:
    write(root, f"{PEOPLE}/map_a.png", sheet(3, 2, 64, (200, 40, 40)))
    write(root, f"{PEOPLE}/map_b.png", sheet(3, 2, 64, (40, 40, 200)))
    write(root, f"{PEOPLE}/battle.png", sheet(2, 1, 100, (40, 200, 40)))
    icons = np.zeros((128, 128, 4), np.uint8)
    icons[...] = MATTE
    icons[2:14, 2:14] = (10, 120, 200, 255)  # frame 0 only
    write(root, ICONS, icons)
    write(root, CH, sheet(3, 2, 64, (200, 200, 40)))
    write(root, TILES, sheet(4, 4, 32, (90, 90, 90)))
    status_doc(
        root,
        {
            f"{PEOPLE}/map_a.png": "needs_revision",
            f"{PEOPLE}/map_b.png": "accepted_native_resolution",
            f"{PEOPLE}/battle.png": "accepted_native_resolution",
            ICONS: "accepted_exact_grid_native_cutouts",
            CH: "accepted_native_resolution",
            TILES: "needs_revision",
        },
    )
    return root


@pytest.fixture()
def world(tmp_path):
    """(package dir, game dir): an import has been made."""
    pkg = make_package(tmp_path / "pkg")
    game = tmp_path / "game"
    (game / "art").mkdir(parents=True)
    art3.import_package(pkg, game / "art")
    return pkg, game


def manifest_of(game: Path) -> dict:
    return art3.load_manifest(game)


def entry(game: Path, id_: str) -> dict:
    return next(e for e in manifest_of(game)["assets"] if e["id"] == id_)


# ------------------------------------------------------------ classify
def test_paths_get_stable_ids():
    cases = {
        "group1_people/art_inbox/nagmon_baker/map_a.png": "npc.nagmon_baker.map_a",
        "group1_people/art_inbox/nagmon_baker/battle.png": "npc.nagmon_baker.battle",
        "group5_upgrades/art_inbox/nagmon_owl/map_b.png": "npc.nagmon_owl.map_b",
        "group4_icons/icons/icons_items.png": "icon.items",
        "group4_icons/icons/icons_ui.png": "icon.ui",
        "group3_props/props/props_world.png": "props.world",
        "group2_interiors/tiles/tiles_interior_home.png": "interior.home",
        "chapter_numbers/tiles/numbers_hub.png": "chapter.numbers.hub",
        "chapter_numbers/tiles/numbers_background.png": "chapter.numbers.background",
        "chapter_sea/art_inbox/sea_mila/map_a.png": "chapter.sea.mila.map_a",
        "chapter_sea/objects/sea_place_2.png": "chapter.sea.place_2",
        "chapter_sea/cards/sea_card_3.png": "chapter.sea.card_3",
        "solar_trip_art_2/art_inbox/ship_small/map.png": "trip.ship_small",
        "solar_trip_art_2/objects/place_moon_base.png": "trip.place_moon_base",
        "seamless_tiles/town_ground_00.png": "tile.town_ground_00",
    }
    for rel, id_ in cases.items():
        spec = art3.classify(rel)
        assert spec and spec.id == id_, rel
    assert art3.classify("README.txt") is None
    assert (
        art3.match_path("wrapper/x/" + "group4_icons/icons/icons_ui.png").id
        == "icon.ui"
    )


def test_every_file_of_the_package_has_its_own_path():
    rels = [
        "group1_people/art_inbox/nagmon_baker/map_a.png",
        "chapter_sea/tiles/sea_hub.png",
        "chapter_numbers/tiles/numbers_hub.png",
    ]
    files = {art3.classify(r).file for r in rels}
    assert len(files) == 3
    assert (
        art3.classify("chapter_sea/tiles/sea_hub.png").file
        == "art/chapters/sea/hub.webp"
    )
    assert art3.classify(rels[0]).file == "art/npc/nagmon_baker/map_a.webp"


# ------------------------------------------------------------ the import
def test_the_import_writes_entries_files_and_registries(world):
    _, game = world
    m = manifest_of(game)
    assert m["drafts_enabled"] is True
    a = entry(game, "npc.nagmon_testy.map_a")
    assert (
        a["status"] == "needs_revision" and "foot_order" in a["known_issues"]
    )
    assert a["cols"] == 3 and a["rows"] == 2 and a["frames"] == 6
    assert a["labels"][0] == "down_0" and a["labels"][3] == "left_0"
    assert a["source"]["path"] == f"{PEOPLE}/map_a.png"
    assert a["source"]["size"] == [192, 128]
    b = entry(game, "npc.nagmon_testy.battle")
    assert b["status"] == "accepted" and b["labels"] == ["back", "front"]
    for e in m["assets"]:
        assert (game / e["file"]).is_file()
        with Image.open(game / e["file"]) as im:
            assert list(im.size) == e["size"]
    assert art3.problems(m, game) == []


def test_cells_do_not_get_bigger_and_feet_are_measured(world):
    _, game = world
    a = entry(game, "npc.nagmon_testy.map_a")
    assert a["frame"] == [64, 64]  # never enlarged
    # the rectangle ends 8 px above the cell's bottom
    assert a["anchor"][1] == 56
    assert 28 < a["anchor"][0] < 36
    assert len(a["feet"]) == 6 and len(a["boxes"]) == 6


def test_the_magenta_matte_is_gone_from_what_is_shipped(world):
    _, game = world
    for e in manifest_of(game)["assets"]:
        if e["kind"] in ("walk", "battle", "icons"):
            with Image.open(game / e["file"]) as im:
                arr = np.array(im.convert("RGBA"))
            vis = arr[..., 3] > 127
            d = np.linalg.norm(
                arr[..., :3].astype(float) - [255, 0, 255], axis=-1
            )
            assert not (vis & (d < 60)).any(), e["id"]


def test_the_icon_sheet_says_which_frames_are_empty(world):
    _, game = world
    e = entry(game, "icon.items")
    assert e["cols"] == 8 and e["rows"] == 8
    assert e["empty_frames"] == list(range(1, 64))
    assert e["labels"][0] == "net" and e["labels"][13] == "feather"


def test_the_item_icon_registry_names_a_frame_of_the_sheet(world):
    _, game = world
    icons = manifest_of(game)["icons"]
    assert icons["items"]["magic_net"] == {"asset": "icon.items", "frame": 0}
    assert icons["items"]["hint_feather"]["frame"] == art3.ITEM_FRAMES.index(
        "feather"
    )
    assert icons["ui"]["heart_full"]["asset"] == "icon.ui"
    # no two items share a picture
    frames = [v["frame"] for v in icons["items"].values()]
    assert len(frames) == len(set(frames))


def test_the_npc_registry_has_sheets_walk_battle_icon_and_feet(world):
    _, game = world
    m = manifest_of(game)
    rec = m["npc_sprites"]["nagmon_testy"]
    assert rec["sheets"] == {
        "battle": "npc.nagmon_testy.battle",
        "map_a": "npc.nagmon_testy.map_a",
        "map_b": "npc.nagmon_testy.map_b",
    }
    assert rec["walk"]["down"] == {"sheet": "map_a", "frames": [0, 1, 2]}
    assert rec["walk"]["up"] == {"sheet": "map_b", "frames": [3, 4, 5]}
    assert rec["battle"]["back"] == 0 and rec["battle"]["front"] == 1
    assert rec["status"] == "needs_revision"
    assert rec["sheet_status"]["map_b"] == "accepted"
    assert rec["frame"] == [64, 64] and len(rec["feet"]["map_a"]) == 6
    icon = next(e for e in m["assets"] if e["id"] == rec["icon"])
    assert icon["size"] == [128, 128] and icon["kind"] == "npc_icon"
    # a chapter person is keyed by chapter and name
    assert "sea_guide" in m["npc_sprites"]
    assert "right" not in m["npc_sprites"]["sea_guide"]["walk"]


def test_a_tile_sheet_is_a_draft_candidate_with_its_tags(world):
    _, game = world
    t = entry(game, "chapter.sea.hub")
    assert t["status"] == "needs_revision"
    assert "mirrored_floor" in t["known_issues"]
    assert t["labels"][4] == "wall_straight"


def test_chapters_go_to_the_lazy_folder_when_the_total_is_over_budget(
    tmp_path, monkeypatch
):
    pkg = make_package(tmp_path / "pkg")
    game = tmp_path / "game"
    (game / "art").mkdir(parents=True)
    monkeypatch.setattr(art3, "CHAPTER_BUDGET", 10)
    m = art3.import_package(pkg, game / "art")
    assert m["chapters_lazy"] is True
    ch = [e for e in m["assets"] if e.get("chapter")]
    assert ch and all(
        e["lazy"] and e["file"].startswith("art/chapters/") for e in ch
    )
    people = entry(game, "npc.nagmon_testy.map_a")
    assert "lazy" not in people


def test_a_chapter_is_bundled_when_the_total_is_small(world):
    _, game = world
    m = manifest_of(game)
    assert m["chapters_lazy"] is False


def test_the_cut_off_figure_is_found(tmp_path):
    pkg = tmp_path / "pkg"
    arr = sheet(3, 2, 64, (1, 2, 3))
    arr[0:8, 20:44] = (1, 2, 3, 255)  # the first figure reaches the top
    write(pkg, f"{PEOPLE}/map_a.png", arr)
    game = tmp_path / "game"
    (game / "art").mkdir(parents=True)
    art3.import_package(pkg, game / "art")
    e = entry(game, "npc.nagmon_testy.map_a")
    assert "cut_off" in e["known_issues"] and 0 in e["cut_frames"]


def test_note_tags():
    tags = art3.tags_from_note(
        "door frame still oversized; wall join height inconsistent",
        "needs_revision",
    )
    assert {"door_size", "wall_join"} <= set(tags)
    grandpa = (
        "LEFT profile extremes improved; FRONT column3 still leads physical"
        " LEFT on viewerRIGHT. Correct TOP RIGHT."
    )
    assert art3.tags_from_note(grandpa, "needs_revision") == ["foot_order"]
    assert "wrong_hand" in art3.tags_from_note(
        "scroll is physicalLEFT; required physicalRIGHT", "needs_revision"
    )
    assert art3.tags_from_note("", "draft") == []  # nothing to see
    assert art3.tags_from_note("fine", "accepted") == []
    assert art3.tags_from_note("something", "needs_revision") == ["see_note"]


# ------------------------------------------------------------ the update flow
def new_package(tmp_path: Path, name="new") -> Path:
    """A replacement: a repaired map_a (accepted now, bigger) and a new tile."""
    root = tmp_path / name
    write(root, f"{PEOPLE}/map_a.png", sheet(3, 2, 64, (250, 120, 40)))
    write(
        root,
        "chapter_sea/tiles/sea_deep.png",
        sheet(4, 4, 32, (30, 60, 90)),
    )
    status_doc(
        root,
        {
            f"{PEOPLE}/map_a.png": "accepted_native_resolution",
            "chapter_sea/tiles/sea_deep.png": "needs_revision",
        },
    )
    return root


def test_a_dry_run_shows_the_diff_and_changes_nothing(world, tmp_path):
    _, game = world
    before = (game / "art" / "manifest.json").read_bytes()
    file_before = (
        game / entry(game, "npc.nagmon_testy.map_a")["file"]
    ).read_bytes()
    lines: list[str] = []
    code = art3.update(
        [new_package(tmp_path)], game / "art", dry_run=True, out=lines.append
    )
    text = "\n".join(lines)
    assert code == 0
    assert "replaced  npc.nagmon_testy.map_a" in text
    assert "status needs_revision -> accepted" in text
    assert "new       chapter.sea.deep" in text
    assert (game / "art" / "manifest.json").read_bytes() == before
    assert (
        game / entry(game, "npc.nagmon_testy.map_a")["file"]
    ).read_bytes() == file_before
    assert not (game / "art/chapters/sea/deep.webp").exists()


def test_an_update_replaces_the_picture_at_the_same_id_and_path(
    world, tmp_path
):
    _, game = world
    old = entry(game, "npc.nagmon_testy.map_a")
    old_bytes = (game / old["file"]).read_bytes()
    code = art3.update(
        [new_package(tmp_path)], game / "art", out=lambda s: None
    )
    assert code == 0
    new = entry(game, "npc.nagmon_testy.map_a")
    assert new["file"] == old["file"] and new["frame"] == old["frame"]
    assert new["status"] == "accepted" and new["known_issues"] == []
    assert new["source"]["sha256"] != old["source"]["sha256"]
    assert (game / new["file"]).read_bytes() != old_bytes
    assert entry(game, "chapter.sea.deep")["status"] == "needs_revision"
    # the others are as they were
    assert entry(game, "npc.nagmon_testy.map_b")["status"] == "accepted"
    rec = manifest_of(game)["npc_sprites"]["nagmon_testy"]
    assert rec["sheet_status"]["map_a"] == "accepted"
    assert art3.problems(manifest_of(game), game) == []


def test_a_zip_with_a_wrapper_folder_works_like_a_directory(world, tmp_path):
    _, game = world
    src = new_package(tmp_path)
    zpath = tmp_path / "fix.zip"
    with zipfile.ZipFile(zpath, "w") as z:
        for p in src.rglob("*"):
            if p.is_file():
                z.write(p, "nagmon_art_fix/" + p.relative_to(src).as_posix())
    lines: list[str] = []
    assert (
        art3.update([zpath], game / "art", dry_run=True, out=lines.append) == 0
    )
    assert "replaced  npc.nagmon_testy.map_a" in "\n".join(lines)


def test_the_same_files_again_change_nothing(world):
    pkg, game = world
    lines: list[str] = []
    assert art3.update([pkg], game / "art", out=lines.append) == 0
    assert lines[0].startswith("0 to change")


def test_a_smaller_picture_is_refused_unless_confirmed(world, tmp_path):
    _, game = world
    small = tmp_path / "small"
    write(small, f"{PEOPLE}/map_a.png", sheet(3, 2, 32, (1, 200, 1)))
    before = (game / "art" / "manifest.json").read_bytes()
    lines: list[str] = []
    assert art3.update([small], game / "art", out=lines.append) == 1
    assert "smaller than before" in "\n".join(lines)
    assert (game / "art" / "manifest.json").read_bytes() == before
    assert (
        art3.update(
            [small], game / "art", allow_smaller=True, out=lambda s: None
        )
        == 0
    )
    assert entry(game, "npc.nagmon_testy.map_a")["source"]["size"] == [96, 64]


def test_a_picture_without_transparency_is_refused(world, tmp_path):
    _, game = world
    bad = tmp_path / "bad"
    arr = sheet(3, 2, 64, (1, 2, 3))
    arr[..., 3] = 255
    arr[..., :3] = (9, 9, 9)
    write(bad, f"{PEOPLE}/map_a.png", arr)
    lines: list[str] = []
    assert art3.update([bad], game / "art", out=lines.append) == 1
    assert "no transparent pixel" in "\n".join(lines)


def test_an_unsafe_zip_is_refused(world, tmp_path):
    _, game = world
    zpath = tmp_path / "evil.zip"
    with zipfile.ZipFile(zpath, "w") as z:
        z.writestr("../evil.png", b"x")
    with pytest.raises(ValueError):
        art3.update([zpath], game / "art", out=lambda s: None)


def test_a_failed_validation_writes_nothing_even_for_the_good_files(
    world, tmp_path
):
    _, game = world
    pkg = new_package(tmp_path)
    write(pkg, f"{PEOPLE}/battle.png", sheet(2, 1, 40, (1, 1, 1)))  # smaller
    before = {
        p: p.read_bytes() for p in (game / "art").rglob("*") if p.is_file()
    }
    assert art3.update([pkg], game / "art", out=lambda s: None) == 1
    after = {
        p: p.read_bytes() for p in (game / "art").rglob("*") if p.is_file()
    }
    assert before == after


def test_a_second_package_can_be_added_to_the_first(world, tmp_path):
    _, game = world
    a = new_package(tmp_path, "a")
    b = tmp_path / "b"
    write(b, f"{PEOPLE}/battle.png", sheet(2, 1, 100, (9, 99, 9)))
    before = entry(game, "npc.nagmon_testy.battle")["source"]["sha256"]
    assert art3.update([a, b], game / "art", out=lambda s: None) == 0
    assert entry(game, "npc.nagmon_testy.battle")["source"]["sha256"] != before


# ------------------------------------------------------------ the committed art
@pytest.fixture(scope="module")
def committed():
    return art3.load_manifest(OUT)


def test_the_committed_manifest_is_sound(committed):
    assert art3.problems(committed) == []
    assert committed["drafts_enabled"] is True


def test_the_committed_art3_files_exist_and_are_in_the_manifest(committed):
    for e in art3.mine_of(committed):
        assert (OUT / e["file"]).is_file(), e["id"]


def test_people_items_props_and_upgrades_are_always_in_the_app(committed):
    for e in art3.mine_of(committed):
        if e["pack"] in ("people", "upgrades", "props", "icons", "trip"):
            assert not e.get("lazy"), e["id"]
    ids = {e["id"] for e in committed["assets"]}
    assert {
        "icon.items",
        "icon.ui",
        "props.world",
        "npc.nagmon_mila.battle",
    } <= ids
    assert {
        "npc.nagmon_owl.map_a",
        "interior.home",
        "chapter.numbers.hub",
    } <= ids


def test_the_fourteen_people_and_the_upgrades_are_in_the_registry(committed):
    reg = committed["npc_sprites"]
    people = [k for k, v in reg.items() if v["pack"] == "people"]
    assert len(people) == 14
    for k in people:
        r = reg[k]
        assert set(r["sheets"]) == {"map_a", "map_b", "battle"}
        assert set(r["walk"]) == {"down", "left", "right", "up"}
        assert r["icon"]
    assert (
        reg["nagmon_mila"]["pack"] == "upgrades"
        and reg["nagmon_owl"]["pack"] == "upgrades"
    )
    draft = {
        k for k in people if reg[k]["sheet_status"]["map_a"] != "accepted"
    }
    assert draft == {
        "nagmon_scientist",
        "nagmon_scout_girl",
        "nagmon_grandpa",
        "nagmon_artist",
    }


def test_the_interiors_are_drafts_and_nothing_else_uses_them(committed):
    for e in art3.mine_of(committed):
        if e["kind"] == "interior" or e["kind"] == "seamless":
            assert e["status"] == "draft", e["id"]


def test_the_app_stays_within_its_art_budget(committed):
    total = sum(
        (OUT / e["file"]).stat().st_size
        for e in committed["assets"]
        if not e.get("lazy")
    )
    assert total < 20_000_000


def test_every_item_icon_is_a_real_item():
    items = {
        i["id"]
        for i in json.loads((OUT / "economy.json").read_text())["items"]
    }
    assert set(art3.ITEM_ICONS) <= items
    assert set(art3.ITEM_ICONS.values()) <= set(art3.ITEM_FRAMES)


def test_fake_replacement_of_a_real_file_keeps_everything_else(
    tmp_path, committed
):
    """The flow on the real manifest, in a copy: nothing in the app changes."""
    game = tmp_path / "game"
    shutil.copytree(OUT / "art", game / "art")
    e = next(
        x for x in committed["assets"] if x["id"] == "npc.nagmon_baker.map_a"
    )
    w, h = e["source"]["size"]
    pkg = tmp_path / "fix"
    arr = np.zeros((h, w, 4), np.uint8)
    arr[...] = MATTE
    arr[100:430, 150:350] = (230, 30, 30, 255)
    write(pkg, e["source"]["path"], arr)
    lines: list[str] = []
    assert art3.update([pkg], game / "art", out=lines.append) == 0
    new = art3.load_manifest(game)
    n = next(x for x in new["assets"] if x["id"] == e["id"])
    assert (
        n["file"] == e["file"]
        and n["frame"] == e["frame"]
        and n["size"] == e["size"]
    )
    assert [a["id"] for a in new["assets"]] == [
        a["id"] for a in committed["assets"]
    ]
    assert n["source"]["sha256"] != e["source"]["sha256"]
