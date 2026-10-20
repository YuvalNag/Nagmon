# SPDX-License-Identifier: GPL-3.0
"""
Text and touch targets on a phone (docs/kids/SDD_ANDROID.md §2.3,
"טקסט וכפתורים בטלפון"): one factor, 1.6, on Android only; nothing
leaves a 2400x1080 screen; the letter board's keys are big and the
delete key is far from the letters.
"""

from __future__ import annotations

import math
from types import SimpleNamespace
from unittest.mock import MagicMock

import pygame
import pytest
from pygame.rect import Rect
from pygame.surface import Surface
from pygame_menu.widgets import Frame

from tuxemon.menu import theme as theme_mod
from tuxemon.menu.alert import AlertManager
from tuxemon.platform import mobile
from tuxemon.scaling import DefaultScaling

W, H = 2400, 1080
#: The Poco F3: 6.67" for 2400x1080.
PX_PER_MM = math.hypot(W, H) / 6.67 / 25.4
SCREEN = Rect(0, 0, W, H)


def mm(px: float) -> float:
    return px / PX_PER_MM


@pytest.fixture(autouse=True)
def big_display():
    # pygame_menu refuses menus bigger than the window.
    pygame.display.set_mode((W, H))
    yield
    theme_mod.reset_theme_cache()


@pytest.fixture
def desktop(monkeypatch):
    for name in mobile.P4A_VARIABLES:
        monkeypatch.delenv(name, raising=False)
    theme_mod.reset_theme_cache()


@pytest.fixture
def phone(monkeypatch):
    monkeypatch.setenv("ANDROID_ARGUMENT", "/data/app")
    theme_mod.reset_theme_cache()


@pytest.fixture
def hebrew(monkeypatch):
    """Right to left, with the Hebrew font (the language stays as it is:
    changing it saves the player's settings file)."""
    from tuxemon.locale.locale import T
    from tuxemon.ui import bidi
    from tuxemon.user_config import CONFIG

    monkeypatch.setattr(bidi, "_locale_is_rtl", lambda: True)
    monkeypatch.setattr(T, "is_rtl", lambda: True)
    monkeypatch.setattr(
        CONFIG.config_model.game, "font_file", "Rubik-Medium.ttf"
    )
    theme_mod.reset_theme_cache()


def make_client():
    screen = Surface((W, H))
    context = SimpleNamespace(
        screen=screen,
        rect=screen.get_rect(),
        resolution=(W, H),
        tile_size=(16, 16),
        scale=7,
        scaling=DefaultScaling(7),
    )
    client = MagicMock()
    client.context = context
    client.config.dialog_speed = "max"
    client.config.large_gui = False
    client.config.sound_volume = 0.0
    client.config.locale.font_file = "Rubik-Medium.ttf"
    client.config.fps = 60
    client.sound_manager.get_sound_filename.return_value = None
    client.alert_manager = AlertManager(MagicMock())
    return client


def widgets_on_screen(menu) -> list[str]:
    """Titles of the visible widgets that leave the screen (none is good)."""
    menu.render()
    out = []
    width, height = menu.get_size(widget=True)
    if width > W or height > H:
        out.append(f"the menu is {width}x{height}")
    for widget in menu.get_widgets():
        if isinstance(widget, Frame) or not widget.is_visible():
            continue
        # pygame_menu clips the real rect to what is on the screen
        rect = widget.get_rect(to_real_position=True)
        whole = rect.size == (widget.get_width(), widget.get_height())
        if not whole or not SCREEN.contains(rect):
            out.append(widget.get_title())
    return out


# ------------------------------------------------------------ the factor


def test_the_factor_is_one_on_a_computer(desktop):
    assert mobile.ui_factor() == 1.0
    assert mobile.ui_px(35) == 35


def test_the_factor_is_1_6_on_a_phone(phone):
    assert mobile.ui_factor() == pytest.approx(1.6)
    assert mobile.ui_px(35) == 56
    assert mobile.ui_factor({}) == 1.0


def test_font_sizes_on_a_computer_did_not_change(desktop):
    from tuxemon.menu.menu import FontSettings

    sizes = FontSettings.from_context(make_client().context)
    assert (sizes.small, sizes.medium, sizes.big) == (28, 35, 42)
    theme = theme_mod.get_theme(DefaultScaling(7))
    assert theme.widget_font_size == 35
    assert theme.title_font_size == 42
    assert theme.widget_padding == (14, 28)


