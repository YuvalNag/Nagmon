# SPDX-License-Identifier: GPL-3.0
"""
The solar-system trip's maps: five zones and the space station.

Layouts (``tools/app/solar_layouts.py``) -> Tiled JSON in the format of
``tools/app/maps.py`` (64 px tiles, one embedded atlas with extruded
edges, a collision grid, an ``events`` object layer with a ``script``
property each) from the new tile sheets (``mods/nagmon/gfx/solar``).

Besides the events, a ``markers`` object layer (hidden) names the places
the trip engine needs: ``spawn``, ``exit``, ``wild`` and one
``npc:<slug>`` per person; the table that ties zones, maps and animals
together is ``mods/nagmon/trips/solar.yaml``.
"""

from __future__ import annotations

import random
from collections import deque
from types import SimpleNamespace
from typing import Any

import numpy as np
import yaml
from PIL import Image

from tools.app import maps
from tools.app import solar_layouts as L
from tools.app.common import NAG, Output, rel_repo

SHEETS = NAG / "gfx" / "solar"
TRIP = NAG / "trips" / "solar.yaml"
TILE = maps.TILE
CELL_SRC = 256
SHEET_FILES = {
    "moon": "nagmon_tiles_moon.png",
    "sun": "nagmon_tiles_sun.png",
    "rocky": "nagmon_tiles_rocky.png",
    "giants": "nagmon_tiles_giants.png",
    "outer": "nagmon_tiles_outer.png",
    "station": "nagmon_tiles_station.png",
    "spaceship": "nagmon_spaceship.png",
}
KEY = (255, 0, 255)
MAPS = tuple(f"solar_{n}" for n in (*L.ZONES, "station"))
MUSIC = None  # the trip engine chooses the music


def trip() -> dict[str, Any]:
    return yaml.safe_load(TRIP.read_text("utf-8"))


# --------------------------------------------------------------- tiles
_SHEETS: dict[str, Image.Image] = {}


def sheet(name: str) -> Image.Image:
    if name not in _SHEETS:
        with Image.open(SHEETS / SHEET_FILES[name]) as im:
            _SHEETS[name] = im.convert("RGBA")
    return _SHEETS[name]


