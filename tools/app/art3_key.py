# SPDX-License-Identifier: GPL-3.0
"""Clears the magenta matte of the owner's transparent sheets.

The ChatGPT exports (checkpoint 59 and later) are RGBA with a *hard* alpha:
the background is transparent, but the RGB under it is still the exact
magenta (255, 0, 255) matte, the silhouette keeps a pinkish ring where
the picture was blended with the matte, and a hole inside a figure
(between an arm and the body, the middle of a gear) is still matte.

:func:`clean_matte` fixes that **without changing the size** of the
picture or any pixel that is really part of it:

* a big flat blob of matte inside the picture is made transparent
  (also a few pixels around it);
* a thin pink thing (a hairline of matte, the ring around the
  silhouette) is keyed: its alpha and its true colour are estimated from
  the matte and the nearest solid colour, and the magenta part is
  removed (the despill of tools/art's keyer, ported from the
  scratchpad's ``fix_art.py``);
* a thick pink thing (a fisher's fuchsia rod, a magenta outline of an
  "empty heart") is the picture itself and stays as it is;
* the colour under a transparent pixel is the colour of the nearest
  solid pixel, so scaling or the GPU's linear filter never mixes magenta in.

A picture with no transparent pixel (a floor, a card, a backdrop) is
returned as it is.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from scipy import ndimage as ndi

MATTE = np.array([255.0, 0.0, 255.0], np.float32)
#: Distance (RGB) to the matte below which a pixel is flat matte noise.
FLAT_D = 12.0
#: A flat region of at least this many pixels is a hole, not a detail.
BLOB_MIN = 150
#: Distance below which a pixel is "pink" (matte or a mixture of it).
PINK_D = 45.0
#: A pixel at least this far from the matte is solid foreground.
SOLID_D = 150.0
#: Pink things that survive an erosion of this many pixels are real.
THICK = 2
#: The ring of the silhouette that is keyed, in pixels.
FRINGE_PX = 2
EIGHT = np.ones((3, 3), bool)


def key_magenta(
    rgb: np.ndarray, near_r: int = 10
) -> tuple[np.ndarray, np.ndarray]:
    """
    Alpha and the true colour of every pixel of a picture on the matte.

    ``pixel = a * F + (1 - a) * M``. F is the colour of the nearest solid
    pixel when one is within ``near_r`` px, else the least opaque colour
    that explains the pixel. Returns (straight rgb float, alpha 0..1).
    """
    p = rgb.astype(np.float32)
    d = np.linalg.norm(p - MATTE, axis=-1)
    solid = d >= SOLID_D
    if not solid.any():
        return p, np.zeros(d.shape, np.float32)
    dist, (iy, ix) = ndi.distance_transform_edt(~solid, return_indices=True)
    fn = p[iy, ix]
    amin = np.maximum.reduce(
        [1 - p[..., 0] / 255, 1 - p[..., 2] / 255, p[..., 1] / 255]
    )
    amin = np.clip(amin, 1e-4, 1)
    fm = np.clip((p - (1 - amin)[..., None] * MATTE) / amin[..., None], 0, 255)
    f = np.where((dist <= near_r)[..., None], fn, fm)
    v = f - MATTE
    a = np.clip(
        ((p - MATTE) * v).sum(-1) / np.maximum((v * v).sum(-1), 1e-3), 0, 1
    )
    a = np.where(solid, 1.0, a)
    a = np.where(d < 3, 0.0, a)
    a = np.where(a < 0.02, 0.0, a)
    al = a[..., None]
    fo = np.where(al > 0, (p - (1 - al) * MATTE) / np.maximum(al, 1e-3), p)
    fo = np.clip(fo, 0, 255)
    # despill: the magenta part (min(R, B) above G) of a partial pixel goes,
    # except as much as the nearest solid pixel really has
    kn = np.maximum(0, np.minimum(fn[..., 0], fn[..., 2]) - fn[..., 1])
    kn = kn * (dist <= near_r)
    exc = np.maximum(0, np.minimum(fo[..., 0], fo[..., 2]) - fo[..., 1] - kn)
    exc = exc * np.clip((1 - a) * 6, 0, 1)
    fo = fo.copy()
    fo[..., 0] -= exc
    fo[..., 2] -= exc
    fo = np.where(solid[..., None], p, fo)
    return fo.astype(np.float32), a.astype(np.float32)


def _label_ids(mask: np.ndarray, keep: np.ndarray) -> np.ndarray:
    """The pixels of ``mask``'s components that contain a pixel of ``keep``."""
    lab, _ = ndi.label(mask, EIGHT)
    ids = np.unique(lab[keep & mask])
    ids = ids[ids > 0]
    return np.isin(lab, ids) & mask


def pink_pixels(rgba: np.ndarray, d_max: float = PINK_D) -> int:
    """How many visible pixels are within ``d_max`` of the matte colour."""
    d = np.linalg.norm(rgba[..., :3].astype(np.float32) - MATTE, axis=-1)
    return int(((rgba[..., 3] > 127) & (d < d_max)).sum())


