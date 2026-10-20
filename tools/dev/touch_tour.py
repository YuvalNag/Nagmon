"""
Plays the game the way a phone does: the Android settings (touch arrows,
taps, a 20:9 screen) and only taps, no keys (docs/kids/SDD_ANDROID.md §3).

Usage:
    HOME=/tmp/nagmon-home python tools/dev/touch_tour.py OUTDIR [--system-locale]

Steps: "who is playing" -> the parent code on its digit pad (twice) ->
a new child -> a wrong code and the parent area -> "send log" -> tap a
child -> a question -> tap the right answer -> tap "continue" -> the
world with the touch arrows -> a wild battle's menu. On the way it saves
the pad, the letter board, a long dialog and the battle menu, and checks
that the text fits the screen. ``--system-locale`` keeps the language
the phone's settings give (no forced Hebrew): a phone must speak Hebrew
on its own (docs/kids/SDD_ANDROID.md §2.7).
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
FORCE_HEBREW = "--system-locale" not in sys.argv[2:]
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

if FORCE_HEBREW:
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


def check_fits(state_name: str) -> None:
    """No button or label of a pygame_menu screen leaves the screen."""
    state = client.get_state_by_name(state_name)
    screen = pygame.Rect((0, 0), context.resolution)
    out = [
        w.get_title()
        for w in state.menu.get_widgets()
        if w.is_visible()
        and not screen.contains(w.get_rect(to_real_position=True))
    ]
    check(not out, f"{state_name}: everything on the screen {out}")


def text_fits(area) -> bool:
    """Every wrapped line of a dialog box is inside the box."""
    from tuxemon.ui.draw import wrapped_text_height

    needed = wrapped_text_height(
        area.text, area.font, area.rect.width, area.line_spacing
    )
    print("dialog text needs", needed, "of", area.rect.height, "px")
    return bool(area.text) and needed <= area.rect.height


def words_inside(menu) -> bool:
    """Every item of a classic Tuxemon menu is inside the menu's border."""
    menu.menu_items.update_rect_from_parent()
    # the words' drop shadow (half a game pixel) may touch the border
    shadow = context.scale
    inner = menu.calc_internal_rect().inflate(shadow, shadow)
    out = [
        rect
        for rect in (
            item.rect.move(menu.menu_items.rect.topleft)
            for item in menu.menu_items
        )
        if not inner.contains(rect)
    ]
    if out:
        print(menu.name, "inside", inner, "but", out)
    return not out


def type_on_screen(text: str, before_end: str | None = None) -> None:
    for ch in text:
        tap_key(ch)
    if before_end:
        shot(before_end)
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
check(
    context.resolution == (2400, 1080),
    "20:9 screen draws at its own 2400x1080",
)
check(CONFIG.controller.overlay, "touch arrows are on")
check(
    CONFIG.locale.slug == "he_IL" and T.get_current_language() == "he_IL",
    f"the phone speaks Hebrew ({CONFIG.locale.slug}, forced: {FORCE_HEBREW})",
)
check(CONFIG.locale.font_file == "Rubik-Medium.ttf", "with the Rubik font")

from nagmon.runtime import get_runtime  # noqa: E402