def _shrink(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Scale down with a box filter over the opaque pixels only; the
    magenta key becomes transparent first, alpha ends up 0 or 255."""
    rgba = np.asarray(image).astype(np.float32)
    keyed = (rgba[..., :3] == np.array(KEY)).all(-1)
    alpha = np.where(keyed | (rgba[..., 3] < 128), 0.0, 1.0).astype(np.float32)
    premul = np.concatenate(
        [rgba[..., :3] * alpha[..., None], alpha[..., None]], -1
    )
    chans = [
        np.asarray(
            Image.fromarray(np.ascontiguousarray(premul[..., i]), "F").resize(
                size, Image.BOX
            )
        )
        for i in range(4)
    ]
    out = np.stack(chans, -1)
    a = out[..., 3:]
    rgb = np.where(a > 0, out[..., :3] / np.maximum(a, 1e-6), 0)
    result = np.zeros(out.shape, np.uint8)
    result[..., :3] = np.clip(rgb + 0.5, 0, 255)
    result[..., 3] = np.where(a[..., 0] >= 0.5, 255, 0)
    result[result[..., 3] == 0, :3] = 0
    return Image.fromarray(result, "RGBA")


def piece_tiles(p: L.Piece) -> list[Image.Image]:
    """The tiles of a piece, row by row."""
    if p.sheet == "spaceship":
        box = (0, 0, p.w * CELL_SRC, p.h * CELL_SRC)
    else:
        x, y = (p.col - 1) * CELL_SRC, (p.row - 1) * CELL_SRC
        box = (x, y, x + p.w * CELL_SRC, y + p.h * CELL_SRC)
    big = _shrink(sheet(p.sheet).crop(box), (p.w * TILE, p.h * TILE))
    return [
        big.crop((i * TILE, j * TILE, (i + 1) * TILE, (j + 1) * TILE))
        for j in range(p.h)
        for i in range(p.w)
    ]


def cell_tile(name: str, row: int, col: int) -> Image.Image:
    return piece_tiles(L.Piece(name, row, col))[0]


# -------------------------------------------------------------- layout
class Plan:
    """What a map holds, before it is written."""

    def __init__(self, name: str) -> None:
        self.name = name
        self.ground: dict[tuple[int, int], tuple[str, int, int]] = {}
        self.objects: list[tuple[int, int, L.Piece]] = []
        self.blocked: set[tuple[int, int]] = set()
        self.spawn = (0, 0)
        self.exits: dict[str, tuple[int, int]] = {}  # name -> tile
        self.wild: tuple[int, int, int, int] | None = None
        self.spots: list[tuple[int, int]] = []
        self.npcs: list[tuple[str, str]] = []

    def place(self, x: int, y: int, piece: L.Piece) -> None:
        self.objects.append((x, y, piece))
        if piece.solid:
            for j in range(piece.h):
                for i in range(piece.w):
                    self.blocked.add((x + i, y + j))

    def walkable(self) -> set[tuple[int, int]]:
        return {
            (x, y)
            for y in range(L.HEIGHT)
            for x in range(L.WIDTH)
            if (x, y) not in self.blocked
        }


def reach(plan: Plan, start: tuple[int, int]) -> set[tuple[int, int]]:
    free = plan.walkable()
    seen, todo = {start}, deque([start])
    while todo:
        x, y = todo.popleft()
        for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if n in free and n not in seen:
                seen.add(n)
                todo.append(n)
    return seen


def key_cells(plan: Plan) -> list[tuple[int, int]]:
    x0, y0, x1, y1 = plan.wild or (0, 0, 0, 0)
    wild = [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
    return [
        plan.spawn,
        *plan.exits.values(),
        *plan.spots,
        *(wild if plan.wild else []),
    ]


def zone_plan(zone: L.Zone) -> Plan:
    plan = Plan(f"solar_{zone.name}")
    plan.spawn, plan.wild, plan.spots, plan.npcs = (
        L.SPAWN,
        L.WILD,
        list(L.SPOTS[: len(zone.npcs)]),
        list(zone.npcs),
    )
    plan.exits["exit"] = L.EXIT
    kind = {(x, y): "." for y in range(L.HEIGHT) for x in range(L.WIDTH)}
    pieces: dict[tuple[int, int], L.Piece] = {}
    for op in zone.ops:
        if op[0] == "fill":
            _, ch, x0, y0, x1, y1 = op
            for y in range(y0, y1 + 1):
                for x in range(x0, x1 + 1):
                    kind[(x, y)] = ch
        else:
            _, ch, x, y = op
            pieces[(x, y)] = zone.pieces[ch]
    rng = random.Random(zone.seed)
    for pos, ch in kind.items():
        cells = zone.kinds.get(ch, zone.ground)
        plan.ground[pos] = cells[rng.randrange(len(cells))]
    protected = set()
    for x, y in [*key_cells(plan), (L.SHIP[0], L.SHIP[1])]:
        protected |= {
            (x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)
        }
    protected |= {
        (L.SHIP[0] + i, L.SHIP[1] + j)
        for i in range(-1, 4)
        for j in range(-1, 5)
    }
    for x in range(L.WIDTH):
        for y in range(L.HEIGHT):
            if x in (0, L.WIDTH - 1) or y in (0, L.HEIGHT - 1):
                plan.place(x, y, zone.border[(x + y) % len(zone.border)])
    plan.place(*L.SHIP, L.SHIP_PIECE)
    for (x, y), piece in pieces.items():
        plan.place(x, y, piece)
    for _ in range(40):  # scatter, until everything key stays connected
        trial = Plan(plan.name)
        trial.__dict__.update(
            {
                k: (v.copy() if hasattr(v, "copy") else v)
                for k, v in plan.__dict__.items()
            }
        )
        trial.objects = list(plan.objects)
        for _ in range(26):
            x, y = (
                rng.randrange(1, L.WIDTH - 1),
                rng.randrange(1, L.HEIGHT - 1),
            )
            piece = (zone.rocks + zone.decor)[
                rng.randrange(len(zone.rocks + zone.decor))
            ]
            cells = {
                (x + i, y + j) for i in range(piece.w) for j in range(piece.h)
            }
            if cells & (protected | trial.blocked) or (x, y) in trial.blocked:
                continue
            trial.place(x, y, piece)
        if set(key_cells(trial)) <= reach(trial, trial.spawn):
            return trial
    raise ValueError(f"{zone.name}: no connected scatter")


def station_plan() -> Plan:
    plan = Plan("solar_station")
    floor = [("station", 1, c) for c in (1, 2, 3, 4)]
    rng = random.Random(17)
    for y in range(L.HEIGHT):
        for x in range(L.WIDTH):
            plan.ground[(x, y)] = floor[rng.randrange(4)]
    wall = L.Piece("station", 2, 1, 1, 2)
    window = L.Piece("station", 2, 4)
    doorway = L.Piece("station", 4, 1, solid=False)
    corner = L.Piece("station", 2, 3, 1, 2)
    for x in range(L.WIDTH):
        if x in L.DOORS.values():
            plan.place(x, 0, window)
            plan.objects.append((x, 1, doorway))
        else:
            plan.place(x, 0, corner if x in (0, L.WIDTH - 1) else wall)
        plan.place(x, 18, wall)
    for y in range(2, 18, 2):
        plan.place(0, y, wall)
        plan.place(L.WIDTH - 1, y, wall)
    # the walls are two tiles tall: the second row is the same piece
    for x in range(L.WIDTH):
        plan.blocked |= {(x, 1)} - (
            {(x, 1)} if x in L.DOORS.values() else set()
        )
        plan.blocked.add((x, 19))
    plan.place(22, 5, L.Piece("station", 4, 3, 2, 2))
    plan.place(20, 4, L.Piece("station", 4, 2))
    plan.place(13, 14, L.SHIP_PIECE)
    plan.spawn = L.STATION_SPAWN
    plan.wild = None
    plan.spots = list(L.STATION_SPOTS)
    plan.npcs = list(L.STATION_NPCS)
    for zone, x in L.DOORS.items():
        plan.exits[zone] = (x, 1)
    if not set(key_cells(plan)) <= reach(plan, plan.spawn):
        raise ValueError("station: not connected")
    return plan


# -------------------------------------------------------------- output
def _script(conditions, actions, behaviors=()) -> dict[str, Any]:
    return {
        "kind": "event",
        "source": "nagmon",
        "priority": 0,
        "timeout": None,
        "delay": None,
        "conditions": [
            {"operator": op, "type": t, "args": list(a)}
            for op, t, a in conditions
        ],
        "actions": [
            {"type": t, "args": [str(x) for x in a]} for t, a in actions
        ],
        "behaviors": [{"type": t, "args": list(a)} for t, a in behaviors],
    }


def _event(name: str, box: tuple[int, int, int, int], script: dict) -> tuple:
    x0, y0, x1, y1 = box
    prop = [
        {
            "name": "script",
            "type": "class",
            "propertytype": "NagmonEvent",
            "value": script,
        }
    ]
    return (
        name,
        SimpleNamespace(x=x0, y=y0, width=x1 - x0 + 1, height=y1 - y0 + 1),
        prop,
    )


def events(plan: Plan, info: dict[str, Any]) -> list[tuple]:
    out = []
    here = [("is", "char_at", ["player"])]
    for key, (x, y) in plan.exits.items():
        target = info["targets"][key]
        out.append(
            _event(
                f"Go to {key}",
                (x, y, x, y),
                _script(
                    here,
                    [
                        (
                            "transition_teleport",
                            [
                                "player",
                                f"{target['map']}.tmx",
                                *target["tile"],
                                "0.3",
                            ],
                        ),
                    ],
                ),
            )
        )
    if plan.wild:
        out.append(
            _event(
                "Wild Animals",
                plan.wild,
                _script(
                    [*here, ("is", "char_moved", ["player"])],
                    [("random_encounter", [info["encounter"], "11"])],
                ),
            )
        )
    key = info["zone"]
    for (slug, face), (x, y) in zip(plan.npcs, plan.spots):
        out.append(
            _event(
                f"Create {slug}",
                (0, 0, 0, 0),
                _script(
                    [("not", "char_exists", [slug])],
                    [
                        ("create_npc", [slug, x, y]),
                        ("char_face", [slug, face]),
                    ],
                ),
            )
        )
        out.append(
            _event(
                f"Talk {slug}",
                (0, 0, 0, 0),
                _script(
                    [],
                    [("translated_dialog", [L.dialog_id(key, slug)])],
                    [("talk", [slug])],
                ),
            )
        )
    return out


def markers(plan: Plan, start: int) -> list[dict[str, Any]]:
    objs, oid = [], start

    def add(name: str, x0: int, y0: int, x1: int, y1: int) -> None:
        nonlocal oid
        objs.append(
            {
                "id": oid,
                "name": name,
                "type": "marker",
                "x": x0 * TILE,
                "y": y0 * TILE,
                "width": (x1 - x0 + 1) * TILE,
                "height": (y1 - y0 + 1) * TILE,
                "rotation": 0,
                "visible": True,
                "properties": [],
            }
        )
        oid += 1

    add("spawn", *plan.spawn, *plan.spawn)
    for name, (x, y) in plan.exits.items():
        add(name if name == "exit" else f"door:{name}", x, y, x, y)
    if plan.wild:
        add("wild", *plan.wild)
    for (slug, _), (x, y) in zip(plan.npcs, plan.spots):
        add(f"npc:{slug}", x, y, x, y)
    return objs


def build_map(plan: Plan, info: dict[str, Any], out: Output) -> dict[str, Any]:
    # tiles: every ground cell and every tile of every piece
    images: dict[tuple[str, int], Image.Image] = {}

    def ground_ref(cell: tuple[str, int, int]) -> tuple[str, int]:
        name, r, c = cell
        key = (name, (r - 1) * 4 + c - 1)
        if key not in images:
            images[key] = cell_tile(name, r, c)
        return key

    def piece_refs(p: L.Piece) -> list[tuple[str, int]]:
        name = f"{p.sheet}:{p.row}:{p.col}:{p.w}x{p.h}"
        keys = [(name, i) for i in range(p.w * p.h)]
        if keys[0] not in images:
            for k, img in zip(keys, piece_tiles(p)):
                images[k] = img
        return keys

    ground = {pos: ground_ref(c) for pos, c in plan.ground.items()}
    above: dict[tuple[int, int], tuple[str, int]] = {}
    for x, y, p in plan.objects:
        for n, key in enumerate(piece_refs(p)):
            above[(x + n % p.w, y + n // p.w)] = key
    used = sorted(set(ground.values()) | set(above.values()))
    tiles = [(SimpleNamespace(name=n), i) for n, i in used]
    atlas = maps.plan_atlas(plan.name, tiles)

    def gid(key: tuple[str, int] | None) -> int:
        return 0 if key is None else 1 + atlas.index[key]

    def layer(lid: int, name: str, cells: dict) -> dict[str, Any]:
        return {
            "id": lid,
            "name": name,
            "type": "tilelayer",
            "x": 0,
            "y": 0,
            "width": L.WIDTH,
            "height": L.HEIGHT,
            "opacity": 1,
            "visible": True,
            "data": [
                gid(cells.get((x, y)))
                for y in range(L.HEIGHT)
                for x in range(L.WIDTH)
            ],
        }

    layers = [layer(1, "Ground", ground), layer(2, "Objects", above)]
    evs = events(plan, info)
    oid = 1
    event_objects = []
    for name, box, props in evs:
        event_objects.append(maps._object(oid, name, box, props))
        oid += 1
    marker_objects = markers(plan, oid)
    oid += len(marker_objects)
    for lid, name, objects in (
        (3, "events", event_objects),
        (4, "blocked_exits", []),
        (5, "markers", marker_objects),
    ):
        layers.append(
            {
                "id": lid,
                "name": name,
                "type": "objectgroup",
                "draworder": "index",
                "x": 0,
                "y": 0,
                "opacity": 1,
                "visible": False,
                "objects": objects,
            }
        )
    rows = [
        "".join("#" if (x, y) in plan.blocked else "." for x in range(L.WIDTH))
        for y in range(L.HEIGHT)
    ]
    w, h = atlas.size
    sources = sorted(
        {rel_repo(SHEETS / SHEET_FILES[n.split(":")[0]]) for n, _ in used}
    )
    doc = {
        "type": "map",
        "version": "1.10",
        "tiledversion": "1.10.2",
        "orientation": "orthogonal",
        "renderorder": "right-down",
        "infinite": False,
        "compressionlevel": -1,
        "width": L.WIDTH,
        "height": L.HEIGHT,
        "tilewidth": TILE,
        "tileheight": TILE,
        "nextlayerid": 6,
        "nextobjectid": oid,
        "properties": [
            {"name": "edges", "type": "string", "value": "clamped"},
            {"name": "map_type", "type": "string", "value": "solar"},
            {"name": "slug", "type": "string", "value": plan.name},
            {
                "name": "nagmon_source",
                "type": "string",
                "value": "tools/app/solar_layouts.py",
            },
            {
                "name": "nagmon_script",
                "type": "string",
                "value": rel_repo(TRIP),
            },
            {"name": "source_tile_size", "type": "int", "value": 16},
            {
                "name": "collision",
                "type": "class",
                "propertytype": "NagmonCollision",
                "value": {"rows": rows, "regions": {}, "lines": []},
            },
            {
                "name": "surface",
                "type": "class",
                "propertytype": "NagmonSurface",
                "value": {},
            },
        ],
        "layers": layers,
        "tilesets": [
            {
                "firstgid": 1,
                "name": "atlas",
                "image": f"../atlas/{plan.name}.png",
                "imagewidth": w,
                "imageheight": h,
                "tilewidth": TILE,
                "tileheight": TILE,
                "margin": maps.EXTRUDE,
                "spacing": 2 * maps.EXTRUDE,
                "columns": atlas.columns,
                "tilecount": len(atlas.index),
            }
        ],
    }
    out.add_image(
        f"atlas/{plan.name}.png",
        maps.draw_atlas(atlas, tiles, images),
        [SHEETS / SHEET_FILES[n.split(":")[0]] for n, _ in used][:1],
        "tileset",
    )
    out.add_json(
        f"atlas/{plan.name}.json",
        maps.atlas_json(SimpleNamespace(name=plan.name), atlas),
    )
    out.add_json(f"maps/{plan.name}.json", doc, compact=True)
    out.assets[f"maps/{plan.name}.json"] = _asset(plan.name, sources)
    return {
        "scripts": [p[0]["value"] for _, _, p in evs],
        "tiles": len(atlas.index),
        "animated": 0,
        "atlas": f"{w}x{h}",
        "events": len(event_objects),
        "blocked_exits": [],
        "replaced": [],
        "flipped_tiles": 0,
    }


def _asset(name: str, sources: list[str]):
    from tools.app.common import Asset

    return Asset(f"maps/{name}.json", [*sources, rel_repo(TRIP)], "map")


def targets(table: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Per map: where each of its exits leads (map, tile)."""
    zones = {z["id"]: z for z in table["zones"]}
    out: dict[str, dict[str, Any]] = {}
    for zid, zone in zones.items():
        door = L.DOORS[zid]
        out[zone["map"]] = {
            "exit": {"map": table["station"]["map"], "tile": [door, 2]}
        }
    out[table["station"]["map"]] = {
        zid: {"map": zone["map"], "tile": list(L.SPAWN)}
        for zid, zone in zones.items()
    }
    return out


def plans() -> dict[str, Plan]:
    found = {f"solar_{n}": zone_plan(z) for n, z in L.ZONES.items()}
    found["solar_station"] = station_plan()
    return found


def build(out: Output) -> dict[str, Any]:
    table = trip()
    tg = targets(table)
    ids = {z["map"]: z for z in table["zones"]}
    summaries = {}
    for name, plan in plans().items():
        zone = ids.get(name)
        info = {
            "targets": tg[name],
            "zone": zone["id"] if zone else "station",
            "encounter": zone["encounter"] if zone else None,
        }
        summaries[name] = build_map(plan, info, out)
    return summaries
