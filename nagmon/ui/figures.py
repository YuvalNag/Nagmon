# SPDX-License-Identifier: GPL-3.0
"""Draw learning-engine ``Figure`` specs onto pygame surfaces.

Pure pygame (no tuxemon) so it runs headless in tests. See
``docs/kids/SDD_FIGURES.md`` for the data of each kind. World coordinates
have y pointing up; everything is drawn at 2x and smooth-scaled down,
which gives antialiased thick lines, arcs and fills.
"""

from __future__ import annotations

import logging
import math
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from fractions import Fraction
from typing import Any, Protocol

import pygame

logger = logging.getLogger(__name__)

RGB = tuple[int, int, int]
RGBA = tuple[int, int, int, int]
Point = tuple[float, float]

SS = 2  # supersampling factor


class EmojiLoader(Protocol):
    def get(self, code: str, size: int) -> pygame.Surface | None: ...


TextTransform = Callable[[str], str]


@dataclass(frozen=True)
class FigureTheme:
    """Colours and line weight. Pastel fills, dark ink, one accent."""

    background: RGBA = (255, 255, 255, 0)
    ink: RGB = (54, 60, 84)
    muted: RGB = (148, 154, 172)
    paper: RGB = (255, 253, 246)
    fill: RGB = (143, 196, 236)
    fill_alt: RGB = (255, 199, 216)
    accent: RGB = (255, 134, 84)
    grid: RGB = (208, 216, 230)
    path: RGB = (72, 128, 220)
    coin: RGB = (247, 203, 76)
    coin_edge: RGB = (196, 140, 22)
    hour_hand: RGB = (230, 80, 96)
    minute_hand: RGB = (64, 118, 212)
    palette: tuple[RGB, ...] = (
        (170, 220, 186),
        (255, 222, 150),
        (200, 186, 236),
        (255, 199, 216),
        (143, 196, 236),
    )
    line_width: float = 4.0  # output pixels at a 200 px figure


DEFAULT_THEME = FigureTheme()

ALIASES = {
    "משולש": "triangle",
    "ריבוע": "square",
    "מלבן": "rectangle",
    "מחומש": "pentagon",
    "משושה": "hexagon",
    "מתומן": "octagon",
    "מעוין": "rhombus",
    "מקבילית": "parallelogram",
    "טרפז": "trapezoid",
    "דלתון": "kite",
    "לב": "heart",
    "כוכב": "star",
    "בית": "house",
    "חץ": "arrow",
    "פרפר": "butterfly",
    "עיגול": "circle",
    "קובייה": "cube",
    "תיבה": "cuboid",
    "גליל": "cylinder",
    "חרוט": "cone",
    "כדור": "sphere",
    "פירמידה": "pyramid",
    "מנסרה": "prism",
}


# ---------------------------------------------------------------- helpers


def _mix(a: Sequence[int], b: Sequence[int], t: float) -> RGB:
    return (
        round(a[0] + (b[0] - a[0]) * t),
        round(a[1] + (b[1] - a[1]) * t),
        round(a[2] + (b[2] - a[2]) * t),
    )


def _fmt(value: Any) -> str:
    if isinstance(value, str):
        return value
    v = float(value)
    if abs(v - round(v)) < 1e-9:
        return str(int(round(v)))
    return f"{v:.2f}".rstrip("0").rstrip(".")


def _to_float(value: Any) -> float:
    if isinstance(value, str):
        return float(Fraction(value.strip()))
    return float(value)


def _nice_step(span: float, max_ticks: int = 10) -> float:
    if span <= 0:
        return 1.0
    raw = span / max_ticks
    mag = 10 ** math.floor(math.log10(raw))
    for m in (1, 2, 5, 10):
        if m * mag >= raw - 1e-12:
            return m * mag
    return 10 * mag


def _points(raw: Any) -> list[Point]:
    pts = []
    for p in raw or []:
        if isinstance(p, Mapping):
            pts.append((_to_float(p["x"]), _to_float(p["y"])))
        else:
            x, y = p
            pts.append((_to_float(x), _to_float(y)))
    return pts


def _name(raw: Any) -> str:
    text = str(raw or "").strip()
    return ALIASES.get(text, text.lower().replace(" ", "_"))


_FONTS: dict[tuple[str | None, int], pygame.font.Font] = {}


def _font(path: str | None, px: int) -> pygame.font.Font:
    if not pygame.font.get_init():
        pygame.font.init()
        _FONTS.clear()
    key = (path, px)
    font = _FONTS.get(key)
    if font is None:
        try:
            font = pygame.font.Font(path, px)
        except (OSError, pygame.error):
            logger.warning("figure font %s unusable, using default", path)
            font = pygame.font.Font(None, px)
        if len(_FONTS) > 64:
            _FONTS.clear()
        _FONTS[key] = font
    return font


class _Map:
    """World (y up) to screen, uniform scale, centred in ``rect``."""

    def __init__(
        self,
        xmin: float,
        xmax: float,
        ymin: float,
        ymax: float,
        rect: pygame.Rect,
    ) -> None:
        sx = rect.w / max(xmax - xmin, 1e-9)
        sy = rect.h / max(ymax - ymin, 1e-9)
        self.s = max(min(sx, sy), 1e-6)
        self.ox = rect.centerx - (xmin + xmax) / 2 * self.s
        self.oy = rect.centery + (ymin + ymax) / 2 * self.s

    @classmethod
    def fit(cls, pts: Iterable[Point], rect: pygame.Rect) -> _Map:
        pts = list(pts)
        xs = [p[0] for p in pts] or [0.0]
        ys = [p[1] for p in pts] or [0.0]
        return cls(min(xs), max(xs), min(ys), max(ys), rect)

    def __call__(self, x: float, y: float) -> Point:
        return (self.ox + x * self.s, self.oy - y * self.s)


# ---------------------------------------------------------------- drawing


def _dot(surf: pygame.Surface, color: Sequence[int], c: Point, r: float):
    if r < 1:
        r = 1
    pygame.draw.circle(surf, color, c, r)


def _line(
    surf: pygame.Surface,
    color: Sequence[int],
    a: Point,
    b: Point,
    width: float,
) -> None:
    if width <= 1.5:
        pygame.draw.aaline(surf, color, a, b)
        return
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    if length > 1e-6:
        nx, ny = -dy / length * width / 2, dx / length * width / 2
        quad = [
            (a[0] + nx, a[1] + ny),
            (b[0] + nx, b[1] + ny),
            (b[0] - nx, b[1] - ny),
            (a[0] - nx, a[1] - ny),
        ]
        pygame.draw.polygon(surf, color, quad)
    _dot(surf, color, a, width / 2)
    _dot(surf, color, b, width / 2)


def _polyline(surf, color, pts: Sequence[Point], width, closed=False):
    pts = list(pts)
    if closed and len(pts) > 2:
        pts = pts + [pts[0]]
    for a, b in zip(pts, pts[1:]):
        _line(surf, color, a, b, width)


def _dashed(
    surf, color, pts: Sequence[Point], width, dash, gap, closed=False
) -> None:
    pts = list(pts)
    if closed and len(pts) > 2:
        pts = pts + [pts[0]]
    on, left = True, dash
    for a, b in zip(pts, pts[1:]):
        seg = math.dist(a, b)
        pos = 0.0
        while pos < seg - 1e-9:
            step = min(left, seg - pos)
            if on:
                t0, t1 = pos / seg, (pos + step) / seg
                _line(
                    surf,
                    color,
                    (a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0),
                    (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1),
                    width,
                )
            pos += step
            left -= step
            if left <= 1e-9:
                on = not on
                left = dash if on else gap


def _arrowhead(surf, color, tip: Point, direction: Point, size: float):
    length = math.hypot(*direction)
    if length < 1e-9:
        return
    ux, uy = direction[0] / length, direction[1] / length
    bx, by = tip[0] - ux * size, tip[1] - uy * size
    px, py = -uy * size * 0.55, ux * size * 0.55
    pygame.draw.polygon(
        surf, color, [tip, (bx + px, by + py), (bx - px, by - py)]
    )


