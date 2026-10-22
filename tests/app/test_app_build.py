"""The committed app data is what tools/app/build_data.py builds."""

from pathlib import Path

GAME = Path(__file__).resolve().parents[2] / "app" / "public" / "game"
MAX_TOTAL_BYTES = 40 * 1024 * 1024
#: The chapters' pictures (art/chapters/) are lazy: not in the app unless the
#: build asks (NAGMON_CHAPTER_ART=1, docs/app/ART_ASSETS.md); they have a budget of their own.
MAX_CHAPTER_BYTES = 20 * 1024 * 1024
LAZY = GAME / "art" / "chapters"


def test_committed_app_data_is_up_to_date(built):
    out, _ = built
    problems = out.differences(GAME)
    assert not problems, (
        "app/public/game is out of date, run tools/app/build_data.py:\n"
        + "\n".join(problems[:40])
    )


def test_app_data_stays_within_the_size_budget():
    files = [p for p in GAME.rglob("*") if p.is_file()]
    lazy = sum(p.stat().st_size for p in files if LAZY in p.parents)
    total = sum(p.stat().st_size for p in files) - lazy
    assert total <= MAX_TOTAL_BYTES
    assert lazy <= MAX_CHAPTER_BYTES


def test_build_leaves_no_notes(built):
    _, report = built
    assert report["notes"] == []
