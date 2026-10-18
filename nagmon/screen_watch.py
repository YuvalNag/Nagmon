"""
Watches play time while a child is in the world (SDD_PROFILES_UI §2.6):
asks the runtime once a minute and says when to warn, suggest a break,
or stop at a natural pause.
"""

from __future__ import annotations

from typing import Any

from nagmon.family.screentime import Action, Decision

TICK_S = 60.0
#: Once a stop is due, check often so the first natural pause is caught.
STOP_TICK_S = 3.0


class ScreenTimeWatcher:
    def __init__(self, rt: Any, *, tick_s: float = TICK_S) -> None:
        self.rt = rt
        self.tick_s = tick_s
        self._elapsed = 0.0
        self._warned = False
        self._stopping = False

    def update(self, dt: float, *, at_natural_break: bool) -> Decision | None:
        """A decision the game must show now, or None."""
        self._elapsed += dt
        interval = STOP_TICK_S if self._stopping else self.tick_s
        if self._elapsed < interval:
            return None
        self._elapsed = 0.0
        decision = self.rt.tick(at_natural_break=at_natural_break)
        if decision is None:
            return None
        if decision.action is Action.MUST_STOP:
            self._stopping = True
            return decision if decision.grace_seconds <= 0 else None
        self._stopping = False
        if decision.action is Action.WARN_SOON:
            if self._warned:
                return None
            self._warned = True
            return decision
        if decision.action is Action.BREAK_SUGGESTED:
            return decision
        return None