def _ellipse_pts(c: Point, rx, ry, t0, t1, steps=48) -> list[Point]:
    return [
        (
            c[0] + rx * math.cos(t0 + (t1 - t0) * i / steps),
            c[1] - ry * math.sin(t0 + (t1 - t0) * i / steps),
        )
        for i in range(steps + 1)
    ]


# ---------------------------------------------------------------- context


class _Ctx:
    def __init__(
        self,
        surf: pygame.Surface,
        theme: FigureTheme,
        font_path: str | None,
        emoji: EmojiLoader | None,
        transform: TextTransform | None,
        out_unit: int,
    ) -> None:
        self.surf = surf
        self.theme = theme
        self.font_path = font_path
        self.emoji = emoji
        self.transform = transform
        self.w, self.h = surf.get_size()
        self.unit = min(self.w, self.h)
        self.lw = max(SS, theme.line_width * out_unit / 200 * SS)
        m = max(SS, round(self.unit * 0.06))
        self.box = pygame.Rect(m, m, max(1, self.w - 2 * m), self.h - 2 * m)
        self.box.h = max(1, self.box.h)

    def px(self, frac: float) -> int:
        return max(7 * SS, round(self.unit * frac))

    def text(
        self,
        text: Any,
        px: int,
        color: Sequence[int] | None = None,
        max_w: float | None = None,
    ) -> pygame.Surface:
        s = _fmt(text)
        if self.transform is not None:
            s = self.transform(s)
        font = _font(self.font_path, px)
        while max_w and px > 7 * SS and font.size(s)[0] > max_w:
            px = max(7 * SS, int(px * 0.85))
            font = _font(self.font_path, px)
        return font.render(s, True, color or self.theme.ink)

    def label(
        self,
        text: Any,
        center: Point,
        px: int,
        color: Sequence[int] | None = None,
        max_w: float | None = None,
        bg: Sequence[int] | None = None,
    ) -> pygame.Rect:
        img = self.text(text, px, color, max_w)
        rect = img.get_rect(center=(round(center[0]), round(center[1])))
        if bg is not None:
            pad = max(SS, px // 6)
            pygame.draw.rect(
                self.surf, bg, rect.inflate(pad * 2, pad), border_radius=pad
            )
        self.surf.blit(img, rect)
        return rect

    def label_out(
        self, text, anchor: Point, direction: Point, px: int, max_w=None
    ):
        """Label just outside ``anchor`` along ``direction``."""
        img = self.text(text, px, None, max_w)
        tw, th = img.get_size()
        length = math.hypot(*direction) or 1.0
        ux, uy = direction[0] / length, direction[1] / length
        off = self.lw + 0.5 * (abs(ux) * tw + abs(uy) * th) + px * 0.15
        c = (anchor[0] + ux * off, anchor[1] + uy * off)
        self.surf.blit(img, img.get_rect(center=(round(c[0]), round(c[1]))))

    def image(self, code: Any, size: float) -> pygame.Surface | None:
        if self.emoji is None or not str(code or "").strip():
            return None
        try:
            return self.emoji.get(str(code), max(1, int(size)))
        except Exception:  # a broken loader must not break the figure
            logger.exception("emoji loader failed for %r", code)
            return None

    def blit_center(self, img: pygame.Surface, center: Point) -> None:
        self.surf.blit(
            img, img.get_rect(center=(round(center[0]), round(center[1])))
        )

    def plate(self, rect: pygame.Rect | None = None) -> None:
        """An empty dashed tray, for zero objects or empty data."""
        r = (rect or self.box).inflate(-self.lw * 2, -self.lw * 2)
        pts = [r.topleft, r.topright, r.bottomright, r.bottomleft]
        d = self.lw * 2.5
        _dashed(self.surf, self.theme.muted, pts, self.lw, d, d, True)


# ---------------------------------------------------------------- objects


def _grid_layout(n: int, rect: pygame.Rect) -> tuple[int, int, float]:
    best = (1, n, 0.0)
    for cols in range(1, n + 1):
        rows = math.ceil(n / cols)
        cell = min(rect.w / cols, rect.h / rows)
        if cell > best[2] + 1e-9:
            best = (cols, rows, cell)
    return best


def _items(ctx: _Ctx, code: str, n: int, rect: pygame.Rect) -> None:
    if n <= 0:
        ctx.plate(rect)
        return
    cols, rows, cell = _grid_layout(n, rect)
    size = cell * 0.84
    img = ctx.image(code, size)
    x0 = rect.centerx - cols * cell / 2
    y0 = rect.centery - rows * cell / 2
    for i in range(n):
        r, c = divmod(i, cols)
        center = (x0 + (c + 0.5) * cell, y0 + (r + 0.5) * cell)
        if img is not None:
            ctx.blit_center(img, center)
        else:
            _dot(ctx.surf, ctx.theme.ink, center, size / 2)
            _dot(ctx.surf, ctx.theme.palette[0], center, size / 2 - ctx.lw)


def _objects(ctx: _Ctx, data: Mapping) -> None:
    if "coins" in data:
        _coins(ctx, [int(v) for v in data.get("coins") or []])
        return
    code = str(data.get("emoji") or "")
    if "groups" in data:
        groups = [max(0, int(g)) for g in data["groups"]]
    else:
        groups = [max(0, int(data.get("count", 0)))]
    if len(groups) <= 1:
        _items(ctx, code, groups[0] if groups else 0, ctx.box)
        return
    box = ctx.box
    n = len(groups)
    plus = min(box.h, box.w) * 0.16
    gw = (box.w - (n - 1) * plus) / n
    th = ctx.theme
    for i, g in enumerate(groups):
        left = box.left + i * (gw + plus)
        tray = pygame.Rect(round(left), box.top, round(gw), box.h)
        pygame.draw.rect(
            ctx.surf,
            _mix(th.palette[i % len(th.palette)], (255, 255, 255), 0.55),
            tray,
            border_radius=round(ctx.lw * 3),
        )
        _items(ctx, code, g, tray.inflate(-ctx.lw * 3, -ctx.lw * 3))
        if i < n - 1:
            cx, cy = left + gw + plus / 2, box.centery
            arm = plus * 0.32
            _line(ctx.surf, th.ink, (cx - arm, cy), (cx + arm, cy), ctx.lw)
            _line(ctx.surf, th.ink, (cx, cy - arm), (cx, cy + arm), ctx.lw)


COIN_SIZES = {1: 0.78, 2: 0.84, 5: 0.9, 10: 1.0}


def _coins(ctx: _Ctx, coins: list[int]) -> None:
    if not coins:
        ctx.plate()
        return
    th = ctx.theme
    cols, rows, cell = _grid_layout(len(coins), ctx.box)
    x0 = ctx.box.centerx - cols * cell / 2
    y0 = ctx.box.centery - rows * cell / 2
    font_has_shekel = _font(ctx.font_path, 20).metrics("₪")[0] is not None
    for i, value in enumerate(coins):
        r, c = divmod(i, cols)
        center = (x0 + (c + 0.5) * cell, y0 + (r + 0.5) * cell)
        if value >= 20:  # a banknote
            bw, bh = cell * 0.92, cell * 0.5
            rect = pygame.Rect(0, 0, round(bw), round(bh))
            rect.center = (round(center[0]), round(center[1]))
            pygame.draw.rect(
                ctx.surf, th.ink, rect, border_radius=round(ctx.lw)
            )
            pygame.draw.rect(
                ctx.surf,
                th.palette[0],
                rect.inflate(-ctx.lw * 2, -ctx.lw * 2),
                border_radius=round(ctx.lw),
            )
            text = f"{value} ₪" if font_has_shekel else str(value)
            ctx.label(text, center, round(bh * 0.5), th.ink, bw * 0.8)
            continue
        radius = cell * 0.46 * COIN_SIZES.get(value, 0.9)
        _dot(ctx.surf, th.coin_edge, center, radius)
        _dot(ctx.surf, th.coin, center, radius - ctx.lw)
        pygame.draw.circle(
            ctx.surf,
            _mix(th.coin, th.coin_edge, 0.5),
            center,
            radius * 0.8,
            max(1, round(ctx.lw / 2)),
        )
        num_px = round(radius * (0.8 if value < 10 else 0.7))
        if font_has_shekel:
            ctx.label(
                value, (center[0], center[1] - radius * 0.12), num_px, th.ink
            )
            ctx.label(
                "₪",
                (center[0], center[1] + radius * 0.48),
                round(radius * 0.38),
                th.ink,
            )
        else:
            ctx.label(value, center, num_px, th.ink)


# ---------------------------------------------------------------- clock


def _clock(ctx: _Ctx, data: Mapping) -> None:
    hour = int(data.get("hour", 12))
    minute = int(data.get("minute", 0)) % 60
    th = ctx.theme
    c = ctx.box.center
    radius = min(ctx.box.w, ctx.box.h) / 2
    _dot(ctx.surf, th.ink, c, radius)
    _dot(ctx.surf, th.paper, c, radius - ctx.lw * 1.4)
    inner = radius - ctx.lw * 1.4

    def at(angle_deg: float, r: float) -> Point:
        a = math.radians(angle_deg)
        return (c[0] + r * math.sin(a), c[1] - r * math.cos(a))

    for i in range(60):
        long_tick = i % 5 == 0
        r0 = inner * (0.86 if long_tick else 0.92)
        _line(
            ctx.surf,
            th.ink if long_tick else th.muted,
            at(i * 6, r0),
            at(i * 6, inner * 0.97),
            ctx.lw * (0.7 if long_tick else 0.35),
        )
    px = max(7 * SS, round(radius * 0.18))
    for n in range(1, 13):
        ctx.label(n, at(n * 30, inner * 0.68), px, th.ink)
    hour_angle = ((hour % 12) + minute / 60) * 30
    _line(ctx.surf, th.hour_hand, c, at(hour_angle, inner * 0.5), ctx.lw * 2)
    _line(ctx.surf, th.minute_hand, c, at(minute * 6, inner * 0.8), ctx.lw)
    _dot(ctx.surf, th.ink, c, ctx.lw * 1.4)


# ---------------------------------------------------------------- fractions


def _parts(data: Mapping) -> tuple[int, int]:
    parts = max(1, int(data.get("parts", 1)))
    shaded = min(parts, max(0, int(data.get("shaded", 0))))
    return parts, shaded


def _pie(ctx: _Ctx, data: Mapping) -> None:
    parts, shaded = _parts(data)
    th = ctx.theme
    c = ctx.box.center
    radius = min(ctx.box.w, ctx.box.h) / 2 - ctx.lw / 2
    if parts == 1:
        _dot(ctx.surf, th.fill if shaded else th.paper, c, radius)
    else:
        steps = max(4, 96 // parts)
        for i in range(parts):
            a0 = 2 * math.pi * i / parts
            pts = [c] + [
                (
                    c[0]
                    + radius * math.sin(a0 + 2 * math.pi / parts * k / steps),
                    c[1]
                    - radius * math.cos(a0 + 2 * math.pi / parts * k / steps),
                )
                for k in range(steps + 1)
            ]
            color = th.fill if i < shaded else th.paper
            pygame.draw.polygon(ctx.surf, color, pts)
        for i in range(parts):
            a = 2 * math.pi * i / parts
            end = (c[0] + radius * math.sin(a), c[1] - radius * math.cos(a))
            _line(ctx.surf, th.ink, c, end, ctx.lw * 0.7)
    pygame.draw.circle(ctx.surf, th.ink, c, radius + ctx.lw / 2, round(ctx.lw))


def _bar_model(ctx: _Ctx, data: Mapping) -> None:
    parts, shaded = _parts(data)
    th = ctx.theme
    box = ctx.box
    bh = min(box.h, max(box.w * 0.3, ctx.lw * 6))
    top = box.centery - bh / 2
    cw = box.w / parts
    for i in range(parts):
        rect = pygame.Rect(
            round(box.left + i * cw), round(top), math.ceil(cw), round(bh)
        )
        pygame.draw.rect(ctx.surf, th.fill if i < shaded else th.paper, rect)
    for i in range(1, parts):
        x = box.left + i * cw
        _line(ctx.surf, th.ink, (x, top), (x, top + bh), ctx.lw * 0.7)
    corners = [
        (box.left, top),
        (box.right, top),
        (box.right, top + bh),
        (box.left, top + bh),
    ]
    _polyline(ctx.surf, th.ink, corners, ctx.lw, closed=True)


# ---------------------------------------------------------------- number line


def _marks(data: Mapping, lo: float, hi: float) -> list[tuple[float, str]]:
    raw = data.get("marks")
    out: list[tuple[float, str]] = []
    if isinstance(raw, (list, tuple)):
        for m in raw:
            if isinstance(m, Mapping):
                v = _to_float(m["value"])
                out.append((v, _fmt(m.get("label", v))))
            elif isinstance(m, (list, tuple)):
                out.append((_to_float(m[0]), _fmt(m[1])))
            else:
                out.append((_to_float(m), _fmt(m)))
        return out
    step = _to_float(raw) if raw else _nice_step(hi - lo)
    if step <= 0:
        step = _nice_step(hi - lo)
    k = math.ceil(lo / step - 1e-9)
    while k * step <= hi + 1e-9 and len(out) < 200:
        out.append((k * step, _fmt(round(k * step, 9))))
        k += 1
    return out


def _number_line(ctx: _Ctx, data: Mapping) -> None:
    th = ctx.theme
    lo = _to_float(data.get("min", 0))
    hi = _to_float(data.get("max", 10))
    if hi <= lo:
        hi = lo + 1
    box = ctx.box
    px = ctx.px(0.11)
    head = ctx.lw * 3
    pad = head + ctx.lw * 2
    y = box.centery - px * 0.2

    def x_of(v: float) -> float:
        return box.left + pad + (v - lo) / (hi - lo) * (box.w - 2 * pad)

    _line(ctx.surf, th.ink, (box.left, y), (box.right, y), ctx.lw)
    _arrowhead(ctx.surf, th.ink, (box.left - ctx.lw, y), (-1, 0), head)
    _arrowhead(ctx.surf, th.ink, (box.right + ctx.lw, y), (1, 0), head)
    marks = [m for m in _marks(data, lo, hi) if lo - 1e-9 <= m[0] <= hi + 1e-9]
    tick = ctx.lw * 2.2
    widths = [ctx.text(t, px).get_width() for _, t in marks]
    spacing = (box.w - 2 * pad) / max(1, len(marks) - 1)
    every = max(1, math.ceil((max(widths, default=0) + px * 0.4) / spacing))
    for i, (v, text) in enumerate(marks):
        x = x_of(v)
        _line(ctx.surf, th.ink, (x, y - tick), (x, y + tick), ctx.lw * 0.7)
        if i % every == 0 or i == len(marks) - 1:
            ctx.label(text, (x, y + tick + px * 0.75), px, th.ink)
    point = data.get("point")
    if point is not None:
        x = x_of(min(hi, max(lo, _to_float(point))))
        _dot(ctx.surf, th.accent, (x, y), ctx.lw * 2.4)
        if data.get("point_label") is not None:
            ctx.label(
                data["point_label"], (x, y - tick - px * 0.8), px, th.accent
            )


# ---------------------------------------------------------------- polygons


def _regular(n: int) -> list[Point]:
    a0 = -math.pi / 2 - math.pi / n
    return [
        (
            math.cos(a0 + 2 * math.pi * i / n),
            math.sin(a0 + 2 * math.pi * i / n),
        )
        for i in range(n)
    ]


POLYGONS: dict[str, list[Point]] = {
    "triangle": _regular(3),
    "square": _regular(4),
    "pentagon": _regular(5),
    "hexagon": _regular(6),
    "octagon": _regular(8),
    "circle": _regular(48),
    "rectangle": [(0, 0), (3, 0), (3, 2), (0, 2)],
    "right_triangle": [(0, 0), (4, 0), (0, 3)],
    "rhombus": [(0, -1.5), (1, 0), (0, 1.5), (-1, 0)],
    "parallelogram": [(0, 0), (3, 0), (4, 2), (1, 2)],
    "trapezoid": [(0, 0), (4, 0), (3, 2), (1, 2)],
    "kite": [(0, -2), (1, 0), (0, 1), (-1, 0)],
}


def _signed_area(pts: Sequence[Point]) -> float:
    return 0.5 * sum(
        a[0] * b[1] - b[0] * a[1]
        for a, b in zip(pts, list(pts[1:]) + [pts[0]])
    )


def _polygon(ctx: _Ctx, data: Mapping) -> None:
    th = ctx.theme
    pts = _points(data.get("points"))
    if not pts:
        pts = list(POLYGONS.get(_name(data.get("name")), []))
    if not pts:
        raise ValueError("polygon without points")
    labels = dict(data.get("labels") or {})
    px = ctx.px(0.1)
    margin = round(px * 1.5) if labels else 0
    area = ctx.box.inflate(-2 * margin, -2 * margin)
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    grid = bool(data.get("grid"))
    if grid:
        x0, x1 = math.floor(min(xs)), math.ceil(max(xs))
        y0, y1 = math.floor(min(ys)), math.ceil(max(ys))
        x1, y1 = max(x1, x0 + 1), max(y1, y0 + 1)
        m = _Map(x0, x1, y0, y1, area)
        if (x1 - x0) * (y1 - y0) <= 2500:
            for gx in range(x0, x1 + 1):
                _line(ctx.surf, th.grid, m(gx, y0), m(gx, y1), ctx.lw * 0.4)
            for gy in range(y0, y1 + 1):
                _line(ctx.surf, th.grid, m(x0, gy), m(x1, gy), ctx.lw * 0.4)
    else:
        m = _Map.fit(pts, area)
    scr = [m(*p) for p in pts]
    if len(scr) >= 3:
        pygame.draw.polygon(ctx.surf, th.fill, scr)
    if len(scr) >= 2:
        _polyline(ctx.surf, th.ink, scr, ctx.lw, closed=len(scr) > 2)
    for p in scr:
        _dot(ctx.surf, th.ink, p, ctx.lw * (0.9 if len(scr) > 1 else 2.5))
    if not labels:
        return
    ccw = _signed_area(pts) >= 0
    cx = sum(xs) / len(xs)
    cy = sum(ys) / len(ys)
    n = len(pts)
    for key, text in labels.items():
        kind, _, idx = str(key).partition("_")
        if not idx.isdigit() or text is None:
            continue
        i = int(idx) % n
        if kind == "side" and n >= 2:
            a, b = pts[i], pts[(i + 1) % n]
            dx, dy = b[0] - a[0], b[1] - a[1]
            nx, ny = (dy, -dx) if ccw else (-dy, dx)
            mid = m((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            ctx.label_out(text, mid, (nx, -ny), px, ctx.box.w * 0.45)
        elif kind == "angle":
            vx, vy = m(*pts[i])
            ccx, ccy = m(cx, cy)
            d = math.hypot(ccx - vx, ccy - vy) or 1.0
            off = min(px * 1.6, d * 0.6)
            pos = (vx + (ccx - vx) / d * off, vy + (ccy - vy) / d * off)
            ctx.label(text, pos, round(px * 0.85), th.ink, ctx.box.w * 0.3)


def _circle(ctx: _Ctx, data: Mapping) -> None:
    th = ctx.theme
    float(data.get("r", 1) or 0)  # validated; drawing always fits the box
    c = ctx.box.center
    radius = min(ctx.box.w, ctx.box.h) / 2 - ctx.lw
    _dot(ctx.surf, th.ink, c, radius + ctx.lw / 2)
    _dot(ctx.surf, th.fill_alt, c, radius - ctx.lw / 2)
    show = str(data.get("show") or "").lower()
    label = data.get("label")
    px = ctx.px(0.12)
    if show == "radius":
        a = math.radians(-20)
        end = (c[0] + radius * math.cos(a), c[1] + radius * math.sin(a))
        _line(ctx.surf, th.ink, c, end, ctx.lw)
        mid = (c[0] + radius * 0.3, c[1] - radius * 0.11 - px * 0.75)
    elif show == "diameter":
        _line(
            ctx.surf,
            th.ink,
            (c[0] - radius, c[1]),
            (c[0] + radius, c[1]),
            ctx.lw,
        )
        mid = (c[0], c[1] - px * 0.7)
    else:
        mid = c
    _dot(ctx.surf, th.ink, c, ctx.lw * 1.2)
    if label is not None and str(label) != "":
        ctx.label(label, mid, px, th.ink, radius * 1.2, bg=th.paper)


def _angle(ctx: _Ctx, data: Mapping) -> None:
    th = ctx.theme
    deg = max(0.0, min(360.0, _to_float(data.get("degrees", 45))))
    rot = _to_float(data.get("rotation", 0) or 0)
    a1, a2 = math.radians(rot), math.radians(rot + deg)
    d1 = (math.cos(a1), math.sin(a1))
    d2 = (math.cos(a2), math.sin(a2))
    arc_r = 0.3
    world = [(0.0, 0.0), d1, d2]
    world += [
        (
            arc_r * math.cos(a1 + (a2 - a1) * k / 16),
            arc_r * math.sin(a1 + (a2 - a1) * k / 16),
        )
        for k in range(17)
    ]
    px = ctx.px(0.12)
    m = _Map.fit(world, ctx.box.inflate(-px, -px))
    v = m(0, 0)
    steps = max(8, int(deg / 4))
    arc = [
        m(
            arc_r * math.cos(a1 + (a2 - a1) * k / steps),
            arc_r * math.sin(a1 + (a2 - a1) * k / steps),
        )
        for k in range(steps + 1)
    ]
    if abs(deg - 90) < 1e-6:
        s = 0.18
        sq = [
            m(d1[0] * s, d1[1] * s),
            m(d1[0] * s + d2[0] * s, d1[1] * s + d2[1] * s),
            m(d2[0] * s, d2[1] * s),
        ]
        pygame.draw.polygon(ctx.surf, th.fill, [v] + sq)
        _polyline(ctx.surf, th.accent, sq, ctx.lw * 0.8)
    elif deg > 0:
        pygame.draw.polygon(ctx.surf, th.fill, [v] + arc)
        _polyline(ctx.surf, th.accent, arc, ctx.lw * 0.8)
    _line(ctx.surf, th.ink, v, m(*d1), ctx.lw)
    _line(ctx.surf, th.ink, v, m(*d2), ctx.lw)
    _dot(ctx.surf, th.ink, v, ctx.lw * 1.1)
    label = data["label"] if "label" in data else f"{_fmt(deg)}°"
    if label is not None and str(label) != "":
        mid = (a1 + a2) / 2
        r = arc_r + 0.22 if deg >= 30 else arc_r + 0.4
        ctx.label(
            label,
            m(r * math.cos(mid), r * math.sin(mid)),
            px,
            th.ink,
            ctx.box.w * 0.4,
        )


def _grid_area(ctx: _Ctx, data: Mapping) -> None:
    th = ctx.theme
    w, h = int(data.get("width", 0)), int(data.get("height", 0))
    if w <= 0 or h <= 0:
        ctx.plate()
        return
    raw = data.get("cells")
    if raw is None:
        cells = {(x, y) for x in range(w) for y in range(h)}
    else:
        cells = {(int(x), int(y)) for x, y in raw}
    cell = min(ctx.box.w / w, ctx.box.h / h)
    ox = ctx.box.centerx - w * cell / 2
    oy = ctx.box.centery - h * cell / 2

    def corner(x: float, y: float) -> Point:  # world grid corner, y up
        return (ox + x * cell, oy + (h - y) * cell)

    bg = pygame.Rect(round(ox), round(oy), round(w * cell), round(h * cell))
    pygame.draw.rect(ctx.surf, th.paper, bg)
    for x, y in cells:
        if 0 <= x < w and 0 <= y < h:
            tl = corner(x, y + 1)
            pygame.draw.rect(
                ctx.surf,
                th.fill,
                pygame.Rect(
                    round(tl[0]),
                    round(tl[1]),
                    round(tl[0] + cell) - round(tl[0]),
                    round(tl[1] + cell) - round(tl[1]),
                ),
            )
    gl = max(SS, ctx.lw * 0.4)
    for x in range(w + 1):
        _line(ctx.surf, th.grid, corner(x, 0), corner(x, h), gl)
    for y in range(h + 1):
        _line(ctx.surf, th.grid, corner(0, y), corner(w, y), gl)
    for x, y in cells:
        for (dx, dy), (a, b) in (
            ((0, -1), ((x, y), (x + 1, y))),
            ((0, 1), ((x, y + 1), (x + 1, y + 1))),
            ((-1, 0), ((x, y), (x, y + 1))),
            ((1, 0), ((x + 1, y), (x + 1, y + 1))),
        ):
            if (x + dx, y + dy) not in cells:
                _line(ctx.surf, th.ink, corner(*a), corner(*b), ctx.lw * 0.8)
    _polyline(
        ctx.surf,
        th.muted,
        [corner(0, 0), corner(w, 0), corner(w, h), corner(0, h)],
        gl,
        closed=True,
    )


# ---------------------------------------------------------------- solids

K = (0.5 * math.cos(math.radians(40)), 0.5 * math.sin(math.radians(40)))
Vec3 = tuple[float, float, float]


def _dims(raw: Any, keys: Sequence[Sequence[str]]) -> list[float | None]:
    """Pick one value per alias group from a mapping, list or number."""
    if raw is None:
        return [None] * len(keys)
    if isinstance(raw, Mapping):
        low = {str(k).lower(): v for k, v in raw.items()}
        out: list[float | None] = []
        for group in keys:
            val = next((low[k] for k in group if k in low), None)
            out.append(None if val is None else _to_float(val))
        return out
    if isinstance(raw, (int, float, str)):
        raw = [raw]
    vals = [_to_float(v) for v in raw]
    return [vals[i] if i < len(vals) else None for i in range(len(keys))]


def _clamp_ratio(vals: list[float]) -> list[float]:
    top = max(vals)
    return [min(top, max(top / 4, v)) for v in vals]


def _project(p: Vec3) -> Point:
    return (p[0] + p[2] * K[0], p[1] + p[2] * K[1])


def _polyhedron(verts: list[Vec3], faces: list[list[int]]):
    """Visible faces and edges (with hidden flag) under oblique view."""
    cx = sum(v[0] for v in verts) / len(verts)
    cy = sum(v[1] for v in verts) / len(verts)
    cz = sum(v[2] for v in verts) / len(verts)
    view = (-K[0], -K[1], 1.0)
    visible: list[tuple[list[int], Vec3]] = []
    face_vis: list[bool] = []
    for f in faces:
        a, b, c = (verts[i] for i in f[:3])
        u = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
        w = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
        n = (
            u[1] * w[2] - u[2] * w[1],
            u[2] * w[0] - u[0] * w[2],
            u[0] * w[1] - u[1] * w[0],
        )
        out = (a[0] - cx, a[1] - cy, a[2] - cz)
        if n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0:
            n = (-n[0], -n[1], -n[2])
        vis = n[0] * view[0] + n[1] * view[1] + n[2] * view[2] < -1e-9
        face_vis.append(vis)
        if vis:
            length = math.sqrt(sum(x * x for x in n)) or 1.0
            visible.append((f, (n[0] / length, n[1] / length, n[2] / length)))
    edges: dict[tuple[int, int], bool] = {}
    for f, vis in zip(faces, face_vis):
        for i in range(len(f)):
            key = tuple(sorted((f[i], f[(i + 1) % len(f)])))
            edges[key] = edges.get(key, False) or vis
    return visible, edges


def _box_solid(l: float, h: float, d: float):
    verts = [
        (0, 0, 0),
        (l, 0, 0),
        (l, h, 0),
        (0, h, 0),
        (0, 0, d),
        (l, 0, d),
        (l, h, d),
        (0, h, d),
    ]
    faces = [
        [0, 1, 2, 3],
        [4, 5, 6, 7],
        [0, 1, 5, 4],
        [3, 2, 6, 7],
        [1, 2, 6, 5],
        [0, 3, 7, 4],
    ]
    return verts, faces


def _solid(ctx: _Ctx, data: Mapping) -> None:
    name = _name(data.get("name"))
    raw = data.get("dims")
    if name in ("sphere", "cylinder", "cone"):
        _round_solid(ctx, name, raw)
        return
    if name == "cube":
        (a,) = _dims(raw, [("a", "edge", "side", "s", "l", "length")])
        size = a or 1.0
        verts, faces = _box_solid(size, size, size)
        labels = {(0, 1): a}
    elif name in ("cuboid", "box"):
        l, w, h = _dims(
            raw,
            [
                ("l", "length", "a", "x"),
                ("w", "width", "d", "depth", "b", "z"),
                ("h", "height", "c", "y"),
            ],
        )
        lv, wv, hv = _clamp_ratio([l or 3.0, w or 2.0, h or 2.0])
        verts, faces = _box_solid(lv, hv, wv)
        labels = {(0, 1): l, (1, 5): w, (0, 3): h}
    elif name == "prism":
        w, h, d = _dims(
            raw,
            [
                ("w", "base", "b", "a"),
                ("h", "height"),
                ("d", "depth", "l", "length"),
            ],
        )
        wv, hv, dv = _clamp_ratio([w or 2.0, h or 1.7, d or 3.0])
        verts = [
            (0, 0, 0),
            (wv, 0, 0),
            (wv / 2, hv, 0),
            (0, 0, dv),
            (wv, 0, dv),
            (wv / 2, hv, dv),
        ]
        faces = [
            [0, 1, 2],
            [3, 4, 5],
            [0, 1, 4, 3],
            [1, 2, 5, 4],
            [0, 2, 5, 3],
        ]
        labels = {(0, 1): w, (1, 4): d}
    elif name == "pyramid":
        l, w, h = _dims(
            raw,
            [
                ("l", "length", "a", "base"),
                ("w", "width", "d"),
                ("h", "height"),
            ],
        )
        lv, wv, hv = _clamp_ratio([l or 2.0, w or l or 2.0, h or 2.0])
        verts = [
            (0, 0, 0),
            (lv, 0, 0),
            (lv, 0, wv),
            (0, 0, wv),
            (lv / 2, hv, wv / 2),
        ]
        faces = [[0, 1, 2, 3], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]]
        labels = {(0, 1): l, (1, 2): w}
    else:
        raise ValueError(f"unknown solid {name!r}")
    _draw_polyhedron(ctx, verts, faces, labels)


def _face_color(th: FigureTheme, n: Vec3) -> RGB:
    if n[1] > 0.3:
        return _mix(th.fill, (255, 255, 255), 0.45)
    if n[0] > 0.3:
        return _mix(th.fill, th.ink, 0.15)
    return th.fill


def _draw_polyhedron(ctx, verts, faces, labels) -> None:
    th = ctx.theme
    px = ctx.px(0.1)
    shown = {k: v for k, v in labels.items() if v is not None}
    margin = round(px * 1.6) if shown else 0
    m = _Map.fit(
        [_project(v) for v in verts], ctx.box.inflate(-2 * margin, -2 * margin)
    )
    scr = [m(*_project(v)) for v in verts]
    visible, edges = _polyhedron(verts, faces)
    for f, n in visible:
        pygame.draw.polygon(ctx.surf, _face_color(th, n), [scr[i] for i in f])
    dash = ctx.lw * 2
    for (i, j), vis in edges.items():
        if not vis:
            _dashed(
                ctx.surf, th.muted, [scr[i], scr[j]], ctx.lw * 0.6, dash, dash
            )
    for (i, j), vis in edges.items():
        if vis:
            _line(ctx.surf, th.ink, scr[i], scr[j], ctx.lw)
    sx = sum(p[0] for p in scr) / len(scr)
    sy = sum(p[1] for p in scr) / len(scr)
    for (i, j), value in shown.items():
        mid = ((scr[i][0] + scr[j][0]) / 2, (scr[i][1] + scr[j][1]) / 2)
        ctx.label_out(value, mid, (mid[0] - sx, mid[1] - sy), px)


def _round_solid(ctx: _Ctx, name: str, raw: Any) -> None:
    th = ctx.theme
    r, h = _dims(raw, [("r", "radius"), ("h", "height")])
    if r is None and isinstance(raw, Mapping):
        dval = _dims(raw, [("d", "diameter")])[0]
        r = None if dval is None else dval / 2
    rv = r or 1.0
    hv = 0.0 if name == "sphere" else (h or rv * 2)
    rv, hv = (rv, hv) if name == "sphere" else _clamp_ratio([rv, hv])
    e = rv * 0.32  # ellipse half-height
    px = ctx.px(0.1)
    margin = round(px * 1.6) if (r is not None or h is not None) else 0
    area = ctx.box.inflate(-2 * margin, -2 * margin)
    if name == "sphere":
        m = _Map(-rv, rv, -rv, rv, area)
    else:
        m = _Map(-rv, rv, -e, hv + e, area)
    s = m.s
    c0 = m(0, 0)
    dash = ctx.lw * 2
    if name == "sphere":
        R = rv * s
        _dot(ctx.surf, th.fill, c0, R)
        shine = (c0[0] - R * 0.35, c0[1] - R * 0.35)
        _dot(ctx.surf, _mix(th.fill, (255, 255, 255), 0.5), shine, R * 0.22)
        front = _ellipse_pts(c0, R, e * s, math.pi, 2 * math.pi)
        back = _ellipse_pts(c0, R, e * s, 0, math.pi)
        _dashed(ctx.surf, th.muted, back, ctx.lw * 0.6, dash, dash)
        _polyline(ctx.surf, th.ink, front, ctx.lw * 0.7)
        pygame.draw.circle(ctx.surf, th.ink, c0, R, round(ctx.lw))
        top_label = None
    else:
        ct = m(0, hv)
        base_front = _ellipse_pts(c0, rv * s, e * s, math.pi, 2 * math.pi)
        base_back = _ellipse_pts(c0, rv * s, e * s, 0, math.pi)
        if name == "cylinder":
            body = [m(-rv, hv), m(rv, hv)] + base_front[::-1]
            pygame.draw.polygon(ctx.surf, th.fill, body)
            top = _ellipse_pts(ct, rv * s, e * s, 0, 2 * math.pi, 64)
            pygame.draw.polygon(
                ctx.surf, _mix(th.fill, (255, 255, 255), 0.45), top
            )
            _polyline(ctx.surf, th.ink, top, ctx.lw)
            _line(ctx.surf, th.ink, m(-rv, 0), m(-rv, hv), ctx.lw)
            _line(ctx.surf, th.ink, m(rv, 0), m(rv, hv), ctx.lw)
            radius_from = ct
        else:
            apex = ct
            pygame.draw.polygon(ctx.surf, th.fill, [apex] + base_front[::-1])
            _line(ctx.surf, th.ink, apex, m(-rv, 0), ctx.lw)
            _line(ctx.surf, th.ink, apex, m(rv, 0), ctx.lw)
            _dashed(ctx.surf, th.muted, [apex, c0], ctx.lw * 0.6, dash, dash)
            radius_from = None
        _dashed(ctx.surf, th.muted, base_back, ctx.lw * 0.6, dash, dash)
        _polyline(ctx.surf, th.ink, base_front, ctx.lw)
        top_label = radius_from
        if h is not None:
            mid = m(rv, hv / 2)
            ctx.label_out(h, mid, (1, 0), px)
    if r is not None:
        start = top_label or c0
        end = (start[0] + rv * s, start[1])
        _dashed(
            ctx.surf, th.accent, [start, end], ctx.lw * 0.7, dash, dash / 2
        )
        _dot(ctx.surf, th.ink, start, ctx.lw)
        mid = ((start[0] + end[0]) / 2, start[1])
        if name == "sphere":
            mid = (mid[0], mid[1] - e * s * 0.6)
        below = name == "cone"
        if below:
            mid = (mid[0], mid[1] + e * s)
        ctx.label_out(r, mid, (0, 1 if below else -1), px)


# ---------------------------------------------------------------- coordinate


def _range(raw: Any, pts: list[Point]) -> tuple[int, int, int, int]:
    if raw is None:
        raw = 5
    if isinstance(raw, (int, float, str)):
        n = abs(_to_float(raw)) or 5
        neg = any(x < 0 or y < 0 for x, y in pts)
        lo = -n if neg else 0
        vals = [lo, n, lo, n]
    else:
        vals = [_to_float(v) for v in raw]
        if len(vals) == 2:
            vals = vals * 2
        if len(vals) != 4:
            raise ValueError("coordinate range must have 1, 2 or 4 numbers")
    xmin, xmax, ymin, ymax = vals
    for x, y in pts:
        xmin, xmax = min(xmin, x), max(xmax, x)
        ymin, ymax = min(ymin, y), max(ymax, y)
    xmin, ymin = math.floor(xmin), math.floor(ymin)
    xmax, ymax = max(math.ceil(xmax), xmin + 1), max(math.ceil(ymax), ymin + 1)
    return xmin, xmax, ymin, ymax


def _coordinate(ctx: _Ctx, data: Mapping) -> None:
    th = ctx.theme
    raw_pts = list(data.get("points") or [])
    pts = _points(raw_pts)
    xmin, xmax, ymin, ymax = _range(data.get("range"), pts)
    px = ctx.px(0.075)
    area = ctx.box.inflate(-round(px * 2.4), -round(px * 2.4))
    m = _Map(xmin, xmax, ymin, ymax, area)
    xs = _nice_step(xmax - xmin)
    ys = _nice_step(ymax - ymin)
    gl = max(SS, ctx.lw * 0.35)

    def ticks(lo: int, hi: int, step: float) -> list[float]:
        k = math.ceil(lo / step - 1e-9)
        out = []
        while k * step <= hi + 1e-9:
            out.append(k * step)
            k += 1
        return out

    xt, yt = ticks(xmin, xmax, xs), ticks(ymin, ymax, ys)
    for x in xt:
        _line(ctx.surf, th.grid, m(x, ymin), m(x, ymax), gl)
    for y in yt:
        _line(ctx.surf, th.grid, m(xmin, y), m(xmax, y), gl)
    ax_y = 0 if ymin <= 0 <= ymax else ymin
    ax_x = 0 if xmin <= 0 <= xmax else xmin
    head = ctx.lw * 2.6
    a, b = m(xmin, ax_y), m(xmax, ax_y)
    _line(ctx.surf, th.ink, a, (b[0] + head * 0.6, b[1]), ctx.lw * 0.8)
    _arrowhead(ctx.surf, th.ink, (b[0] + head * 1.4, b[1]), (1, 0), head)
    a, b = m(ax_x, ymin), m(ax_x, ymax)
    _line(ctx.surf, th.ink, a, (b[0], b[1] - head * 0.6), ctx.lw * 0.8)
    _arrowhead(ctx.surf, th.ink, (b[0], b[1] - head * 1.4), (0, -1), head)
    tick = ctx.lw * 1.2
    wide = max(ctx.text(_fmt(v), px).get_width() for v in xt + yt)
    x_every = max(1, math.ceil((wide + px * 0.5) / (xs * m.s)))
    y_every = max(1, math.ceil(px * 1.2 / (ys * m.s)))
    for x in xt:
        p = m(x, ax_y)
        _line(ctx.surf, th.ink, (p[0], p[1] - tick), (p[0], p[1] + tick), gl)
        if round(x / xs) % x_every:
            continue
        if x != ax_x or ax_y != 0:
            ctx.label(_fmt(x), (p[0], p[1] + tick + px * 0.7), px, th.muted)
    for y in yt:
        p = m(ax_x, y)
        _line(ctx.surf, th.ink, (p[0] - tick, p[1]), (p[0] + tick, p[1]), gl)
        if round(y / ys) % y_every:
            continue
        if y != ax_y or ax_x != 0:
            ctx.label(_fmt(y), (p[0] - tick - px * 0.9, p[1]), px, th.muted)
    if ax_x == 0 and ax_y == 0:
        o = m(0, 0)
        ctx.label("0", (o[0] - px * 0.6, o[1] + px * 0.8), px, th.muted)
    lpx = round(px * 1.25)
    for raw, (x, y) in zip(raw_pts, pts):
        p = m(x, y)
        _dot(ctx.surf, th.ink, p, ctx.lw * 1.7)
        _dot(ctx.surf, th.accent, p, ctx.lw * 1.2)
        label = raw.get("label") if isinstance(raw, Mapping) else None
        if label:
            ctx.label(label, (p[0] + lpx * 0.7, p[1] - lpx * 0.7), lpx, th.ink)


# ---------------------------------------------------------------- grid path

DIRS = {"R": (1, 0), "L": (-1, 0), "U": (0, 1), "D": (0, -1)}


def _moves(raw: Any) -> list[tuple[str, int]]:
    out = []
    for token in raw or []:
        t = str(token).strip().upper()
        letters = [ch for ch in t if ch in DIRS]
        digits = "".join(ch for ch in t if ch.isdigit())
        if len(letters) != 1:
            raise ValueError(f"bad move {token!r}")
        out.append((letters[0], int(digits) if digits else 1))
    return out


def _arrow_glyph(ctx, center: Point, direction: str, size: float, color):
    dx, dy = DIRS[direction]
    vx, vy = dx, -dy  # screen
    half = size * 0.38
    tail = (center[0] - vx * half, center[1] - vy * half)
    tip = (center[0] + vx * half, center[1] + vy * half)
    head = size * 0.34
    _line(
        ctx.surf,
        color,
        tail,
        (tip[0] - vx * head * 0.8, tip[1] - vy * head * 0.8),
        ctx.lw,
    )
    _arrowhead(ctx.surf, color, tip, (vx, vy), head)


def _grid_path(ctx: _Ctx, data: Mapping) -> None:
    th = ctx.theme
    w = max(1, int(data.get("width", 5)))
    h = max(1, int(data.get("height", 5)))
    sx, sy = (int(v) for v in data.get("start") or (0, 0))
    moves = _moves(data.get("moves"))
    repeat = max(1, int(data.get("repeat", 1) or 1))
    box = ctx.box
    strip_h = round(box.h * 0.24) if moves else 0
    grid_rect = pygame.Rect(box.left, box.top, box.w, box.h - strip_h)
    cell = min(grid_rect.w / w, grid_rect.h / h)
    ox = grid_rect.centerx - w * cell / 2
    oy = grid_rect.centery - h * cell / 2

    def center(x: float, y: float) -> Point:
        return (ox + (x + 0.5) * cell, oy + (h - y - 0.5) * cell)

    pygame.draw.rect(
        ctx.surf,
        th.paper,
        pygame.Rect(round(ox), round(oy), round(w * cell), round(h * cell)),
    )
    gl = max(SS, ctx.lw * 0.4)
    for x in range(w + 1):
        _line(
            ctx.surf,
            th.grid,
            (ox + x * cell, oy),
            (ox + x * cell, oy + h * cell),
            gl,
        )
    for y in range(h + 1):
        _line(
            ctx.surf,
            th.grid,
            (ox, oy + y * cell),
            (ox + w * cell, oy + y * cell),
            gl,
        )
    corners = [
        (ox, oy),
        (ox + w * cell, oy),
        (ox + w * cell, oy + h * cell),
        (ox, oy + h * cell),
    ]
    _polyline(ctx.surf, th.ink, corners, ctx.lw * 0.8, closed=True)
    for label, pos in dict(data.get("marks") or {}).items():
        mx, my = (int(v) for v in pos)
        c = center(mx, my)
        img = ctx.image(label, cell * 0.8)
        if img is not None:
            ctx.blit_center(img, c)
        else:
            ctx.label(label, c, round(cell * 0.5), th.ink, cell * 0.9)
    if data.get("show_path"):
        x, y = sx, sy
        for _ in range(repeat):
            for d, n in moves:
                for _ in range(n):
                    nx, ny = x + DIRS[d][0], y + DIRS[d][1]
                    a, b = center(x, y), center(nx, ny)
                    tip = (
                        a[0] + (b[0] - a[0]) * 0.8,
                        a[1] + (b[1] - a[1]) * 0.8,
                    )
                    _line(ctx.surf, th.path, a, tip, ctx.lw * 0.8)
                    _arrowhead(
                        ctx.surf,
                        th.path,
                        b,
                        (b[0] - a[0], b[1] - a[1]),
                        cell * 0.25,
                    )
                    x, y = nx, ny
    s = center(sx, sy)
    _dot(ctx.surf, th.ink, s, cell * 0.3)
    _dot(ctx.surf, th.accent, s, cell * 0.3 - ctx.lw * 0.8)
    if not moves:
        return
    # Program strip: numbered arrow cards, then "×repeat".
    rep_w = strip_h * 1.1 if repeat > 1 else 0
    n = len(moves)
    card = min(strip_h * 0.86, (box.w - rep_w) / n * 0.9)
    gap = card * 0.12
    total = n * card + (n - 1) * gap + rep_w
    x0 = box.centerx - total / 2
    cy = box.bottom - strip_h / 2
    small = max(7 * SS, round(card * 0.24))
    for i, (d, count) in enumerate(moves):
        rect = pygame.Rect(
            round(x0 + i * (card + gap)),
            round(cy - card / 2),
            round(card),
            round(card),
        )
        pygame.draw.rect(
            ctx.surf, th.grid, rect, border_radius=round(card * 0.15)
        )
        pygame.draw.rect(
            ctx.surf,
            th.paper,
            rect.inflate(-ctx.lw, -ctx.lw),
            border_radius=round(card * 0.15),
        )
        _arrow_glyph(ctx, rect.center, d, card * 0.8, th.path)
        ctx.label(
            i + 1,
            (rect.left + small * 0.6, rect.top + small * 0.6),
            small,
            th.muted,
        )
        if count > 1:
            ctx.label(
                count,
                (rect.right - small * 0.6, rect.bottom - small * 0.6),
                small,
                th.ink,
            )
    if repeat > 1:
        bracket = pygame.Rect(
            round(x0 - gap / 2),
            round(cy - card / 2 - gap / 2),
            round(n * card + (n - 1) * gap + gap),
            round(card + gap),
        )
        pygame.draw.rect(
            ctx.surf,
            th.accent,
            bracket,
            round(max(SS, ctx.lw * 0.5)),
            border_radius=round(card * 0.2),
        )
        ctx.label(
            f"×{repeat}",
            (bracket.right + rep_w / 2, cy),
            round(card * 0.42),
            th.accent,
            rep_w,
        )


# ---------------------------------------------------------------- pattern


def _pattern(ctx: _Ctx, data: Mapping) -> None:
    th = ctx.theme
    items = list(data.get("items") or [])
    if not items:
        ctx.plate()
        return
    n = len(items)
    rows = 1 if n <= 8 else 2
    cols = math.ceil(n / rows)
    cell = min(ctx.box.w / cols, ctx.box.h / rows)
    card = cell * 0.88
    x0 = ctx.box.centerx - cols * cell / 2
    y0 = ctx.box.centery - rows * cell / 2
    radius = round(card * 0.14)
    for i, item in enumerate(items):
        r, c = divmod(i, cols)
        cx, cy = x0 + (c + 0.5) * cell, y0 + (r + 0.5) * cell
        rect = pygame.Rect(0, 0, round(card), round(card))
        rect.center = (round(cx), round(cy))
        if str(item).strip() == "?":
            pygame.draw.rect(ctx.surf, th.accent, rect, border_radius=radius)
            ctx.label("?", (cx, cy), round(card * 0.6), th.paper)
            continue
        pygame.draw.rect(ctx.surf, th.grid, rect, border_radius=radius)
        pygame.draw.rect(
            ctx.surf,
            th.paper,
            rect.inflate(-ctx.lw, -ctx.lw),
            border_radius=radius,
        )
        img = ctx.image(item, card * 0.78)
        if img is not None:
            ctx.blit_center(img, (cx, cy))
        else:
            ctx.label(item, (cx, cy), round(card * 0.5), th.ink, card * 0.85)


# ---------------------------------------------------------------- numbers


def _grid_numbers(ctx: _Ctx, data: Mapping) -> None:
    th = ctx.theme
    grid = [list(row or []) for row in data.get("grid") or []]
    rows, cols = len(grid), max((len(r) for r in grid), default=0)
    if rows == 0 or cols == 0:
        ctx.plate()
        return
    target = data.get("target")
    tr, tc = (int(target[0]), int(target[1])) if target else (-1, -1)
    cell = min(ctx.box.w / cols, ctx.box.h / rows)
    ox = ctx.box.centerx - cols * cell / 2
    oy = ctx.box.centery - rows * cell / 2
    px = round(cell * 0.45)
    for r in range(rows):
        for c in range(cols):
            rect = pygame.Rect(
                round(ox + c * cell),
                round(oy + r * cell),
                round(ox + (c + 1) * cell) - round(ox + c * cell),
                round(oy + (r + 1) * cell) - round(oy + r * cell),
            )
            is_target = (r, c) == (tr, tc)
            pygame.draw.rect(
                ctx.surf, th.accent if is_target else th.paper, rect
            )
            value = grid[r][c] if c < len(grid[r]) else None
            text = "?" if value is None and is_target else value
            if text is not None:
                ctx.label(text, rect.center, px, th.ink, cell * 0.86)
    gl = max(SS, ctx.lw * 0.5)
    for c in range(cols + 1):
        x = ox + c * cell
        _line(ctx.surf, th.muted, (x, oy), (x, oy + rows * cell), gl)
    for r in range(rows + 1):
        y = oy + r * cell
        _line(ctx.surf, th.muted, (ox, y), (ox + cols * cell, y), gl)
    corners = [
        (ox, oy),
        (ox + cols * cell, oy),
        (ox + cols * cell, oy + rows * cell),
        (ox, oy + rows * cell),
    ]
    _polyline(ctx.surf, th.ink, corners, ctx.lw * 0.8, closed=True)


# ---------------------------------------------------------------- symmetry


def _mirror(right: list[Point]) -> list[Point]:
    """Close a right half (top to bottom, x >= 0) with its mirror image."""
    left = [(-x, y) for x, y in reversed(right) if abs(x) > 1e-9]
    return right + left


def _heart() -> list[Point]:
    pts = []
    for i in range(64):
        t = 2 * math.pi * i / 64
        x = 16 * math.sin(t) ** 3
        y = (
            13 * math.cos(t)
            - 5 * math.cos(2 * t)
            - 2 * math.cos(3 * t)
            - math.cos(4 * t)
        )
        pts.append((x, y))
    return pts


def _star() -> list[Point]:
    return [
        (
            (1 if i % 2 == 0 else 0.42)
            * math.cos(math.pi / 2 + i * math.pi / 5),
            (1 if i % 2 == 0 else 0.42)
            * math.sin(math.pi / 2 + i * math.pi / 5),
        )
        for i in range(10)
    ]


SYMMETRY_SHAPES: dict[str, list[Point]] = {
    **POLYGONS,
    "heart": _heart(),
    "star": _star(),
    "house": [(-1, 0), (1, 0), (1, 1.2), (0, 2.2), (-1, 1.2)],
    "arrow": _mirror([(0, 2.2), (0.8, 1.2), (0.35, 1.2), (0.35, 0), (0, 0)]),
    "butterfly": _mirror(
        [
            (0, 1.0),
            (0.4, 1.9),
            (1.4, 2.2),
            (1.7, 1.4),
            (0.9, 0.4),
            (1.5, -0.4),
            (1.2, -1.4),
            (0.5, -1.3),
            (0, -0.8),
        ]
    ),
}


def _symmetry(ctx: _Ctx, data: Mapping) -> None:
    th = ctx.theme
    shape = data.get("shape")
    axis = str(data.get("axis") or "vertical").lower()
    area = ctx.box.inflate(-ctx.lw * 6, -ctx.lw * 6)
    if isinstance(shape, (list, tuple)):
        pts = _points(shape)
    else:
        pts = list(SYMMETRY_SHAPES.get(_name(shape), []))
    if pts:
        m = _Map.fit(pts, area)
        scr = [m(*p) for p in pts]
        pygame.draw.polygon(ctx.surf, th.fill_alt, scr)
        _polyline(ctx.surf, th.ink, scr, ctx.lw, closed=True)
        xs, ys = [p[0] for p in scr], [p[1] for p in scr]
        bounds = pygame.Rect(
            round(min(xs)),
            round(min(ys)),
            round(max(xs) - min(xs)),
            round(max(ys) - min(ys)),
        )
    else:
        size = min(area.w, area.h)
        img = ctx.image(shape, size)
        bounds = pygame.Rect(0, 0, size, size)
        bounds.center = area.center
        if img is not None:
            ctx.blit_center(img, area.center)
        else:
            pygame.draw.rect(
                ctx.surf, th.paper, bounds, border_radius=round(size * 0.1)
            )
            ctx.label("?", bounds.center, round(size * 0.6), th.muted)
    ext = ctx.lw * 4
    dash = ctx.lw * 2.2
    cx, cy = bounds.center
    if axis in ("vertical", "both"):
        _dashed(
            ctx.surf,
            th.accent,
            [(cx, bounds.top - ext), (cx, bounds.bottom + ext)],
            ctx.lw * 0.8,
            dash,
            dash * 0.7,
        )
    if axis in ("horizontal", "both"):
        _dashed(
            ctx.surf,
            th.accent,
            [(bounds.left - ext, cy), (bounds.right + ext, cy)],
            ctx.lw * 0.8,
            dash,
            dash * 0.7,
        )


# ---------------------------------------------------------------- dispatch

_RENDERERS: dict[str, Callable[[_Ctx, Mapping], None]] = {
    "objects": _objects,
    "clock": _clock,
    "pie": _pie,
    "bar_model": _bar_model,
    "number_line": _number_line,
    "polygon": _polygon,
    "circle": _circle,
    "angle": _angle,
    "grid_area": _grid_area,
    "solid": _solid,
    "coordinate": _coordinate,
    "grid_path": _grid_path,
    "pattern": _pattern,
    "grid_numbers": _grid_numbers,
    "symmetry": _symmetry,
}

FIGURE_KINDS: tuple[str, ...] = tuple(_RENDERERS)


def _placeholder(ctx: _Ctx) -> None:
    th = ctx.theme
    pygame.draw.rect(
        ctx.surf, th.paper, ctx.box, border_radius=round(ctx.unit * 0.08)
    )
    pygame.draw.rect(
        ctx.surf,
        th.muted,
        ctx.box,
        max(1, round(ctx.lw * 0.6)),
        border_radius=round(ctx.unit * 0.08),
    )
    try:
        ctx.label("?", ctx.box.center, ctx.px(0.4), th.muted)
    except Exception:  # pragma: no cover - fonts unavailable
        logger.exception("placeholder label failed")


def render_figure(
    figure_kind: str,
    data: Mapping[str, Any] | None,
    size: tuple[int, int],
    *,
    theme: FigureTheme = DEFAULT_THEME,
    font_path: str | None = None,
    emoji_loader: EmojiLoader | None = None,
    text_transform: TextTransform | None = None,
) -> pygame.Surface:
    """Draw ``Figure(figure_kind, data)`` on a new SRCALPHA surface.

    Never raises for bad kinds or data: a neutral placeholder is drawn
    instead (and a warning is logged).
    """
    w, h = max(1, int(size[0])), max(1, int(size[1]))
    hi = pygame.Surface((w * SS, h * SS), pygame.SRCALPHA)

    def fresh() -> _Ctx:
        hi.fill(theme.background)
        return _Ctx(
            hi, theme, font_path, emoji_loader, text_transform, min(w, h)
        )

    renderer = _RENDERERS.get(str(figure_kind))
    try:
        if renderer is None:
            raise KeyError(f"unknown figure kind {figure_kind!r}")
        renderer(fresh(), data if isinstance(data, Mapping) else {})
    except Exception as exc:
        logger.warning("figure %r not drawn: %s", figure_kind, exc)
        _placeholder(fresh())
    return pygame.transform.smoothscale(hi, (w, h))
