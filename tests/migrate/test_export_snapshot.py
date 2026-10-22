# SPDX-License-Identifier: GPL-3.0
"""The snapshot export (tools/migrate): rules, renaming, scan, chunks."""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATE = ROOT / "tools" / "migrate"


def load(name: str):
    spec = importlib.util.spec_from_file_location(name, MIGRATE / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


export = load("export_snapshot")
chunks = load("push_chunks")


def rules_of(text: str, tmp_path: Path):
    f = tmp_path / "rules.txt"
    f.write_text(text, encoding="utf-8")
    return export.parse_rules(f)


def test_last_matching_rule_wins_and_folders_take_their_children(tmp_path):
    rules = rules_of("- music\n+ music/keep.ogg\n- music/keep.ogg/x\n", tmp_path)
    assert export.decide(rules, "music/a.ogg")[0] is False
    assert export.decide(rules, "music/keep.ogg")[0] is True
    assert export.decide(rules, "other/a.ogg")[0] is True
    assert export.decide(rules, "musical/a.ogg")[0] is True  # not a prefix of a name


def test_globs(tmp_path):
    rules = rules_of("- a/*.png\n- b/**/skip\n", tmp_path)
    assert export.decide(rules, "a/x.png")[0] is False
    assert export.decide(rules, "a/sub/x.png")[0] is True
    assert export.decide(rules, "b/skip/f")[0] is False
    assert export.decide(rules, "b/x/y/skip")[0] is False
    assert export.decide(rules, "b/other")[0] is True


def test_bad_rule_is_refused(tmp_path):
    with pytest.raises(SystemExit):
        rules_of("keep everything\n", tmp_path)


def test_old_name_is_replaced_but_not_longer_names():
    text = "YuvalNag/Nagmon and github.com/YuvalNag/Nagmon.git, not YuvalNag/nagmon-data or YuvalNag/Nagmon-x"
    new = export.OLD_RE.sub("YuvalNag/nagmon-game", text)
    assert new == "YuvalNag/nagmon-game and github.com/YuvalNag/nagmon-game.git, not YuvalNag/nagmon-data or YuvalNag/Nagmon-x"


def git(cwd: Path, *a: str) -> str:
    env = dict(os.environ, HOME=os.environ.get("HOME", "/root"))
    return subprocess.run(
        ["git", "-c", "user.email=t@t", "-c", "user.name=t", *a],
        cwd=cwd, check=True, capture_output=True, text=True, env=env,
    ).stdout


def make_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "old"
    (repo / "tools" / "migrate" / "templates").mkdir(parents=True)
    for tmpl in (MIGRATE / "templates").iterdir():
        (repo / "tools" / "migrate" / "templates" / tmpl.name).write_text(tmpl.read_text(encoding="utf-8"), encoding="utf-8")
    (repo / "app").mkdir()
    (repo / "app" / "a.ts").write_text('const R = "YuvalNag/Nagmon";\n', encoding="utf-8")
    (repo / "app" / "run.sh").write_text("#!/bin/sh\n", encoding="utf-8")
    (repo / "app" / "run.sh").chmod(0o755)
    (repo / "art_sources").mkdir()
    (repo / "art_sources" / "big.png").write_bytes(b"\x89PNG\0\0")
    (repo / "docs" / "app").mkdir(parents=True)
    (repo / "docs" / "app" / "d.md").write_text("log devices/<device-id>/logs/x.txt\n", encoding="utf-8")
    (repo / "README.md").write_text("old\n", encoding="utf-8")
    git(repo, "init", "-q", "-b", "main")
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "first")
    return repo


def run_export(repo: Path, out: Path, *extra: str, rules: str | None = None):
    rules_file = repo / "rules.txt"
    rules_file.write_text(rules or "- art_sources\n- README.md\n- docs\n+ docs/app\n", encoding="utf-8")
    return subprocess.run(
        [sys.executable, str(MIGRATE / "export_snapshot.py"), "--repo", str(repo), "--out", str(out),
         "--rules", str(rules_file), *extra],
        capture_output=True, text=True, env=dict(os.environ, HOME=os.environ.get("HOME", "/root")),
    )