def test_font_sizes_on_a_phone(phone):
    from tuxemon.menu.menu import FontSettings

    sizes = FontSettings.from_context(make_client().context)
    assert (sizes.small, sizes.medium, sizes.big) == (45, 56, 67)
    theme = theme_mod.get_theme(DefaultScaling(7))
    assert theme.widget_font_size == 56
    assert theme.title_font_size == 67
    assert theme.widget_padding == (34, 67)


def test_big_text_on_a_phone_is_five_millimetres(phone, hebrew):
    from tuxemon.constants.asset_loader import fetch_asset
    from tuxemon.menu.menu import FontSettings

    big = FontSettings.from_context(make_client().context).big
    font = pygame.font.Font(fetch_asset("font", "Rubik-Medium.ttf"), big)
    assert mm(font.get_linesize()) >= 5.0


def test_classic_menu_fonts(desktop, monkeypatch):
    from tuxemon.states.dialog_state import DialogState

    state = DialogState(make_client(), Rect(0, 0, 600, 100), text=["x"])
    assert state.font_size == 35
    monkeypatch.setenv("ANDROID_ARGUMENT", "/data/app")
    state = DialogState(make_client(), Rect(0, 0, 600, 100), text=["x"])
    assert state.font_size == 56


# ------------------------------------------------------------ columns


@pytest.mark.parametrize(
    "count, rows",
    [
        pytest.param(3, [3], id="fits"),
        pytest.param(6, [6], id="just_fits"),
        pytest.param(7, [4, 3], id="seven_avatars"),
        pytest.param(9, [5, 4], id="nine_grades"),
        pytest.param(14, [5, 5, 4], id="parent_area"),
    ],
)
def test_column_rows(count, rows):
    from tuxemon.menu.phone import column_rows

    assert column_rows(count, row_height=135, available=864) == rows


def _choice(client, count: int, text: str = "כיתה"):
    from tuxemon.states.choice_state import ChoiceState
    from tuxemon.ui.menu_options import ChoiceOption, MenuOptions

    options = MenuOptions(
        [
            ChoiceOption(
                key=f"o{i}", display_text=f"{text} {i}", action=lambda: None
            )
            for i in range(count)
        ]
    )
    state = ChoiceState(client, options)
    state.transition.apply(state.menu, 1.0, client.context)
    return state


def _buttons(menu):
    return [w for w in menu.get_widgets() if w.is_selectable]


@pytest.mark.parametrize(
    "count", [pytest.param(9, id="grades"), pytest.param(7, id="avatars")]
)
def test_choice_list_fits_on_a_phone(phone, hebrew, count):
    client = make_client()
    state = _choice(client, count)
    width, height = state.menu.get_size(widget=True)
    assert height <= 0.8 * H
    assert widgets_on_screen(state.menu) == []
    buttons = _buttons(state.menu)
    assert len(buttons) == count
    # Hebrew: the first choice is in the right-hand column, at the top
    first = buttons_by_title(buttons)["כיתה 0"].get_rect(to_real_position=True)
    last = buttons_by_title(buttons)[f"כיתה {count - 1}"].get_rect(
        to_real_position=True
    )
    assert first.centerx > last.centerx
    for button in buttons:
        assert mm(button.get_height()) >= 8.5


def buttons_by_title(buttons):
    return {b.get_title(): b for b in buttons}


def test_choice_list_on_a_computer_has_no_columns(desktop, hebrew):
    state = _choice(make_client(), 9)
    assert not any(isinstance(w, Frame) for w in state.menu.get_widgets())


# ------------------------------------------------------------ dialog


LONG_LINE = (
    "הצבעים הבוהקים של Ampystoma נועדו להזהיר, אז קשה להאמין שהוא מצליח "
    "להפתיע מישהו. אבל המים העכורים שבהם הוא גר מסתירים אותו עד שהוא "
    "מחליט להופיע. הוא אוהב לצאת ליבשה בזמן סופות רעמים."
)


