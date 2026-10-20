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
``sprites/`` (relative to ``app/public/game``). Monsters get a
``sprites`` entry with the sheet, its scale ``k`` (an HD sheet is k
times the 128x88 layout) and the front/back/menu rectangles at that
scale.
"""

from __future__ import annotations

import copy
from collections.abc import Iterable
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from PIL import Image

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
    """Copies pictures under ``sprites/`` and remembers where they went."""

    def __init__(self, out: Output) -> None:
        self.out = out
        self.missing: list[str] = []

    def copy(self, rel: str, target: str, kind: str) -> str | None:
        src = mod_file(rel)
        if src is None:
            self.missing.append(rel)
            return None
        dest = f"sprites/{target}"
        self.out.add_copy(dest, src, kind)
        return dest


def monster_sprites(sprites: Sprites, slug: str) -> dict[str, Any] | None:
    rel = f"gfx/sprites/battle/{slug}-sheet.png"
    dest = sprites.copy(rel, f"monsters/{slug}-sheet.png", "monster")
    if dest is None:
        return None
    src = mod_file(rel)
    assert src is not None
    with Image.open(src) as im:
        width, height = im.size
    k = width // SHEET_LAYOUT[0]
    if (width, height) != (SHEET_LAYOUT[0] * k, SHEET_LAYOUT[1] * k):
        raise ValueError(f"{src}: {width}x{height} is not the sheet layout")
    out: dict[str, Any] = {"sheet": dest, "scale": k}
    for name, (x, y, w, h) in RECTS.items():
        out[name] = [x * k, y * k, w * k, h * k]
    return out


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
            rec["sprite"] = sprites.copy(
                rec["sprite"], f"items/{Path(rec['sprite']).name}", "item"
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
            art["map"] = sprites.copy(
                f"{folder}/{name}.png", f"{sub}/{name}.png", "npc"
            )
            art["frame"] = map_frame(
                f"{folder}/{name}.png", bool(tpl.get("is_static_prop"))
            )
        sheet = tpl.get("combat_sheet")
        if sheet and sheet != "noclass":
            art["portrait"] = sprites.copy(
                f"gfx/sprites/player/{sheet}.png",
                f"portraits/{sheet}.png",
                "portrait",
            )
        rec["sprites"] = art
        msgids.add(slug)
        for profile in (
            (rec.get("speech") or {}).get("profile") or {}
        ).values():
            msgids |= {v for v in (profile or {}).values() if v}
        npcs[slug] = rec
    for name in sorted(map_sprites):
        sprites.copy(f"sprites/{name}.png", f"npc/{name}.png", "npc")
    for rec in npcs.values():
        for target in _templates_set_on(scripts, rec["slug"]):
            rec["sprites"].setdefault("alternates", {})[target] = {
                "map": f"sprites/npc/{target}.png",
                "frame": map_frame(f"sprites/{target}.png", False),
            }
    for name in sorted(combat_sheets):
        sprites.copy(
            f"gfx/sprites/player/{name}.png",
            f"portraits/{name}.png",
            "portrait",
        )
    avatars = avatar_records(sprites)

    # -- animations
    animations = {}
    for slug in sorted(animations_wanted):
        rec = _strip(table("animation")[slug])
        rel = f"animations/{rec['file']}/{slug}.png"
        rec["sheet"] = sprites.copy(
            rel, f"animations/{rec['file']}/{slug}.png", "animation"
        )
        animations[slug] = rec

    # Shapes are shown by name (journal, monster info).
    msgids |= set(table("shape"))

    # -- elements
    elements = {}
    for slug, rec in table("element").items():
        rec = _strip(rec)
        if rec.get("icon"):
            rec["icon"] = sprites.copy(
                rec["icon"], f"ui/element/{Path(rec['icon']).name}", "ui"
            )
        msgids.add(slug)
        elements[slug] = rec

    # -- environments (battle backgrounds, HUD and battle music)
    environments = {}
    music_used = set(refs["music"]) | set(MENU_MUSIC)
    for slug in sorted(refs["environment"]):
        rec = _strip(table("environment")[slug])
        graphics = rec.get("battle_graphics") or {}
        rec["battle_graphics"] = _rewrite_paths(graphics, sprites)
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


def _rewrite_paths(node: Any, sprites: Sprites) -> Any:
    if isinstance(node, dict):
        return {k: _rewrite_paths(v, sprites) for k, v in node.items()}
    if isinstance(node, str) and node.endswith(".png"):
        return sprites.copy(node, f"ui/{Path(node).name}", "ui")
    return node


def map_frame(rel: str, static: bool) -> list[int] | None:
    """[width, height] of one frame of a shipped map picture."""
    src = mod_file(rel)
    if src is None:
        return None
    with Image.open(src) as im:
        width, height = im.size
    if static:
        return [width, height]
    if width % SHEET_COLUMNS or height % SHEET_ROWS:
        raise ValueError(f"{src}: not a {SHEET_COLUMNS}x{SHEET_ROWS} sheet")
    return [width // SHEET_COLUMNS, height // SHEET_ROWS]


def _templates_set_on(scripts: list[dict[str, Any]], npc: str) -> list[str]:
    return sorted(
        {
            args[1]
            for args in _args(scripts, "set_template")
            if args[0] == npc and args[1] != npc
        }
    )


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
        records.append(
            {
                "key": avatar.key,
                "sprite": avatar.sprite,
                "combat_sheet": avatar.combat_sheet,
                "gender": avatar.gender,
                "label_he": avatar.label_he,
                "map": sprites.copy(
                    f"sprites/{avatar.sprite}.png",
                    f"npc/{avatar.sprite}.png",
                    "npc",
                ),
                "frame": map_frame(f"sprites/{avatar.sprite}.png", False),
                "portrait": sprites.copy(
                    f"gfx/sprites/player/{avatar.combat_sheet}.png",
                    f"portraits/{avatar.combat_sheet}.png",
                    "portrait",
                ),
            }
        )
    return {
        "avatars": records,
        "legacy": dict(AVATAR_LEGACY),
        "fallback": AVATAR_FALLBACK,
    }