def test_export_end_to_end(tmp_path):
    repo = make_repo(tmp_path)
    out = tmp_path / "out"
    r = run_export(repo, out)
    assert r.returncode == 0, r.stderr
    assert (out / "app" / "a.ts").read_text() == 'const R = "YuvalNag/nagmon-game";\n'
    assert not (out / "art_sources").exists()
    assert os.access(out / "app" / "run.sh", os.X_OK)
    readme = (out / "README.md").read_text()
    assert "YuvalNag/nagmon-game" in readme and "{{" not in readme
    assert (out / ".github" / "workflows" / "data.yml").is_file()
    assert git(repo, "rev-parse", "HEAD").strip() in (out / "EXPORT_INFO.txt").read_text()
    assert "devices/<device-id>/" in (out / "docs" / "app" / "d.md").read_text()
    # a second export into a folder with files is refused (never deletes)
    assert run_export(repo, out).returncode != 0


def test_scan_stops_on_a_token_a_private_term_and_a_data_folder(tmp_path):
    repo = make_repo(tmp_path)
    (repo / "app" / "t.ts").write_text("token ghp_" + "a" * 36 + "\nmy-secret-name\n", encoding="utf-8")
    (repo / "devices" / "ab12cd34").mkdir(parents=True)
    (repo / "devices" / "ab12cd34" / "x.txt").write_text("x", encoding="utf-8")
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "bad")
    forbid = tmp_path / "forbid.txt"
    forbid.write_text("My-Secret-Name\n", encoding="utf-8")
    r = run_export(repo, tmp_path / "out", "--forbid-file", str(forbid))
    assert r.returncode == 2
    assert "GitHub token in app/t.ts" in r.stderr
    assert "private term in app/t.ts" in r.stderr
    assert "forbidden path kept: devices/ab12cd34/x.txt" in r.stderr


def test_the_real_rules_keep_what_the_build_needs_and_leave_the_heavy_art():
    rules = export.parse_rules(MIGRATE / "export_rules.txt")
    keep = lambda p: export.decide(rules, p)[0]  # noqa: E731
    for path in (
        "app/src/main.tsx", "tools/app/build_data.py", "tests/app/conftest.py",
        "mods/nagmon/mod.yaml", "mods/tuxemon/db/monster/x.json", "tuxemon/prepare.py",
        "nagmon/learning/engine.py", ".github/workflows/app.yml", "LICENSE", "ATTRIBUTIONS.md",
        "art_sources/solar/monsters/combit/front.png", "docs/app/SDD.md",
        "mods/tuxemon/music/JRPG_town_loop.ogg", "mods/tuxemon/font/OFL.txt",
        "mods/nagmon/gfx/emoji/LICENSE.md", "tools/android/screen_shape.py",
    ):
        assert keep(path), path
    for path in (
        "art_sources/intro.mp4", "art_sources/batch3/map/x.png", "mods/tuxemon/music/Jester Theme.mp3",
        "mods/tuxemon/font/Arbata.ttf", "mods/nagmon/gfx/intro/0001.jpg", "buildconfig/build_deb.sh",
        ".github/workflows/android.yml", "tools/migrate/export_snapshot.py", "tests/tuxemon/test_x.py",
        "docs/concept/x.jpg", "scripts/check.sh", "run_nagmon.sh",
    ):
        assert not keep(path), path


def test_chunks_respect_the_limit_and_put_deletes_first(tmp_path):
    repo = tmp_path / "r"
    repo.mkdir()
    for name, size in (("a", 6), ("b", 6), ("c", 6), ("d", 20)):
        (repo / name).write_bytes(b"x" * size)
    got = chunks.make_chunks(repo, ["a", "b", "c", "d"], ["gone"], 13)
    assert got == [["gone", "a", "b"], ["c"], ["d"]]


def test_a_real_device_id_in_the_docs_stops_the_export(tmp_path):
    repo = make_repo(tmp_path)
    (repo / "docs" / "app" / "d.md").write_text("log devices/77bcce20/logs/x.txt\n", encoding="utf-8")
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "leak")
    r = run_export(repo, tmp_path / "out")
    assert r.returncode != 0
    assert "a real device id in docs/app/d.md" in r.stderr
