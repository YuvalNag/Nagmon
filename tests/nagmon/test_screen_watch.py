"""Screen-time watcher during play (SDD_PROFILES_UI §2.6)."""

from __future__ import annotations

from nagmon.family.screentime import Action, Decision
from nagmon.screen_watch import STOP_TICK_S, ScreenTimeWatcher


class FakeRuntime:
    def __init__(self, decisions):
        self.decisions = list(decisions)
        self.ticks = []

    def tick(self, *, at_natural_break=False):
        self.ticks.append(at_natural_break)
        return self.decisions.pop(0) if self.decisions else None


ALLOW = Decision(Action.ALLOW)
WARN = Decision(Action.WARN_SOON, minutes_left=5, message_he="עוד 5 דקות")
BREAK = Decision(Action.BREAK_SUGGESTED, message_he="הפסקה?")


def stop(grace: int) -> Decision:
    return Decision(
        Action.MUST_STOP, message_he="להתראות", grace_seconds=grace
    )


def test_ticks_once_a_minute():
    rt = FakeRuntime([ALLOW, ALLOW])
    w = ScreenTimeWatcher(rt, tick_s=60)
    assert w.update(30, at_natural_break=False) is None
    assert rt.ticks == []
    assert w.update(31, at_natural_break=False) is None
    assert rt.ticks == [False]


def test_warns_only_once():
    rt = FakeRuntime([WARN, WARN])
    w = ScreenTimeWatcher(rt, tick_s=1)
    assert w.update(1, at_natural_break=False) is WARN
    assert w.update(1, at_natural_break=False) is None


def test_break_suggestion_is_shown():
    w = ScreenTimeWatcher(FakeRuntime([BREAK]), tick_s=1)
    assert w.update(1, at_natural_break=True) is BREAK


def test_stop_waits_for_grace_then_checks_often():
    rt = FakeRuntime([stop(120), stop(0)])
    w = ScreenTimeWatcher(rt, tick_s=60)
    assert w.update(60, at_natural_break=False) is None
    # Now it checks every few seconds to catch a natural pause.
    decision = w.update(STOP_TICK_S, at_natural_break=True)
    assert decision is not None and decision.action is Action.MUST_STOP
    assert rt.ticks == [False, True]


def test_no_child_no_decision():
    w = ScreenTimeWatcher(FakeRuntime([None]), tick_s=1)
    assert w.update(1, at_natural_break=True) is None
