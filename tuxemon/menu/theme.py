# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
from pathlib import Path

from pygame.surface import Surface
from pygame_menu.baseimage import BaseImage
from pygame_menu.locals import SCROLLAREA_POSITION_NONE
from pygame_menu.sound import SOUND_TYPE_WIDGET_SELECTION, Sound
from pygame_menu.themes import Theme
from pygame_menu.widgets.core.selection import Selection
from pygame_menu.widgets.core.widget import Widget
from pygame_menu.widgets.selection import NoneSelection
from pygame_menu.widgets.widget.menubar import MENUBAR_STYLE_ADAPTIVE

from tuxemon.constants.asset_loader import fetch_asset
from tuxemon.graphics import HD_TWIN_FACTOR, fetch_hd_twin
from tuxemon.locale.locale import T
from tuxemon.menu.rtl import install_pygame_menu_bidi, start_menu_alignment
from tuxemon.platform import mobile
from tuxemon.platform.const.graphics import (
    FONT_COLOR,
    FONT_SHADOW_COLOR,
    FONT_SIZE,
    FONT_SIZE_BIG,
    SCROLLBAR_COLOR,
    SCROLLBAR_SLIDER_COLOR,
    TRANSPARENT_COLOR,
)
from tuxemon.scaling import ScalingStrategy
from tuxemon.tools import transform_resource_filename
from tuxemon.ui import bidi
from tuxemon.user_config import CONFIG

_theme: Theme | None = None


def reset_theme_cache(_locale_name: str | None = None) -> None:
    """
    Drop the cached theme so the next ``get_theme`` picks up the current
    language (font, alignment, cursor side). Registered as a language
    change callback.
    """
    global _theme
    _theme = None


T.language_changed_callbacks.append(reset_theme_cache)
install_pygame_menu_bidi()


class TuxemonArrowSelection(Selection):
    def __init__(self, scale_factor: int, rtl: bool = False) -> None:
        # Call the constructor of the Selection providing the left, right,
        # top and bottom margins of your Selection effect box.
        #
        #  --------------------------
        # |          ^ top           |  In this example, XXXX represents the
        # | left  XXXXXXXXXXXX right |  Widget to be Selected.
        # |<----> XXXXXXXXXXXX<----->|  left, right, top and bottom must be described
        # |         v bottom         |  in pixels
        #  --------------------------
        #

        arrow = BaseImage(
            image_path=transform_resource_filename(CONFIG.menu_cursor),
        ).scale(scale_factor, scale_factor, smooth=False)
        if rtl:
            # RTL: the arrow sits right of the widget and points left
            arrow = arrow.flip(True, False)

        super().__init__(
            margin_left=0 if rtl else arrow.get_width(),
            margin_right=arrow.get_width() if rtl else 0,
            margin_top=0,
            margin_bottom=0,
        )
        self.arrow = arrow
        self.rtl = rtl

    def draw(self, surface: Surface, widget: Widget) -> Selection:
        """
        This method receives the surface to draw the selection and the
        widget itself. For retrieving the Selection coordinates the rect
        object from widget should be used.
        """
        widget_rect = widget.get_rect()
        if self.rtl:
            position = (widget_rect.topright[0], widget_rect.topright[1])
        else:
            position = (
                widget_rect.topleft[0] - self.arrow.get_width(),
                widget_rect.topleft[1],
            )

        self.arrow.draw(
            surface,
            area=self.arrow.get_rect(),
            position=position,
        )
        return self


def widget_padding(
    scaling: ScalingStrategy, *, touch: bool
) -> tuple[int, int]:
    """
    Space around each button. On a phone it is 1.6 times (3, 6): a
    medium button is 135 pixels high (8.7 mm on a 6.67" 2400x1080
    screen) and seven of them still fit (SDD_ANDROID §2.3).
    """
    if touch:
        factor = mobile.PHONE_UI_FACTOR
        return (
            round(scaling.scale_int(3) * factor),
            round(scaling.scale_int(6) * factor),
        )
    return scaling.scale_int(2), scaling.scale_int(4)


