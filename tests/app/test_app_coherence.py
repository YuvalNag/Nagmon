"""Each character looks the same on the map and in its portrait."""

import json

import numpy as np
import pytest
from PIL import Image

from tools.app import coherence, db
from tools.app.common import mod_file, rel_repo


def data(built, rel):
    out, _ = built
    return json.loads(out.data[rel])


def shipped(built, rel):
    out, _ = built
    if rel in out.images:
        return out.images[rel]
    return Image.open(out.copies[rel])


def character_pairs(built):
    return coherence.pairs(
        data(built, "db/npcs.json"), data(built, "db/avatars.json")["avatars"]
    )


def _combat(portrait):
    return portrait.removeprefix("sprites/portraits/").removesuffix(".png")


def test_every_portrait_shows_the_character_of_its_map_sprite(built):
    rows = []
    for name, (m, p) in sorted(character_pairs(built).items()):
        d = coherence.distance(shipped(built, m), shipped(built, p))
        rows.append((name, d, coherence.verdict(name, d)))
    table = "\n".join(f"{n:28s} {d:.3f} {v}" for n, d, v in rows)
    print("\nmap front vs portrait front (Hellinger):\n" + table)
    assert len(rows) == 12, table
    assert {n for n, _, v in rows if v == "approved"} == {"nagmon_owl"}
    assert not [n for n, _, v in rows if v.isupper()], table


def test_the_guard_flags_exactly_the_portraits_built_from_the_map(built):
    """On the old game's combat sheets, the four differ and the rest do not."""
    flagged, rows = set(), []
    pairs = character_pairs(built)
    for name, (m, p) in sorted(pairs.items()):
        combat = _combat(p)
        src = mod_file(f"gfx/sprites/player/{combat}.png")
        with Image.open(src) as original:
            d = coherence.distance(shipped(built, m), original)
        rows.append(f"{name:28s} {combat:20s} {d:.3f}")
        if d > coherence.THRESHOLD:
            flagged.add(name)
    print(
        "\nmap front vs the old game's portrait (Hellinger):\n"
        + "\n".join(rows)
    )
    rebuilt = {
        n for n, (_, p) in pairs.items() if _combat(p) in db.PORTRAIT_FROM_MAP
    }
    assert len(rebuilt) == 3
    assert flagged == rebuilt | set(db.COHERENCE_APPROVED), "\n".join(rows)


def test_every_approval_has_a_reason_and_its_distance(built):
    pairs = character_pairs(built)
    for name, entry in db.COHERENCE_APPROVED.items():
        assert name in pairs, f"{name}: not a shipped character"
        assert isinstance(entry["reason"], str) and entry["reason"].strip()
        m, p = pairs[name]
        d = coherence.distance(shipped(built, m), shipped(built, p))
        assert abs(d - entry["distance"]) <= coherence.DRIFT, (name, d)


def test_a_drifted_approval_fails_again():
    entry = db.COHERENCE_APPROVED["nagmon_owl"]
    assert coherence.verdict("nagmon_owl", entry["distance"]) == "approved"
    far = entry["distance"] + coherence.DRIFT + 0.01
    assert coherence.verdict("nagmon_owl", far) == "APPROVED, BUT CHANGED"
    assert (
        coherence.verdict("someone", coherence.THRESHOLD + 0.01) == "DIFFERENT"
    )
    assert coherence.verdict("someone", coherence.THRESHOLD - 0.01) == ""


def test_the_command_passes_on_the_shipped_data(capsys):
    assert coherence.main() == 0
    printed = capsys.readouterr().out
    assert "nagmon_owl" in printed and "approved" in printed
    assert "DIFFERENT" not in printed


def test_the_approved_owl_keeps_its_own_portrait(built):
    out, _ = built
    assert "nagmon_owl" not in db.PORTRAIT_FROM_MAP
    reason = db.COHERENCE_APPROVED["nagmon_owl"]["reason"]
    assert "approved by the parent" in reason
    src = mod_file("gfx/sprites/player/nagmon_owl.png")
    assert out.copies["sprites/portraits/nagmon_owl.png"] == src


def test_only_hd_sheets_with_tall_figures_become_portraits():
    small = Image.new("RGBA", (48, 128), (200, 100, 50, 255))
    with pytest.raises(ValueError, match="not HD"):
        db.portrait_from_map_sheet(small, 3)
    short = Image.new("RGBA", (3 * 128, 4 * 256), (0, 0, 0, 0))
    for row in (0, 3):
        short.paste(
            (200, 100, 50, 255), (150, row * 256 + 150, 230, row * 256 + 250)
        )
    with pytest.raises(ValueError, match="too short"):
        db.portrait_from_map_sheet(short, 3)


def test_portraits_built_from_the_map_come_from_its_sheet(built):
    out, _ = built
    npcs = data(built, "db/npcs.json")
    for combat, sprite in db.PORTRAIT_FROM_MAP.items():
        dest = f"sprites/portraits/{combat}.png"
        src = mod_file(f"sprites/{sprite}.png")
        asset = out.assets[dest]
        assert asset.sources == [rel_repo(src)], combat
        assert asset.note == db.PORTRAIT_FROM_MAP_NOTE
        portrait = out.images[dest]
        # the same geometry as every other HD combat sheet
        assert portrait.size == (384, 192), combat
        users = [
            n for n in npcs.values() if n["sprites"].get("portrait") == dest
        ]
        assert users and all(
            n["sprites"]["portrait_scale"] == 3 for n in users
        )
        # the front is the map's front frame, scaled down
        with Image.open(src) as sheet:
            want = db.map_frames(sheet)[0]
        front = coherence.portrait_front(portrait)
        small = want.convert("RGBa").resize(
            front.size, Image.Resampling.LANCZOS
        )
        a = np.asarray(small.convert("RGBA"), dtype=float)
        b = np.asarray(front, dtype=float)
        assert np.abs(a - b).mean() < 6, combat
        # standing on the cell's bottom edge
        alpha = np.asarray(portrait)[..., 3]
        assert alpha[-1, 192:].any() and alpha[-1, :192].any(), combat


def test_credits_say_the_portrait_was_built_from_the_map(built):
    doc = data(built, "credits.json")
    by_path = {a["path"]: a for a in doc["assets"]}
    for combat in db.PORTRAIT_FROM_MAP:
        item = by_path[f"sprites/portraits/{combat}.png"]
        assert "built from the map sprite" in item["note"], combat
        assert item["sources"][0].startswith("mods/nagmon/sprites/")


def test_portrait_from_map_sheet_is_bottom_aligned_and_centred():
    sheet = Image.new("RGBA", (3 * 100, 4 * 300), (0, 0, 0, 0))
    for row, colour in ((0, (255, 0, 0, 255)), (3, (0, 0, 255, 255))):
        sheet.paste(colour, (120, row * 300 + 20, 180, row * 300 + 270))
    out = db.portrait_from_map_sheet(sheet, 3)
    assert out.size == (384, 192)
    a = np.asarray(out)
    # back on the left (blue), front on the right (red), full height
    assert tuple(a[100, 96]) == (0, 0, 255, 255)
    assert tuple(a[100, 192 + 96]) == (255, 0, 0, 255)
    assert a[0, 192 + 96, 3] > 0 and a[-1, 192 + 96, 3] > 0
