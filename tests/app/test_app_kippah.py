"""The hero boy's kippah: on every frame, drawn crisply, without jitter."""

import json

import numpy as np
import pytest
from PIL import Image

from tools.app import kippah, overlays
from tools.app.common import mod_file

COLOURS = np.array(
    [kippah.NAVY, kippah.NAVY_LIGHT, kippah.OUTLINE, kippah.HIGHLIGHT]
)
MAP = "sprites/npc/nagmon_hero_boy.png"
BATTLE = "sprites/portraits/nagmon_hero_boy.png"
MAP_SRC = "sprites/nagmon_hero_boy.png"
BATTLE_SRC = "gfx/sprites/player/nagmon_hero_boy.png"


def shipped(built, rel):
    out, _ = built
    return np.asarray(out.images[rel].convert("RGBA"))


def original(rel):
    with Image.open(mod_file(rel)) as im:
        return np.asarray(im.convert("RGBA"))


def drawn(new, old):
    """Pixels the kippah drew: changed, and in the kippah's colours."""
    ours = (new[..., None, :] == COLOURS).all(-1).any(-1)
    return (new != old).any(axis=-1) & ours


def frames(a):
    fh, fw = a.shape[0] // 4, a.shape[1] // 3
    return {
        (r, c): a[r * fh : (r + 1) * fh, c * fw : (c + 1) * fw]
        for r in range(4)
        for c in range(3)
    }


def test_the_source_art_is_the_art_the_kippah_was_fitted_to():
    for rel in (MAP_SRC, BATTLE_SRC):
        kippah.check_source(rel, mod_file(rel))


def test_changed_art_asks_for_a_new_look(tmp_path):
    other = tmp_path / "boy.png"
    other.write_bytes(mod_file(MAP_SRC).read_bytes() + b"\0")
    with pytest.raises(ValueError, match="the hero boy's art changed: look"):
        kippah.check_source(MAP_SRC, other)


def test_the_kippah_is_on_all_twelve_map_frames(built):
    new, old = shipped(built, MAP), original(MAP_SRC)
    mask = frames(drawn(new, old)[..., None].repeat(4, -1))
    for key, cell in mask.items():
        cell = cell[..., 0]
        assert cell.sum() > 150, key
        ys = np.flatnonzero(cell.any(axis=1))
        assert ys.max() < cell.shape[0] * 0.5, key


def test_the_kippah_sits_on_the_hair_inside_the_head(built):
    old = original(MAP_SRC)
    new = shipped(built, MAP)
    for key, src in frames(old).items():
        mask = frames(drawn(new, old)[..., None].repeat(4, -1))[key][..., 0]
        box = kippah.head_box(src)
        ys, xs = np.nonzero(mask)
        cx, cy = xs.mean(), ys.mean()
        assert box[0] <= cx < box[2] and box[1] <= cy < box[3], key
        assert kippah.hair_share(src, mask, box) >= kippah.MIN_HAIR, key


def test_a_kippah_off_the_head_is_refused():
    old = original(MAP_SRC)
    frame = frames(old.copy())[(0, 1)].copy()
    box = kippah.head_box(frame)
    with pytest.raises(ValueError, match="off the head"):
        kippah.seat(frame, frame.copy(), box, box[2] + 5, box[1], 30)
    with pytest.raises(ValueError, match="sits on hair"):
        # inside the box, but down on the face
        kippah.seat(
            frame, frame.copy(), box, (box[0] + box[2]) / 2, box[3] - 2, 30
        )


def test_the_kippah_is_drawn_with_hard_pixels(built):
    """Every changed pixel is the kippah's, or a filled hole of the source."""
    for rel, src in ((MAP, MAP_SRC), (BATTLE, BATTLE_SRC)):
        new, old = shipped(built, rel), original(src)
        changed = (new != old).any(axis=-1)
        other = changed & ~drawn(new, old)
        assert (old[other][..., 3] < 128).all(), rel
        assert (new[changed][..., 3] == 255).all(), rel
        assert other.sum() <= kippah.SMALL_HOLE * 2, rel


def test_no_new_enclosed_holes_and_no_tiny_ones(built):
    for rel, src in ((MAP, MAP_SRC), (BATTLE, BATTLE_SRC)):
        new, old = shipped(built, rel), original(src)
        if rel == MAP:
            pairs = zip(frames(new).values(), frames(old).values())
        else:
            h = new.shape[1] // 2
            pairs = [(new[:, :h], old[:, :h]), (new[:, h:], old[:, h:])]
        for n, o in pairs:
            assert not (kippah.holes(n) & ~kippah.holes(o)).any(), rel
            assert not kippah.holes(n).any(), rel


def test_the_plus_shaped_hole_of_the_source_is_closed(built):
    old = frames(original(MAP_SRC))[(0, 2)]
    new = frames(shipped(built, MAP))[(0, 2)]
    patch = (slice(192, 195), slice(83, 86))
    assert (old[patch][..., 3] < 128).sum() == 5
    assert (new[patch][..., 3] == 255).all()


def test_the_kippah_does_not_jitter_while_walking(built):
    """Each walking frame's kippah is the standing one's, moved whole."""
    new, old = shipped(built, MAP), original(MAP_SRC)
    mask = frames(drawn(new, old)[..., None].repeat(4, -1))

    def shape(m):
        ys, xs = np.nonzero(m)
        return (ys.max() - ys.min() + 1, xs.max() - xs.min() + 1)

    for row in range(4):
        sizes = {shape(mask[(row, c)][..., 0]) for c in range(3)}
        assert len(sizes) == 1, (row, sizes)


def test_both_battle_views_and_the_card_wear_it(built):
    out, _ = built
    new, old = shipped(built, BATTLE), original(BATTLE_SRC)
    mask = drawn(new, old)
    half = new.shape[1] // 2
    assert mask[:, :half].sum() > 150 and mask[:, half:].sum() > 150
    card = np.asarray(out.images["avatars/boy_blue.png"].convert("RGBA"))
    colours = {tuple(int(v) for v in px) for px in card.reshape(-1, 4)}
    assert kippah.NAVY in colours and kippah.OUTLINE in colours


def test_credits_mention_the_kippah(built):
    out, _ = built
    doc = json.loads(out.data["credits.json"])
    by_path = {a["path"]: a for a in doc["assets"]}
    for rel in (MAP, BATTLE, "avatars/boy_blue.png"):
        assert "kippah" in by_path[rel]["note"], rel
    assert {MAP_SRC, BATTLE_SRC} <= set(overlays.SHEETS)
    assert set(kippah.SOURCE_SHA256) == {MAP_SRC, BATTLE_SRC}


def test_the_other_heroes_are_unchanged(built):
    out, _ = built
    for name in ("nagmon_hero_girl", "nagmon_hero_curly"):
        assert f"sprites/npc/{name}.png" in out.copies
        assert f"sprites/portraits/{name}.png" in out.copies
