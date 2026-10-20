# SPDX-License-Identifier: GPL-3.0
"""Database: the records the Nagmon world uses, with their sprites.

Records are read the way the old game reads them
(``tuxemon.database.loader.load_files``, table by table, ``nagmon``
after ``tuxemon`` so a Nagmon record replaces Tuxemon's of the same
slug). What is kept starts from what the converted map scripts use
(``add_monster``, ``choice_monster``, ``random_encounter``,
``create_npc``, ``add_item``, ``set_environment``, ``set_template``...)
plus every Nagmon record, and follows the references: evolutions,
movesets (techniques), technique/item animations and sounds, element
charts, environment graphics and music.

Paths to pictures in the records are rewritten to the copies under
``sprites/`` (relative to ``app/public/game``). A 1x Tuxemon picture
ships as an HD copy (``tools/app/hd.py``, xBRZ) and every record says
its picture's scale: k pixels of the picture for one pixel of the 1x
art (docs/app/SDD.md §10, "תמונות"):

* monsters: ``sprites`` with the sheet, its ``scale`` (the sheet is
  ``scale`` times the 128x88 layout) and the front/back/menu
  rectangles at that scale;
* map pictures (NPCs, avatars, alternates): ``map``, ``frame`` (one
  frame, in the picture's pixels) and ``scale`` (a character is 16x32 at
  1x); portraits: ``portrait_scale`` (the 128x64 combat layout);
* items: ``sprite_scale``; elements: ``icon_scale`` (24 px at 1x);
* animations: ``frame_x``/``frame_y`` in the picture's pixels,
  ``scale``, ``frames`` and ``columns`` (a long strip is wrapped into
  rows to fit a 4096 texture);
* environments: ``battle_graphics.scale`` for all of its pictures, and
  the island frame size ``island_width``/``island_height``.
"""

from __future__ import annotations

import copy
from collections.abc import Iterable
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from PIL import Image

from tools.app import hd, overlays
from tools.app.common import MOD_ORDER, MODS, Output, mod_file, rel_repo

EXTENSIONS = [".json", ".yaml", ".yml"]
SHEET_LAYOUT = (128, 88)
RECTS = {
    "front": (0, 0, 64, 64),
    "back": (64, 0, 64, 64),
    "menu1": (0, 64, 24, 24),
    "menu2": (24, 64, 24, 24),
}
#: The menu theme: the start and profile screens (not in a map script).
MENU_MUSIC = ("music_main_theme",)
#: Technique animations too scary for young kids -> a gentle one.
GENTLE_ANIMATIONS = {"frighten": "sparks_white"}
#: The avatars a child can pick: the owner's three modest HD heroes. The
#: Tuxemon ones (sleeveless map sheets) are gone; the keys old profiles
#: stored map to a hero.
AVATAR_KEYS = ("boy_blue", "girl_teal", "girl_curly")
AVATAR_LEGACY = {
    "boy_light": "boy_blue",
    "boy_dark": "boy_blue",
    "girl_light": "girl_teal",
    "girl_dark": "girl_curly",
}
AVATAR_FALLBACK = "boy_blue"
#: A character's map sheet: 3 frames across, 4 directions down.
SHEET_COLUMNS, SHEET_ROWS = 3, 4
#: One frame of a 1x character map sheet; a 1x combat sheet's width.
MAP_FRAME = (16, 32)
COMBAT_WIDTH = 128
#: Characters whose combat sheet (battle and dialog portrait) shows
#: another person than their map sheet: the map is canonical, so the app
#: builds their portrait from the map sheet (combat sheet -> map sprite).
#: The old game's files are left as they are.
PORTRAIT_FROM_MAP = {
    "nagmon_shopkeeper": "nagmon_shopkeeper",
    "nagmon_teacher": "nagmon_teacher",
    "nagmon_traveler": "nagmon_tourist",
}
#: Characters whose map and portrait differ on purpose (combat sheet ->
#: why): the coherence guard (tools/app/coherence.py) lets them pass.
COHERENCE_APPROVED = {
    "nagmon_owl": "approved by the parent: the owl with glasses and a "
    "book in battle and dialogs",
}
PORTRAIT_FROM_MAP_NOTE = (
    "Portrait built from the map sprite, so both show the same "
    "character (tools/app/db.py PORTRAIT_FROM_MAP)."
)
#: A 1x item or type icon.
ICON_SIZE = 24
#: Tuxemon's island frame (``BattleGraphicsModel``): two side by side.
ISLAND = (96, 57)

