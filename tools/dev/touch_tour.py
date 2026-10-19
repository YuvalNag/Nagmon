"""
Plays the game the way a phone does: the Android settings (touch arrows,
taps, a 20:9 screen) and only taps, no keys (docs/kids/SDD_ANDROID.md §3).

Usage:
    HOME=/tmp/nagmon-home python tools/dev/touch_tour.py OUTDIR

Steps: "who is playing" -> tap a child -> a question -> tap the right
answer -> tap "continue" -> the world with the touch arrows.
Exits non-zero if a tap did not do what a child expects.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
REPO = Path(__file__).resolve().parents[2]
os.environ["ANDROID_ARGUMENT"] = str(REPO)
sys.path.insert(0, str(REPO))
os.chdir(REPO)

from nagmon.android.setup import prepare_environment  # noqa: E402

prepare_environment(os.environ)

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)

from tuxemon.platform import platform  # noqa: E402

platform.init()
import pygame  # noqa: E402

from tuxemon.prepare import pygame_init  # noqa: E402

# The Poco F3's screen in landscape (SDL's dummy driver reports 1024x768).
_info = pygame.display.Info
pygame.display.Info = lambda: type(  # type: ignore[assignment]
    "Info", (), {"current_w": 2400, "current_h": 1080}
)()

context = pygame_init()
pygame.display.Info = _info  # type: ignore[assignment]

from tuxemon import main as tm  # noqa: E402
from tuxemon.client import LocalPygameClient  # noqa: E402
from tuxemon.locale.locale import T  # noqa: E402
from tuxemon.session import local_session  # noqa: E402
from tuxemon.user_config import CONFIG  # noqa: E402

CONFIG.update_locale("he_IL")
T.change_language("he_IL")
config = CONFIG.copy()
config.config_model.display.splash = False
client = LocalPygameClient.create(config, context)
local_session.set_client(client)
tm.configure_game_states(client, config, None)

DT = 1.0 / 60
failures: list[str] = []


def check(ok: bool, what: str) -> None:
    print(("ok  " if ok else "FAIL"), what)
    if not ok:
        failures.append(what)


def step(n: int) -> None:
    for _ in range(n):
        client.update(DT)
        client.draw()
        client.input_manager.draw_inputs(client.screen)
        pygame.display.update()


def names() -> list[str]:
    return [s.name for s in client.active_states]


def shot(name: str) -> None:
    path = out / f"{name}.png"
    pygame.image.save(pygame.display.get_surface(), path)
    print("saved", path, names())


def tap(pos: tuple[int, int]) -> None:
    """What SDL sends for a finger: a mouse press and release."""
    pos = (int(pos[0]), int(pos[1]))
    pygame.event.post(
        pygame.event.Event(pygame.MOUSEBUTTONDOWN, pos=pos, button=1)
    )
    step(3)
    pygame.event.post(
        pygame.event.Event(pygame.MOUSEBUTTONUP, pos=pos, button=1)
    )
    step(10)


def tap_widget(state_name: str, widget_id: str) -> bool:
    state = client.get_state_by_name(state_name)
    widget = state.menu.get_widget(widget_id, recursive=True)
    if widget is None:
        print("no widget", widget_id)
        return False
    tap(widget.get_rect(to_real_position=True).center)
    return True


def tap_key(label: str) -> bool:
    """Taps a key of the on-screen keyboard (a classic Tuxemon menu)."""
    state = client.active_states[0]
    state.menu_items.update_rect_from_parent()
    group = state.menu_items.rect
    for item in state.menu_items:
        obj = item.game_object
        is_end = label == "END" and obj.action == state.confirm
        if is_end or getattr(obj, "char", None) == label:
            pos = (
                group.left + item.rect.centerx,
                group.top + item.rect.centery,
            )
            tap(pos)
            print(
                "tap", label, pos, "->", state.input_controller.current_string
            )
            return True
    print("no key", label)
    return False


def tap_choice(index: int = 0) -> bool:
    """Taps a button of the top pygame_menu screen (a choice list)."""
    state = client.active_states[0]
    found = [w for w in state.menu.get_widgets() if w.is_selectable]
    if len(found) <= index:
        print("no choice", index, names())
        return False
    tap(found[index].get_rect(to_real_position=True).center)
    return True


def type_on_screen(text: str) -> None:
    for ch in text:
        tap_key(ch)
    tap_key("END")
    step(20)


def tap_through_dialogs(limit: int = 6) -> None:
    for _ in range(limit):
        if names()[0] != "DialogState":
            return
        tap((context.resolution[0] // 2, context.resolution[1] // 3))
        step(20)


def wait_for(state: str, frames: int = 2400) -> bool:
    for _ in range(frames // 20):
        if state in names():
            return True
        step(20)
        if "IntroState" in names():
            tap((context.resolution[0] // 2, context.resolution[1] // 2))
    return state in names()


print("drawing size:", context.resolution, "scale:", context.scale)
check(context.resolution == (1600, 720), "20:9 screen draws at 1600x720")
check(CONFIG.controller.overlay, "touch arrows are on")

from nagmon.runtime import get_runtime  # noqa: E402

check(wait_for("ProfileSelectState"), "who-is-playing screen")
step(30)
shot("t00_first_run_pin")
if names()[0] == "InputMenu":
    step(60)  # the keyboard slides open first
    type_on_screen("1234")
    shot("t00b_pin_typed")
    tap_through_dialogs()
check(get_runtime().parent.has_pin(), "parent PIN set by tapping digits")
print("states after PIN:", names())
if names()[0] == "InputMenu":  # the new-child wizard: name
    step(60)
    type_on_screen("נועה")
    shot("t00c_name_typed")
    tap_through_dialogs()
    check(names()[0] == "ChoiceState", "grade list after the name")
    shot("t00d_grade")
    tap_choice(1)  # first grade
    step(30)
    check(names()[0] == "ChoiceState", "character list after the grade")
    shot("t00e_avatar")
    tap_choice(0)
    step(30)
    tap_through_dialogs()
    step(30)
rt = get_runtime()
check(
    [p.name for p in rt.store.list()] == ["נועה"], "child created by taps only"
)
print("states after wizard:", names())
assert rt is not None
from nagmon.family.screentime import ScreenLimits  # noqa: E402

rt.parent.settings.default_limits = ScreenLimits(
    daily_max_minutes=None,
    weekday_windows=None,
    weekend_windows=None,
    bedtime=None,
)
rt.parent.settings.shabbat_mode = False
rt.parent.settings.holiday_mode = False
if not rt.store.list():
    from nagmon.game_flow import defaults_for_grade

    rt.store.create(name="נועה", avatar="girl_light", **defaults_for_grade(1))
client.get_state_by_name("ProfileSelectState").rebuild()
step(30)
shot("t01_who_plays")

child = rt.store.list()[0]
tap_widget("ProfileSelectState", f"child_{child.id}")
step(60)
check(rt.active is not None and rt.active.id == child.id, "tap picks a child")
shot("t02_after_tap")

if rt.engine is not None:
    client.push_state("QuizState", subject="math", context="quest")
    step(40)
    quiz = client.get_state_by_name("QuizState")
    if quiz.question is not None and quiz.question.meta.get("worked_example"):
        tap_widget("QuizState", "example_done")
        step(20)
    q = quiz.question
    shot("t03_question")
    if q is not None and q.kind == "choice":
        tap_widget("QuizState", f"choice_{q.answer}")
        step(20)
        shot("t04_feedback")
        check(
            quiz.outcome is not None and quiz.outcome.correct,
            "tap on the right answer counts as right",
        )
        tap_widget("QuizState", "continue")
        step(20)
        check("QuizState" not in names(), "tap on continue closes it")
    else:
        print("question kind:", q.kind if q else None)

shot("t05_title")

# ------------------------------------------------------------ the world
tap_widget("StartState", "menu_new_game")
step(60)
if "ChoiceState" in names()[:1]:  # more than one mod: take the first
    tap_choice(0)
    step(60)


def finger(kind: int, pos: tuple[int, int]) -> None:
    w, h = context.resolution
    pygame.event.post(
        pygame.event.Event(
            kind,
            x=pos[0] / w,
            y=pos[1] / h,
            fingerid=1,
            touch_id=0,
            dx=0,
            dy=0,
        )
    )


def overlay():
    return client.input_manager.core_devices.overlay


for _ in range(150):
    top = names()[0] if names() else ""
    if top == "WorldState":
        break
    if top == "DialogState":
        check_arrows = overlay().active
        if check_arrows:
            failures.append("arrows shown over a dialog")
        tap((context.resolution[0] // 2, context.resolution[1] // 3))
    elif top == "ChoiceMonster":
        shot("t06_starter")
        tap_choice(1)  # "choose" under the first monster
    elif top == "ChoiceState":
        tap_choice(0)
    elif top == "JournalInfoState":
        shot("t06b_info")
        tap((context.resolution[0] // 2, context.resolution[1] // 2))
    elif top == "QuizState":
        quiz = client.get_state_by_name("QuizState")
        if not quiz.example_seen:
            shot("t06c_worked_example")
            tap_widget("QuizState", "example_done")
        elif quiz.outcome is None and quiz.question is not None:
            if quiz.question.kind == "choice":
                tap_widget("QuizState", f"choice_{quiz.question.answer}")
            else:
                quiz.answer(quiz.question.answer)
        else:
            tap_widget("QuizState", "continue")
    step(30)
print("world states:", names())
check(names()[:1] == ["WorldState"], "reached the map by taps")
if names()[:1] == ["WorldState"]:
    step(10)
    check(overlay().active, "arrows shown on the map")
    shot("t07_map_with_arrows")
    player = local_session.player
    start = tuple(player.tile_pos)
    for arrow in ("right", "left", "down", "up"):
        rect = getattr(overlay().ui.dpad.rect, arrow)
        finger(pygame.FINGERDOWN, rect.center)
        step(40)
        finger(pygame.FINGERUP, rect.center)
        step(20)
        if tuple(player.tile_pos) != start:
            break
    print("player", start, "->", tuple(player.tile_pos))
    check(tuple(player.tile_pos) != start, "holding an arrow walks")
    shot("t08_walked")

shot("t09_end")
print("states:", names())
if failures:
    print("FAILED:", failures)
    sys.exit(1)
print("touch tour passed")
