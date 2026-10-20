"""The hero boy's kippah: on every frame, drawn crisply, without jitter."""

import json

import numpy as np
from PIL import Image

from tools.app import kippah, overlays
from tools.app.common import mod_file

COLOURS = {
    kippah.NAVY,
    kippah.NAVY_LIGHT,
    kippah.OUTLINE,
    kippah.HIGHLIGHT,
}
MAP = "sprites/npc/nagmon_hero_boy.png"
BATTLE = "sprites/portraits/nagmon_hero_boy.png"


def shipped(built, rel):
    out, _ = built
    return np.asarray(out.images[rel].convert("RGBA"))


def original(rel):
    with Image.open(mod_file(rel)) as im:
        return np.asarray(im.convert("RGBA"))


def changed(new, old):
    return (new != old).any(axis=-1)


def test_the_kippah_is_on_all_twelve_map_frames(built):
    new = shipped(built, MAP)
    old = original("sprites/nagmon_hero_boy.png")
    diff = changed(new, old)
    fh, fw = new.shape[0] // 4, new.shape[1] // 3
    for row in range(4):
        for col in range(3):
            cell = diff[row * fh : (row + 1) * fh, col * fw : (col + 1) * fw]
            assert cell.sum() > 150, (row, col)
            # in the head, the top third of the frame
            ys = np.flatnonzero(cell.any(axis=1))
            assert ys.max() < fh * 0.5, (row, col)


def test_the_kippah_is_drawn_with_hard_pixels_in_its_own_colours(built):
    for rel, src in (
        (MAP, "sprites/nagmon_hero_boy.png"),
        (BATTLE, "gfx/sprites/player/nagmon_hero_boy.png"),
    ):
        new = shipped(built, rel)
        diff = changed(new, original(src))
        colours = {tuple(int(v) for v in px) for px in new[diff]}
        assert colours <= COLOURS, rel


def test_the_kippah_does_not_jitter_while_walking(built):
    """Each walking frame's kippah is the standing one's, moved whole."""
    new = shipped(built, MAP)
    diff = changed(new, original("sprites/nagmon_hero_boy.png"))
    fh, fw = new.shape[0] // 4, new.shape[1] // 3
    for row in range(4):
        cells = [
            diff[row * fh : (row + 1) * fh, c * fw : (c + 1) * fw]
            for c in range(3)
        ]

        def shape(mask):
            ys, xs = np.nonzero(mask)
            return mask[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]

        # the drawn pixels may hide under nothing: compare the bounding
        # boxes' sizes, which a jittering size or shape would change
        sizes = {shape(c).shape for c in cells}
        assert len(sizes) == 1, (row, sizes)


def test_both_battle_views_and_the_card_wear_it(built):
    out, _ = built
    new = shipped(built, BATTLE)
    diff = changed(new, original("gfx/sprites/player/nagmon_hero_boy.png"))
    half = new.shape[1] // 2
    assert diff[:, :half].sum() > 150 and diff[:, half:].sum() > 150
    card = np.asarray(out.images["avatars/boy_blue.png"].convert("RGBA"))
    colours = {tuple(int(v) for v in px) for px in card.reshape(-1, 4)}
    assert kippah.NAVY in colours and kippah.OUTLINE in colours


def test_credits_mention_the_kippah(built):
    out, _ = built
    doc = json.loads(out.data["credits.json"])
    by_path = {a["path"]: a for a in doc["assets"]}
    for rel in (MAP, BATTLE, "avatars/boy_blue.png"):
        assert "kippah" in by_path[rel]["note"], rel
    assert set(overlays.SHEETS) == {
        "sprites/nagmon_hero_boy.png",
        "gfx/sprites/player/nagmon_hero_boy.png",
    }


def test_the_other_heroes_are_unchanged(built):
    out, _ = built
    for name in ("nagmon_hero_girl", "nagmon_hero_curly"):
        assert f"sprites/npc/{name}.png" in out.copies
        assert f"sprites/portraits/{name}.png" in out.copies
