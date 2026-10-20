# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
from __future__ import annotations

from collections.abc import Callable, Generator
from functools import partial
from typing import TYPE_CHECKING, Any, ClassVar

from pygame import SRCALPHA, draw
from pygame.font import Font
from pygame.rect import Rect
from pygame.surface import Surface

from tuxemon.graphics import ColorLike
from tuxemon.locale.locale import T
from tuxemon.menu.input import (
    CharacterSetManager,
    InputController,
    NameDataLoader,
)
from tuxemon.menu.interface import MenuItem
from tuxemon.menu.keyboard import (
    KeyboardLayout,
    PlacedSpriteList,
    keyboard_layout,
)
from tuxemon.menu.menu import Menu
from tuxemon.platform import mobile
from tuxemon.platform.const import buttons, events, intentions
from tuxemon.platform.const.graphics import FONT_SIZE_BIGGER
from tuxemon.session import local_session
from tuxemon.sprite import RelativeGroup
from tuxemon.tools import open_choice_dialog
from tuxemon.ui import bidi
from tuxemon.ui.input_display import InputDisplay, InputDisplayConfig
from tuxemon.ui.menu_options import MenuOptions, create_choice_options
from tuxemon.ui.text_renderer import TextRenderer

if TYPE_CHECKING:
    from tuxemon.base_client import BaseClient
    from tuxemon.platform.events import PlayerInput


class InputMenuObj:
    def __init__(
        self,
        action: Callable[[], None],
        char: str | None = None,
    ):
        self.action = action
        self.char = char

    def __call__(self) -> None:
        return self.action()


#: The phone's keys (SDD_ANDROID §2.3): a light key, a red "delete" and a
#: green "done", each with a darker border.
KEY_COLORS: dict[str, tuple[ColorLike, ColorLike]] = {
    "key": ((236, 242, 252), (96, 112, 150)),
    "delete": ((255, 214, 214), (186, 72, 72)),
    "done": ((212, 244, 212), (64, 146, 64)),
}
#: What a hidden character shows (a code); a letter of both fonts.
MASK = "\u2022"


