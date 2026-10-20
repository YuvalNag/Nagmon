# SPDX-License-Identifier: GPL-3.0
"""
xBRZ, the pixel-art upscaler, in numpy (docs/kids/SDD_ART.md §2.11).

xBRZ is (c) Zenju (zenju AT gmx DOT de), GPL-3.0; this file follows its
xbrz.cpp (version 1.8, as in the xbrz.py bindings) step by step.

A faithful port of xBRZ 1.8 with its default settings for RGBA images
(the "buffered" colour distance), so its output matches the C++ library
pixel for pixel. Pixels outside the image are transparent.

Every step works on whole arrays at once, and on a batch: the input is
``(..., height, width, 4)``, so many small pictures (tiles with their
context) are scaled in one call.

A development tool: the game never imports numpy.
"""

from __future__ import annotations

import numpy as np

# ScalerCfg defaults (xbrz_config.h)
EQUAL_COLOR_TOLERANCE = 30.0
CENTER_DIRECTION_BIAS = 4.0
DOMINANT_DIRECTION_THRESHOLD = 3.6
STEEP_DIRECTION_THRESHOLD = 2.2

NONE, NORMAL, DOMINANT = 0, 1, 2

# The blend patterns of Scaler2x..Scaler6x: (M, N, row, column) blends
# the pixel at (row, column) of the output block M/N towards the colour;
# M == N sets it.
PATTERNS: dict[int, dict[str, list[tuple[int, int, int, int]]]] = {
    2: {
        "shallow": [(1, 4, 1, 0), (3, 4, 1, 1)],
        "steep": [(1, 4, 0, 1), (3, 4, 1, 1)],
        "steep_shallow": [(1, 4, 1, 0), (1, 4, 0, 1), (5, 6, 1, 1)],
        "diagonal": [(1, 2, 1, 1)],
        "corner": [(21, 100, 1, 1)],
    },
    3: {
        "shallow": [(1, 4, 2, 0), (1, 4, 1, 2), (3, 4, 2, 1), (1, 1, 2, 2)],
        "steep": [(1, 4, 0, 2), (1, 4, 2, 1), (3, 4, 1, 2), (1, 1, 2, 2)],
        "steep_shallow": [
            (1, 4, 2, 0),
            (1, 4, 0, 2),
            (3, 4, 2, 1),
            (3, 4, 1, 2),
            (1, 1, 2, 2),
        ],
        "diagonal": [(1, 8, 1, 2), (1, 8, 2, 1), (7, 8, 2, 2)],
        "corner": [(45, 100, 2, 2)],
    },
    4: {
        "shallow": [
            (1, 4, 3, 0),
            (1, 4, 2, 2),
            (3, 4, 3, 1),
            (3, 4, 2, 3),
            (1, 1, 3, 2),
            (1, 1, 3, 3),
        ],
        "steep": [
            (1, 4, 0, 3),
            (1, 4, 2, 2),
            (3, 4, 1, 3),
            (3, 4, 3, 2),
            (1, 1, 2, 3),
            (1, 1, 3, 3),
        ],
        "steep_shallow": [
            (3, 4, 3, 1),
            (3, 4, 1, 3),
            (1, 4, 3, 0),
            (1, 4, 0, 3),
            (1, 3, 2, 2),
            (1, 1, 3, 3),
            (1, 1, 3, 2),
            (1, 1, 2, 3),
        ],
        "diagonal": [(1, 2, 3, 2), (1, 2, 2, 3), (1, 1, 3, 3)],
        "corner": [(68, 100, 3, 3), (9, 100, 3, 2), (9, 100, 2, 3)],
    },
    5: {
        "shallow": [
            (1, 4, 4, 0),
            (1, 4, 3, 2),
            (1, 4, 2, 4),
            (3, 4, 4, 1),
            (3, 4, 3, 3),
            (1, 1, 4, 2),
            (1, 1, 4, 3),
            (1, 1, 4, 4),
            (1, 1, 3, 4),
        ],
        "steep": [
            (1, 4, 0, 4),
            (1, 4, 2, 3),
            (1, 4, 4, 2),
            (3, 4, 1, 4),
            (3, 4, 3, 3),
            (1, 1, 2, 4),
            (1, 1, 3, 4),
            (1, 1, 4, 4),
            (1, 1, 4, 3),
        ],
        "steep_shallow": [
            (1, 4, 0, 4),
            (1, 4, 2, 3),
            (3, 4, 1, 4),
            (1, 4, 4, 0),
            (1, 4, 3, 2),
            (3, 4, 4, 1),
            (2, 3, 3, 3),
            (1, 1, 2, 4),
            (1, 1, 3, 4),
            (1, 1, 4, 4),
            (1, 1, 4, 2),
            (1, 1, 4, 3),
        ],
        "diagonal": [
            (1, 8, 4, 2),
            (1, 8, 3, 3),
            (1, 8, 2, 4),
            (7, 8, 4, 3),
            (7, 8, 3, 4),
            (1, 1, 4, 4),
        ],
        "corner": [(86, 100, 4, 4), (23, 100, 4, 3), (23, 100, 3, 4)],
    },
    6: {
        "shallow": [
            (1, 4, 5, 0),
            (1, 4, 4, 2),
            (1, 4, 3, 4),
            (3, 4, 5, 1),
            (3, 4, 4, 3),
            (3, 4, 3, 5),
            (1, 1, 5, 2),
            (1, 1, 5, 3),
            (1, 1, 5, 4),
            (1, 1, 5, 5),
            (1, 1, 4, 4),
            (1, 1, 4, 5),
        ],
        "steep": [
            (1, 4, 0, 5),
            (1, 4, 2, 4),
            (1, 4, 4, 3),
            (3, 4, 1, 5),
            (3, 4, 3, 4),
            (3, 4, 5, 3),
            (1, 1, 2, 5),
            (1, 1, 3, 5),
            (1, 1, 4, 5),
            (1, 1, 5, 5),
            (1, 1, 4, 4),
            (1, 1, 5, 4),
        ],
        "steep_shallow": [
            (1, 4, 0, 5),
            (1, 4, 2, 4),
            (3, 4, 1, 5),
            (3, 4, 3, 4),
            (1, 4, 5, 0),
            (1, 4, 4, 2),
            (3, 4, 5, 1),
            (3, 4, 4, 3),
            (1, 1, 2, 5),
            (1, 1, 3, 5),
            (1, 1, 4, 5),
            (1, 1, 5, 5),
            (1, 1, 4, 4),
            (1, 1, 5, 4),
            (1, 1, 5, 2),
            (1, 1, 5, 3),
        ],
        "diagonal": [
            (1, 2, 5, 3),
            (1, 2, 4, 4),
            (1, 2, 3, 5),
            (1, 1, 4, 5),
            (1, 1, 5, 5),
            (1, 1, 5, 4),
        ],
        "corner": [
            (97, 100, 5, 5),
            (42, 100, 4, 5),
            (42, 100, 5, 4),
            (6, 100, 5, 3),
            (6, 100, 3, 5),
        ],
    },
}

