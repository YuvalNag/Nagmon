#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0
"""Export a snapshot of the app to the new repo (YuvalNag/nagmon-game).

    python tools/migrate/export_snapshot.py --commit nagmon-app --out /home/user/export-game

What it does, in order (see tools/migrate/README.md):

1. ``git archive <commit>`` streams the tree; nothing is checked out, so
   node_modules, dist and test-results (never tracked) cannot come along.
2. Each path goes through ``export_rules.txt`` (last matching rule wins).
3. Text files get the old repo name replaced by the new one.
4. README.md of the new repo, an extra data-check workflow and
   ``EXPORT_INFO.txt`` (source commit) are written from ``templates/``.
5. The export is scanned for things that must not leave: tokens, device
   logs, and any term of an optional private ``--forbid-file`` (one
   case-insensitive term per line, kept OUTSIDE the public repo).

The export has no git history: it is one snapshot. ``push_chunks.py``
turns it into a few small commits.
"""

from __future__ import annotations

import argparse
import io
import re
import subprocess
import sys
import tarfile
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
OLD_NAME = "YuvalNag/Nagmon"
NEW_NAME = "YuvalNag/nagmon-game"

# the old name, but not a longer name that merely starts with it
OLD_RE = re.compile(r"YuvalNag/Nagmon(?![A-Za-z0-9_-])")

# things that must never be in the export (the private terms come from
# --forbid-file, never from this public file)
BUILTIN_FORBIDDEN = {
    # the tests' fake tokens are "github_pat_TEST..."
    "a GitHub token": re.compile(r"\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{30,}|github_pat_(?!TEST)[A-Za-z0-9_]{30,}"),
    "a private key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
}
# top-level data folders of nagmon-data (app/src/core/family is code, fine)
FORBIDDEN_PATHS = (
    re.compile(r"^(devices|family|playbooks|storybook)/"),
    re.compile(r"(^|/)secrets\.json$"),
    re.compile(r"\.(keystore|jks|p12)$"),
    re.compile(r"(^|/)\.env($|\.)"),
)
#: docs quote the device the parent's phone sends (devices/<id>/logs/...);
#: the id is replaced. Only in docs: the tests' fake ids stay as they are.
REDACTIONS = (
    (re.compile(r"^docs/"), re.compile(r"\bdevices/[0-9a-f]{8}/"), "devices/<device-id>/"),
)
#: words that only warn (a person reads the hits): not a block
REVIEW_WORDS = re.compile(r"\bFAMILY\b")


def parse_rules(path: Path) -> list[tuple[bool, re.Pattern[str]]]:
    rules = []
    for n, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        sign, _, pattern = line.partition(" ")
        if sign not in ("+", "-") or not pattern.strip():
            raise SystemExit(f"{path}:{n}: a rule is '+ pattern' or '- pattern'")
        rules.append((sign == "+", glob_to_re(pattern.strip().strip("/"))))
    return rules


def glob_to_re(pattern: str) -> re.Pattern[str]:
    out, i = [], 0
    while i < len(pattern):
        c = pattern[i]
        if pattern.startswith("**", i):
            out.append(".*")
            i += 2
            if pattern.startswith("/", i) and out[-1] == ".*":
                # "a/**/b" also matches "a/b"
                out[-1] = "(?:.*/)?"
                i += 1
        elif c == "*":
            out.append("[^/]*")
            i += 1
        elif c == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(c))
            i += 1
    # a pattern names the path itself or a folder above it
    return re.compile("^" + "".join(out) + "(?:/.*)?$")


def decide(rules: list[tuple[bool, re.Pattern[str]]], path: str) -> tuple[bool, int | None]:
    """(keep, index of the deciding rule); the last match wins."""
    keep, deciding = True, None
    for i, (include, rx) in enumerate(rules):
        if rx.match(path):
            keep, deciding = include, i
    return keep, deciding


def is_text(data: bytes) -> bool:
    if b"\0" in data[:8192]:
        return False
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return True


def render(template: Path, values: dict[str, str]) -> str:
    text = template.read_text(encoding="utf-8")
    for key, value in values.items():
        text = text.replace("{{" + key + "}}", value)
    return text


