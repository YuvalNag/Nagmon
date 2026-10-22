# Moving the code to the private repo (YuvalNag/nagmon-game)

The old repo `YuvalNag/Nagmon` is a public fork of Tuxemon. The code moves,
as a snapshot with no history, to the private non-fork repo
`YuvalNag/nagmon-game`. Family details never move: they stay in
`YuvalNag/nagmon-data`.

Three files:

| File | What |
|---|---|
| `export_rules.txt` | What stays and what is left out (last matching rule wins). Each rule group says why. |
| `export_snapshot.py` | `git archive` of a commit, filtered by the rules, old repo name replaced, README of the new repo written, the export scanned for tokens, device logs, private terms. |
| `push_chunks.py` | Syncs the export into a clone of the new repo and commits it in parts of at most 15 MB, pushing one part at a time (the proxy allows 2 git operations per repo and answers HTTP 413 to a big push). Re-runnable. |

## The final snapshot (run after the last merge)

```bash
export HOME=/root
cd /home/user/wt-app            # nagmon-app, with the merged branches
git fetch origin && git status  # nothing uncommitted; or use --commit <sha>

# 1. a private list of terms that must not leave (children's names, device
#    ids ...), one per line, OUTSIDE the repos
FORBID=/tmp/forbid.txt          # e.g. ls /home/user/nagmon-data/devices > $FORBID

# 2. export (never overwrites: the folder must be empty or missing)
rm -rf /home/user/export-game
python3 tools/migrate/export_snapshot.py --commit nagmon-app \
        --out /home/user/export-game --forbid-file "$FORBID"      # exit 0 = clean

# 3. prove it stands alone (scratch copy; node_modules hard-linked, not copied)
cp -a /home/user/export-game /tmp/dry && cp -al app/node_modules /tmp/dry/app/node_modules
cd /tmp/dry && python -m tools.app.build_data --check && pytest tests/app -q
cd app && npx tsc --noEmit && npx vite build && npx vitest run
rm -rf /tmp/dry

# 4. commit in parts and push, one push at a time (about 9 parts, ~2 min)
cd /home/user/wt-app
python3 tools/migrate/push_chunks.py --export /home/user/export-game \
        --repo /home/user/nagmon-game --plan                       # see the parts
python3 tools/migrate/push_chunks.py --export /home/user/export-game \
        --repo /home/user/nagmon-game --push --pause 5
```

If a push fails after the retries, run the same command again: it continues
with what still differs. `--limit-mb 8` makes the parts smaller.

## What is left out, and where it goes

See the comments in `export_rules.txt`. In short: the old desktop game
packaging, scripts and tests, the Sphinx docs and concept art, the other
workflows, `art_sources/` (except the Solar monsters the build reads), 148 MB
of unused Tuxemon music, 19 MB of unused fonts, the intro frames. The raw art
goes to `YuvalNag/nagmon-art`.

## Tests

`pytest tests/migrate -q`
