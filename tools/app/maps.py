# SPDX-License-Identifier: GPL-3.0
"""Maps: Tuxemon TMX + Nagmon YAML scripts -> Tiled JSON + a tile atlas.

For each map of the Nagmon world (:data:`WORLD_MAPS`):

* ``maps/<name>.json``: a Tiled JSON map (orientation, tile layers, one
  embedded tileset: the map's atlas). Tiles are 64 px, the size of the
  HD (xBRZ x4) tilesets in ``mods/nagmon/gfx/tilesets``.
* ``atlas/<name>.png`` and ``atlas/<name>.json``: only the tiles the map
  draws, plus the frames of its animated tiles, each with a 2 px border
  copied from its own edge (no seams when the camera zooms). The layout
  is a Tiled image tileset with ``margin`` 2 and ``spacing`` 4.

Events and collisions come from the old game's own loaders
(``tuxemon.map.loader``): the TMX events and the script events merged
the way ``MapLoader.process_and_merge_events`` merges them (a script
event with ``replaces:`` takes the place of the TMX event), and the
collision map the game builds from the "Collisions" objects, the
tilesets' tile properties and the script's ``collisions:``.

The events go into an object layer ``events``: one object per event,
its box in pixels, and one ``script`` property (Tiled "class" value)
the TS interpreter reads::

    {"kind": "event" | "init", "source": "tmx" | "nagmon",
     "priority": 0, "timeout": null, "delay": null,
     "conditions": [{"operator": "is", "type": "char_at",
                     "args": ["player"]}],
     "actions": [{"type": "play_music", "args": ["music_town_theme"]}],
     "behaviors": [{"type": "talk", "args": ["nagmon_cashier"]}]}

Exits to maps outside the world (route 8, Steamshore) are not events:
they move to an object layer ``blocked_exits`` and their tiles become
walls in the collision grid.
"""

from __future__ import annotations

import base64
import math
import struct
import xml.etree.ElementTree as ET
import zlib
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from PIL import Image

from tools.app.common import NAG, TUX, WORLD_MAPS, Output

SRC_TILE = 16
HD_SCALE = 4
TILE = SRC_TILE * HD_SCALE
EXTRUDE = 2
CELL = TILE + 2 * EXTRUDE
MAX_TEXTURE = 4096
FLIP_MASK = 0xE0000000
GID_MASK = 0x1FFFFFFF
#: Actions that move the player to another map: (action, map arg index).
TELEPORTS = {"transition_teleport": 1, "teleport": 1, "change_map": 0}


@dataclass
class Tileset:
    name: str
    tsx: Path
    columns: int
    tilecount: int
    image: Path
    #: local id -> [(local frame id, duration ms)]
    animations: dict[int, list[tuple[int, int]]]

    @property
    def hd_image(self) -> Path:
        return NAG / "gfx" / "tilesets" / self.image.name


@dataclass
class TileLayer:
    id: int
    name: str
    width: int
    height: int
    data: list[int]
    visible: bool
    opacity: float


@dataclass
class TmxMap:
    name: str
    path: Path
    width: int
    height: int
    properties: list[dict[str, Any]]
    tilesets: list[tuple[int, Tileset]]
    layers: list[TileLayer]

    def resolve(self, gid: int) -> tuple[Tileset, int]:
        """The tileset and local tile id of a raw gid (flags removed)."""
        gid &= GID_MASK
        for firstgid, ts in reversed(self.tilesets):
            if gid >= firstgid:
                local = gid - firstgid
                if local >= ts.tilecount:
                    raise ValueError(f"{self.name}: gid {gid} out of range")
                return ts, local
        raise ValueError(f"{self.name}: gid {gid} has no tileset")