def matte_blob_pixels(rgba: np.ndarray) -> int:
    """Pixels of flat matte blobs (holes) still visible in the picture."""
    d = np.linalg.norm(rgba[..., :3].astype(np.float32) - MATTE, axis=-1)
    flat = (rgba[..., 3] > 127) & (d < FLAT_D)
    lab, n = ndi.label(flat, EIGHT)
    if not n:
        return 0
    sizes = ndi.sum(flat, lab, range(1, n + 1))
    return int(sum(s for s in sizes if s >= BLOB_MIN))


def has_matte(rgba: np.ndarray) -> bool:
    """The picture has transparent pixels, so a matte to clear."""
    return bool((rgba[..., 3] == 0).any())


def clean_matte(rgba: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
    """Returns (cleaned uint8 RGBA of the same size, what was done)."""
    h, w = rgba.shape[:2]
    stats: dict[str, Any] = {
        "pink_before": pink_pixels(rgba),
        "blob_before": matte_blob_pixels(rgba),
    }
    if not has_matte(rgba):
        stats.update(pink_after=stats["pink_before"], blob_after=0, keyed=0)
        stats["blob_after"] = stats["blob_before"]
        return rgba.copy(), stats
    rgb = rgba[..., :3].astype(np.float32)
    opaque = rgba[..., 3] > 0
    rgb[~opaque] = MATTE
    d = np.linalg.norm(rgb - MATTE, axis=-1)

    # 1. the holes: big flat blobs of matte, and a little around them
    flat = opaque & (d < FLAT_D)
    lab, n = ndi.label(flat, EIGHT)
    blob = np.zeros_like(flat)
    if n:
        sizes = ndi.sum(flat, lab, range(1, n + 1))
        big = np.nonzero(sizes >= BLOB_MIN)[0] + 1
        blob = np.isin(lab, big)
    # a small pocket (between balusters, an arm and a box) is matte too when
    # the pink thing is mostly flat; a shaded fuchsia rod is not
    plab, pn = ndi.label(opaque & (d < PINK_D), EIGHT)
    if pn:
        idx = range(1, pn + 1)
        size = np.asarray(ndi.sum(np.ones_like(d), plab, idx))
        flatn = np.asarray(ndi.sum(flat, plab, idx))
        pocket = np.nonzero((size >= 25) & (flatn >= 0.6 * size))[0] + 1
        blob = blob | np.isin(plab, pocket)
    grown = ndi.binary_dilation(blob, EIGHT, iterations=2) & opaque
    removed = blob | (grown & (d < PINK_D))
    solid = opaque & ~removed

    # 2. a thick pink thing is real; the rest of the pink is matte
    pink = solid & (d < PINK_D)
    core = ndi.binary_erosion(pink, EIGHT, iterations=THICK)
    protected = _label_ids(pink, core)
    thin = pink & ~protected

    # 3. key the ring of the silhouette and the thin pink
    dist_bg = ndi.distance_transform_edt(solid)
    band = solid & (dist_bg <= FRINGE_PX)
    todo = (band | thin) & ~protected
    base = rgb.copy()
    base[~solid] = MATTE
    fo, a = key_magenta(base)
    alpha = np.where(solid, 1.0, 0.0).astype(np.float32)
    alpha = np.where(todo, a, alpha)
    color = np.where(todo[..., None], fo, base)

    # a solid-looking pixel of the ring may still be tinted (85% picture and
    # 15% matte): take out the magenta it has beyond the nearest inside pixel
    interior = solid & (dist_bg > FRINGE_PX)
    tinted = band & ~protected & (d >= SOLID_D) & ~thin
    if interior.any() and tinted.any():
        _, (ry, rx) = ndi.distance_transform_edt(~interior, return_indices=True)
        ref = base[ry, rx]
        have = np.minimum(color[..., 0], color[..., 2]) - color[..., 1]
        keep = np.maximum(0, np.minimum(ref[..., 0], ref[..., 2]) - ref[..., 1])
        exc = np.where(tinted, np.maximum(0, have - keep), 0)
        color = color.copy()
        color[..., 0] -= exc
        color[..., 2] -= exc
    # 4. colour under the transparent pixels: the nearest solid one
    seen = alpha > 0.002
    if seen.any() and not seen.all():
        _, (iy, ix) = ndi.distance_transform_edt(~seen, return_indices=True)
        color = np.where(seen[..., None], color, color[iy, ix])
    out = np.empty((h, w, 4), np.uint8)
    out[..., :3] = np.clip(np.rint(color), 0, 255).astype(np.uint8)
    out[..., 3] = np.clip(np.rint(alpha * 255), 0, 255).astype(np.uint8)
    stats.update(
        pink_after=pink_pixels(out),
        blob_after=matte_blob_pixels(out),
        keyed=int(todo.sum()),
        removed=int((opaque & (out[..., 3] < 128)).sum()),
    )
    return out, stats
