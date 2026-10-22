# SPDX-License-Identifier: GPL-3.0
"""Text review: the Hebrew lines a native speaker checks (docs/app/TEXT_REVIEW.md).

    python -m tools.app.review stats
    python -m tools.app.review apply <decisions.json> [--dry-run] [--no-build]

``extract`` lists every line of shipped Hebrew (quests, the people's lines,
mail, facts, the app's screens) with a stable id, its source and key and a
hint of who says it and when. ``build`` ships the lines not yet approved as
``game/review.json`` (lazy: only the review screen reads it).
``mods/nagmon/review/status.yaml`` keeps id -> hash of the approved text.

``apply`` takes the parent's decisions (the phone uploads them as
``devices/<id>/review/<UTC>/decisions.json``) and writes the corrections
into the sources *in place*: only the text of the one scalar changes, never
the formatting, the comments or the neighbours. A decision made about a line
that has changed since (its ``baseHash``) is refused.
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from hashlib import sha256
from pathlib import Path
from typing import Any

import yaml

REPO = Path(__file__).resolve().parents[2]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))
from tools.app.common import Output  # noqa: E402

STATUS = "mods/nagmon/review/status.yaml"
TS_FILE = "app/src/i18n.ts"
#: The order of the types in the screen and the shipped file.
TYPES = ("quest", "npc", "mail", "fact", "ui")

_LOADER = getattr(yaml, "CSafeLoader", yaml.SafeLoader)
_HOLE = re.compile(r"\{\w+\}")

POOLS = {
    "greet_first": "ברכה ראשונה ביום",
    "greet_again": "ברכה בשיחה השנייה ביום",
    "idle": "שיחה שלישית ואילך",
    "farewell": "פרידה",
}
PHASES = {
    "morning": "בוקר",
    "afternoon": "צהריים",
    "evening": "ערב",
    "night": "לילה",
}
SUBJECTS = {
    "math": "חשבון",
    "geometry": "גיאומטריה",
    "english": "אנגלית",
    "science": "מדעים",
    "logic": "חשיבה",
    "hebrew": "עברית",
}


def text_hash(text: str) -> str:
    """16 hex digits of the SHA-256 of the text, composed (NFC)."""
    data = unicodedata.normalize("NFC", text).encode("utf-8")
    return sha256(data).hexdigest()[:16]


@dataclass(frozen=True)
class Item:
    id: str
    type: str
    #: The source file, relative to the repo root.
    src: str
    #: Where in the file ("/" between the parts of the path).
    key: str
    he: str
    ctx: str
    en: str | None = None

    @property
    def hash(self) -> str:
        return text_hash(self.he)

    def shipped(self) -> dict[str, str]:
        out = {
            "id": self.id,
            "type": self.type,
            "src": self.src,
            "key": self.key,
            "he": self.he,
        }
        if self.en:
            out["en"] = self.en
        out["ctx"] = self.ctx
        out["hash"] = self.hash
        return out


def _yaml(path: Path) -> Any:
    return yaml.load(path.read_text(encoding="utf-8"), Loader=_LOADER)


def _rel(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def _hebrew(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


# --------------------------------------------------------------- extract
def extract(root: Path = REPO) -> list[Item]:
    """Every review item, in the order of the screen."""
    nag = root / "mods" / "nagmon"
    people = _people(nag)
    items: list[Item] = []
    items += _quests(root, nag, people)
    items += _npcs(root, nag, people)
    items += _mail(root, nag, people)
    items += _facts(root, nag)
    items += _ui(root)
    return items


def _people(nag: Path) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for path in sorted((nag / "npcs").glob("*.yaml")):
        if path.name.endswith(".lines.he.yaml"):
            continue
        card = _yaml(path)
        if isinstance(card, dict):
            out[path.stem] = card
    return out


def _name(people: dict[str, dict[str, Any]], slug: str) -> str:
    return str(people.get(slug, {}).get("name_he") or slug)


def _quest_part(path: list[str], giver: str) -> str:
    """What a line of a quest is, as the parent reads it."""
    p = "/".join("#" if x.isdigit() else x for x in path)
    if p == "title/he":
        return "כותרת המשימה"
    if p == "board/goal/he":
        return "מה כתוב בלוח המשימות"
    if p == "offer/lines/#/he":
        return f"{giver} מציע את המשימה"
    if p == "variants/#/he":
        return f"{giver} מספר לפני השאלה"
    if p == "steps/#/todo/he":
        return "שורה ברשימת המטלות"
    if p == "steps/#/say/#/he":
        return f"{giver} אומר בסיום"
    if p == "steps/#/hint/he":
        return "רמז"
    if p == "steps/#/prompt/he":
        return f"{giver} שואל"
    if p == "steps/#/wait/he":
        return f"{giver} אומר כשעוד לא סיימו"
    if p == "steps/#/options/#/label/he":
        return "תשובה שהילד בוחר"
    if p == "steps/#/options/#/reply/he":
        return "התגובה לבחירה"
    if p.startswith("lines/"):
        return f"שורה כללית של המשימות ({path[1]})"
    return "שורה במשימה"


def _walk_quest(
    node: Any, path: list[str]
) -> list[tuple[list[str], str, str | None]]:
    found: list[tuple[list[str], str, str | None]] = []
    if isinstance(node, dict):
        if _hebrew(node.get("he")) and "he" not in path:
            en = node.get("en")
            found.append(
                (path + ["he"], node["he"], en if _hebrew(en) else None)
            )
        for k, v in node.items():
            if k in ("he", "en") and path:
                continue
            if not path and k in ("places", "props"):
                continue
            found += _walk_quest(v, path + [str(k)])
    elif isinstance(node, list):
        for i, v in enumerate(node):
            found += _walk_quest(v, path + [str(i)])
    return found


def _quests(
    root: Path, nag: Path, people: dict[str, dict[str, Any]]
) -> list[Item]:
    items: list[Item] = []
    for path in sorted((nag / "quests").glob("*.yaml")):
        doc = _yaml(path)
        if not isinstance(doc, dict):
            continue
        giver = _name(people, str(doc["giver"])) if doc.get("giver") else ""
        title = doc.get("title")
        head = title.get("he") if isinstance(title, dict) else None
        for key_path, he, en in _walk_quest(doc, []):
            part = _quest_part(key_path, giver or "המספר")
            ctx = " · ".join(x for x in (head, part) if x)
            if not head:
                ctx = part
            key = "/".join(key_path)
            items.append(
                Item(
                    f"quest:{path.stem}:{key}",
                    "quest",
                    _rel(root, path),
                    key,
                    he,
                    ctx,
                    en,
                )
            )
    return items


def _pool_label(pool: str, card: dict[str, Any]) -> str:
    if pool in POOLS:
        return POOLS[pool]
    if pool.startswith("topic."):
        topic = pool[len("topic.") :]
        for t in (card.get("knows") or {}).get("topics") or []:
            if isinstance(t, dict) and t.get("id") == topic:
                return f"תשובה ללחצן: {t.get('label_he') or topic}"
        return f"תשובה בנושא {topic}"
    return pool


def _when(when: Any) -> str:
    if not isinstance(when, dict):
        return ""
    parts: list[str] = []
    phases = when.get("phase")
    if phases:
        names = [PHASES.get(str(p), str(p)) for p in phases]
        parts.append("בשעות: " + ", ".join(names))
    if when.get("friendship_min") is not None:
        parts.append(f"אחרי ידידות {when['friendship_min']}")
    return " · ".join(parts)


def _npcs(
    root: Path, nag: Path, people: dict[str, dict[str, Any]]
) -> list[Item]:
    items: list[Item] = []
    for path in sorted((nag / "npcs").glob("*.lines.he.yaml")):
        slug = path.name[: -len(".lines.he.yaml")]
        card = people.get(slug, {})
        who = _name(people, slug)
        doc = _yaml(path)
        if not isinstance(doc, dict):
            continue
        for pool, lines in doc.items():
            for i, line in enumerate(lines or []):
                when = ""
                if isinstance(line, dict):
                    text, when = line.get("text"), _when(line.get("when"))
                    key = f"{pool}/{i}/text"
                else:
                    text, key = line, f"{pool}/{i}"
                if not _hebrew(text):
                    continue
                ctx = " · ".join(
                    x for x in (who, _pool_label(str(pool), card), when) if x
                )
                items.append(
                    Item(
                        f"npc:{slug}:{key}",
                        "npc",
                        _rel(root, path),
                        key,
                        text,
                        ctx,
                    )
                )
    return items


def _mail(
    root: Path, nag: Path, people: dict[str, dict[str, Any]]
) -> list[Item]:
    path = nag / "mail" / "letters.yaml"
    if not path.is_file():
        return []
    doc = _yaml(path)
    senders = doc.get("senders") or {}
    items: list[Item] = []
    for letter, rec in (doc.get("letters") or {}).items():
        sender = senders.get(rec.get("from"), {})
        who = sender.get("name_he") or _name(people, str(rec.get("from")))
        if rec.get("kind") == "postcard":
            kind = "גלויה שמגיעה בבוקר"
        else:
            kind = f"מכתב שמגיע אחרי אירוע ({letter})"
        for i, variant in enumerate(rec.get("variants") or []):
            if not _hebrew(variant.get("text_he")):
                continue
            key = f"letters/{letter}/variants/{i}/text_he"
            items.append(
                Item(
                    f"mail:{path.stem}:{key}",
                    "mail",
                    _rel(root, path),
                    key,
                    variant["text_he"],
                    f"מאת {who} · {kind}",
                )
            )
    return items


def _facts(root: Path, nag: Path) -> list[Item]:
    path = nag / "economy" / "facts.yaml"
    if not path.is_file():
        return []
    items: list[Item] = []
    for fid, rec in (_yaml(path).get("facts") or {}).items():
        if not _hebrew(rec.get("text_he")):
            continue
        subject = SUBJECTS.get(rec.get("subject"), rec.get("subject") or "")
        key = f"facts/{fid}/text_he"
        items.append(
            Item(
                f"fact:{path.stem}:{key}",
                "fact",
                _rel(root, path),
                key,
                rec["text_he"],
                f"עובדה ב{subject} · מופיעה בשלטים, בלוח, בגלויות ובספרים",
            )
        )
    return items


_TS_LINE = re.compile(r'^  (\w+): ("(?:[^"\\]|\\.)*"),?\s*(?://.*)?$')
_TS_COMMENT = re.compile(r"^\s*//\s*(.*)$")


def _ui(root: Path) -> list[Item]:
    path = root / TS_FILE
    if not path.is_file():
        return []
    items: list[Item] = []
    section = ""
    inside = False
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("export const he = {"):
            inside = True
            continue
        if not inside:
            continue
        if line.startswith("}"):
            break
        comment = _TS_COMMENT.match(line)
        if comment:
            section = comment.group(1).strip()
            continue
        m = _TS_LINE.match(line)
        if not m or m.group(1).startswith("item_"):
            continue
        try:
            text = json.loads(m.group(2))
        except ValueError:
            continue
        if not _hebrew(text):
            continue
        where = f"{section} · " if section else ""
        items.append(
            Item(
                f"ui:{path.stem}:{m.group(1)}",
                "ui",
                _rel(root, path),
                m.group(1),
                text,
                f"טקסט במסך ({where}{m.group(1)})",
            )
        )
    return items


# ---------------------------------------------------------------- status
def load_status(root: Path = REPO) -> dict[str, str]:
    path = root / STATUS
    if not path.is_file():
        return {}
    doc = _yaml(path) or {}
    return {str(k): str(v) for k, v in (doc.get("approved") or {}).items()}


def _status_text(approved: dict[str, str]) -> str:
    lines = [
        "# Lines a native speaker approved (docs/app/TEXT_REVIEW.md):",
        "# id -> hash of the approved text. tools/app/review.py writes it.",
        "version: 1",
    ]
    if not approved:
        return "\n".join(lines + ["approved: {}"]) + "\n"
    lines.append("approved:")
    for key in sorted(approved):
        lines.append(f"  {json.dumps(key)}: {json.dumps(approved[key])}")
    return "\n".join(lines) + "\n"


def write_status(root: Path, approved: dict[str, str]) -> None:
    path = root / STATUS
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_status_text(approved), encoding="utf-8")


def pending(items: list[Item], status: dict[str, str]) -> list[Item]:
    return [i for i in items if status.get(i.id) != i.hash]


# ----------------------------------------------------------------- build
def build(out: Output, root: Path = REPO) -> dict[str, Any]:
    items = extract(root)
    ids = [i.id for i in items]
    if len(set(ids)) != len(ids):
        dup = sorted({i for i in ids if ids.count(i) > 1})
        raise ValueError(f"review ids are not unique: {dup[:5]}")
    todo = pending(items, load_status(root))
    out.add_json(
        "review.json",
        {"version": 1, "items": [i.shipped() for i in todo]},
        compact=True,
    )
    return {
        "total": len(items),
        "pending": len(todo),
        "by_type": {t: sum(1 for i in todo if i.type == t) for t in TYPES},
    }


# ----------------------------------------------------------------- apply
@dataclass
class Refusal:
    id: str
    reason: str


@dataclass
class Result:
    applied: list[str] = field(default_factory=list)
    refused: list[Refusal] = field(default_factory=list)
    skipped: int = 0
    diff: str = ""


@dataclass
class _Edit:
    start: int
    end: int
    raw: str


def read_decisions(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("decisions")
    if not isinstance(data, list) or not all(
        isinstance(d, dict) for d in data
    ):
        raise ValueError(f"{path}: not a list of decisions")
    return data


def _yaml_scalar(src: str, key: str) -> tuple[int, int, Any]:
    """Where the scalar at ``key`` is in the text, and its node."""
    node = yaml.compose(src, Loader=yaml.SafeLoader)
    for part in key.split("/"):
        if isinstance(node, yaml.MappingNode):
            for k, v in node.value:
                if k.value == part:
                    node = v
                    break
            else:
                raise KeyError(key)
        elif isinstance(node, yaml.SequenceNode):
            node = node.value[int(part)]
        else:
            raise KeyError(key)
    if not isinstance(node, yaml.ScalarNode):
        raise KeyError(key)
    return node.start_mark.index, node.end_mark.index, node


_PLAIN_BAD = re.compile(r"(^[\s\-?:,\[\]{}#&*!|>'\"%@`])|(: )|( #)|(:$)|(\s$)")


def _encode(style: str | None, text: str) -> str | None:
    if style == '"':
        return json.dumps(text, ensure_ascii=False)
    if style == "'":
        return "'" + text.replace("'", "''") + "'"
    if style is None:
        if _PLAIN_BAD.search(text) or text.lower() in {
            "true",
            "false",
            "null",
            "yes",
            "no",
            "~",
        }:
            return json.dumps(text, ensure_ascii=False)
        try:
            if not isinstance(
                yaml.safe_load(text), str
            ):  # a number, a date...
                return json.dumps(text, ensure_ascii=False)
        except yaml.YAMLError:
            return json.dumps(text, ensure_ascii=False)
        return text
    return None


def _locate(src: str, item: Item, new: str) -> _Edit:
    """The edit that puts ``new`` in the place of the item's line."""
    if item.src.endswith(".ts"):
        pos = 0
        needle = f"  {item.key}: "
        for line in src.splitlines(keepends=True):
            if line.startswith(needle):
                start = pos + len(needle)
                old, end = json.JSONDecoder().raw_decode(src, start)
                if old != item.he:
                    raise ValueError("the source text differs")
                return _Edit(start, end, json.dumps(new, ensure_ascii=False))
            pos += len(line)
        raise KeyError(item.key)
    start, end, node = _yaml_scalar(src, item.key)
    if node.value != item.he:
        raise ValueError("the source text differs")
    raw = _encode(node.style, new)
    if raw is None:
        raise ValueError("a block scalar (| or >) is not edited in place")
    return _Edit(start, end, raw)


