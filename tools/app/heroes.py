# SPDX-License-Identifier: GPL-3.0
"""The heroes: ``mods/nagmon/heroes/heroes.yaml`` as ``game/heroes.json``.

The characters a child can be. The file is checked here, so a typo stops
the build and not a child's game; the app reads the shipped roster and has
no hero list of its own (docs/app/HEROES.md says how to add one).

Checks: ids are unique and plain; at most :data:`HARD_MAX` heroes (the
picker's layout is tested up to that many); every art id is an entry of
``art/manifest.json`` and its file has a placeholder, so a picture that is
not in the build is drawn from its stand-in; the fallback and the legacy
ids point at heroes the child can see.

The shipped file also carries what the app would otherwise look up in the
big art manifest (the file, the frame size, the map scale), so the start
screen does not load the manifest.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from typing import Any

from tools.app.common import NAG, OUT, Output
from tools.app.content import read_yaml
from tools.app.placeholders import placeholder_path

SOURCE = NAG / "heroes" / "heroes.yaml"
MANIFEST = OUT / "art" / "manifest.json"

#: The most heroes the picker is built and tested for.
HARD_MAX = 12
#: The pictures of a hero: its walk sheet, its large portrait, its face.
ART_KEYS = ("map", "portrait", "face")
#: A 1x map frame is 16x32 px (Tuxemon's); the sheet's scale is its multiple.
MAP_FRAME_1X = (16, 32)
ID = re.compile(r"[a-z][a-z0-9_]{1,31}")
COLOR = re.compile(r"#[0-9a-fA-F]{6}")


def load_manifest() -> dict[str, Any]:
    return json.loads(MANIFEST.read_text("utf-8"))


def art_entry(art_id: str, manifest: dict[str, Any] | None = None):
    """The manifest entry of an art id, or None."""
    manifest = manifest or load_manifest()
    return next((a for a in manifest["assets"] if a["id"] == art_id), None)


def _placeholder_exists(file: str) -> bool:
    return (OUT / placeholder_path(file)).is_file()


class _Problems:
    def __init__(self) -> None:
        self.items: list[str] = []

    def add(self, where: str, what: str) -> None:
        self.items.append(f"{where}: {what}")

    def raise_if_any(self) -> None:
        if self.items:
            raise ValueError("heroes: " + "; ".join(self.items))


def _text(p: _Problems, where: str, name: Any) -> None:
    if not isinstance(name, dict):
        p.add(where, "name needs he and en")
        return
    for lang in ("he", "en"):
        v = name.get(lang)
        if not isinstance(v, str) or not v.strip():
            p.add(where, f"name.{lang} is missing")


def _files(
    p: _Problems,
    where: str,
    art: Any,
    manifest: dict[str, Any],
    has_placeholder: Callable[[str], bool],
    *,
    whole: bool,
) -> dict[str, Any]:
    """Check an ``art`` block; return the app's view of it."""
    files: dict[str, Any] = {}
    if not isinstance(art, dict):
        p.add(where, "art is missing")
        return files
    for key in ART_KEYS:
        if whole and key not in art:
            p.add(where, f"art.{key} is missing")
    for key, art_id in art.items():
        if key not in ART_KEYS:
            p.add(where, f"art.{key} is not one of {', '.join(ART_KEYS)}")
            continue
        entry = art_entry(str(art_id), manifest)
        if entry is None:
            p.add(where, f"art.{key}: {art_id} is not in the art manifest")
            continue
        if not has_placeholder(entry["file"]):
            p.add(where, f"art.{key}: {art_id} has no placeholder")
        record: dict[str, Any] = {"file": entry["file"]}
        if key == "map":
            w, h = entry["frame"]
            if (
                w % MAP_FRAME_1X[0]
                or h * MAP_FRAME_1X[0] != w * MAP_FRAME_1X[1]
            ):
                p.add(
                    where, f"art.map: frame {w}x{h} is not 16x32 times a scale"
                )
                continue
            record["frame"] = [w, h]
            record["scale"] = w // MAP_FRAME_1X[0]
        files[key] = record
    return files