def git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(repo), *args], check=True, capture_output=True, text=True
    ).stdout.strip()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", type=Path, default=None, help="the old repo (default: the one this script is in)")
    ap.add_argument("--commit", default="HEAD", help="commit, branch or tag to export (default HEAD)")
    ap.add_argument("--out", type=Path, required=True, help="export folder; must be empty or missing, and outside any git repo")
    ap.add_argument("--rules", type=Path, default=HERE / "export_rules.txt")
    ap.add_argument("--new-name", default=NEW_NAME, help=f"replaces {OLD_NAME} (default {NEW_NAME})")
    ap.add_argument("--forbid-file", type=Path, help="private terms (one per line, case-insensitive) that must not appear; keep it outside the repos")
    ap.add_argument("--list", action="store_true", help="only list what would be kept/left out, write nothing")
    args = ap.parse_args()

    repo = (args.repo or HERE.parents[1]).resolve()
    sha = git(repo, "rev-parse", "--verify", args.commit + "^{commit}")
    describe = git(repo, "log", "-1", "--format=%h %s", sha)
    rules = parse_rules(args.rules)
    out = args.out.resolve()

    if not args.list:
        if out.exists() and any(out.iterdir()):
            raise SystemExit(f"{out} is not empty; remove it first (this script never deletes)")
        probe = subprocess.run(["git", "-C", str(out.parent), "rev-parse", "--git-dir"], capture_output=True, text=True)
        if out.parent.exists() and probe.returncode == 0 and (out == repo or repo in out.parents):
            raise SystemExit("the export must be outside the old repo")
        out.mkdir(parents=True, exist_ok=True)

    forbid_terms = []
    if args.forbid_file:
        forbid_terms = [t.strip().lower() for t in args.forbid_file.read_text(encoding="utf-8").splitlines() if t.strip() and not t.startswith("#")]

    kept = Counter()          # top folder -> bytes
    kept_n = Counter()
    left = Counter()          # deciding rule -> files
    left_bytes = Counter()
    rewritten: Counter[str] = Counter()
    redacted: Counter[str] = Counter()
    problems: list[str] = []
    review: list[str] = []
    written: set[str] = set()

    proc = subprocess.Popen(["git", "-C", str(repo), "archive", "--format=tar", sha], stdout=subprocess.PIPE)
    assert proc.stdout is not None
    with tarfile.open(fileobj=proc.stdout, mode="r|") as tar:
        for member in tar:
            if member.isdir():
                continue
            path = member.name
            keep, rule = decide(rules, path)
            if not keep:
                left[rule] += 1
                left_bytes[rule] += member.size
                continue
            top = path.split("/", 1)[0] if "/" in path else "(root)"
            if any(rx.search(path) for rx in FORBIDDEN_PATHS):
                problems.append(f"forbidden path kept: {path}")
            if member.issym():
                kept_n[top] += 1
                if not args.list:
                    target = out / path
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.symlink_to(member.linkname)
                    written.add(path)
                continue
            data = tar.extractfile(member).read()  # type: ignore[union-attr]
            if is_text(data):
                text = data.decode("utf-8")
                new_text, n = OLD_RE.subn(args.new_name, text)
                if n:
                    rewritten[path] = n
                    data = new_text.encode("utf-8")
                    text = new_text
                for path_rx, rx, repl in REDACTIONS:
                    if path_rx.match(path):
                        text, n = rx.subn(repl, text)
                        if n:
                            redacted[path] += n
                            data = text.encode("utf-8")
                low = text.lower()
                for label, rx in BUILTIN_FORBIDDEN.items():
                    if rx.search(text):
                        problems.append(f"{label} in {path}")
                for term in forbid_terms:
                    if term in low:
                        problems.append(f"private term in {path} (term #{forbid_terms.index(term) + 1})")
                if REVIEW_WORDS.search(text):
                    review.append(path)
            kept[top] += len(data)
            kept_n[top] += 1
            if args.list:
                print(path)
                continue
            target = out / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            target.chmod(0o755 if member.mode & 0o111 else 0o644)
            written.add(path)
    if proc.wait() != 0:
        raise SystemExit("git archive failed")

    if not args.list:
        values = {"SOURCE_COMMIT": sha, "SOURCE_DESCRIBE": describe, "OLD_NAME": OLD_NAME, "NEW_NAME": args.new_name}
        for template, dest in (
            ("README.md.tmpl", "README.md"),
            ("data.yml.tmpl", ".github/workflows/data.yml"),
            ("EXPORT_INFO.txt.tmpl", "EXPORT_INFO.txt"),
        ):
            target = out / dest
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(render(HERE / "templates" / template, values), encoding="utf-8")
            kept_n["(generated)"] += 1

    # report
    total = sum(kept.values())
    print(f"source: {describe} ({sha})", file=sys.stderr)
    print(f"kept {sum(kept_n.values())} files, {total / 1e6:.1f} MB (text and binary content, uncompressed)", file=sys.stderr)
    for top, size in sorted(kept.items(), key=lambda kv: -kv[1]):
        print(f"  {size / 1e6:8.1f} MB  {kept_n[top]:6d} files  {top}", file=sys.stderr)
    print("left out (by rule):", file=sys.stderr)
    for rule, n in sorted(left.items(), key=lambda kv: -left_bytes[kv[0]]):
        label = "(no rule)" if rule is None else f"rule {rule + 1}"
        print(f"  {left_bytes[rule] / 1e6:8.1f} MB  {n:6d} files  {label}: {rules[rule][1].pattern if rule is not None else ''}", file=sys.stderr)
    if rewritten:
        print(f"renamed {OLD_NAME} -> {args.new_name} in {len(rewritten)} files:", file=sys.stderr)
        for path, n in sorted(rewritten.items()):
            print(f"  {n:3d}  {path}", file=sys.stderr)
    if redacted:
        print(f"device ids redacted in {len(redacted)} files:", file=sys.stderr)
        for path, n in sorted(redacted.items()):
            print(f"  {n:3d}  {path}", file=sys.stderr)
    if review:
        print("to read by a person (the word FAMILY appears):", file=sys.stderr)
        for path in sorted(review):
            print(f"  {path}", file=sys.stderr)
    if problems:
        print("STOP: the export holds what must not leave:", file=sys.stderr)
        for p in problems:
            print(f"  {p}", file=sys.stderr)
        return 2
    print("scan: clean (no tokens, device logs or private terms)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