_TABLES: dict[str, dict[str, dict[str, Any]]] = {}


def table(name: str) -> dict[str, dict[str, Any]]:
    """``{slug: record}`` of a table, all mods merged as the game does."""
    if name in _TABLES:
        return _TABLES[name]
    from tuxemon.database.loader import load_files

    config = SimpleNamespace(file_extensions=EXTENSIONS)
    merged: dict[str, dict[str, Any]] = {}
    for mod in MOD_ORDER:
        base = MODS / mod / "db"
        merged.update(load_files(name, base, config))  # type: ignore[arg-type]
    records = {}
    for slug in sorted(merged):
        record = dict(merged[slug])
        paths = record.pop("paths", [])
        record["_source"] = [rel_repo(Path(p)) for p in paths]
        records[slug] = record
    _TABLES[name] = records
    return records


def nagmon_slugs(name: str) -> set[str]:
    return {
        slug
        for slug, rec in table(name).items()
        if any(s.startswith("mods/nagmon/") for s in rec["_source"])
    }


def _args(scripts: Iterable[dict[str, Any]], action: str) -> list[list[str]]:
    return [
        a["args"] for s in scripts for a in s["actions"] if a["type"] == action
    ]


def world_refs(scripts: list[dict[str, Any]]) -> dict[str, set[str]]:
    """Slugs the map scripts refer to, by table."""
    refs: dict[str, set[str]] = {
        k: set()
        for k in (
            "monster",
            "encounter",
            "npc",
            "item",
            "environment",
            "music",
            "animation",
            "sprite",
            "combat_sheet",
            "msgid",
        )
    }
    for args in _args(scripts, "add_monster"):
        refs["monster"].add(args[0])
    for args in _args(scripts, "choice_monster"):
        refs["monster"] |= set(args[0].split(":"))
    for args in _args(scripts, "random_encounter"):
        refs["encounter"].add(args[0])
    for args in _args(scripts, "create_npc"):
        refs["npc"].add(args[0])
    for args in _args(scripts, "add_item"):
        refs["item"].add(args[0])
    for args in _args(scripts, "set_environment"):
        refs["environment"].add(args[0])
    for args in _args(scripts, "play_music"):
        refs["music"].add(args[0])
    for args in _args(scripts, "play_map_animation"):
        refs["animation"].add(args[0])
    for args in _args(scripts, "set_template"):
        refs["sprite"].add(args[1])
        if len(args) > 2:
            refs["combat_sheet"].add(args[2])
    for args in _args(scripts, "translated_dialog"):
        refs["msgid"].add(args[0])
    for args in _args(scripts, "translated_dialog_choice"):
        refs["msgid"] |= set(args[0].split(":"))
    return refs


def evolution_closure(slugs: set[str]) -> set[str]:
    monsters = table("monster")
    found: set[str] = set()
    pending = sorted(slugs)
    while pending:
        slug = pending.pop()
        if slug in found:
            continue
        if slug not in monsters:
            raise KeyError(f"monster {slug} is not in the database")
        found.add(slug)
        for evo in monsters[slug].get("evolutions") or []:
            pending.append(evo["monster_slug"])
    return found


def _strip(record: dict[str, Any]) -> dict[str, Any]:
    return copy.deepcopy(record)