def validate(
    doc: dict[str, Any],
    manifest: dict[str, Any],
    has_placeholder: Callable[[str], bool],
) -> dict[str, Any]:
    """Check the roster; return what ships (``heroes.json``)."""
    p = _Problems()
    heroes = doc.get("heroes")
    if not isinstance(heroes, list) or not heroes:
        raise ValueError("heroes: the roster is empty")
    limit = doc.get("max_heroes", HARD_MAX)
    if not isinstance(limit, int) or not 1 <= limit <= HARD_MAX:
        p.add("max_heroes", f"must be a number from 1 to {HARD_MAX}")
        limit = HARD_MAX
    if len(heroes) > limit:
        p.add("roster", f"{len(heroes)} heroes, at most {limit}")
    seen: set[str] = set()
    shipped = []
    for i, h in enumerate(heroes):
        hid = h.get("id") if isinstance(h, dict) else None
        where = f"hero {hid or i}"
        if not isinstance(hid, str) or not ID.fullmatch(hid):
            p.add(where, "id must be lower-case letters, digits and _")
            continue
        if hid in seen:
            p.add(where, "id is listed twice")
        seen.add(hid)
        _text(p, where, h.get("name"))
        if not isinstance(h.get("order"), int) or isinstance(h["order"], bool):
            p.add(where, "order must be a number")
        if not isinstance(h.get("enabled"), bool):
            p.add(where, "enabled must be true or false")
        colors = h.get("colors")
        if not isinstance(colors, dict) or not all(
            isinstance(colors.get(k), str) and COLOR.fullmatch(colors[k])
            for k in ("primary", "secondary")
        ):
            p.add(where, "colors needs primary and secondary as #rrggbb")
        files = _files(
            p, where, h.get("art"), manifest, has_placeholder, whole=True
        )
        variants = []
        vseen: set[str] = set()
        for v in h.get("variants") or []:
            vid = v.get("id") if isinstance(v, dict) else None
            vwhere = f"{where} variant {vid}"
            if not isinstance(vid, str) or not ID.fullmatch(vid):
                p.add(vwhere, "id must be lower-case letters, digits and _")
                continue
            if vid in vseen:
                p.add(vwhere, "id is listed twice")
            vseen.add(vid)
            if not isinstance(v.get("kind"), str) or not v["kind"]:
                p.add(vwhere, "kind is missing (head_covering, hair...)")
            _text(p, vwhere, v.get("name"))
            vfiles = _files(
                p,
                vwhere,
                v.get("art") or {},
                manifest,
                has_placeholder,
                whole=False,
            )
            variants.append(
                {
                    "id": vid,
                    "kind": v.get("kind"),
                    "name": v.get("name"),
                    "art": dict(v.get("art") or {}),
                    "files": vfiles,
                }
            )
        entry: dict[str, Any] = {
            "id": hid,
            "order": h.get("order"),
            "enabled": h.get("enabled"),
            "name": h.get("name"),
            "colors": colors,
            "art": h.get("art"),
            "files": files,
        }
        if variants:
            entry["variants"] = variants
        shipped.append(entry)
    enabled = {h["id"] for h in shipped if h["enabled"] is True}
    if not enabled:
        p.add("roster", "no hero is enabled")
    fallback = doc.get("fallback")
    if fallback not in enabled:
        p.add("fallback", f"{fallback!r} must be an enabled hero")
    legacy = doc.get("legacy") or {}
    for old, new in legacy.items():
        if new not in seen:
            p.add("legacy", f"{old} -> {new}: no such hero")
        if old in seen:
            p.add("legacy", f"{old} is a hero's id, not an old key")
    p.raise_if_any()
    return {
        "version": 1,
        "max": limit,
        "fallback": fallback,
        "legacy": dict(legacy),
        "heroes": sorted(shipped, key=lambda h: (h["order"], h["id"])),
    }


def build(out: Output) -> dict[str, int]:
    # the manifest this build writes, else the committed one
    manifest = (
        json.loads(out.data["art/manifest.json"])
        if "art/manifest.json" in out.data
        else load_manifest()
    )
    built = validate(read_yaml(SOURCE), manifest, _placeholder_exists)
    out.add_json("heroes.json", built)
    return {
        "heroes": len(built["heroes"]),
        "enabled": sum(1 for h in built["heroes"] if h["enabled"]),
    }
