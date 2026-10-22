#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0
"""Put an export (export_snapshot.py) into the new repo as a few small commits.

    # 1. see the plan, change nothing
    python tools/migrate/push_chunks.py --export /home/user/export-game --repo /home/user/nagmon-game --plan
    # 2. sync + commit in chunks, push nothing
    python tools/migrate/push_chunks.py --export ... --repo ...
    # 3. sync + commit + push, ONE push at a time
    python tools/migrate/push_chunks.py --export ... --repo ... --push

Why chunks: the session's git proxy takes 2 concurrent git operations per
repo and refuses a big push (HTTP 413). One snapshot of about 130 MB goes as
~10 commits of at most ``--limit-mb`` each, pushed one after the other.

It works on a first run (empty repo) and on a re-run after a newer export:
the working tree is made equal to the export, and only what differs from the
last commit is chunked (deleted files first, in the first chunk).
A push that fails is retried; a re-run continues where the last one stopped
(the commits made so far are already in the repo, the rest still differs).
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

TRAILERS = (
    "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\n"
    "Claude-Session: https://claude.ai/code/session_01QXGUTMY9kQ8kTkR3CqxLvx"
)


def run(repo: Path, *args: str, input: str | None = None, check: bool = True, timeout: int = 900) -> subprocess.CompletedProcess[str]:
    env = dict(os.environ, HOME=os.environ.get("HOME") or "/root", GIT_TERMINAL_PROMPT="0")
    return subprocess.run(["git", "-C", str(repo), *args], input=input, check=check, text=True, capture_output=True, env=env, timeout=timeout)


def sync(export: Path, repo: Path) -> None:
    """Make the working tree of ``repo`` equal to ``export`` (keeps .git)."""
    wanted = {p.relative_to(export).as_posix() for p in export.rglob("*") if p.is_file() or p.is_symlink()}
    for p in sorted(repo.rglob("*"), reverse=True):
        rel = p.relative_to(repo).as_posix()
        if rel == ".git" or rel.startswith(".git/"):
            continue
        if (p.is_file() or p.is_symlink()) and rel not in wanted:
            p.unlink()
        elif p.is_dir() and not p.is_symlink() and not any(p.iterdir()):
            p.rmdir()
    for rel in sorted(wanted):
        src, dst = export / rel, repo / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.is_symlink():
            if dst.is_symlink() or dst.exists():
                dst.unlink()
            dst.symlink_to(os.readlink(src))
        elif not dst.is_file() or dst.stat().st_size != src.stat().st_size or dst.read_bytes() != src.read_bytes():
            shutil.copy2(src, dst)


def changed(repo: Path) -> tuple[list[str], list[str]]:
    """(paths to add, paths deleted) relative to the last commit."""
    out = run(repo, "status", "--porcelain", "-z", "-uall").stdout
    add, gone = [], []
    for entry in out.split("\0"):
        if not entry:
            continue
        code, path = entry[:2], entry[3:]
        (gone if "D" in code else add).append(path)
    return sorted(add), sorted(gone)


def make_chunks(repo: Path, add: list[str], gone: list[str], limit: int) -> list[list[str]]:
    chunks: list[list[str]] = []
    cur: list[str] = list(gone)
    size = 0
    for path in add:
        n = os.lstat(repo / path).st_size
        if cur and size + n > limit:
            chunks.append(cur)
            cur, size = [], 0
        cur.append(path)
        size += n
    if cur:
        chunks.append(cur)
    return chunks


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--export", type=Path, required=True)
    ap.add_argument("--repo", type=Path, required=True, help="a clone of the new repo (empty on the first run)")
    ap.add_argument("--branch", default="main", help="branch to push (default main, the new repo's default branch)")
    ap.add_argument("--remote", default="origin")
    ap.add_argument("--limit-mb", type=float, default=15.0, help="most bytes of file content per commit/push (default 15)")
    ap.add_argument("--message", default=None, help="first line of every commit (default: Snapshot of <source commit>)")
    ap.add_argument("--plan", action="store_true", help="print the chunks only; the repo is not touched")
    ap.add_argument("--push", action="store_true", help="push each commit, one at a time, then wait for the next")
    ap.add_argument("--retries", type=int, default=3)
    ap.add_argument("--pause", type=float, default=5.0, help="seconds between pushes")
    args = ap.parse_args()

    export, repo = args.export.resolve(), args.repo.resolve()
    if not (repo / ".git").exists():
        raise SystemExit(f"{repo} is not a git clone")
    if export == repo or export in repo.parents or repo in export.parents:
        raise SystemExit("export and repo must be different, unrelated folders")
    info = export / "EXPORT_INFO.txt"
    source = next((l.split(":", 1)[1].strip() for l in info.read_text().splitlines() if l.startswith("Source commit:")), "?") if info.exists() else "?"
    title = args.message or f"Snapshot of {source[:12]} from the old repo"
    limit = int(args.limit_mb * 1e6)

    if args.plan:
        # plan against the export itself: everything not yet in the repo
        probe_root, files = export, sorted(p.relative_to(export).as_posix() for p in export.rglob("*") if p.is_file())
        have = set(run(repo, "ls-files").stdout.splitlines()) if (repo / ".git").exists() else set()
        add = [f for f in files if f not in have]
        gone = sorted(have - set(files))
        chunks, cur, size = [], list(gone), 0
        for f in add:
            n = (probe_root / f).stat().st_size
            if cur and size + n > limit:
                chunks.append((cur, size)); cur, size = [], 0
            cur.append(f); size += n
        if cur:
            chunks.append((cur, size))
        print(f"{len(add)} files to add, {len(gone)} to delete, {len(chunks)} chunks of at most {args.limit_mb:g} MB")
        for i, (paths, sz) in enumerate(chunks, 1):
            print(f"  part {i}/{len(chunks)}: {len(paths):5d} files {sz / 1e6:6.1f} MB  {paths[0]}  ..  {paths[-1]}")
        return 0

    sync(export, repo)
    add, gone = changed(repo)
    chunks = make_chunks(repo, add, gone, limit)
    if not chunks:
        print("nothing to commit: the repo already equals the export")
    for i, paths in enumerate(chunks, 1):
        run(repo, "add", "--all", "--pathspec-from-file=-", "--pathspec-file-nul", input="\0".join(paths) + "\0")
        msg = f"{title} (part {i}/{len(chunks)})\n\n{paths[0]} .. {paths[-1]}\n\n{TRAILERS}\n"
        run(repo, "-c", "user.email=noreply@anthropic.com", "-c", "user.name=Claude", "commit", "-q", "-m", msg)
        print(f"committed part {i}/{len(chunks)}: {len(paths)} files", flush=True)
        if args.push:
            for attempt in range(1, args.retries + 1):
                r = run(repo, "push", args.remote, f"HEAD:refs/heads/{args.branch}", check=False, timeout=900)
                if r.returncode == 0:
                    print(f"pushed part {i}/{len(chunks)}", flush=True)
                    break
                print(f"push failed (try {attempt}): {r.stderr.strip()[-300:]}", file=sys.stderr, flush=True)
                time.sleep(args.pause * attempt * 2)
            else:
                print(f"STOP at part {i}: re-run the same command to continue", file=sys.stderr)
                return 1
            time.sleep(args.pause)
    if args.push is False and chunks:
        print("committed locally, nothing pushed; add --push to push (one at a time)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
