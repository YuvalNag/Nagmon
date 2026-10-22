"""The second batch of owner art: manifest, files, size and the backdrop map."""

import json

import pytest
from PIL import Image

from tools.app import art2
from tools.app.common import OUT

BUDGET = 12_000_000


@pytest.fixture(scope="module")
def manifest():
    return json.loads((OUT / art2.MANIFEST).read_text())


def test_the_committed_manifest_matches_the_files(manifest):
    assert art2.problems(manifest) == []


def test_the_art_fits_the_apk_budget(manifest):
    # batch 3 (tools/app/art3.py) has its own budget in test_app_art3.py
    total = sum(
        (OUT / e["file"]).stat().st_size
        for e in manifest["assets"]
        if e.get("importer") != "art3"
    )
    assert total < BUDGET


def test_every_group_is_in_the_manifest(manifest):
    ids = {e["id"] for e in manifest["assets"]}
    want = {f"backdrop_{n}" for n in art2.BACKDROPS}
    want |= {f"fx_{n}" for n in art2.EFFECTS}
    want |= {f"fx_{n}_add" for n in art2.EFFECTS}
    want |= {f"parts_{n}" for n in art2.SUBJECTS}
    want |= {f"pose_{n}" for n in art2.HEROES}
    want |= {f"portrait_{n}" for n in art2.GUIDES}
    want |= {f"ui_{n}" for n in art2.UI_PIECES}
    want |= {f"card_{n}" for n in art2.CARDS}
    want |= {"cat_battle", "cat_map_a", "cat_map_b", "logo", "title_sunrise"}
    want |= {"title_band", "story_grey_valley", "story_color_burst"}
    assert want <= ids


def test_sheets_have_one_label_per_frame_and_additive_ones_pair_up(manifest):
    by_id = {e["id"]: e for e in manifest["assets"]}
    for e in manifest["assets"]:
        if "labels" in e:
            assert len(e["labels"]) == e["frames"]
        if e.get("blend") == "add":
            base = by_id[e["of"]]
            assert base["frame"] == e["frame"] and base["blend"] == "normal"


def test_keyed_sheets_have_alpha_and_are_not_magenta(manifest):
    for e in manifest["assets"]:
        if e["kind"] not in (
            "effect",
            "pose",
            "portrait",
            "enemy_parts",
            "cat",
        ):
            continue
        if e.get("blend") == "add":
            continue
        with Image.open(OUT / e["file"]) as im:
            assert im.mode == "RGBA", e["id"]
            small = im.convert("RGBA").resize((64, 64))
            px = [p for p in small.getdata() if p[3] > 200]
            pink = [p for p in px if p[0] > 230 and p[2] > 230 and p[1] < 60]
            assert len(pink) < max(2, len(px) // 200), e["id"]


def test_the_backdrop_map_names_real_maps_and_assets(manifest):
    ids = {e["id"] for e in manifest["assets"]}
    table = manifest["backdrops"]
    assert table["default"] in ids and table["night"] in ids
    for name, art in table["maps"].items():
        assert (OUT / "maps" / f"{name}.json").is_file(), name
        assert art in ids


def test_problems_finds_what_is_wrong(manifest, tmp_path):
    bad = json.loads(json.dumps(manifest))
    bad["assets"][0]["size"] = [1, 1]
    bad["assets"].append(dict(bad["assets"][1]))
    bad["assets"][2]["file"] = "art/nope.webp"
    found = " | ".join(art2.problems(bad))
    assert (
        "size" in found and "duplicate id" in found and "missing file" in found
    )


def test_a_fixed_copy_wins_over_the_package(tmp_path):
    (tmp_path / "p" / "g").mkdir(parents=True)
    (tmp_path / "f" / "g").mkdir(parents=True)
    (tmp_path / "p" / "g" / "a.png").write_bytes(b"p")
    (tmp_path / "p" / "g" / "b.png").write_bytes(b"p")
    (tmp_path / "f" / "g" / "a.png").write_bytes(b"f")
    src = art2.Sources(tmp_path / "p", tmp_path / "f")
    assert src.find("g/a.png").read_bytes() == b"f"
    assert src.find("g/b.png").read_bytes() == b"p"
    with pytest.raises(FileNotFoundError):
        src.find("g/c.png")


def test_a_sheet_is_scaled_to_the_frame_size(tmp_path):
    src = tmp_path / "s.png"
    Image.new("RGBA", (2048, 1024), (255, 0, 0, 255)).save(src)
    imp = art2.Importer(art2.Sources(tmp_path, tmp_path), tmp_path / "out")
    imp._sheet("x", "effect", "x.webp", src, {"rect": [0, 0, 512, 512]}, 320)
    (e,) = imp.entries
    assert e["size"] == [1280, 640] and e["frame"] == [320, 320]
    assert (e["cols"], e["rows"], e["frames"]) == (4, 2, 8)
    assert e["source"]["sha256"]
