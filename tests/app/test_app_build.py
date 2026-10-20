"""The committed app data is what tools/app/build_data.py builds."""

from pathlib import Path

GAME = Path(__file__).resolve().parents[2] / "app" / "public" / "game"
MAX_TOTAL_BYTES = 35 * 1024 * 1024


def test_committed_app_data_is_up_to_date(built):
    out, _ = built
    problems = out.differences(GAME)
    assert not problems, (
        "app/public/game is out of date, run tools/app/build_data.py:\n"
        + "\n".join(problems[:40])
    )


def test_app_data_stays_within_the_size_budget():
    total = sum(p.stat().st_size for p in GAME.rglob("*") if p.is_file())
    assert total <= MAX_TOTAL_BYTES


def test_build_leaves_no_notes(built):
    _, report = built
    assert report["notes"] == []