class Sprites:
    """Ships pictures under ``sprites/`` and remembers where they went."""

    def __init__(self, out: Output) -> None:
        self.out = out
        self.missing: list[str] = []
        self.done: dict[str, Any] = {}

    def source(self, rel: str) -> Path | None:
        src = mod_file(rel)
        if src is None:
            self.missing.append(rel)
        return src

    def copy(self, rel: str, target: str, kind: str) -> str | None:
        src = self.source(rel)
        if src is None:
            return None
        dest = f"sprites/{target}"
        if rel in overlays.SHEETS:
            # a repainted sheet (overlays.SHEETS): generated, not copied
            if dest not in self.out.images:
                self.out.add_image(dest, load_art(rel), [src], kind)
                self.out.assets[dest].note = overlays.SHEET_NOTE
            return dest
        self.out.add_copy(dest, src, kind)
        return dest

    def upscaled(
        self,
        rel: str,
        target: str,
        kind: str,
        k: int,
        frames: list[hd.Box] | None = None,
        after: Any = None,
    ) -> Any:
        """
        Ship an HD copy (xBRZ x``k``, frame by frame) of the 1x picture
        ``rel``. ``after(image)`` may rearrange it and returns
        ``(image, extra)``. Returns ``(dest, extra)``. The same picture
        asked for again gives the first answer; another picture (or the
        same one at another scale or framing) under the same name fails.
        """
        dest = f"sprites/{target}"
        key = (rel, k, tuple(frames) if frames else None)
        if dest in self.done:
            first, answer = self.done[dest]
            if first != key:
                raise ValueError(
                    f"{dest}: asked for as {key}, already made as {first}"
                )
            return answer
        src = mod_file(rel)
        assert src is not None
        with Image.open(src) as im:
            image = hd.xbrz(im, k, frames)
        extra = None
        if after is not None:
            image, extra = after(image)
        self.out.add_image(dest, image, [src], kind, adapted=f"xBRZ x{k}")
        self.done[dest] = (key, (dest, extra))
        return dest, extra


def load_art(rel: str) -> Image.Image:
    """The picture at mod path ``rel``, as RGBA, with its repaint."""
    src = mod_file(rel)
    if src is None:
        raise FileNotFoundError(rel)
    with Image.open(src) as im:
        return overlays.sheet(rel, im.convert("RGBA"))


def _size(src: Path) -> tuple[int, int]:
    with Image.open(src) as im:
        return im.size


def monster_sprites(sprites: Sprites, slug: str) -> dict[str, Any] | None:
    """The sheet at the HD scale (a 1x sheet: xBRZ x3), with its rects."""
    rel = f"gfx/sprites/battle/{slug}-sheet.png"
    target = f"monsters/{slug}-sheet.png"
    src = sprites.source(rel)
    if src is None:
        return None
    width, height = _size(src)
    k = width // SHEET_LAYOUT[0]
    if (width, height) != (SHEET_LAYOUT[0] * k, SHEET_LAYOUT[1] * k):
        raise ValueError(f"{src}: {width}x{height} is not the sheet layout")
    if k == 1:
        k = hd.MONSTER
        dest, _ = sprites.upscaled(
            rel, target, "monster", k, list(RECTS.values())
        )
    elif k >= hd.MONSTER:
        dest = sprites.copy(rel, target, "monster")
    else:
        raise ValueError(f"{src}: x{k} is below the HD scale x{hd.MONSTER}")
    out: dict[str, Any] = {"sheet": dest, "scale": k}
    for name, (x, y, w, h) in RECTS.items():
        out[name] = [x * k, y * k, w * k, h * k]
    return out


def map_sheet(
    sprites: Sprites, rel: str, target: str, static: bool
) -> dict[str, Any]:
    """
    ``{"map", "frame", "scale"}`` of a map picture: a character's sheet
    (3x4 frames of 16x32 at 1x, or an HD multiple) or a prop (one 1x
    frame). 1x pictures ship as xBRZ x4, the tiles' scale.
    """
    src = sprites.source(rel)
    if src is None:
        return {"map": None, "frame": None, "scale": None}
    width, height = _size(src)
    if static:
        if width > MAP_FRAME[0] * 2:
            raise ValueError(f"{src}: an HD prop: give it a scale here")
        fw, fh, k = width, height, 1
    else:
        if width % SHEET_COLUMNS or height % SHEET_ROWS:
            raise ValueError(
                f"{src}: not a {SHEET_COLUMNS}x{SHEET_ROWS} sheet"
            )
        fw, fh = width // SHEET_COLUMNS, height // SHEET_ROWS
        k = fw // MAP_FRAME[0]
        if (fw, fh) != (MAP_FRAME[0] * k, MAP_FRAME[1] * k):
            raise ValueError(f"{src}: a {fw}x{fh} frame is not 16x32 x k")
    if k == 1:
        k = hd.MAP
        dest, _ = sprites.upscaled(
            rel, target, "npc", k, hd.grid(width, height, fw, fh)
        )
        fw, fh = fw * k, fh * k
    else:
        dest = sprites.copy(rel, target, "npc")
    return {"map": dest, "frame": [fw, fh], "scale": k}