class InputMenu(Menu[InputMenuObj]):
    """
    A menu interface used to input and edit text, featuring an on-screen
    character keyboard and configurable control buttons.

    Supports character limits, random name generation, character variant
    selection, and external button injection via plug-in functions.
    """

    name: ClassVar[str] = "InputMenu"
    background = None
    draw_borders = False

    def __init__(
        self,
        client: BaseClient,
        prompt: str = "",
        callback: Callable[[str], None] | None = None,
        initial: str = "",
        char_limit: int = 99,
        random: bool = False,
        button_injectors: None
        | (
            list[
                Callable[
                    [InputMenu], Generator[MenuItem[InputMenuObj], None, None]
                ]
            ]
        ) = None,
        char_manager: CharacterSetManager | None = None,
        secret: bool = False,
        **kwargs: Any,
    ) -> None:
        """
        Initialize the input menu UI.

        Parameters:
            prompt: Optional label text to display above the input (e.g. "Name?").
            callback: Function to call with the final input string when confirmed.
            initial: Optional starting text value shown in the input field.
            char_limit: Maximum allowed number of input characters.
            random: Enables a "Don't Care" button for randomized name generation.
            button_injectors: Optional list of generator functions that inject
                additional MenuItem buttons into the layout.
            char_manager: Optional CharacterSetManager to control the active character
                set and variant mappings; falls back to defaults if not provided.
            secret: Shows a dot for each character (a code).
            **kwargs: Additional arguments passed to the base Menu.
        """
        self.button_injectors = button_injectors or []
        self._suppress_first_event = True
        self.name_loader = NameDataLoader("npc_names.yaml")
        self.input_controller = InputController(
            initial_string=initial, char_limit=char_limit
        )
        self.char_manager = char_manager or CharacterSetManager()
        self.secret = secret
        #: The prompt's lines: each ``\n`` starts one (SDD_ANDROID §2.7).
        self.prompt_lines = prompt.count("\n") + 1
        #: A phone: big square keys and a row of their own for "done",
        #: "space" and "delete" (SDD_ANDROID §2.3).
        self.big_keys = mobile.is_android()

        self._repeat_timers: dict[int, float] = {
            buttons.UP: 0.0,
            buttons.DOWN: 0.0,
            buttons.LEFT: 0.0,
            buttons.RIGHT: 0.0,
        }
        super().__init__(client=client, **kwargs)

        # The following is necessary to prevent writing a char immediately
        # after leaving the char variant dialog.
        self.leaving_char_variant_dialog = False

        self.input_display = InputDisplay(
            context=self.client.context,
            font=self.font,
            font_color=self.font_color,
            prompt_text=prompt,
            initial_input_string=self._display_string(),
            area_rect=self.rect,
            config=self._phone_display_config() if self.big_keys else None,
        )
        self.sprites.add(self.input_display.sprites)

        self.callback = callback
        self.char_limit = char_limit
        self.random = random
        assert self.callback

        self.update_char_counter()

    # ------------------------------------------------------------ phone

    def _phone_display_config(self) -> InputDisplayConfig:
        """
        The prompt (a line for each ``\n``) and the typed text across the
        whole width, above the keys; the counter at the other end of the
        text.
        """
        scale = max(1, self.client.context.scaling.scale_int(1))
        width = self.rect.width // scale
        line = -(-self.font.get_linesize() // scale) + 1
        prompt = line * self.prompt_lines
        counter = self.font.size("000")
        return InputDisplayConfig(
            prompt_offset_x=6,
            prompt_offset_y=3,
            prompt_width=width - 12,
            prompt_height=prompt,
            text_area_offset_x=6,
            text_area_offset_y=4 + prompt,
            text_area_width=width - 12 - 2 * (counter[0] // scale + 1),
            text_area_height=line,
            char_counter_offset_x=6 + counter[0] // scale + 1,
            char_counter_offset_y=4 + prompt,
            char_counter_size=(counter[0], self.font.get_linesize()),
        )

    def _phone_board_area(self) -> Rect:
        """Below the prompt and the typed text, to the bottom edge."""
        scaling = self.client.context.scaling
        line = self.font.get_linesize()
        side = scaling.scale_int(6)
        lines = self.prompt_lines + 1
        # a game pixel more for each extra prompt line (rounded up above)
        top = (
            scaling.scale_int(6)
            + lines * (line + scaling.scale_int(1))
            + (lines - 2) * scaling.scale_int(1)
        )
        bottom = scaling.scale_int(3)
        return Rect(
            self.rect.left + side,
            self.rect.top + top,
            self.rect.width - 2 * side,
            self.rect.height - top - bottom,
        )

    def create_new_menu_items_group(self) -> None:
        if not getattr(self, "big_keys", False):
            super().create_new_menu_items_group()
            return
        self.menu_items = PlacedSpriteList(parent=self.calc_menu_items_rect)
        self.menu_sprites = RelativeGroup(parent=self.menu_items)

    def calc_menu_items_rect(self) -> Rect:
        if self.big_keys:
            return self.calc_internal_rect()
        return super().calc_menu_items_rect()

    def update_cursor_visibility(self) -> None:
        if self.big_keys:
            # a phone has no arrow keys: the pointer would cover a key
            self.cursor_controller.hide_cursor()
            return
        super().update_cursor_visibility()

    def show_cursor(self) -> None:
        if self.big_keys:
            self.cursor_controller.hide_cursor()
            return
        super().show_cursor()

    def _key_font(self) -> Font:
        scaling = self.client.context.scaling
        size = mobile.ui_px(scaling.scale_int(FONT_SIZE_BIGGER))
        return Font(self.font_filename, size)

    def _key_image(
        self, size: tuple[int, int], label: str, style: str, font: Font
    ) -> Surface:
        """A key: a rounded tile with its label in the middle."""
        fill, border = KEY_COLORS[style]
        image = Surface(size, SRCALPHA)
        radius = max(2, size[1] // 6)
        width = max(2, size[1] // 40)
        draw.rect(image, fill, image.get_rect(), border_radius=radius)
        draw.rect(image, border, image.get_rect(), width, radius)
        renderer = TextRenderer(
            scaling=self.client.context.scaling,
            font=font if font.size(label)[0] < size[0] * 0.9 else self.font,
            font_color=self.font_color,
            font_shadow_color=self.font_shadow_color,
        )
        text = renderer.shadow_text(label)
        image.blit(text, text.get_rect(center=image.get_rect().center))
        return image

    def _key(
        self,
        place: Rect,
        label: str,
        action: Callable[[], None],
        *,
        char: str | None = None,
        style: str = "key",
        font: Font,
    ) -> MenuItem[InputMenuObj]:
        assert isinstance(self.menu_items, PlacedSpriteList)
        self.menu_items.places.append(place)
        return MenuItem(
            self._key_image(place.size, label, style, font),
            None,
            None,
            InputMenuObj(action, char),
        )

    def _blank(self, place: Rect) -> MenuItem[InputMenuObj]:
        assert isinstance(self.menu_items, PlacedSpriteList)
        self.menu_items.places.append(Rect(place.topleft, (0, 0)))
        return self._create_empty_item()

    def _phone_items(self) -> Generator[MenuItem[InputMenuObj], None, None]:
        """
        Square keys in reading order, then the action row: done, space
        and delete with an empty cell between each, then any extra
        buttons above the board at the end of the line.
        """
        assert isinstance(self.menu_items, PlacedSpriteList)
        self.menu_items.places = []
        everything = self.char_manager.all_chars
        chars = [c for c in everything if c not in ("\0", " ")]
        gap = self.client.context.scaling.scale_int(2)
        cells, layout = self._phone_cells(chars, gap)
        self.menu_items.columns = layout.columns
        font = self._key_font()
        for char, place in zip(cells, layout.chars):
            if char is None:
                yield self._blank(place)
                continue
            yield self._key(
                place,
                char,
                partial(self.add_input_char, char),
                char=char,
                font=font,
            )
        # the action row is a row of its own for the arrow keys too
        for _ in range(layout.rows * layout.columns - len(cells)):
            yield self._blank(layout.chars[-1])
        row = [
            self._key(
                layout.done,
                T.translate("menu_key_done"),
                self.confirm,
                style="done",
                font=font,
            ),
            self._blank(layout.done),
        ]
        if " " in everything:
            row.append(
                self._key(
                    layout.space,
                    T.translate("menu_key_space"),
                    partial(self.add_input_char, " "),
                    char=" ",
                    font=font,
                )
            )
        row.append(self._blank(layout.space))
        row.append(
            self._key(
                layout.delete,
                T.translate("menu_key_delete"),
                self.backspace,
                style="delete",
                font=font,
            )
        )
        while len(row) < layout.columns:
            row.append(self._blank(layout.delete))
        yield from row
        yield from self._phone_extras(layout.board, gap, font)

    def _phone_cells(
        self, chars: list[str], gap: int
    ) -> tuple[list[str | None], KeyboardLayout]:
        """
        The keys with the digits on a row of their own: a "1" next to
        the last letter reads as a letter. None is an empty cell. Digits
        alone (a number pad) read left to right, in Hebrew too.
        """
        chars_rtl = False if self.char_manager.digits_only else None
        first_digit = next(
            (i for i, c in enumerate(chars) if c.isdigit()), len(chars)
        )
        letters, rest = chars[:first_digit], chars[first_digit:]
        cells: list[str | None] = list(chars)
        for _ in range(3):
            layout = keyboard_layout(
                self._phone_board_area(),
                len(cells),
                gap=gap,
                rtl=bidi.locale_is_rtl(),
                chars_rtl=chars_rtl,
            )
            pad = -len(letters) % layout.columns if letters and rest else 0
            wanted: list[str | None] = [*letters, *[None] * pad, *rest]
            if wanted == cells:
                break
            cells = wanted
        return cells, layout

    def _phone_extras(
        self, board: Rect, gap: int, font: Font
    ) -> Generator[MenuItem[InputMenuObj], None, None]:
        """ "Random" and injected buttons: tiles above the board."""
        extras: list[tuple[str, MenuItem[InputMenuObj]]] = []
        if self.random:
            label = T.translate("random")
            extras.append(
                (
                    label,
                    MenuItem(
                        None, label, None, InputMenuObj(self.pick_random)
                    ),
                )
            )
        for injector in self.button_injectors:
            extras.extend((item.label or "", item) for item in injector(self))
        assert isinstance(self.menu_items, PlacedSpriteList)
        rtl = bidi.locale_is_rtl()
        height = board.height // 5
        x = board.left if rtl else board.right
        for label, item in extras:
            width = max(font.size(label)[0] + 4 * gap, board.width // 6)
            if not rtl:
                x -= width
            place = Rect(x, board.top - gap - height, width, height)
            x += width + gap if rtl else -gap
            self.menu_items.places.append(place)
            if label:
                item.image = self._key_image(place.size, label, "key", font)
            yield item

    # ------------------------------------------------------------ layout

    def calc_internal_rect(self) -> Rect:
        """Calculate the internal area of the menu for layout."""
        if getattr(self, "big_keys", False):
            return self._phone_board_area()
        w = self.rect.width - self.rect.width * 0.95
        h = self.rect.height - self.rect.height * 0.5
        rect = self.rect.inflate(-w, -h)
        rect.top = int(self.rect.centery * 0.7)
        return rect

    def initialize_items(
        self,
    ) -> Generator[MenuItem[InputMenuObj], None, None]:
        """Generate keyboard and control buttons, including optional external injectors."""
        if self.big_keys:
            yield from self._phone_items()
            return
        self.menu_items.columns = max(
            1, self.rect.width // int(self.rect.width * 0.075)
        )
        layout = self.char_manager.get_layout_grid(self.menu_items.columns)

        for row in layout:
            for char in row:
                if char is None:
                    yield self._create_empty_item()
                else:
                    yield self._create_char_item(char)

        yield from self.generate_default_buttons()

        for injector in self.button_injectors:
            yield from injector(self)

    def generate_default_buttons(
        self,
    ) -> Generator[MenuItem[InputMenuObj], None, None]:
        """Yield the core control buttons for the input menu."""
        yield MenuItem(
            self.shadow_text("←"),
            None,
            None,
            InputMenuObj(self.backspace),
        )

        yield MenuItem(
            self.shadow_text("END"),
            None,
            None,
            InputMenuObj(self.confirm),
        )

        if self.random:
            yield self._create_empty_item()
            yield MenuItem(
                self.shadow_text(T.translate("random").upper()),
                None,
                None,
                InputMenuObj(self.pick_random),
            )

    def process_event(self, event: PlayerInput) -> PlayerInput | None:
        if event.button in (buttons.A, intentions.SELECT):
            self._handle_select_event(event)
            return None

        if event.pressed and event.button == events.BACKSPACE:
            self._handle_backspace_event()
            return None

        if event.pressed and event.button == events.UNICODE:
            self._handle_unicode_event(event.value)
            return None

        if event.pressed and event.button == buttons.MOUSELEFT:
            # The first-event guard is for the release of the key that
            # opened this menu; a tap or click is always meant.
            self._suppress_first_event = False

        return super().process_event(event)

    def empty(self) -> None:
        """Handler for empty character slots (no action)."""

    def backspace(self) -> None:
        """Remove the last character from the input string."""
        self.input_controller.backspace()
        self.update_text_area()
        self.update_char_counter()

    def add_input_char_and_pop(self, char: str) -> None:
        """Add character from variant dialog and close the variant menu."""
        self.leaving_char_variant_dialog = True
        self.input_controller.add_char(char)
        self.update_text_area()
        self.update_char_counter()
        self.client.pop_state()

    def add_input_char(self, char: str) -> None:
        """Add character to input string or show alert if limit exceeded."""
        if self._suppress_first_event:
            self._suppress_first_event = False
            return

        if self.input_controller.add_char(char):
            self.update_text_area()
            self.update_char_counter()
        else:
            self.input_display.update_input_string(T.translate("alert_text"))

    def _display_string(self) -> str:
        """Return the input string padded with underscores to fill remaining slots."""
        s = self.input_controller.current_string
        limit = self.input_controller.char_limit
        if self.secret:
            slots = [MASK] * len(s)
            slots += ["_"] * self.input_controller.remaining_chars
            return " ".join(slots)
        if limit <= 20:
            return s + "_" * self.input_controller.remaining_chars
        return s

    def update_text_area(self) -> None:
        """Update the text area to reflect the current input string."""
        self.input_display.update_input_string(self._display_string())

    def update_char_counter(self) -> None:
        """Update the character count display (none for a code: its
        empty places already show what is left)."""
        if self.secret:
            self.input_display.char_counter.text = ""
            return
        self.input_display.update_char_counter(
            self.input_controller.remaining_chars
        )

    def confirm(self) -> None:
        """Trigger the input confirmation and invoke callback."""
        final_input_string = self.input_controller.current_string
        if not final_input_string and self.char_limit > 0:
            return
        if self.callback is None:
            raise ValueError("Callback function not provided!")
        self.callback(final_input_string)
        self.client.pop_state(self)

    def pick_random(self) -> None:
        """Assign a random name based on gender and language preferences."""
        gender = local_session.player.gender or "neutral"
        language = T.get_current_language().lower()
        fallback_language = self.client.config.locale.slug.lower()
        random_name = self.name_loader.get_random_name(
            gender, language, fallback_language
        )
        self.input_controller.set_string(random_name)
        self.update_text_area()
        self.update_char_counter()

    def _create_empty_item(self) -> MenuItem[InputMenuObj]:
        """Create a disabled menu item representing an empty key."""
        empty = MenuItem(
            self.shadow_text(" "),
            None,
            None,
            InputMenuObj(self.empty),
        )
        empty.enabled = False
        return empty

    def _create_char_item(self, char: str) -> MenuItem[InputMenuObj]:
        """Create a character key menu item."""
        return MenuItem(
            self.shadow_text(char),
            None,
            None,
            InputMenuObj(partial(self.add_input_char, char), char),
        )

    def _handle_select_event(self, event: PlayerInput) -> None:
        """Handle selection input on a menu item."""
        menu_item = self.get_selected_item()
        if menu_item is None:
            return

        if event.triggered:
            if self.leaving_char_variant_dialog:
                self.leaving_char_variant_dialog = False
                if menu_item.game_object.char:
                    self.input_controller.add_char(menu_item.game_object.char)
                    self.update_text_area()
                    self.update_char_counter()
            else:
                menu_item.game_object()

        elif event.held and event.hold_time > self.client.config.fps:
            base_char = menu_item.game_object.char
            if base_char:
                variants = self.char_manager.get_char_variants(base_char)
                all_variants = [base_char] + list(variants)

                actions = {
                    c: partial(self.add_input_char_and_pop, c)
                    for c in all_variants
                }
                options = create_choice_options(actions)

                menu = MenuOptions(options)
                open_choice_dialog(client=self.client, menu=menu)

    def _handle_backspace_event(self) -> None:
        """Handle the backspace key event."""
        self.backspace()

    def _handle_unicode_event(self, char: str) -> None:
        """Handle unicode character input event."""
        if self.char_manager.is_valid_input_char(char):
            self.add_input_char(char)