SCALES = tuple(PATTERNS)


_K_B = 0.0593  # ITU-R BT.2020
_K_R = 0.2627
_K_G = 1 - _K_B - _K_R
_SCALE_B = 0.5 / (1 - _K_B)
_SCALE_R = 0.5 / (1 - _K_R)


def _dist(p1: np.ndarray, p2: np.ndarray) -> np.ndarray:
    """
    ColorDistanceRGBA: the YCbCr distance, weighted by alpha (float64).
    As distYCbCrBuffered: each difference halved towards zero and doubled
    again, the distance rounded to float32.
    """
    diff = p1[..., :3].astype(np.int32) - p2[..., :3].astype(np.int32)
    diff = (np.trunc(diff / 2) * 2).astype(np.float64)
    r, g, b = diff[..., 0], diff[..., 1], diff[..., 2]
    y = _K_R * r + _K_G * g + _K_B * b
    c_b = _SCALE_B * (b - y)
    c_r = _SCALE_R * (r - y)
    d = np.sqrt(y * y + c_b * c_b + c_r * c_r).astype(np.float32)
    d = d.astype(np.float64)
    a1 = p1[..., 3] / 255.0
    a2 = p2[..., 3] / 255.0
    return np.where(
        a1 < a2, a1 * d + 255 * (a2 - a1), a2 * d + 255 * (a1 - a2)
    )


def _same(p1: np.ndarray, p2: np.ndarray) -> np.ndarray:
    return np.all(p1 == p2, axis=-1)