def test_a_long_dialog_line_fits_its_box_on_a_phone(phone, hebrew):
    from tuxemon.states.dialog_state import DialogState
    from tuxemon.ui.dialogue import calc_dialog_rect
    from tuxemon.ui.draw import wrapped_text_height
    from tuxemon.ui.text_alignment import DialogPosition

    client = make_client()
    rect = calc_dialog_rect(SCREEN, DialogPosition.BOTTOM)
    assert SCREEN.contains(rect)
    state = DialogState(client, rect, text=[LONG_LINE])
    state.on_open()
    box = state.dialog_box.rect
    needed = wrapped_text_height(LONG_LINE, state.font, box.width)
    assert needed <= box.height
    assert needed > 2 * state.font.get_linesize()  # it does wrap


def test_dialog_box_on_a_computer_did_not_change(desktop):
    from tuxemon.ui.dialogue import calc_dialog_rect
    from tuxemon.ui.text_alignment import DialogPosition

    rect = calc_dialog_rect(SCREEN, DialogPosition.BOTTOM)
    assert rect.size == (int(W * 0.8), int(H * 0.25))


# ------------------------------------------------------------ letter board


def test_keyboard_layout_for_hebrew():
    from tuxemon.menu.keyboard import keyboard_layout

    area = Rect(48, 300, W - 96, H - 330)
    layout = keyboard_layout(area, 42, gap=14, rtl=True)
    keys = layout.chars
    assert len(keys) == 42
    for key in keys:
        assert area.contains(key)
        assert mm(key.width) >= 9 and mm(key.height) >= 9
    for i, a in enumerate(keys):
        assert a.collidelist(keys[i + 1 :]) == -1
    # the actions are in a row of their own, under every letter
    for action in (layout.done, layout.space, layout.delete):
        assert area.contains(action)
        assert action.top > max(k.bottom for k in keys)
        assert action.collidelist(keys) == -1
    # delete is far from every letter: at least a third of a key
    gap = min(_distance(layout.delete, k) for k in keys)
    assert gap >= keys[0].height / 3
    # Hebrew: "done" first on the right, delete on the left
    assert layout.done.left > layout.space.left > layout.delete.left
    assert layout.space.left - layout.delete.right >= keys[0].width / 2


def test_keyboard_layout_left_to_right():
    from tuxemon.menu.keyboard import keyboard_layout

    layout = keyboard_layout(Rect(0, 0, 1280, 400), 40, gap=8, rtl=False)
    assert layout.done.left < layout.space.left < layout.delete.left


def _distance(a: Rect, b: Rect) -> float:
    dx = max(b.left - a.right, a.left - b.right, 0)
    dy = max(b.top - a.bottom, a.top - b.bottom, 0)
    return math.hypot(dx, dy)


def _input_menu(client, prompt="איך קוראים לשחקן?"):
    from tuxemon.locale.locale import T
    from tuxemon.menu.input import CharacterSetManager
    from tuxemon.states.input import InputMenu

    hebrew = CharacterSetManager(
        chars=T.translate_in("menu_alphabet", "he_IL"), char_variants=""
    )
    menu = InputMenu(
        client,
        prompt=prompt,
        callback=lambda text: None,
        char_limit=16,
        char_manager=hebrew,
    )
    menu.reload_items()
    menu.refresh_layout()
    return menu


def _absolute(menu, item) -> Rect:
    menu.menu_items.update_rect_from_parent()
    return item.rect.move(menu.menu_items.rect.topleft)


def test_letter_board_keys_are_big_on_a_phone(phone, hebrew):
    menu = _input_menu(make_client())
    keys = [i for i in menu.menu_items if i.game_object.char]
    assert len(keys) >= 42
    for item in keys:
        rect = _absolute(menu, item)
        assert SCREEN.contains(rect)
        assert mm(rect.width) >= 9 and mm(rect.height) >= 9
    for item in menu.menu_items:
        assert SCREEN.contains(_absolute(menu, item))


def test_digits_start_their_own_row_on_a_phone(phone, hebrew):
    # a "1" next to the last letter reads as one more letter
    menu = _input_menu(make_client())
    keys = {
        i.game_object.char: _absolute(menu, i)
        for i in menu.menu_items
        if i.game_object.char
    }
    letters = [r for c, r in keys.items() if not c.isdigit() and c != " "]
    digits = [keys[d] for d in "1234567890"]
    assert min(r.top for r in digits) > max(r.top for r in letters[:27])
    assert len({r.top for r in digits}) == 1