def selection_gap(scaling: ScalingStrategy) -> int:
    """Room between buttons side by side (a phone has no arrow)."""
    return scaling.scale_int(4)


def label_padding(scaling: ScalingStrategy) -> tuple[int, int]:
    """
    Space around a text that is not a button, on a phone: a finger does
    not need it, and the bigger text needs the room.
    """
    return scaling.scale_int(1), mobile.ui_px(scaling.scale_int(6))


def border_image(path: str, scale_factor: int) -> BaseImage:
    """
    The border at ``scale_factor`` times its size: from its HD twin,
    smoothly, when there is one (SDD_ANDROID §2.7), else as always
    (nearest).
    """
    twin = fetch_hd_twin(path)
    if twin is None:
        return BaseImage(image_path=transform_resource_filename(path)).scale(
            scale_factor, scale_factor, smooth=False
        )
    image = BaseImage(image_path=twin)
    w, h = image.get_size()
    return image.resize(
        w // HD_TWIN_FACTOR * scale_factor,
        h // HD_TWIN_FACTOR * scale_factor,
        smooth=True,
    )


def get_theme(scaling: ScalingStrategy) -> Theme:
    """Get Tuxemon default theme."""
    global _theme

    if _theme is not None:
        return _theme

    scale_factor = max(scaling.scale_int(1), 1)
    tuxemon_border = border_image(CONFIG.menu_border, scale_factor)

    tuxemon_background_center_rect = tuxemon_border.get_rect()
    tuxemon_background_center_rect = tuxemon_background_center_rect.inflate(
        -2 * tuxemon_background_center_rect.width // 3,
        -2 * tuxemon_background_center_rect.height // 3,
    )

    tuxemon_border._surface = tuxemon_border._surface.convert_alpha()
    tuxemon_background = tuxemon_border.copy().crop_rect(
        tuxemon_background_center_rect
    )

    theme = Theme(
        background_color=tuxemon_background,
        widget_alignment=start_menu_alignment(),
        title=False,
        # A phone is tapped, not steered with keys: the arrow next to the
        # selected button would only cover the next one.
        widget_selection_effect=(
            NoneSelection()
            if mobile.is_android()
            else TuxemonArrowSelection(scale_factor, rtl=bidi.locale_is_rtl())
        ),
        border_color=tuxemon_border,
        scrollarea_position=SCROLLAREA_POSITION_NONE,
        widget_padding=widget_padding(scaling, touch=mobile.is_android()),
        title_close_button=False,
        title_bar_style=MENUBAR_STYLE_ADAPTIVE,
        widget_font_shadow=True,
    )

    # Set common font sizes and colors as part of the theme definition
    theme.widget_font_size = mobile.ui_px(scaling.scale_int(FONT_SIZE))
    theme.title_font_size = mobile.ui_px(scaling.scale_int(FONT_SIZE_BIG))
    theme.widget_font_color = FONT_COLOR
    theme.selection_color = FONT_COLOR
    theme.scrollbar_color = SCROLLBAR_COLOR
    theme.scrollbar_slider_color = SCROLLBAR_SLIDER_COLOR
    theme.title_font_color = FONT_COLOR
    theme.title_background_color = TRANSPARENT_COLOR
    theme.widget_font_shadow_color = FONT_SHADOW_COLOR
    font = fetch_asset("font", CONFIG.locale.font_file)
    theme.title_font = font
    theme.widget_font = font

    _theme = theme
    return _theme


_sound_engine: Sound | None = None


def get_sound_engine(volume: float, filename: Path | None) -> Sound:
    """Get Tuxemon default sound engine."""
    global _sound_engine

    if _sound_engine is not None:
        _sound_engine.set_sound_volume(
            sound_type=SOUND_TYPE_WIDGET_SELECTION, volume=volume
        )
        return _sound_engine

    sound_engine = Sound()
    sound_engine.set_sound(
        sound_type=SOUND_TYPE_WIDGET_SELECTION,
        sound_file=filename,
        volume=float(volume),
    )

    _sound_engine = sound_engine
    return _sound_engine