def _gradient(
    m: int, n: int, front: np.ndarray, back: np.ndarray
) -> np.ndarray:
    """gradientRGBA<M, N>(front, back): no alpha blending, integer maths."""
    wf = front[..., 3:4].astype(np.int64) * m
    wb = back[..., 3:4].astype(np.int64) * (n - m)
    ws = wf + wb
    safe = np.where(ws == 0, 1, ws)
    rgb = (front[..., :3] * wf + back[..., :3] * wb) // safe
    out = np.concatenate([rgb, ws // n], axis=-1)
    return np.where(ws == 0, 0, out).astype(np.uint8)


def _flat(x: np.ndarray) -> np.ndarray:
    return x.reshape(-1, 4)


def _preprocess(p: np.ndarray, h: int, w: int) -> tuple[np.ndarray, ...]:
    """
    preProcessCorners for every kernel with F at (x, y), x in [-1, w-1],
    y in [-1, h-1]. ``p`` is the image padded by 2 on every side.
    Returns blend_f, blend_g, blend_j, blend_k, each (..., h+1, w+1).
    """

    def at(dx: int, dy: int) -> np.ndarray:
        return p[..., 1 + dy : 2 + dy + h, 1 + dx : 2 + dx + w, :]

    f, g, j, k = at(0, 0), at(1, 0), at(0, 1), at(1, 1)
    shape = f.shape[:-1]
    skip = (_same(f, g) & _same(j, k)) | (_same(f, j) & _same(g, k))
    todo = np.flatnonzero(~skip)
    ker = {
        name: _flat(at(dx, dy))[todo]
        for name, (dx, dy) in {
            "b": (0, -1),
            "c": (1, -1),
            "e": (-1, 0),
            "f": (0, 0),
            "g": (1, 0),
            "h": (2, 0),
            "i": (-1, 1),
            "j": (0, 1),
            "k": (1, 1),
            "l": (2, 1),
            "n": (0, 2),
            "o": (1, 2),
        }.items()
    }
    b, c, e, f, g, hh, i, j, k, l_, n, o = (ker[x] for x in "bcefghijklno")
    jg = (
        _dist(i, f)
        + _dist(f, c)
        + _dist(n, k)
        + _dist(k, hh)
        + CENTER_DIRECTION_BIAS * _dist(j, g)
    )
    fk = (
        _dist(e, j)
        + _dist(j, o)
        + _dist(b, g)
        + _dist(g, l_)
        + CENTER_DIRECTION_BIAS * _dist(f, k)
    )
    first = jg < fk
    second = fk < jg
    dom1 = np.where(DOMINANT_DIRECTION_THRESHOLD * jg < fk, DOMINANT, NORMAL)
    dom2 = np.where(DOMINANT_DIRECTION_THRESHOLD * fk < jg, DOMINANT, NORMAL)
    out = []
    for cond, dom in (
        (first & ~_same(f, g) & ~_same(f, j), dom1),  # blend_f
        (second & ~_same(g, f) & ~_same(g, k), dom2),  # blend_g
        (second & ~_same(j, f) & ~_same(j, k), dom2),  # blend_j
        (first & ~_same(k, j) & ~_same(k, g), dom1),  # blend_k
    ):
        full = np.zeros(int(np.prod(shape)), np.uint8)
        full[todo] = np.where(cond, dom, NONE)
        out.append(full.reshape(shape))
    return tuple(out)


# The 3x3 kernel names after a clock-wise rotation (get_x<ROT_...>).
_ROT = {
    0: dict(a="a", b="b", c="c", d="d", e="e", f="f", g="g", h="h", i="i"),
    1: dict(a="g", b="d", c="a", d="h", e="e", f="b", g="i", h="f", i="c"),
    2: dict(a="i", b="h", c="g", d="f", e="e", f="d", g="c", h="b", i="a"),
    3: dict(a="c", b="f", c="i", d="b", e="e", f="h", g="a", h="d", i="g"),
}


def _rotated(i: int, j: int, n: int, rot: int) -> tuple[int, int]:
    """MatrixRotation: (row, column) in the output block before rotation."""
    for _ in range(rot):
        i, j = n - 1 - j, i
    return i, j


def scale(image: np.ndarray, factor: int) -> np.ndarray:
    """
    ``image`` (..., h, w, 4) uint8 RGBA, scaled by ``factor`` (2-6) with
    xBRZ. Pixels outside the image count as transparent.
    """
    if factor not in PATTERNS:
        raise ValueError(f"xBRZ scales by 2 to 6, not {factor}")
    image = np.asarray(image, dtype=np.uint8)
    h, w = image.shape[-3], image.shape[-2]
    lead = image.shape[:-3]
    pad = [(0, 0)] * len(lead) + [(2, 2), (2, 2), (0, 0)]
    p = np.pad(image, pad)

    bf, bg, bj, bk = _preprocess(p, h, w)
    # The blend info of pixel (x, y), from the four kernels around it:
    # top left, top right, bottom right, bottom left, 2 bits each.
    info = (
        bk[..., :-1, :-1]
        | (bj[..., :-1, 1:] << 2)
        | (bf[..., 1:, 1:] << 4)
        | (bg[..., 1:, :-1] << 6)
    ).reshape(-1)

    def k3(dx: int, dy: int) -> np.ndarray:
        return _flat(p[..., 2 + dy : 2 + dy + h, 2 + dx : 2 + dx + w, :])

    ker = {
        name: k3(dx, dy)
        for name, (dx, dy) in {
            "a": (-1, -1),
            "b": (0, -1),
            "c": (1, -1),
            "d": (-1, 0),
            "e": (0, 0),
            "f": (1, 0),
            "g": (-1, 1),
            "h": (0, 1),
            "i": (1, 1),
        }.items()
    }
    out = np.empty((len(info), factor, factor, 4), np.uint8)
    out[...] = ker["e"][:, None, None, :]

    def eq(p1: np.ndarray, p2: np.ndarray) -> np.ndarray:
        return _dist(p1, p2) < EQUAL_COLOR_TOLERANCE

    patterns = PATTERNS[factor]
    for rot in range(4):
        # rotateBlendInfo: the corners move one place clock-wise per turn
        blend = info.astype(np.uint16) << (2 * rot)
        blend = ((blend | (blend >> 8)) & 0xFF).astype(np.uint8)
        todo = np.flatnonzero(((blend >> 4) & 3) >= NORMAL)
        if not len(todo):
            continue
        blend = blend[todo]
        names = _ROT[rot]
        b, c, d, e, f, g, hh, i = (ker[names[x]][todo] for x in "bcdefghi")
        br = (blend >> 4) & 3
        tr = (blend >> 2) & 3
        bl = (blend >> 6) & 3
        line = (br >= DOMINANT) | ~(
            ((tr != NONE) & ~eq(e, g))
            | ((bl != NONE) & ~eq(e, c))
            | (~eq(e, i) & eq(g, hh) & eq(hh, i) & eq(i, f) & eq(f, c))
        )
        px = np.where((_dist(e, f) <= _dist(e, hh))[:, None], f, hh)
        fg = _dist(f, g)
        hc = _dist(hh, c)
        shallow = (
            (STEEP_DIRECTION_THRESHOLD * fg <= hc)
            & ~_same(e, g)
            & ~_same(d, g)
        )
        steep = (
            (STEEP_DIRECTION_THRESHOLD * hc <= fg)
            & ~_same(e, c)
            & ~_same(b, c)
        )
        kinds = {
            "steep_shallow": line & shallow & steep,
            "shallow": line & shallow & ~steep,
            "steep": line & ~shallow & steep,
            "diagonal": line & ~shallow & ~steep,
            "corner": ~line,
        }
        for kind, mask in kinds.items():
            sel = np.flatnonzero(mask)
            if not len(sel):
                continue
            where = todo[sel]
            col = px[sel]
            for m, n, row, column in patterns[kind]:
                r, cc = _rotated(row, column, factor, rot)
                if m == n:
                    out[where, r, cc] = col
                else:
                    out[where, r, cc] = _gradient(m, n, col, out[where, r, cc])

    # (pixels, f, f, 4) -> (..., h*f, w*f, 4)
    out = out.reshape(lead + (h, w, factor, factor, 4))
    nd = len(lead)
    axes = tuple(range(nd)) + (nd, nd + 2, nd + 1, nd + 3, nd + 4)
    return out.transpose(axes).reshape(lead + (h * factor, w * factor, 4))
