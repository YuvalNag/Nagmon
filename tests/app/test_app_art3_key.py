"""The matte keyer of the owner's transparent sheets (tools/app/art3_key.py)."""

import numpy as np

from tools.app import art3_key as key

M = np.array([255.0, 0.0, 255.0])
RED = np.array([200.0, 30.0, 30.0])


def synthetic(size: int = 160) -> np.ndarray:
    """
    A package-style RGBA: a red donut (its hole is matte), a fuchsia rod,
    antialiased against the matte. Alpha is hard: 0 where the matte shows
    (and the RGB there is the exact matte), 255 elsewhere, so the ring of
    blended pixels is opaque and pink.
    """
    yy, xx = np.mgrid[0:size, 0:size].astype(float)
    r = np.hypot(xx - 60, yy - 80)
    cover = (
        np.clip(32 - r, 0, 1) * (r > 14)
        + np.clip(r - 14, 0, 1) * (r <= 14) * 0
    )
    cover = np.clip(32 - r, 0, 1) * np.clip(r - 14, 0, 1)
    color = np.broadcast_to(RED, (size, size, 3)).copy()
    # the rod: a fuchsia line 10 px thick, outside the donut
    rod = (np.abs(xx - 135) < 5) & (yy > 40) & (yy < 120)
    cover = np.maximum(cover, rod.astype(float))
    rod_c = np.array([240.0, 20.0, 230.0])
    color[rod] = rod_c
    px = cover[..., None] * color + (1 - cover[..., None]) * M
    out = np.zeros((size, size, 4), np.uint8)
    out[..., :3] = np.rint(px).astype(np.uint8)
    out[..., 3] = np.where(cover > 0.15, 255, 0)
    out[cover <= 0.15, :3] = (255, 0, 255)
    # an extra flat leftover blob inside the donut's hole stays opaque
    hole = r < 11
    out[hole, :3] = (255, 0, 255)
    out[hole, 3] = 255
    return out


def over(rgba: np.ndarray, bg: tuple[int, int, int]) -> np.ndarray:
    a = rgba[..., 3:4] / 255.0
    return rgba[..., :3] * a + np.array(bg) * (1 - a)


def test_the_size_does_not_change():
    src = synthetic()
    out, _ = key.clean_matte(src)
    assert out.shape == src.shape and out.dtype == np.uint8


def test_a_hole_of_matte_becomes_transparent():
    src = synthetic()
    assert key.matte_blob_pixels(src) > 300
    out, stats = key.clean_matte(src)
    assert key.matte_blob_pixels(out) == 0
    assert out[80, 60, 3] == 0  # the middle of the donut
    assert stats["blob_before"] > 300 and stats["blob_after"] == 0


def test_the_ring_of_the_silhouette_has_no_pink():
    src = synthetic()
    out, _ = key.clean_matte(src)
    # a pixel on the outer edge of the red disc: no magenta left once it is
    # drawn over a light and over a dark ground
    for bg in ((250, 250, 245), (20, 20, 30)):
        comp = over(out, bg)
        yy, xx = np.mgrid[0:160, 0:160]
        ring = (np.abs(np.hypot(xx - 60, yy - 80) - 32) < 2.5) & (xx < 100)
        pink = (comp[..., 0] + comp[..., 2]) / 2 - comp[..., 1]
        # the red is (200, 30, 30): a little over 0; the matte mix is >> 100
        assert pink[ring].max() < 110, pink[ring].max()
    # and in what the picture shows, the pink did drop
    assert key.pink_pixels(out) < key.pink_pixels(src)


def test_a_thick_pink_object_is_the_picture_and_stays():
    src = synthetic()
    out, _ = key.clean_matte(src)
    core = out[60:100, 133:138]
    assert (core[..., 3] == 255).all()
    assert np.abs(core[..., :3].astype(int) - [240, 20, 230]).max() <= 2


def test_a_thick_gap_in_the_matte_colour_goes_unless_it_is_kept():
    src = synthetic()
    # the rod is now the colour of the matte itself: a gap between two limbs
    rod = (src[..., 3] == 255) & (
        np.abs(src[..., :3].astype(int) - [240, 20, 230]).max(-1) < 3
    )
    src[rod, :3] = (246, 10, 244)
    gone, _ = key.clean_matte(src)
    assert (gone[60:100, 133:138, 3] == 0).all()
    kept, _ = key.clean_matte(src, keep_fuchsia=True)
    assert (kept[60:100, 133:138, 3] == 255).all()


def test_pixels_that_are_really_the_picture_do_not_change():
    src = synthetic()
    out, _ = key.clean_matte(src)
    inside = np.zeros(src.shape[:2], bool)
    yy, xx = np.mgrid[0:160, 0:160]
    inside[
        (np.hypot(xx - 60, yy - 80) > 18) & (np.hypot(xx - 60, yy - 80) < 28)
    ] = True
    assert (out[inside] == src[inside]).all()


def test_transparent_pixels_carry_the_nearest_colour_not_magenta():
    out, _ = key.clean_matte(synthetic())
    clear = out[..., 3] == 0
    clear[:, 80:] = False  # the fuchsia rod is a real, near-magenta colour
    assert clear.any()
    d = np.linalg.norm(out[clear, :3].astype(float) - M, axis=-1)
    assert (d > 100).mean() > 0.99


def test_an_opaque_picture_is_returned_as_it_is():
    src = np.full((20, 30, 4), 255, np.uint8)
    src[..., :3] = (200, 190, 10)
    out, stats = key.clean_matte(src)
    assert (out == src).all() and stats["keyed"] == 0


def test_cleaning_twice_adds_no_pink():
    once, _ = key.clean_matte(synthetic())
    twice, _ = key.clean_matte(once)
    assert key.pink_pixels(twice) <= key.pink_pixels(once)
    assert key.matte_blob_pixels(twice) == 0
