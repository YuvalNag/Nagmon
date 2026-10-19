"""
The phone's crash report (docs/kids/SDD_ANDROID.md §2.6): what is
caught, what the report holds and hides, and that nothing leaves the
phone without the parent's tap.
"""

from __future__ import annotations

import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

import run_tuxemon
from nagmon import crash_report
from nagmon.crash_report import CrashGuard, CrashReports, build_report

REPO = Path(__file__).resolve().parents[2]
NOW = datetime(2026, 10, 19, 14, 30, tzinfo=timezone.utc)
INFO = {"version": "0.4.35", "build": "9", "device": "Xiaomi M2012K11G"}

GROQ = "gsk_" + "a1B2" * 12
GEMINI = "AIza" + "Sy" * 18
GITHUB = "github_pat_" + "11ABCDEFG" * 4


class Offers:
    """Stands in for the Android dialog: records what it was shown."""

    def __init__(self, fail: bool = False) -> None:
        self.shown: list[str] = []
        self.fail = fail

    def __call__(self, text: str) -> None:
        self.shown.append(text)
        if self.fail:
            raise RuntimeError("no window")


def _guard(tmp_path, offers, *, secrets=()):
    return CrashGuard(
        CrashReports(tmp_path / "crash"),
        info=lambda: INFO,
        offer=offers,
        secrets=lambda: secrets,
        clock=lambda: NOW,
    )


# ------------------------------------------------------------ the report


def test_known_kinds_of_keys_are_hidden():
    text = (
        f"groq={GROQ} gemini={GEMINI} gh={GITHUB} "
        "ghp_" + "x" * 36 + " sk-" + "y" * 40 + " Authorization: Bearer abc.def"
    )
    clean = crash_report.redact_secrets(text)
    for secret in (GROQ, GEMINI, GITHUB, "x" * 36, "y" * 40, "abc.def"):
        assert secret not in clean
    assert "groq=" in clean and "gemini=" in clean


def test_saved_keys_are_hidden_even_without_a_known_shape():
    clean = crash_report.redact_secrets("key is plainsecret123456", ["plainsecret123456"])
    assert "plainsecret123456" not in clean
    assert "key is" in clean


def test_report_says_what_and_where():
    report = build_report("Traceback ...\nValueError: bad", INFO, now=NOW)
    assert "0.4.35" in report and "build: 9" in report
    assert "Xiaomi M2012K11G" in report
    assert "2026-10-19 14:30 UTC" in report
    assert report.rstrip().endswith("ValueError: bad")


def test_a_long_report_keeps_its_end():
    """The last lines of a traceback name the error; they must survive."""
    error = "\n".join(f"line {i}" for i in range(20000)) + "\nKeyError: 'end'"
    report = build_report(error, INFO, now=NOW)
    assert len(report) <= crash_report.MAX_CHARS
    assert report.rstrip().endswith("KeyError: 'end'")
    assert "0.4.35" in report


# ------------------------------------------------------------- storage


def test_the_last_report_is_kept(tmp_path):
    reports = CrashReports(tmp_path / "crash")
    assert reports.last() is None
    reports.save("first")
    reports.save("second")
    assert reports.last() == "second"


def test_a_native_crash_is_read_once(tmp_path):
    reports = CrashReports(tmp_path / "crash")
    assert reports.take_native() is None
    reports.native_file.parent.mkdir(parents=True, exist_ok=True)
    reports.native_file.write_text("Fatal Python error: Segmentation fault")
    assert "Segmentation fault" in reports.take_native()
    assert reports.take_native() is None


def test_an_empty_native_file_is_not_a_crash(tmp_path):
    reports = CrashReports(tmp_path / "crash")
    reports.native_file.parent.mkdir(parents=True, exist_ok=True)
    reports.native_file.write_text("")
    assert reports.take_native() is None


def test_a_real_native_crash_is_written_down(tmp_path):
    """A segfault kills Python; faulthandler still leaves the stack."""
    root = tmp_path / "crash"
    code = (
        "import sys, faulthandler; sys.path.insert(0, sys.argv[1]);"
        "from nagmon.crash_report import CrashReports;"
        "CrashReports(__import__('pathlib').Path(sys.argv[2])).watch_native();"
        "faulthandler._sigsegv()"
    )
    done = subprocess.run(
        [sys.executable, "-c", code, str(REPO), str(root)],
        capture_output=True,
        timeout=60,
    )
    assert done.returncode != 0
    text = CrashReports(root).take_native()
    assert text and "Fatal Python error" in text


# --------------------------------------------------------------- guard


def test_a_normal_run_reports_nothing(tmp_path):
    offers = Offers()
    _guard(tmp_path, offers).run(lambda: None)
    assert offers.shown == []
    assert CrashReports(tmp_path / "crash").last() is None