def test_the_whole_key_is_a_touch_target(phone, hebrew):
    menu = _input_menu(make_client())
    handler = menu._input_handler
    for item in [i for i in menu.menu_items if i.game_object.char][:5]:
        rect = _absolute(menu, item)
        for point in (rect.center, (rect.left + 3, rect.bottom - 3)):
            index = handler._item_at(point)
            assert index is not None
            assert menu.menu_items.sprites()[index] is item


def test_delete_is_far_from_the_letters_on_a_phone(phone, hebrew):
    menu = _input_menu(make_client())
    items = list(menu.menu_items)
    delete = next(i for i in items if i.game_object.action == menu.backspace)
    done = next(i for i in items if i.game_object.action == menu.confirm)
    letters = [
        _absolute(menu, i)
        for i in items
        if i.game_object.char and i.game_object.char != " "
    ]
    delete_rect = _absolute(menu, delete)
    assert min(_distance(delete_rect, k) for k in letters) >= 40
    assert delete_rect.top > max(k.bottom for k in letters)
    assert _absolute(menu, done).left > delete_rect.right
    # the keys say what they do, in the child's language
    from tuxemon.locale.locale import T

    assert T.translate_in("menu_key_delete", "he_IL") == "מחק"
    assert T.translate_in("menu_key_done", "he_IL") == "סיום"
    assert T.translate_in("menu_key_space", "he_IL") == "רווח"


def test_prompt_and_typed_text_fit_on_a_phone(phone, hebrew):
    prompt = "הורה: בחרו קוד של 4 ספרות"
    menu = _input_menu(make_client(), prompt=prompt)
    display = menu.input_display
    for area in (display.prompt, display.text_area, display.char_counter):
        assert SCREEN.contains(area.rect)
    assert menu.font.size(prompt)[0] <= display.prompt.rect.width
    # nothing written over the keys
    top = min(_absolute(menu, i).top for i in menu.menu_items)
    assert display.prompt.rect.bottom <= top
    assert display.text_area.rect.bottom <= top
    assert not display.char_counter.rect.colliderect(display.text_area.rect)


def test_letter_board_on_a_computer_did_not_change(desktop, hebrew):
    menu = _input_menu(make_client())
    rect = menu.rect
    assert menu.menu_items.columns == rect.width // int(rect.width * 0.075)
    labels = [i.game_object.action for i in menu.menu_items]
    assert menu.backspace in labels and menu.confirm in labels


# ------------------------------------------------------------ digit pad
# (SDD_ANDROID §2.7): the parent code, a pad with digits only.

PIN_PROMPT = (
    "קוד הורים\nבחרו 4 ספרות. הקוד שומר על אזור ההורים ועל הוספת שחקנים."
)


def _pin_pad(client):
    from tuxemon.menu.input import CharacterSetManager
    from tuxemon.states.input import InputMenu

    menu = InputMenu(
        client,
        prompt=PIN_PROMPT,
        callback=lambda text: None,
        char_limit=4,
        char_manager=CharacterSetManager.digits(),
        secret=True,
    )
    menu.reload_items()
    menu.refresh_layout()
    return menu


def test_digits_only_char_set():
    from tuxemon.menu.input import CharacterSetManager

    digits = CharacterSetManager.digits()
    assert digits.all_chars == "1234567890"
    assert digits.is_valid_input_char("7")
    for char in ("a", "א", " ", "-"):
        assert not digits.is_valid_input_char(char)


def test_digit_pad_on_a_phone(phone, hebrew):
    menu = _pin_pad(make_client())
    items = list(menu.menu_items)
    keys = {
        i.game_object.char: _absolute(menu, i)
        for i in items
        if i.game_object.char
    }
    # only digits: no letters and no space key
    assert sorted(keys) == sorted("0123456789")
    actions = [i.game_object.action for i in items]
    assert menu.backspace in actions and menu.confirm in actions
    for rect in keys.values():
        assert SCREEN.contains(rect)
        assert mm(rect.width) >= 12 and mm(rect.height) >= 12
    # a number pad reads left to right, even in Hebrew
    assert keys["1"].left < keys["2"].left < keys["5"].left
    assert keys["6"].top > keys["1"].top
    # "done" stays at the start of the Hebrew line (right)
    done = next(i for i in items if i.game_object.action == menu.confirm)
    delete = next(i for i in items if i.game_object.action == menu.backspace)
    assert _absolute(menu, done).left > _absolute(menu, delete).right


