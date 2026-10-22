"""Modest clothes: no back view shows skin below the neck."""

import json

import numpy as np
from PIL import Image

from tools.app import modesty
from tools.app.common import mod_file

#: Not people: feathers and fur have no "skin" to cover.
NOT_PEOPLE = {
    "nagmon_owl",
    "nagmon_owl_caped",
    "nagmon_owl_space",
    "rockitten",
}


def data(built, rel):
    out, _ = built
    return json.loads(out.data[rel])


def shipped(built, rel):
    out, _ = built
    image = (
        out.images[rel] if rel in out.images else Image.open(out.copies[rel])
    )
    return np.asarray(image.convert("RGBA"))


def people(built):
    """Map sheet -> portrait (or None) of every shipped person."""
    found = {}
    for rec in data(built, "db/npcs.json").values():
        art = rec["sprites"]
        sheets = [art, *art.get("alternates", {}).values()]
        for sheet in sheets:
            if sheet.get("map", "").startswith("sprites/npc/"):
                found.setdefault(sheet["map"], art.get("portrait"))
    for avatar in data(built, "db/avatars.json")["avatars"]:
        found[avatar["map"]] = avatar["portrait"]
    return {
        m: p
        for m, p in found.items()
        if m.removeprefix("sprites/npc/").removesuffix(".png")
        not in NOT_PEOPLE
    }


def back_frames(sheet):
    fh, fw = sheet.shape[0] // 4, sheet.shape[1] // 3
    return [sheet[3 * fh :, c * fw : (c + 1) * fw] for c in range(3)]


def front_frame(sheet):
    fh, fw = sheet.shape[0] // 4, sheet.shape[1] // 3
    return sheet[:fh, fw : 2 * fw]


def open_backs(sheet, portrait=None):
    skin = modesty.skin_colour(front_frame(sheet))
    assert skin is not None
    counts = [modesty.open_back(f, skin) for f in back_frames(sheet)]
    if portrait is not None:
        back = portrait[:, : portrait.shape[1] // 2]
        counts.append(modesty.open_back(back, skin))
    return counts


def test_no_back_view_shows_skin_below_the_neck(built):
    rows, bad = [], []
    shown = people(built)
    assert (
        len(shown) == 20
    )  # 21 map sheets less the three owls; 3 are the owner's people
    for m, p in sorted(shown.items()):
        counts = open_backs(
            shipped(built, m), shipped(built, p) if p else None
        )
        rows.append(f"{m:40s} {counts}")
        if max(counts) > modesty.MAX_SKIN:
            bad.append(m)
    print(
        "\nlargest skin patch on the back torso (map backs, battle back):\n"
        + "\n".join(rows)
    )
    assert not bad, "\n".join(rows)


def test_the_rule_sees_the_teacher_s_open_back_in_the_source():
    with Image.open(mod_file("sprites/nagmon_teacher.png")) as im:
        sheet = np.asarray(im.convert("RGBA"))
    assert min(open_backs(sheet)) > 200


def test_only_the_teacher_s_back_frames_change(built):
    with Image.open(mod_file("sprites/nagmon_teacher.png")) as im:
        old = np.asarray(im.convert("RGBA"))
    new = shipped(built, "sprites/npc/nagmon_teacher.png")
    changed = (new != old).any(-1)
    fh = old.shape[0] // 4
    assert not changed[: 3 * fh].any()
    assert changed[3 * fh :].sum() > 600
    # the blouse colour, not skin: the repainted pixels are light and cool
    px = new[changed][:, :3].astype(int)
    assert (px[:, 0] - px[:, 2] < 80).all()


def test_the_teacher_s_battle_back_is_closed_too(built):
    portrait = shipped(built, "sprites/portraits/nagmon_teacher.png")
    sheet = shipped(built, "sprites/npc/nagmon_teacher.png")
    skin = modesty.skin_colour(front_frame(sheet))
    back = portrait[:, : portrait.shape[1] // 2]
    assert modesty.open_back(back, skin) <= modesty.MAX_SKIN


def test_credits_note_the_closed_blouse(built):
    doc = data(built, "credits.json")
    item = next(
        a
        for a in doc["assets"]
        if a["path"] == "sprites/npc/nagmon_teacher.png"
    )
    assert "blouse" in item["note"]