def map_frames(sheet: Image.Image) -> tuple[Image.Image, Image.Image]:
    """The front and back standing frames of a 3x4 map sheet, trimmed."""
    sheet = sheet.convert("RGBA")
    w, h = sheet.width // SHEET_COLUMNS, sheet.height // SHEET_ROWS
    out = []
    for row in (0, SHEET_ROWS - 1):  # row 0 faces us, the last one away
        frame = sheet.crop((w, row * h, 2 * w, (row + 1) * h))
        box = frame.getbbox()
        if box is None:
            raise ValueError("an empty map frame")
        out.append(frame.crop(box))
    return out[0], out[1]


def portrait_from_map_sheet(sheet: Image.Image, k: int) -> Image.Image:
    """
    A combat sheet (back left, front right, 64x64 cells at 1x, here x k)
    from a character's map sheet: its middle-column front and back
    frames, scaled down (Lanczos, premultiplied alpha) to the cell's
    height, centred and standing on the cell's bottom edge.
    """
    cell = (COMBAT_WIDTH // 2) * k
    out = Image.new("RGBA", (2 * cell, cell), (0, 0, 0, 0))
    front, back = map_frames(sheet)
    for i, frame in enumerate((back, front)):
        f = min(cell / frame.height, cell / frame.width, 1.0)
        size = (
            max(1, round(frame.width * f)),
            max(1, round(frame.height * f)),
        )
        small = (
            frame.convert("RGBa")
            .resize(size, Image.Resampling.LANCZOS)
            .convert("RGBA")
        )
        x = i * cell + (cell - size[0]) // 2
        out.alpha_composite(small, (x, cell - size[1]))
    return out


def portrait_from_map(
    sprites: Sprites, name: str, sprite: str
) -> tuple[str | None, int | None]:
    """The combat sheet ``name``, built from the map sheet ``sprite``."""
    target = f"portraits/{name}.png"
    dest = f"sprites/{target}"
    if dest in sprites.out.images:
        return dest, hd.PORTRAIT
    src = sprites.source(f"sprites/{sprite}.png")
    if src is None:
        return None, None
    with Image.open(src) as im:
        sheet = portrait_from_map_sheet(im, hd.PORTRAIT)
    sprites.out.add_image(dest, sheet, [src], "portrait")
    sprites.out.assets[dest].note = PORTRAIT_FROM_MAP_NOTE
    return dest, hd.PORTRAIT


def combat_sheet(sprites: Sprites, name: str) -> tuple[str | None, int | None]:
    """A combat sheet (back left, front right) at the HD scale."""
    if name in PORTRAIT_FROM_MAP:
        return portrait_from_map(sprites, name, PORTRAIT_FROM_MAP[name])
    rel = f"gfx/sprites/player/{name}.png"
    target = f"portraits/{name}.png"
    src = sprites.source(rel)
    if src is None:
        return None, None
    width, height = _size(src)
    k = width // COMBAT_WIDTH
    if width != COMBAT_WIDTH * k:
        raise ValueError(f"{src}: {width} px is not 128 x k")
    if k == 1:
        half = COMBAT_WIDTH // 2
        frames = [(0, 0, half, height), (half, 0, half, height)]
        dest, _ = sprites.upscaled(
            rel, target, "portrait", hd.PORTRAIT, frames
        )
        return dest, hd.PORTRAIT
    if k < hd.PORTRAIT:
        raise ValueError(f"{src}: x{k} is below the HD scale")
    return sprites.copy(rel, target, "portrait"), k


def icon(
    sprites: Sprites, rel: str, target: str, kind: str
) -> tuple[str | None, int | None]:
    """An item or type icon: 24 px at 1x, shipped as xBRZ x4."""
    src = sprites.source(rel)
    if src is None:
        return None, None
    width, height = _size(src)
    if (width, height) != (ICON_SIZE, ICON_SIZE):
        raise ValueError(f"{src}: {width}x{height} is not a 24 px icon")
    dest, _ = sprites.upscaled(rel, target, kind, hd.ICON)
    return dest, hd.ICON


def animation_sheet(sprites: Sprites, rec: dict[str, Any]) -> None:
    """
    A technique, item or map animation: a strip of ``frame_x`` x
    ``frame_y`` frames, shipped as xBRZ x4 (wrapped into rows when it
    is wider than a texture). Rewrites the record's sheet and sizes.
    """
    slug, file = rec["slug"], rec["file"]
    rel = f"animations/{file}/{slug}.png"
    src = sprites.source(rel)
    if src is None:
        rec["sheet"] = None
        return
    width, height = _size(src)
    fx, fy = rec["frame_x"], rec["frame_y"]
    count = width // fx
    if not count or height < fy:
        raise ValueError(f"{src}: no {fx}x{fy} frame")
    k = hd.MAP if file == "tileset" else hd.ANIMATION
    frames = [(i * fx, 0, fx, fy) for i in range(count)]

    def wrap(image: Image.Image) -> tuple[Image.Image, int]:
        return hd.wrap(image, fx * k, fy * k, count)

    dest, columns = sprites.upscaled(
        rel, f"animations/{file}/{slug}.png", "animation", k, frames, wrap
    )
    rec["sheet"] = dest
    rec["frame_x"], rec["frame_y"] = fx * k, fy * k
    rec["scale"] = k
    rec["frames"] = count
    rec["columns"] = columns


def build(out: Output, scripts: list[dict[str, Any]]) -> dict[str, Any]:
    refs = world_refs(scripts)
    sprites = Sprites(out)
    sounds_used: set[str] = set()
    msgids: set[str] = set(refs["msgid"])

    # -- encounters and monsters
    encounters = {
        slug: _strip(table("encounter")[slug])
        for slug in sorted(refs["encounter"] | nagmon_slugs("encounter"))
    }
    seeds = set(refs["monster"]) | nagmon_slugs("monster")
    for enc in encounters.values():
        seeds |= {m["monster"] for m in enc.get("monsters", [])}
    npcs_wanted = set(refs["npc"])
    monster_slugs = evolution_closure(seeds)
    monsters = {}
    techniques_wanted: set[str] = set()
    for slug in sorted(monster_slugs):
        rec = _strip(table("monster")[slug])
        rec["sprites"] = monster_sprites(sprites, slug)
        for move in rec.get("moveset") or []:
            techniques_wanted.add(move["technique"])
        for call in (rec.get("sounds") or {}).values():
            if call and call.get("sfx"):
                sounds_used.add(call["sfx"])
        msgids |= {slug, f"{slug}_description"}
        if rec.get("species"):
            msgids.add(f"cat_{rec['species']}")
        if rec.get("shape"):
            msgids.add(rec["shape"])
        monsters[slug] = rec

    # -- techniques
    animations_wanted: set[str] = set(refs["animation"])
    techniques = {}
    for slug in sorted(techniques_wanted):
        rec = _strip(table("technique")[slug])
        if slug in GENTLE_ANIMATIONS:
            old = rec["visuals"]["animation"]
            rec["visuals"]["animation"] = GENTLE_ANIMATIONS[slug]
            rec["_note"] = (
                f"Animation {old} replaced by {GENTLE_ANIMATIONS[slug]}: "
                "gentle for young kids (tools/app/db.py)."
            )
        anim = (rec.get("visuals") or {}).get("animation")
        if anim:
            animations_wanted.add(anim)
        sfx = (rec.get("sound") or {}).get("sfx")
        if sfx:
            sounds_used.add(sfx)
        msgids |= {slug, f"{slug}_description"}
        for key in ("use_tech", "use_success", "use_failure"):
            if rec.get(key):
                msgids.add(rec[key])
        techniques[slug] = rec

    # -- items
    items = {}
    for slug in sorted(refs["item"] | nagmon_slugs("item")):
        rec = _strip(table("item")[slug])
        if rec.get("sprite"):
            rec["sprite"], rec["sprite_scale"] = icon(
                sprites,
                rec["sprite"],
                f"items/{Path(rec['sprite']).name}",
                "item",
            )
        anim = (rec.get("visuals") or {}).get("animation")
        if anim:
            animations_wanted.add(anim)
        sfx = (rec.get("sound") or {}).get("sfx")
        if sfx:
            sounds_used.add(sfx)
        msgids |= {slug, f"{slug}_description"}
        for key in ("use_item", "use_success", "use_failure"):
            if rec.get(key):
                msgids.add(rec[key])
        items[slug] = rec
    # Capture shakes (the "tuxeball" item animation family).
    animations_wanted |= {
        s for s, a in table("animation").items() if a.get("file") == "item"
    }

    # -- NPCs (and the player's avatars)
    npcs = {}
    map_sprites = set(refs["sprite"])
    combat_sheets = set(refs["combat_sheet"])
    for slug in sorted(npcs_wanted | nagmon_slugs("npc")):
        rec = _strip(table("npc")[slug])
        tpl = rec.get("template") or {}
        art: dict[str, Any] = {}
        name = tpl.get("sprite_name")
        if name:
            folder = "sprites_obj" if tpl.get("is_static_prop") else "sprites"
            sub = "objects" if tpl.get("is_static_prop") else "npc"
            art |= map_sheet(
                sprites,
                f"{folder}/{name}.png",
                f"{sub}/{name}.png",
                bool(tpl.get("is_static_prop")),
            )
        sheet = tpl.get("combat_sheet")
        if sheet and sheet != "noclass":
            art["portrait"], art["portrait_scale"] = combat_sheet(
                sprites, sheet
            )
        rec["sprites"] = art
        msgids.add(slug)
        for profile in (
            (rec.get("speech") or {}).get("profile") or {}
        ).values():
            msgids |= {v for v in (profile or {}).values() if v}
        npcs[slug] = rec
    sheets = {
        name: map_sheet(
            sprites, f"sprites/{name}.png", f"npc/{name}.png", False
        )
        for name in sorted(map_sprites)
    }
    for rec in npcs.values():
        for target in _templates_set_on(scripts, rec["slug"]):
            rec["sprites"].setdefault("alternates", {})[target] = sheets[
                target
            ]
    for name in sorted(combat_sheets):
        combat_sheet(sprites, name)
    avatars = avatar_records(sprites)

    # -- animations
    animations = {}
    for slug in sorted(animations_wanted):
        rec = _strip(table("animation")[slug])
        animation_sheet(sprites, rec)
        animations[slug] = rec

    # Shapes are shown by name (journal, monster info).
    msgids |= set(table("shape"))

    # -- elements
    elements = {}
    for slug, rec in table("element").items():
        rec = _strip(rec)
        if rec.get("icon"):
            rec["icon"], rec["icon_scale"] = icon(
                sprites,
                rec["icon"],
                f"ui/element/{Path(rec['icon']).name}",
                "ui",
            )
        msgids.add(slug)
        elements[slug] = rec

    # -- environments (battle backgrounds, HUD and battle music)
    environments = {}
    music_used = set(refs["music"]) | set(MENU_MUSIC)
    for slug in sorted(refs["environment"]):
        rec = _strip(table("environment")[slug])
        rec["battle_graphics"] = battle_graphics(
            sprites, rec.get("battle_graphics") or {}
        )
        for entry in (rec.get("battle_music") or {}).values():
            if entry and entry.get("music"):
                music_used.add(entry["music"])
        environments[slug] = rec

    out.add_json("db/monsters.json", monsters)
    out.add_json("db/techniques.json", techniques)
    out.add_json("db/items.json", items)
    out.add_json("db/npcs.json", npcs)
    out.add_json("db/avatars.json", avatars)
    out.add_json("db/encounters.json", encounters)
    out.add_json("db/elements.json", elements)
    out.add_json("db/environments.json", environments)
    out.add_json("db/animations.json", animations)
    if sprites.missing:
        out.notes += [f"no picture: {m}" for m in sorted(set(sprites.missing))]
    return {
        "counts": {
            "monsters": len(monsters),
            "nagmon_monsters": len(nagmon_slugs("monster") & set(monsters)),
            "techniques": len(techniques),
            "items": len(items),
            "npcs": len(npcs),
            "encounters": len(encounters),
            "elements": len(elements),
            "environments": len(environments),
            "animations": len(animations),
        },
        "sounds": sorted(sounds_used),
        "music": sorted(music_used),
        "msgids": sorted(msgids),
    }


def battle_graphics(sprites: Sprites, graphics: dict[str, Any]) -> Any:
    """
    The environment's pictures (background, HUD, trays, party icons,
    islands), all xBRZ x6: one ``scale`` for the whole battle screen.
    The islands are two frames side by side, each scaled on its own.
    """
    k = hd.BATTLE_UI
    island = graphics.get("island_sheet")
    iw = graphics.get("island_width", ISLAND[0])
    ih = graphics.get("island_height", ISLAND[1])

    def rewrite(node: Any) -> Any:
        if isinstance(node, dict):
            return {key: rewrite(v) for key, v in node.items()}
        if isinstance(node, str) and node.endswith(".png"):
            if sprites.source(node) is None:
                return None
            frames = (
                [(0, 0, iw, ih), (iw, 0, iw, ih)] if node == island else None
            )
            dest, _ = sprites.upscaled(
                node, f"ui/{Path(node).name}", "ui", k, frames
            )
            return dest
        return node

    out = rewrite(graphics)
    if island:
        out["island_width"], out["island_height"] = iw * k, ih * k
    out["scale"] = k
    return out


def _templates_set_on(scripts: list[dict[str, Any]], npc: str) -> list[str]:
    return sorted(
        {
            args[1]
            for args in _args(scripts, "set_template")
            if args[0] == npc and args[1] != npc
        }
    )


def avatar_card(out: Output, key: str, combat_sheet: str) -> str:
    """
    The hero's picture for the profile cards: the front half of the
    combat sheet (back on the left, front on the right), trimmed.
    """
    rel = f"gfx/sprites/player/{combat_sheet}.png"
    src = mod_file(rel)
    if src is None:
        raise FileNotFoundError(f"no combat sheet for {key}: {combat_sheet}")
    sheet = load_art(rel)
    half = sheet.width // 2
    front = sheet.crop((half, 0, sheet.width, sheet.height))
    box = front.getbbox()
    if box is None:
        raise ValueError(f"{src}: the front half is empty")
    dest = f"avatars/{key}.png"
    out.add_image(dest, front.crop(box), [src], "portrait")
    if rel in overlays.SHEETS:
        out.assets[dest].note = overlays.SHEET_NOTE
    return dest


def avatar_records(sprites: Sprites) -> dict[str, Any]:
    """
    The child's avatars: the HD heroes of ``nagmon.game_flow.AVATARS``,
    a map from every other old key to a hero, and the fallback.
    """
    from nagmon.game_flow import AVATARS

    by_key = {avatar.key: avatar for avatar in AVATARS}
    old_keys = set(by_key) - set(AVATAR_KEYS)
    if old_keys != set(AVATAR_LEGACY):
        raise ValueError(f"avatar keys without a hero: {sorted(old_keys)}")
    records = []
    for key in AVATAR_KEYS:
        avatar = by_key[key]
        portrait, portrait_scale = combat_sheet(sprites, avatar.combat_sheet)
        records.append(
            {
                "key": avatar.key,
                "sprite": avatar.sprite,
                "combat_sheet": avatar.combat_sheet,
                "gender": avatar.gender,
                "label_he": avatar.label_he,
                **map_sheet(
                    sprites,
                    f"sprites/{avatar.sprite}.png",
                    f"npc/{avatar.sprite}.png",
                    False,
                ),
                "portrait": portrait,
                "portrait_scale": portrait_scale,
                "card": avatar_card(
                    sprites.out, avatar.key, avatar.combat_sheet
                ),
            }
        )
    return {
        "avatars": records,
        "legacy": dict(AVATAR_LEGACY),
        "fallback": AVATAR_FALLBACK,
    }
