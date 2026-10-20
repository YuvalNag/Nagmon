"""Each character looks the same on the map and in its portrait."""

import json

import numpy as np
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


def test_every_portrait_shows_the_character_of_its_map_sprite(built):
    rows = []
    for name, (m, p) in sorted(character_pairs(built).items()):
        rows.append(
            (name, coherence.distance(shipped(built, m), shipped(built, p)))
        )
    table = "\n".join(f"{n:28s} {d:.3f}" for n, d in rows)
    print("\nmap front vs portrait front (Hellinger):\n" + table)
    assert len(rows) == 12, table
    approved = {
        name
        for name, (_, p) in character_pairs(built).items()
        if _combat(p) in db.COHERENCE_APPROVED
    }
    assert approved == {"nagmon_owl"}
    bad = [n for n, d in rows if d > coherence.THRESHOLD and n not in approved]
    assert not bad, table


def _combat(portrait):
    return portrait.removeprefix("sprites/portraits/").removesuffix(".png")


def test_the_guard_flags_exactly_the_portraits_built_from_the_map(built):
    """On the old game's combat sheets, the four differ and the rest do not."""
    flagged, rows = set(), []
    for name, (m, p) in sorted(character_pairs(built).items()):
        combat = p.removeprefix("sprites/portraits/").removesuffix(".png")
        src = mod_file(f"gfx/sprites/player/{combat}.png")
        with Image.open(src) as original:
            d = coherence.distance(shipped(built, m), original)
        rows.append(f"{name:28s} {combat:20s} {d:.3f}")
        if d > coherence.THRESHOLD:
            flagged.add(combat)
    print(
        "\nmap front vs the old game's portrait (Hellinger):\n"
        + "\n".join(rows)
    )
    want = set(db.PORTRAIT_FROM_MAP) | set(db.COHERENCE_APPROVED)
    assert flagged == want, "\n".join(rows)


def test_the_approved_owl_keeps_its_own_portrait(built):
    out, _ = built
    assert "nagmon_owl" not in db.PORTRAIT_FROM_MAP
    assert "approved by the parent" in db.COHERENCE_APPROVED["nagmon_owl"]
    src = mod_file("gfx/sprites/player/nagmon_owl.png")
    assert out.copies["sprites/portraits/nagmon_owl.png"] == src


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