def test_an_error_before_the_game_starts_is_offered(tmp_path):
    offers = Offers()

    def start():
        raise ImportError(f"no module pygame (key {GROQ})")

    with pytest.raises(SystemExit) as stop:
        _guard(tmp_path, offers).run(start)
    assert stop.value.code == 1
    assert len(offers.shown) == 1
    shown = offers.shown[0]
    assert "ImportError: no module pygame" in shown
    assert GROQ not in shown
    assert CrashReports(tmp_path / "crash").last() == shown


def test_saved_keys_are_hidden_in_the_offer(tmp_path):
    offers = Offers()

    def start():
        raise RuntimeError("token plainsecret123456 refused")

    with pytest.raises(SystemExit):
        _guard(tmp_path, offers, secrets=["plainsecret123456"]).run(start)
    assert "plainsecret123456" not in offers.shown[0]


def test_an_error_inside_the_game_is_offered(tmp_path, monkeypatch):
    """
    Tuxemon catches its own errors (handle_fatal_error) and exits; the
    guard hears about them through run_tuxemon.on_fatal_error.
    """
    monkeypatch.chdir(tmp_path)
    offers = Offers()
    guard = _guard(tmp_path, offers)
    monkeypatch.setattr(run_tuxemon, "on_fatal_error", guard.report)

    def start():
        try:
            raise KeyError("missing_map")
        except KeyError as e:
            run_tuxemon.handle_fatal_error(e)

    with pytest.raises(SystemExit):
        guard.run(start)
    assert len(offers.shown) == 1
    assert "KeyError: 'missing_map'" in offers.shown[0]


def test_a_clean_exit_is_not_a_crash(tmp_path):
    offers = Offers()

    def start():
        raise SystemExit(0)

    with pytest.raises(SystemExit):
        _guard(tmp_path, offers).run(start)
    assert offers.shown == []


def test_last_times_native_crash_is_offered_and_the_game_still_starts(tmp_path):
    reports = CrashReports(tmp_path / "crash")
    reports.native_file.parent.mkdir(parents=True, exist_ok=True)
    reports.native_file.write_text("Fatal Python error: Illegal instruction")
    offers = Offers()
    started = []
    _guard(tmp_path, offers).run(lambda: started.append(True))
    assert started == [True]
    assert len(offers.shown) == 1
    assert "Illegal instruction" in offers.shown[0]


def test_a_broken_dialog_does_not_hide_the_crash(tmp_path):
    offers = Offers(fail=True)

    def start():
        raise ValueError("boom")

    with pytest.raises(SystemExit):
        _guard(tmp_path, offers).run(start)
    assert "ValueError: boom" in CrashReports(tmp_path / "crash").last()


def test_missing_phone_details_still_give_a_report(tmp_path):
    offers = Offers()

    def no_info():
        raise RuntimeError("jnius missing")

    guard = CrashGuard(
        CrashReports(tmp_path / "crash"),
        info=no_info,
        offer=offers,
        clock=lambda: NOW,
    )
    with pytest.raises(SystemExit):
        guard.run(lambda: 1 / 0)
    assert "ZeroDivisionError" in offers.shown[0]


def test_android_entry_point_uses_the_guard():
    main = (REPO / "buildconfig" / "android" / "main.py").read_text()
    assert "CrashGuard" in main
    assert "run_tuxemon.on_fatal_error = guard.report" in main
    assert "guard.run(start)" in main


# ---------------------------------------------- the log and GitHub (SDD_FIELD_DATA §2.5)


LOG_LINES = "\n".join(f"14:{i:02d}:00 INFO nagmon.x: step {i}" for i in range(60))


def test_the_report_ends_with_the_apps_log():
    report = build_report("ValueError: bad", INFO, now=NOW, log=LOG_LINES)
    error_at = report.index("ValueError: bad")
    log_at = report.index(crash_report.LOG_MARKER)
    assert error_at < log_at
    assert report.rstrip().endswith("step 59")


def test_a_long_log_keeps_its_end_and_the_error():
    huge = "\n".join(f"line {i}" for i in range(20000))
    error = "\n".join(f"frame {i}" for i in range(20000)) + "\nKeyError: 'end'"
    report = build_report(error, INFO, now=NOW, log=huge)
    assert len(report) <= crash_report.MAX_CHARS
    assert "KeyError: 'end'" in report
    assert report.rstrip().endswith("line 19999")
    assert "0.4.35" in report


def test_without_a_log_the_report_is_unchanged():
    assert build_report("E", INFO, now=NOW) == build_report("E", INFO, now=NOW, log="")
    assert crash_report.LOG_MARKER not in build_report("E", INFO, now=NOW)