def _holes(text: str) -> list[str]:
    return sorted(_HOLE.findall(text))


def apply(
    decisions: list[dict[str, Any]],
    root: Path = REPO,
    *,
    dry_run: bool = False,
) -> Result:
    items = {i.id: i for i in extract(root)}
    status = load_status(root)
    result = Result()
    edits: dict[str, list[_Edit]] = {}
    sources: dict[str, str] = {}
    new_text: dict[str, str] = {}
    done: set[str] = set()

    def accept(did: str, text: str) -> None:
        done.add(did)
        new_text[did] = text
        result.applied.append(did)

    def refuse(did: Any, reason: str) -> None:
        result.refused.append(Refusal(str(did), reason))

    for d in decisions:
        did = d.get("id")
        action = d.get("action")
        if action == "skip":
            result.skipped += 1
            continue
        item = items.get(did) if isinstance(did, str) else None
        if action not in ("approve", "edit"):
            refuse(did, f"unknown action {action!r}")
        elif item is None:
            refuse(did, "unknown id")
        elif did in done:
            refuse(did, "decided twice in one file")
        elif d.get("baseHash") != item.hash:
            refuse(did, "the line has changed since: its hash is not the baseHash")
        elif action == "approve":
            accept(did, item.he)
        else:
            new = d.get("newText")
            if not isinstance(new, str) or not new.strip():
                refuse(did, "newText is empty")
            elif "\n" in new or "\r" in new:
                refuse(did, "newText has more than one line")
            elif new == item.he:
                accept(did, item.he)
            elif _holes(new) != _holes(item.he):
                refuse(
                    did,
                    "newText must keep the placeholders "
                    + " ".join(_holes(item.he)),
                )
            else:
                new = unicodedata.normalize("NFC", new.strip())
                src = sources.setdefault(
                    item.src, (root / item.src).read_text(encoding="utf-8")
                )
                try:
                    edit = _locate(src, item, new)
                except (KeyError, ValueError, IndexError) as e:
                    refuse(did, str(e) or "not found in the source")
                    continue
                edits.setdefault(item.src, []).append(edit)
                accept(did, new)
    updated: dict[str, str] = {}
    for rel, es in edits.items():
        text = sources[rel]
        for e in sorted(es, key=lambda e: e.start, reverse=True):
            text = text[: e.start] + e.raw + text[e.end :]
        updated[rel] = text
    approved = dict(status)
    for did, text in new_text.items():
        approved[did] = text_hash(text)
    old_status = (
        (root / STATUS).read_text(encoding="utf-8")
        if (root / STATUS).is_file()
        else ""
    )
    new_status = _status_text(approved) if new_text else old_status

    diff: list[str] = []
    for rel, text in updated.items():
        diff += difflib.unified_diff(
            sources[rel].splitlines(keepends=True),
            text.splitlines(keepends=True),
            f"a/{rel}",
            f"b/{rel}",
        )
    diff += difflib.unified_diff(
        old_status.splitlines(keepends=True),
        new_status.splitlines(keepends=True),
        f"a/{STATUS}",
        f"b/{STATUS}",
    )
    result.diff = "".join(diff)
    if dry_run or not new_text:
        return result

    for rel, text in updated.items():
        _write(root / rel, text)
    try:
        now = {i.id: i for i in extract(root)}
        for did, text in new_text.items():
            if now[did].he != text:
                raise RuntimeError(f"{did}: the file does not say {text!r}")
    except Exception:
        for rel in updated:
            _write(root / rel, sources[rel])
        raise
    write_status(root, approved)
    return result