def test_digit_pad_prompt_has_two_lines_above_the_keys(phone, hebrew):
    menu = _pin_pad(make_client())
    display = menu.input_display
    line = menu.font.get_linesize()
    assert display.prompt.rect.height >= 2 * line
    first, second = PIN_PROMPT.split("\n")
    assert menu.font.size(second)[0] <= display.prompt.rect.width
    top = min(_absolute(menu, i).top for i in menu.menu_items)
    for area in (display.prompt, display.text_area, display.char_counter):
        assert SCREEN.contains(area.rect)
        assert area.rect.bottom <= top
    assert display.text_area.rect.top >= display.prompt.rect.bottom
    # both lines are drawn: ink in the top and in the bottom half
    image = display.prompt.image
    half = image.get_height() // 2
    assert (
        image.get_bounding_rect().top < half < image.get_bounding_rect().bottom
    )


def test_digit_pad_hides_the_digits(phone, hebrew):
    menu = _pin_pad(make_client())
    menu._suppress_first_event = False
    menu.add_input_char("1")
    menu.add_input_char("2")
    assert menu.input_controller.current_string == "12"
    assert menu.input_display.text_area.text == "• • _ _"
    assert "1" not in menu.input_display.text_area.text
    # the bullet is a real letter of both fonts (not an empty box)
    import pygame.freetype

    from tuxemon.constants.paths import mods_folder

    pygame.freetype.init()
    for font in ("Rubik-Medium.ttf", "PressStart2P.ttf"):
        path = mods_folder / "tuxemon/font" / font
        metrics = pygame.freetype.Font(path.as_posix(), 16).get_metrics("•")
        assert metrics[0] is not None


def test_a_key_tap_does_not_rebuild_the_keys(phone, hebrew, monkeypatch):
    menu = _input_menu(make_client())
    menu._suppress_first_event = False
    images = [i.image for i in menu.menu_items]
    rebuilt = []
    monkeypatch.setattr(menu, "reload_items", lambda: rebuilt.append(1))
    for char in "נועה":
        menu.add_input_char(char)
    menu.backspace()
    menu.update(1 / 60)
    assert not rebuilt
    assert [i.image for i in menu.menu_items] == images
    assert menu.input_controller.current_string == "נוע"


# ------------------------------------------------------------ Nagmon screens


@pytest.fixture
def runtime(monkeypatch):
    from nagmon import runtime as runtime_mod

    rt = MagicMock()
    rt.store.list.return_value = [
        SimpleNamespace(id=f"p{i}", name=f"ילד{i}", settings={})
        for i in range(8)
    ]
    rt.store.load_learner_dict.return_value = {"stars": {"a": 12}}
    runtime_mod.set_runtime(rt)
    yield rt
    runtime_mod.set_runtime(None)


def test_who_plays_with_eight_children_fits_on_a_phone(phone, hebrew, runtime):
    from mods.nagmon.states.profiles import ProfileSelectState

    state = ProfileSelectState(make_client())
    assert widgets_on_screen(state.menu) == []
    ids = {w.get_id() for w in state.menu.get_widgets()}
    assert {f"child_p{i}" for i in range(8)} <= ids
    assert {"new_child", "parents"} <= ids


def test_who_plays_on_a_computer_has_no_columns(desktop, hebrew, runtime):
    from mods.nagmon.states.profiles import ProfileSelectState

    state = ProfileSelectState(make_client())
    assert not any(isinstance(w, Frame) for w in state.menu.get_widgets())


def test_parent_area_fits_on_a_phone(phone, hebrew, runtime):
    from mods.nagmon.states.profiles import ParentMenuState

    runtime.parent.settings.default_limits.daily_max_minutes = 60
    runtime.parent.settings.location.city_he = "ירושלים"
    state = ParentMenuState(make_client())
    assert widgets_on_screen(state.menu) == []