def test_the_guard_adds_the_log_with_keys_hidden(tmp_path):
    offers = Offers()
    guard = CrashGuard(
        CrashReports(tmp_path / "crash"),
        info=lambda: INFO,
        offer=offers,
        log=lambda: f"14:00:00 INFO nagmon.x: key {GROQ}\n14:00:01 INFO nagmon.x: last",
        clock=lambda: NOW,
    )
    with pytest.raises(SystemExit):
        guard.run(lambda: 1 / 0)
    shown = offers.shown[0]
    assert "ZeroDivisionError" in shown and "nagmon.x: last" in shown
    assert GROQ not in shown


def test_a_broken_log_does_not_hide_the_crash(tmp_path):
    offers = Offers()

    def broken():
        raise RuntimeError("no log")

    guard = CrashGuard(
        CrashReports(tmp_path / "crash"),
        info=lambda: INFO,
        offer=offers,
        log=broken,
        clock=lambda: NOW,
    )
    with pytest.raises(SystemExit):
        guard.run(lambda: 1 / 0)
    assert "ZeroDivisionError" in offers.shown[0]


class Field:
    """Stands in for FieldData: connected or not, sends or fails."""

    def __init__(self, *, connected=True, works=True, repo="YuvalNag/nagmon-data"):
        self.connected = connected
        self.works = works
        self.repo = repo
        self.sent: list[str] = []

    def send_crash(self, text):
        from nagmon.field_data.github import Code, Upload

        self.sent.append(text)
        return Upload(Code.OK if self.works else Code.OFFLINE)


def test_a_connected_phone_sends_the_crash_to_github():
    from nagmon.field_data.uploads import send_crash_or_share

    field, shared = Field(), []
    assert send_crash_or_share("report", field, shared.append) == "github"
    assert field.sent == ["report"] and shared == []


@pytest.mark.parametrize(
    "field", [None, Field(connected=False), Field(works=False)]
)
def test_otherwise_the_share_sheet_opens(field):
    from nagmon.field_data.uploads import send_crash_or_share

    shared = []
    assert send_crash_or_share("report", field, shared.append) == "share"
    assert shared == ["report"]


def test_a_broken_upload_still_opens_the_share_sheet():
    from nagmon.field_data.uploads import send_crash_or_share

    class Broken(Field):
        def send_crash(self, text):
            raise OSError("disk")

    shared = []
    assert send_crash_or_share("report", Broken(), shared.append) == "share"
    assert shared == ["report"]


def test_android_entry_point_sends_to_github_and_adds_the_log():
    main = (REPO / "buildconfig" / "android" / "main.py").read_text()
    assert "send_crash_or_share" in main
    assert "app_log.install" in main and "app_log.tail(100)" in main
    assert "app_log.note_crash()" in main


# ------------------------------------------------- children's names


def test_names_are_hidden_in_any_alphabet():
    text = (
        "WARNING tuxemon: נועה has no monsters\n"
        "ERROR tuxemon: Cannot start battle, Zephyrine has no monsters!\n"
        "ERROR tuxemon: zephyrine's owner not found (לנועה)\n"
    )
    hidden = crash_report.hide_names(text, ["נועה", "Zephyrine"])
    assert "נועה" not in hidden
    assert "zephyrine" not in hidden.lower()
    assert hidden.count(crash_report.NAME_MARK) == 4


def test_a_name_inside_an_english_word_is_left_alone():
    hidden = crash_report.hide_names("Danger at the dance, Dan", ["Dan"])
    assert hidden == f"Danger at the dance, {crash_report.NAME_MARK}"


def test_one_letter_and_empty_names_are_ignored():
    assert crash_report.hide_names("a map", ["a", "", "  "]) == "a map"


def test_the_guard_hides_the_childrens_names(tmp_path):
    offers = Offers()
    guard = CrashGuard(
        CrashReports(tmp_path / "crash"),
        info=lambda: INFO,
        offer=offers,
        log=lambda: "14:00:00 WARNING tuxemon: נועה has no monsters\n",
        names=lambda: ["נועה"],
        clock=lambda: NOW,
    )
    with pytest.raises(SystemExit):
        guard.run(lambda: 1 / 0)
    assert "נועה" not in offers.shown[0]
    assert "נועה" not in (tmp_path / "crash" / "last_crash.txt").read_text()


def test_broken_names_do_not_hide_the_crash(tmp_path):
    offers = Offers()

    def broken():
        raise OSError("no profiles")

    guard = CrashGuard(
        CrashReports(tmp_path / "crash"),
        info=lambda: INFO,
        offer=offers,
        names=broken,
        clock=lambda: NOW,
    )
    with pytest.raises(SystemExit):
        guard.run(lambda: 1 / 0)
    assert "ZeroDivisionError" in offers.shown[0]


def test_android_entry_point_hides_the_names():
    main = (REPO / "buildconfig" / "android" / "main.py").read_text()
    assert "names=" in main and ".names()" in main