def _write(path: Path, text: str) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        f.write(text)


# ------------------------------------------------------------------- cli
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("stats", help="how many lines, how many still pending")
    ap = sub.add_parser("apply", help="write the parent's decisions back")
    ap.add_argument("decisions", type=Path)
    ap.add_argument("--dry-run", action="store_true", help="print a diff only")
    ap.add_argument(
        "--no-build", action="store_true", help="do not run build_data"
    )
    for p in (sub.choices["stats"], ap):
        p.add_argument(
            "--root", type=Path, default=REPO, help=argparse.SUPPRESS
        )
    args = parser.parse_args(argv)
    root = args.root.resolve()
    if args.cmd == "stats":
        out = Output()
        print(json.dumps(build(out, root), ensure_ascii=False, indent=1))
        return 0
    result = apply(read_decisions(args.decisions), root, dry_run=args.dry_run)
    if args.dry_run:
        print(result.diff, end="")
    print(
        f"applied {len(result.applied)}, skipped {result.skipped}, "
        f"refused {len(result.refused)}"
    )
    for r in result.refused:
        print(f"refused {r.id}: {r.reason}")
    if not args.dry_run and result.applied and not args.no_build:
        from tools.app import build_data

        if build_data.main([]) != 0:
            return 1
    return 1 if result.refused else 0


if __name__ == "__main__":
    sys.exit(main())