def _question():
    from nagmon.learning.model import Choice, Question

    return Question(
        item_id="t1",
        skill_id="math.add",
        subject="math",
        kind="choice",
        prompt_he="כמה זה 12 + 7?",
        prompt_en=None,
        answer="c",
        choices=tuple(
            Choice(cid, text)
            for cid, text in (
                ("a", "17"),
                ("b", "18"),
                ("c", "19"),
                ("d", "20"),
            )
        ),
    )


def test_quiz_answers_are_big_on_a_phone(phone, hebrew, monkeypatch):
    from mods.nagmon.states import nagmon_quiz
    from mods.nagmon.states.nagmon_quiz import QuizState

    monkeypatch.setattr(nagmon_quiz, "get_runtime", lambda: None)
    monkeypatch.setattr(QuizState, "_auto_read", lambda self: False)
    client = make_client()
    state = QuizState(client, question=_question(), context="battle")
    assert widgets_on_screen(state.menu) == []
    big = state.font_type.big
    for cid in "abcd":
        button = state.menu.get_widget(f"choice_{cid}", recursive=True)
        assert button.get_font_info()["size"] >= big
        assert mm(button.get_height()) >= 9


def _kinds():
    from nagmon.learning.model import Choice, Figure

    numbers = tuple(
        Choice(cid, text)
        for cid, text in zip("abcd", ("17", "18", "19", "20"))
    )
    pictures = tuple(
        Choice(cid, text, image=code)
        for cid, text, code in zip(
            "abc", ("תפוח", "בננה", "ענבים"), ("1f34e", "1f34c", "1f347")
        )
    )
    trees = Figure("objects", {"emoji": "1f333", "groups": [2, 1]})
    return {
        "choice_figure": dict(kind="choice", choices=numbers, figure=trees),
        "pictures": dict(kind="choice", choices=pictures),
        "worked_example": dict(
            kind="choice",
            choices=numbers,
            figure=trees,
            meta={"worked_example": True},
            explanation_he="מתחילים ב־12 וסופרים עוד 7. התשובה היא 19.",
        ),
        "number_pad": dict(kind="number", figure=trees),
        "order": dict(kind="order", choices=numbers),
        "letters": dict(kind="letters", meta={"word": "חתול"}),
    }


@pytest.mark.parametrize(
    "case",
    [
        pytest.param("choice_figure", id="choice_figure"),
        pytest.param("pictures", id="pictures"),
        pytest.param("worked_example", id="worked_example"),
        pytest.param("number_pad", id="number_pad"),
        pytest.param("order", id="order"),
        pytest.param("letters", id="letters"),
    ],
)
def test_every_kind_of_question_fits_on_a_phone(
    phone, hebrew, monkeypatch, case
):
    from dataclasses import replace

    from mods.nagmon.states import nagmon_quiz
    from mods.nagmon.states.nagmon_quiz import QuizState

    monkeypatch.setattr(nagmon_quiz, "get_runtime", lambda: None)
    monkeypatch.setattr(QuizState, "_auto_read", lambda self: False)
    question = replace(_question(), **_kinds()[case])
    state = QuizState(make_client(), question=question, context="battle")
    assert widgets_on_screen(state.menu) == []
    buttons = [
        w.get_rect(to_real_position=True)
        for w in state.menu.get_widgets()
        if w.is_selectable and w.is_visible()
    ]
    for i, a in enumerate(buttons):
        assert a.collidelist(buttons[i + 1 :]) == -1, case