@dataclass
class Atlas:
    name: str
    #: (tileset name, local id) -> atlas index
    index: dict[tuple[str, int], int] = field(default_factory=dict)
    columns: int = 1
    rows: int = 1

    @property
    def size(self) -> tuple[int, int]:
        return self.columns * CELL, self.rows * CELL

    def position(self, i: int) -> tuple[int, int]:
        return (
            EXTRUDE + (i % self.columns) * CELL,
            EXTRUDE + (i // self.columns) * CELL,
        )


# ------------------------------------------------------------- TMX/TSX
_TSX_CACHE: dict[Path, Tileset] = {}


def load_tsx(path: Path) -> Tileset:
    path = path.resolve()
    if path in _TSX_CACHE:
        return _TSX_CACHE[path]
    root = ET.parse(path).getroot()
    if int(root.get("margin", 0)) or int(root.get("spacing", 0)):
        raise ValueError(f"{path}: margin/spacing are not supported")
    if int(root.get("tilewidth", 0)) != SRC_TILE:
        raise ValueError(f"{path}: tiles are not {SRC_TILE} px")
    image = root.find("image")
    if image is None:
        raise ValueError(f"{path}: not an image tileset")
    animations: dict[int, list[tuple[int, int]]] = {}
    for tile in root.findall("tile"):
        anim = tile.find("animation")
        if anim is not None:
            animations[int(tile.get("id", 0))] = [
                (int(f.get("tileid", 0)), int(f.get("duration", 0)))
                for f in anim.findall("frame")
            ]
    ts = Tileset(
        name=str(root.get("name")),
        tsx=path,
        columns=int(root.get("columns", 0)),
        tilecount=int(root.get("tilecount", 0)),
        image=(path.parent / str(image.get("source"))).resolve(),
        animations=animations,
    )
    _TSX_CACHE[path] = ts
    return ts


def _property(el: ET.Element) -> dict[str, Any]:
    kind = el.get("type", "string")
    raw = el.get("value", el.text or "")
    value: Any = raw
    if kind == "bool":
        value = raw == "true"
    elif kind == "int":
        value = int(raw)
    elif kind == "float":
        value = float(raw)
    return {"name": el.get("name"), "type": kind, "value": value}


def _layer_data(layer: ET.Element, width: int, height: int) -> list[int]:
    data = layer.find("data")
    if data is None:
        raise ValueError("layer without data")
    encoding = data.get("encoding")
    compression = data.get("compression")
    text = (data.text or "").strip()
    if encoding == "csv":
        gids = [int(v) for v in text.replace("\n", "").split(",") if v]
    elif encoding == "base64":
        raw = base64.b64decode(text)
        if compression == "zlib" or compression == "gzip":
            raw = zlib.decompress(
                raw, 15 + (16 if compression == "gzip" else 0)
            )
        elif compression:
            raise ValueError(f"compression {compression} is not supported")
        gids = list(struct.unpack(f"<{len(raw) // 4}I", raw))
    else:
        raise ValueError(f"encoding {encoding} is not supported")
    if len(gids) != width * height:
        raise ValueError("layer size does not match the map")
    return gids


def load_tmx(name: str) -> TmxMap:
    path = TUX / "maps" / f"{name}.tmx"
    root = ET.parse(path).getroot()
    if root.get("orientation") != "orthogonal":
        raise ValueError(f"{name}: only orthogonal maps are supported")
    if int(root.get("tilewidth", 0)) != SRC_TILE:
        raise ValueError(f"{name}: tiles are not {SRC_TILE} px")
    width, height = int(root.get("width", 0)), int(root.get("height", 0))
    props_el = root.find("properties")
    properties = (
        [_property(p) for p in props_el.findall("property")]
        if props_el is not None
        else []
    )
    tilesets = []
    for ts_el in root.findall("tileset"):
        source = ts_el.get("source")
        if not source:
            raise ValueError(f"{name}: embedded TMX tilesets not supported")
        tilesets.append(
            (int(ts_el.get("firstgid", 1)), load_tsx(path.parent / source))
        )
    layers = []
    for el in root.findall("layer"):
        w, h = int(el.get("width", width)), int(el.get("height", height))
        layers.append(
            TileLayer(
                id=int(el.get("id", 0)),
                name=str(el.get("name")),
                width=w,
                height=h,
                data=_layer_data(el, w, h),
                visible=el.get("visible", "1") != "0",
                opacity=float(el.get("opacity", 1)),
            )
        )
    if root.findall("group") or root.findall("imagelayer"):
        raise ValueError(f"{name}: group/image layers are not supported")
    return TmxMap(name, path, width, height, properties, tilesets, layers)


# --------------------------------------------------------------- atlas
def used_tiles(tmx: TmxMap) -> list[tuple[Tileset, int]]:
    """Every tile the map draws, plus its animation frames, in order."""
    found: dict[tuple[str, int], tuple[Tileset, int]] = {}
    pending: list[tuple[Tileset, int]] = []
    for layer in tmx.layers:
        for gid in layer.data:
            if gid & GID_MASK:
                pending.append(tmx.resolve(gid))
    while pending:
        ts, local = pending.pop()
        key = (ts.name, local)
        if key in found:
            continue
        found[key] = (ts, local)
        for frame, _ in ts.animations.get(local, []):
            pending.append((ts, frame))
    order = {ts.name: i for i, (_, ts) in enumerate(tmx.tilesets)}
    return sorted(found.values(), key=lambda t: (order[t[0].name], t[1]))


def plan_atlas(name: str, tiles: list[tuple[Tileset, int]]) -> Atlas:
    count = max(1, len(tiles))
    columns = min(MAX_TEXTURE // CELL, max(1, math.ceil(math.sqrt(count))))
    rows = math.ceil(count / columns)
    atlas = Atlas(name=name, columns=columns, rows=rows)
    if rows * CELL > MAX_TEXTURE:
        raise ValueError(f"{name}: {count} tiles do not fit a 4096 atlas")
    for i, (ts, local) in enumerate(tiles):
        atlas.index[(ts.name, local)] = i
    return atlas


def crop_tiles(
    wanted: Iterable[tuple[Tileset, int]], notes: list[str]
) -> dict[tuple[str, int], Image.Image]:
    """The HD 64 px image of each tile, opening each sheet once."""
    by_sheet: dict[str, tuple[Tileset, set[int]]] = {}
    for ts, local in wanted:
        by_sheet.setdefault(ts.name, (ts, set()))[1].add(local)
    tiles: dict[tuple[str, int], Image.Image] = {}
    for ts_name in sorted(by_sheet):
        ts, locals_ = by_sheet[ts_name]
        with Image.open(ts.image) as small:
            small_size = small.size
        hd_path = ts.hd_image
        if hd_path.is_file():
            sheet = Image.open(hd_path)
            if sheet.size != (
                small_size[0] * HD_SCALE,
                small_size[1] * HD_SCALE,
            ):
                raise ValueError(f"{hd_path}: not {HD_SCALE}x {ts.image}")
            sheet = sheet.convert("RGBA")
            scale = 1
        else:
            notes.append(f"{ts.name}: no HD sheet, original scaled x4")
            sheet = Image.open(ts.image).convert("RGBA")
            scale = HD_SCALE
        step = TILE // scale
        for local in sorted(locals_):
            x, y = (local % ts.columns) * step, (local // ts.columns) * step
            tile = sheet.crop((x, y, x + step, y + step))
            if scale != 1:
                tile = tile.resize((TILE, TILE), Image.Resampling.NEAREST)
            tiles[(ts.name, local)] = tile
        sheet.close()
    return tiles


def _extruded(tile: Image.Image) -> Image.Image:
    e, t = EXTRUDE, TILE
    cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    cell.paste(tile, (e, e))
    near = Image.Resampling.NEAREST
    cell.paste(tile.crop((0, 0, t, 1)).resize((t, e), near), (e, 0))
    cell.paste(tile.crop((0, t - 1, t, t)).resize((t, e), near), (e, e + t))
    cell.paste(tile.crop((0, 0, 1, t)).resize((e, t), near), (0, e))
    cell.paste(tile.crop((t - 1, 0, t, t)).resize((e, t), near), (e + t, e))
    corners = {
        (0, 0): (0, 0),
        (e + t, 0): (t - 1, 0),
        (0, e + t): (0, t - 1),
        (e + t, e + t): (t - 1, t - 1),
    }
    for (cx, cy), src in corners.items():
        cell.paste(tile.getpixel(src), (cx, cy, cx + e, cy + e))
    return cell


def draw_atlas(
    atlas: Atlas,
    tiles: list[tuple[Tileset, int]],
    images: dict[tuple[str, int], Image.Image],
) -> Image.Image:
    sheet = Image.new("RGBA", atlas.size, (0, 0, 0, 0))
    for ts, local in tiles:
        x, y = atlas.position(atlas.index[(ts.name, local)])
        sheet.paste(
            _extruded(images[(ts.name, local)]), (x - EXTRUDE, y - EXTRUDE)
        )
    return sheet


# -------------------------------------------------------------- events
def _rule(rule: Any) -> dict[str, Any]:
    return {"type": rule.type, "args": [str(a) for a in rule.parameters]}


def event_script(event: Any, kind: str, source: str) -> dict[str, Any]:
    return {
        "kind": kind,
        "source": source,
        "priority": event.priority,
        "timeout": event.timeout,
        "delay": event.delay,
        "conditions": [
            {
                "operator": getattr(c.operator, "value", str(c.operator)),
                "type": c.type,
                "args": [str(a) for a in c.parameters],
            }
            for c in event.conds
        ],
        "actions": [_rule(a) for a in event.acts],
        "behaviors": [
            {"type": b.type, "args": [str(a) for a in b.args]}
            for b in event.behavs
        ],
    }


def leaves_world(script: dict[str, Any]) -> str | None:
    """The map outside the world an event teleports to, if any."""
    for action in script["actions"]:
        index = TELEPORTS.get(action["type"])
        if index is None or len(action["args"]) <= index:
            continue
        target = Path(action["args"][index]).stem
        if target not in WORLD_MAPS:
            return target
    return None


def load_scripts(name: str, tmx_path: Path) -> dict[str, Any]:
    """Events, inits and collisions as the old game merges them."""
    import pytmx

    from tuxemon.map.loader import TMXMapLoader, YAMLEventLoader

    data = pytmx.TiledMap(str(tmx_path))
    loader = TMXMapLoader()
    size = (SRC_TILE, SRC_TILE)
    collision, lines = loader.load_collision_data(data, size)
    surface = loader.load_surface_data(data)
    tmx_events, tmx_inits = loader.load_events_and_inits(data, size)

    yaml_path = NAG / "maps" / f"{name}.yaml"
    yaml_loader = YAMLEventLoader()
    yaml_events: list[Any] = []
    yaml_inits: list[Any] = []
    replaced: set[str] = set()
    if yaml_path.is_file():
        collision.update(yaml_loader.load_collision(yaml_path))
        yaml_events = yaml_loader.load_events(yaml_path, "event")["event"]
        replaced |= yaml_loader.replaced
        yaml_inits = yaml_loader.load_events(yaml_path, "init")["init"]
        replaced |= yaml_loader.replaced
    unmatched = replaced - {e.name for e in tmx_events + tmx_inits}
    if unmatched:
        raise ValueError(f"{name}: replaces unknown events {unmatched}")
    entries = (
        [(e, "event", "tmx") for e in tmx_events if e.name not in replaced]
        + [(e, "init", "tmx") for e in tmx_inits if e.name not in replaced]
        + [(e, "event", "nagmon") for e in yaml_events]
        + [(e, "init", "nagmon") for e in yaml_inits]
    )
    return {
        "events": entries,
        "collision": collision,
        "lines": lines,
        "surface": surface,
        "replaced": sorted(replaced),
        "script": yaml_path if yaml_path.is_file() else None,
    }


def _region(props: Any) -> dict[str, Any]:
    def dirs(values: Iterable[Any]) -> list[str]:
        return [getattr(d, "value", str(d)) for d in values]

    push = props.push_effect
    return {
        "enter_from": dirs(props.enter_from),
        "exit_from": dirs(props.exit_from),
        "endure": dirs(props.endure),
        "key": props.key,
        "hop": bool(props.hop),
        "speed_modifier": props.speed_modifier,
        "push": (
            None
            if push is None
            else {
                "direction": getattr(push.direction, "value", None),
                "strength": push.strength,
            }
        ),
    }


def collision_value(
    tmx: TmxMap,
    collision: dict[tuple[int, int], Any],
    lines: Iterable[tuple[tuple[int, int], Any]],
    walls: set[tuple[int, int]],
) -> dict[str, Any]:
    """
    The collision grid. ``rows[y][x]`` is ``.`` (free), ``#`` (a wall:
    no entry from any side) or ``r`` (a region: see ``regions["x,y"]``,
    entry only from ``enter_from``, as in ``tuxemon/movement.py``).
    ``lines`` block the step from ``[x, y]`` in ``direction``.
    """
    grid = [["."] * tmx.width for _ in range(tmx.height)]
    regions: dict[str, Any] = {}
    for (x, y), props in sorted(collision.items()):
        if not (0 <= x < tmx.width and 0 <= y < tmx.height):
            continue
        if props is None:
            grid[y][x] = "#"
        else:
            grid[y][x] = "r"
            regions[f"{x},{y}"] = _region(props)
    for x, y in sorted(walls):
        grid[y][x] = "#"
        regions.pop(f"{x},{y}", None)
    return {
        "rows": ["".join(row) for row in grid],
        "regions": regions,
        "lines": sorted(
            [x, y, getattr(d, "value", str(d))] for (x, y), d in lines
        ),
    }


# ----------------------------------------------------------------- map
def _object(oid: int, name: str, box: Any, props: list[dict[str, Any]]):
    return {
        "id": oid,
        "name": name,
        "type": "event",
        "x": box.x * TILE,
        "y": box.y * TILE,
        "width": box.width * TILE,
        "height": box.height * TILE,
        "rotation": 0,
        "visible": True,
        "properties": props,
    }


def convert(
    tmx: TmxMap,
    atlas: Atlas,
    scripts: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """The Tiled JSON map and a summary for the report/tests."""
    layers: list[dict[str, Any]] = []
    flipped = 0
    for layer in tmx.layers:
        data = []
        for gid in layer.data:
            if not gid & GID_MASK:
                data.append(0)
                continue
            ts, local = tmx.resolve(gid)
            flags = gid & FLIP_MASK
            flipped += bool(flags)
            data.append((1 + atlas.index[(ts.name, local)]) | flags)
        layers.append(
            {
                "id": layer.id,
                "name": layer.name,
                "type": "tilelayer",
                "x": 0,
                "y": 0,
                "width": layer.width,
                "height": layer.height,
                "opacity": layer.opacity,
                "visible": layer.visible,
                "data": data,
            }
        )
    next_layer = max(lay.id for lay in tmx.layers) + 1

    events, blocked = [], []
    walls: set[tuple[int, int]] = set()
    action_names: set[str] = set()
    condition_names: set[str] = set()
    for event, kind, source in scripts["events"]:
        script = event_script(event, kind, source)
        prop = {
            "name": "script",
            "type": "class",
            "propertytype": "NagmonEvent",
            "value": script,
        }
        target = leaves_world(script)
        if target is not None:
            box = event.box
            for x in range(box.x, box.x + box.width):
                for y in range(box.y, box.y + box.height):
                    walls.add((x, y))
            reason = {
                "name": "blocked_reason",
                "type": "string",
                "value": f"leads to {target}, outside the Nagmon world",
            }
            blocked.append((event, [prop, reason]))
            continue
        events.append((event, [prop]))
        action_names |= {a["type"] for a in script["actions"]}
        action_names |= {b["type"] for b in script["behaviors"]}
        condition_names |= {c["type"] for c in script["conditions"]}

    oid = 1
    event_objects = []
    for event, props in events:
        event_objects.append(_object(oid, event.name, event.box, props))
        oid += 1
    blocked_objects = []
    for event, props in blocked:
        blocked_objects.append(_object(oid, event.name, event.box, props))
        oid += 1
    for name, objects in (
        ("events", event_objects),
        ("blocked_exits", blocked_objects),
    ):
        layers.append(
            {
                "id": next_layer,
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
        next_layer += 1

    collision = collision_value(
        tmx, scripts["collision"], scripts["lines"], walls
    )
    surface = {
        f"{x},{y}": dict(sorted(v.items()))
        for (x, y), v in sorted(scripts["surface"].items())
    }
    properties = [
        *tmx.properties,
        {"name": "nagmon_source", "type": "string", "value": _rel(tmx.path)},
        {
            "name": "nagmon_script",
            "type": "string",
            "value": _rel(scripts["script"]) if scripts["script"] else "",
        },
        {"name": "source_tile_size", "type": "int", "value": SRC_TILE},
        {
            "name": "collision",
            "type": "class",
            "propertytype": "NagmonCollision",
            "value": collision,
        },
        {
            "name": "surface",
            "type": "class",
            "propertytype": "NagmonSurface",
            "value": surface,
        },
    ]
    width, height = atlas.size
    tileset = {
        "firstgid": 1,
        "name": "atlas",
        "image": f"../atlas/{tmx.name}.png",
        "imagewidth": width,
        "imageheight": height,
        "tilewidth": TILE,
        "tileheight": TILE,
        "margin": EXTRUDE,
        "spacing": 2 * EXTRUDE,
        "columns": atlas.columns,
        "tilecount": len(atlas.index),
    }
    anims = []
    by_index = {i: key for key, i in atlas.index.items()}
    sets = {ts.name: ts for _, ts in tmx.tilesets}
    for i in sorted(by_index):
        ts_name, local = by_index[i]
        frames = sets[ts_name].animations.get(local)
        if frames:
            anims.append(
                {
                    "id": i,
                    "animation": [
                        {
                            "tileid": atlas.index[(ts_name, f)],
                            "duration": d,
                        }
                        for f, d in frames
                    ],
                }
            )
    if anims:
        tileset["tiles"] = anims
    doc = {
        "type": "map",
        "version": "1.10",
        "tiledversion": "1.10.2",
        "orientation": "orthogonal",
        "renderorder": "right-down",
        "infinite": False,
        "compressionlevel": -1,
        "width": tmx.width,
        "height": tmx.height,
        "tilewidth": TILE,
        "tileheight": TILE,
        "nextlayerid": next_layer,
        "nextobjectid": oid,
        "properties": properties,
        "layers": layers,
        "tilesets": [tileset],
    }
    summary = {
        "scripts": [p[0]["value"] for _, p in events],
        "tiles": len(atlas.index),
        "animated": len(anims),
        "atlas": f"{width}x{height}",
        "events": len(event_objects),
        "blocked_exits": [o["name"] for o in blocked_objects],
        "replaced": scripts["replaced"],
        "flipped_tiles": flipped,
        "actions": sorted(action_names),
        "conditions": sorted(condition_names),
    }
    return doc, summary


def atlas_json(tmx: TmxMap, atlas: Atlas) -> dict[str, Any]:
    width, height = atlas.size
    frames = []
    for (ts_name, local), i in sorted(atlas.index.items(), key=lambda t: t[1]):
        x, y = atlas.position(i)
        frames.append(
            {"index": i, "tileset": ts_name, "tile": local, "x": x, "y": y}
        )
    return {
        "image": f"{tmx.name}.png",
        "imagewidth": width,
        "imageheight": height,
        "tilewidth": TILE,
        "tileheight": TILE,
        "margin": EXTRUDE,
        "spacing": 2 * EXTRUDE,
        "columns": atlas.columns,
        "tilecount": len(atlas.index),
        "frames": frames,
    }


def _rel(path: Path) -> str:
    from tools.app.common import rel_repo

    return rel_repo(path)


def build(out: Output) -> dict[str, Any]:
    tmxs = {name: load_tmx(name) for name in WORLD_MAPS}
    used = {name: used_tiles(tmx) for name, tmx in tmxs.items()}
    images = crop_tiles(
        (t for tiles in used.values() for t in tiles), out.notes
    )
    summaries: dict[str, Any] = {}
    for name, tmx in tmxs.items():
        atlas = plan_atlas(name, used[name])
        scripts = load_scripts(name, tmx.path)
        doc, summary = convert(tmx, atlas, scripts)
        sources = {ts.hd_image for ts, _ in used[name]}
        out.add_image(
            f"atlas/{name}.png",
            draw_atlas(atlas, used[name], images),
            sources,
            "tileset",
        )
        out.add_json(f"atlas/{name}.json", atlas_json(tmx, atlas))
        out.add_json(f"maps/{name}.json", doc, compact=True)
        out.assets[f"maps/{name}.json"] = _map_asset(name, tmx, scripts)
        summaries[name] = summary
    return summaries


def _map_asset(name: str, tmx: TmxMap, scripts: dict[str, Any]):
    from tools.app.common import Asset

    sources = [_rel(tmx.path)]
    if scripts["script"]:
        sources.append(_rel(scripts["script"]))
    return Asset(f"maps/{name}.json", sources, "map")