check(wait_for("ProfileSelectState"), "who-is-playing screen")
step(30)
check(names()[0] == "ProfileSelectState", "the intro's tap pressed nothing")
tap_widget("ProfileSelectState", "new_child")
step(30)
if names()[0] == "InputMenu":
    step(60)  # the keyboard slides open first
    shot("t00_first_run_pin")
    pad = client.active_states[0]
    chars = {i.game_object.char for i in pad.menu_items} - {None}
    check(chars == set("0123456789"), f"the code pad has digits only {chars}")
    check(pad.input_display.prompt.text.count("\n") == 1, "two-line prompt")
    type_on_screen("1234", before_end="t00b_pin_typed")
    check(
        "1" not in pad.input_display.text_area.text,
        "the typed code is hidden",
    )
    check(names()[0] == "InputMenu", "the code is asked again")
    step(60)
    shot("t00b2_pin_again")
    type_on_screen("1234")
    step(20)
    shot("t00b3_pin_saved")
    tap((context.resolution[0] // 2, context.resolution[1] // 3))
    step(20)
    shot("t00b4_github_where")
    tap_through_dialogs()
check(get_runtime().parent.has_pin(), "parent PIN set by tapping digits")
print("states after PIN:", names())
if names()[0] == "InputMenu":  # the new-child wizard: name
    step(60)
    type_on_screen("נועה", before_end="t00c_letter_board")
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
check_fits("ProfileSelectState")

# The parent area: a wrong code goes back to the pad, then the right one.
tap_widget("ProfileSelectState", "parents")
step(60)
if names()[0] == "InputMenu":
    type_on_screen("9999")
    shot("t01a_wrong_code")
    tap_through_dialogs()
    check(names()[0] == "InputMenu", "a wrong code goes back to the pad")
    step(60)
    type_on_screen("1234")
    step(30)
check(names()[0] == "ParentMenuState", "the parent area after the code")
if names()[0] == "ParentMenuState":
    shot("t01c_parent_area")
    check_fits("ParentMenuState")
    client.pop_state()
    step(20)

# "Send log": after the parent's code, the share sheet (here a fake
# one) gets the cleaned log.
import types  # noqa: E402

shared: list[str] = []
sys.modules["nagmon.android.crash_dialog"] = types.SimpleNamespace(
    share=lambda text, **kw: shared.append(text)
)
check(tap_widget("ProfileSelectState", "share_log"), "a send-log button")
step(60)
check(
    names()[0] == "InputMenu" and not shared,
    "send log asks for the parent code first",
)
if names()[0] == "InputMenu":
    type_on_screen("1234")
    step(20)
check(
    len(shared) == 1 and "Nagmon start" in shared[0],
    "send log opens the share sheet with the log",
)
del sys.modules["nagmon.android.crash_dialog"]

# A long dialog line wraps inside the box (the longest page of a
# monster's description: three lines on a phone).
from nagmon.ui.game_helpers import say  # noqa: E402

say(client, T.translate("ampystoma_description").split("\n")[0])
step(30)
shot("t01b_long_dialog")
dialog = client.active_states[0]
check(
    dialog.name == "DialogState" and text_fits(dialog.dialog_box),
    "a long dialog line fits its box",
)
tap_through_dialogs()

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
        # other kinds (a number pad, letters...) are answered directly:
        # the quiz must close, or the title's buttons stay under it
        print("question kind:", q.kind if q else None)
        if q is not None:
            quiz.answer(q.answer)
            step(20)
            tap_widget("QuizState", "continue")
            step(20)
        check("QuizState" not in names(), "the question closes")

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
            finger_id=1,
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

    # The map's menu and the team (classic Tuxemon screens, bigger text).
    # The phone's back button opens it, as Escape does.
    for kind in (pygame.KEYDOWN, pygame.KEYUP):
        pygame.event.post(pygame.event.Event(kind, key=pygame.K_AC_BACK))
        step(3)
    step(40)
    check(names()[:1] == ["WorldMenuState"], "back button opens the menu")
    if names()[:1] == ["WorldMenuState"]:
        shot("t09a_world_menu")
        check_fits("WorldMenuState")
        client.pop_state()
        step(10)
    client.push_state(
        "MonsterMenuState", monsters=local_session.player.monsters
    )
    step(40)
    shot("t09b_team")
    client.pop_state()
    step(10)

    # A wild battle: the battle menu fits and its words are big.
    ex = client.event_engine.execute_action
    ex("wild_encounter", ["geometrion", "6"], True)
    for _ in range(80):
        if names()[:1] == ["MainCombatMenuState"]:
            break
        if names()[:1] == ["DialogState"]:
            tap((context.resolution[0] // 2, context.resolution[1] // 3))
        step(20)
    check(names()[:1] == ["MainCombatMenuState"], "battle menu")
    if names()[:1] == ["MainCombatMenuState"]:
        step(30)
        shot("t10_combat_menu")
        menu = client.active_states[0]
        screen = pygame.Rect((0, 0), context.resolution)
        check(screen.contains(menu.rect), "battle menu inside the screen")
        menu.menu_items.update_rect_from_parent()
        group = menu.menu_items.rect
        check(words_inside(menu), "battle menu words inside its border")
        # "fight": the list of attacks, then maybe a knowledge question
        fight = menu.menu_items.sprites()[0]
        tap(fight.rect.move(group.topleft).center)
        step(40)
        shot("t11_combat_techniques")
        top = client.active_states[0]
        if top.name == "CombatTargetMenuState" or hasattr(top, "menu_items"):
            top.menu_items.update_rect_from_parent()
            inner = top.menu_items.rect
            check(
                screen.contains(top.rect) and words_inside(top),
                f"{top.name}: the attacks inside the screen and the border",
            )
            tap(top.menu_items.sprites()[0].rect.move(inner.topleft).center)
            step(60)
        if names()[:1] == ["QuizState"]:
            shot("t12_battle_question")
            check_fits("QuizState")

shot("t09_end")
print("states:", names())
if failures:
    print("FAILED:", failures)
    sys.exit(1)
print("touch tour passed")