@pytest.mark.parametrize(
    "where", [pytest.param("phone", id="phone"), pytest.param("pc", id="pc")]
)
def test_a_list_that_fits_its_words_keeps_them_inside(
    hebrew, monkeypatch, where
):
    # The battle's attack list: a box as wide as its longest name. In
    # Hebrew the selection arrow is on the right, and the longest name
    # went over the box's left border.
    from tuxemon.menu.interface import MenuItem
    from tuxemon.menu.menu import Menu

    if where == "phone":
        monkeypatch.setenv("ANDROID_ARGUMENT", "/data/app")
    else:
        for name in mobile.P4A_VARIABLES:
            monkeypatch.delenv(name, raising=False)
    menu = Menu(make_client())
    # In the game the arrow is already 7 times bigger when its margin is
    # worked out: 105 pixels at 2400x1080, more than the box's padding.
    # The border is 6 pixels scaled 7 times on each side.
    monkeypatch.setattr(
        menu.cursor_controller, "get_margin", lambda: (-105, -49)
    )
    monkeypatch.setattr(
        menu, "calc_internal_rect", lambda: menu.rect.inflate(-84, -84)
    )
    menu.shrink_to_items = True
    for name in ("כרסום", "רתיחה", "טופר אש"):
        menu.add(MenuItem(menu.shadow_text(name), None, None, name))
    menu.anchor("bottom", 800)
    menu.anchor("right", W)
    # the first frame lays the menu out, as in a battle
    menu._show_contents = True
    menu.draw(Surface((W, H)))
    inner = menu.calc_internal_rect()
    menu.menu_items.update_rect_from_parent()
    for item in menu.menu_items:
        rect = item.rect.move(menu.menu_items.rect.topleft)
        assert inner.contains(rect), (rect, inner)
    assert SCREEN.contains(menu.rect)


def test_attack_details_stay_in_their_box():
    from tuxemon.states.combat_menus import info_line_position

    # a computer keeps its places (1280x720 and 2400x1080)
    assert info_line_position("recharge", (1280, 720), 30) == (35, 665)
    assert info_line_position("recharge", (W, H), 42) == (66, 998)
    # a phone's taller line moves up, its bottom inside the box
    x, y = info_line_position("recharge", (W, H), 67)
    assert y + 67 <= round(H * 139 / 144) and x == 66


def test_attack_details_read_right_to_left():
    from tuxemon.constants.asset_loader import fetch_asset
    from tuxemon.states.combat_menus import render_info_line
    from tuxemon.ui.bidi import ensure_visual

    def pixels(surface):
        return pygame.image.tobytes(surface, "RGBA")

    font = pygame.font.Font(fetch_asset("font", "Rubik-Medium.ttf"), 30)
    line = "דיוק 100%"
    drawn = render_info_line(font, line)
    # it was drawn letter by letter from the left: "קויד"
    assert pixels(drawn) != pixels(font.render(line, True, (0, 0, 0)))
    visual = font.render(ensure_visual(line), True, (0, 0, 0))
    assert pixels(drawn) == pixels(visual)


def _hud_line(phone_or_desktop_font_size):
    from tuxemon.states.combat_animations import CombatAnimations

    owner = SimpleNamespace(
        font_size=phone_or_desktop_font_size,
        font_filename=pygame.font.get_default_font(),
        font_color=(0, 0, 0),
        font_shadow_color=(200, 200, 200),
        client=make_client(),
    )
    return CombatAnimations.hud_text(owner, "גאומטריון רמה 6")


def test_battle_box_text_keeps_the_computers_size_on_a_phone(phone):
    # the HUD boxes are pictures of a fixed size: bigger names ran into
    # the HP bars
    computer = 5 * 7
    on_phone = _hud_line(mobile.ui_px(computer))
    reference = pygame.font.Font(pygame.font.get_default_font(), computer)
    assert abs(on_phone.get_height() - reference.get_linesize()) <= 4


def test_battle_box_text_has_no_missing_signs():
    from tuxemon.combat.utils import build_hud_text

    monster = SimpleNamespace(name="גאומטריון", gender_symbol="♂", level=6)
    line = build_hud_text("MainCombatMenuState", monster, True, False, False)
    assert "♂" not in line["line1"] and "♀" not in line["line1"]


def test_who_plays_has_a_send_log_button_on_a_phone(phone, hebrew, runtime):
    from mods.nagmon.states.profiles import ProfileSelectState

    state = ProfileSelectState(make_client())
    ids = {w.get_id() for w in state.menu.get_widgets()}
    assert "share_log" in ids
    assert widgets_on_screen(state.menu) == []


def test_who_plays_on_a_computer_has_no_send_log(desktop, hebrew, runtime):
    from mods.nagmon.states.profiles import ProfileSelectState

    state = ProfileSelectState(make_client())
    assert "share_log" not in {w.get_id() for w in state.menu.get_widgets()}
