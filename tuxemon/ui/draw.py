# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
from __future__ import annotations

import logging
import re
from collections.abc import Generator, Iterable
from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING

from pygame.font import Font
from pygame.rect import Rect
from pygame.surface import Surface

from tuxemon.graphics import ColorLike
from tuxemon.ui.bidi import (
    BILINGUAL_LINE_BREAK,
    VisualStr,
    needs_bidi,
    paragraph_is_rtl,
    reorder,
    strip_bidi_controls,
)
from tuxemon.ui.text_alignment import HorizontalAlignment, VerticalAlignment
from tuxemon.ui.text_renderer import TextRenderer

if TYPE_CHECKING:
    from tuxemon.scaling import ScalingStrategy

logger = logging.getLogger(__name__)

font_size_cache: dict[tuple[int, str], tuple[int, int]] = {}


class RenderMode(Enum):
    # Renders text character by character
    CHARACTER = "char"
    # Renders text token by token (e.g., words or phrases)
    TOKEN = "token"
    # Renders text line by line
    LINE = "line"


class TextOverflow(Enum):
    # Truncates text when it reaches the boundary
    CLIP = "clip"
    # Adds "…" when clipping occurs
    ELLIPSIS = "ellipsis"
    # Allows overflow (useful for scrollable views)
    EXPAND = "expand"
    # Moves overflow text to next line (if vertical space allows)
    WRAP = "wrap"


@dataclass
class RenderedChar:
    rect: Rect
    surface: Surface
    char: str
    delay: float = 0.0


def get_font_height(font: Font) -> int:
    return get_text_size("Tg", font)[1]


def get_text_size(text: str, font: Font) -> tuple[int, int]:
    key = (id(font), text)
    if key not in font_size_cache:
        font_size_cache[key] = font.size(text)
    return font_size_cache[key]


class OverflowHandler:
    def __init__(self, font: Font, rect: Rect, behavior: TextOverflow):
        self.font = font
        self.rect = rect
        self.behavior = behavior
        self.ellipsis = "…"
        self.ellipsis_width = font.size(self.ellipsis)[0]

    def get_ellipsis_char(
        self, top: int, fg: ColorLike, bg: ColorLike, renderer: TextRenderer
    ) -> RenderedChar:
        surface = renderer.shadow_text(self.ellipsis, bg=bg, fg=fg)
        update_rect = surface.get_rect(
            top=top, left=self.rect.right - self.ellipsis_width
        )
        return RenderedChar(
            rect=update_rect, surface=surface, char=self.ellipsis
        )

    def handle_render_attempt(
        self,
        current_x_position: int,
        segment_width: int,
        top: int,
        fg: ColorLike,
        bg: ColorLike,
        renderer: TextRenderer,
    ) -> tuple[bool, RenderedChar | None]:
        """
        Determines if a segment should be rendered and if an ellipsis
        is needed.

        Returns:
            A tuple: (should_render_segment, optional_ellipsis_char).
            should_render_segment: True if the segment fits and should
                be rendered.
            optional_ellipsis_char: A RenderedChar for ellipsis if needed,
                otherwise None.
        """
        if self.behavior == TextOverflow.EXPAND:
            return True, None

        if current_x_position + segment_width <= self.rect.right:
            return True, None

        if self.behavior == TextOverflow.ELLIPSIS:
            if current_x_position + self.ellipsis_width <= self.rect.right:
                return False, self.get_ellipsis_char(top, fg, bg, renderer)
            else:
                return False, None

        return False, None


def _prepare_text_lines(
    text: str,
    font: Font,
    rect_width: int,
    overflow_behavior: TextOverflow,
) -> list[str]:
    """
    Prepares and returns a list of text lines based on overflow behavior.
    """
    return [
        line
        for line, _ in _prepare_text_lines_with_direction(
            text, font, rect_width, overflow_behavior
        )
    ]


def wrapped_text_height(
    text: str, font: Font, width: int, line_spacing: int = 0
) -> int:
    """
    The height a text needs when it is wrapped to ``width``, the way a
    dialog box draws it.
    """
    lines = _prepare_text_lines_with_direction(
        text, font, width, TextOverflow.CLIP
    )
    return len(lines) * (get_font_height(font) + line_spacing)


def _prepare_text_lines_with_direction(
    text: str,
    font: Font,
    rect_width: int,
    overflow_behavior: TextOverflow,
) -> list[tuple[str, bool]]:
    """
    Wraps logical text into lines and tags each line with the base
    direction of the paragraph it came from (True = RTL).

    Lines are produced exactly like ``break_text_into_lines`` on the whole
    text; the direction is computed per paragraph so a bilingual message
    (English paragraph, Hebrew paragraph) gets the right base for each.
    """
    if not text.strip():
        return [("", False)]
    paragraphs = list(iterate_paragraphs(text))
    if overflow_behavior not in (
        TextOverflow.WRAP,
        TextOverflow.CLIP,
        TextOverflow.EXPAND,
        TextOverflow.ELLIPSIS,
    ):
        return [(p, paragraph_is_rtl(p)) for p in paragraphs]

    allow_word_overflow = overflow_behavior == TextOverflow.WRAP
    lines: list[tuple[str, bool]] = []
    for index, paragraph in enumerate(paragraphs):
        if not paragraph.strip():
            if index == 0:
                continue
            lines.append(("", False))
            continue
        base_rtl = paragraph_is_rtl(paragraph)
        for line in break_text_into_lines(
            paragraph,
            font,
            rect_width,
            allow_word_overflow=allow_word_overflow,
        ):
            lines.append((line, base_rtl))
    return lines


def _iter_chars_for_line(
    line: str,
    font: Font,
    fg: ColorLike,
    bg: ColorLike,
    top: int,
    x_start: int,
    overflow_handler: OverflowHandler,
    text_renderer: TextRenderer,
) -> Generator[RenderedChar, None, None]:
    """
    Generates RenderedChar objects for each character in a line.
    Handles horizontal overflow using the provided overflow_handler.
    """
    x_position = x_start

    for char in line:
        advance = font.size(char)[0]

        should_render, ellipsis_char = overflow_handler.handle_render_attempt(
            x_position, advance, top, fg, bg, text_renderer
        )

        if ellipsis_char:
            yield ellipsis_char
            return

        if not should_render:
            return

        glyph = text_renderer.get_glyph(char, fg, bg)
        rect = glyph.get_rect(top=top, left=x_position)

        if char != " ":
            yield RenderedChar(rect=rect, surface=glyph, char=char)

        x_position += advance


def _iter_tokens_for_line(
    line: str,
    font: Font,
    fg: ColorLike,
    bg: ColorLike,
    top: int,
    x_start: int,
    overflow_handler: OverflowHandler,
    text_renderer: TextRenderer,
) -> Generator[RenderedChar, None, None]:
    """
    Generates RenderedChar objects for each token (word/spacing) in a line.
    Handles horizontal overflow using the provided overflow_handler.
    """
    x_position = x_start

    for token in tokenize_preserving_spacing(line):
        token_width = font.size(token)[0]

        should_render, ellipsis_char = overflow_handler.handle_render_attempt(
            x_position, token_width, top, fg, bg, text_renderer
        )

        if ellipsis_char:
            yield ellipsis_char
            return

        if not should_render:
            return

        surface = text_renderer.shadow_text(token, bg=bg, fg=fg)
        rect = surface.get_rect(top=top, left=x_position)

        if token.strip():
            yield RenderedChar(rect=rect, surface=surface, char=token)

        x_position += token_width


def _bidi_line_start(
    rect: Rect,
    width: int,
    h_alignment: HorizontalAlignment,
    base_rtl: bool,
) -> int:
    """x of the left edge of a visual line of the given width."""
    if width > rect.width and base_rtl:
        # an RTL line that does not fit overflows on its end (the left)
        if h_alignment == HorizontalAlignment.LEFT:
            return rect.left
        return rect.right - width
    offset_x, _ = calculate_alignment_offset(
        rect, width, 0, h_alignment, VerticalAlignment.TOP
    )
    return rect.left + offset_x


def _iter_bidi_line(
    line: str,
    base_rtl: bool,
    mode: RenderMode,
    font: Font,
    fg: ColorLike,
    bg: ColorLike,
    top: int,
    rect: Rect,
    h_alignment: HorizontalAlignment,
    overflow_behavior: TextOverflow,
    text_renderer: TextRenderer,
) -> Generator[RenderedChar, None, None]:
    """
    Renders one wrapped line that needs bidi reordering.

    Glyphs are placed on the *visual* line, but in CHARACTER mode they are
    yielded in *logical* order, so the typewriter effect reveals the text
    in reading order (right to left for Hebrew, left to right for an
    English word inside a Hebrew sentence).
    """
    visual, visual_to_logical = reorder(line, base_rtl)
    ellipsis = "…"
    ellipsis_width = font.size(ellipsis)[0]

    if mode == RenderMode.LINE:
        surface = text_renderer.shadow_text(visual, bg=bg, fg=fg)
        width = surface.get_width()
        left = _bidi_line_start(rect, width, h_alignment, base_rtl)
        yield RenderedChar(
            rect=surface.get_rect(top=top, left=left),
            surface=surface,
            char=visual,
        )
        return

    if mode == RenderMode.TOKEN:
        pieces = tokenize_preserving_spacing(visual)
    else:
        pieces = list(visual)
    advances = [font.size(piece)[0] for piece in pieces]
    total_width = sum(advances)
    x = _bidi_line_start(rect, total_width, h_alignment, base_rtl)
    positions = []
    for advance in advances:
        positions.append(x)
        x += advance

    def fits(index: int, reserve: int = 0) -> bool:
        if overflow_behavior == TextOverflow.EXPAND:
            return True
        left = positions[index]
        right = left + advances[index]
        if base_rtl:
            return left >= rect.left + reserve and right <= rect.right
        return left >= rect.left and right <= rect.right - reserve

    clipped = any(
        piece.strip() and not fits(index) for index, piece in enumerate(pieces)
    )
    reserve = (
        ellipsis_width
        if clipped and overflow_behavior == TextOverflow.ELLIPSIS
        else 0
    )

    if mode == RenderMode.TOKEN:
        indices = list(range(len(pieces)))
        if base_rtl:
            indices.reverse()
    else:
        indices = sorted(
            range(len(pieces)), key=lambda i: visual_to_logical[i]
        )

    for index in indices:
        piece = pieces[index]
        if not piece.strip() or not fits(index, reserve):
            continue
        if mode == RenderMode.TOKEN:
            surface = text_renderer.shadow_text(VisualStr(piece), bg=bg, fg=fg)
        else:
            surface = text_renderer.get_glyph(piece, fg, bg)
        yield RenderedChar(
            rect=surface.get_rect(top=top, left=positions[index]),
            surface=surface,
            char=piece,
        )

    if reserve:
        surface = text_renderer.shadow_text(ellipsis, bg=bg, fg=fg)
        left = rect.left if base_rtl else rect.right - ellipsis_width
        yield RenderedChar(
            rect=surface.get_rect(top=top, left=left),
            surface=surface,
            char=ellipsis,
        )


def iter_render_text(
    text: str,
    font: Font,
    fg: ColorLike,
    bg: ColorLike,
    rect: Rect,
    scaling: ScalingStrategy,
    h_alignment: HorizontalAlignment = HorizontalAlignment.LEFT,
    v_alignment: VerticalAlignment = VerticalAlignment.TOP,
    text_renderer: TextRenderer | None = None,
    mode: RenderMode = RenderMode.CHARACTER,
    overflow_behavior: TextOverflow = TextOverflow.CLIP,
    line_spacing: int = 0,
) -> Generator[RenderedChar, None, None]:
    """
    Yields the rendered pieces of a text, in reveal order.

    Text is wrapped in logical order; lines that contain RTL text (or
    belong to an RTL paragraph) are reordered after wrapping, see
    ``_iter_bidi_line``. Pure LTR lines take the original code path.
    """
    lines = _prepare_text_lines_with_direction(
        text, font, rect.width, overflow_behavior
    )
    if not lines:
        return

    line_height = get_font_height(font) + line_spacing
    total_text_height = len(lines) * line_height

    _, vertical_offset = calculate_alignment_offset(
        rect, 0, total_text_height, HorizontalAlignment.LEFT, v_alignment
    )

    if text_renderer is None:
        text_renderer = TextRenderer(
            scaling=scaling, font_color=fg, font_shadow_color=bg, font=font
        )

    for line_index, (line, base_rtl) in enumerate(lines):
        current_line_y = rect.top + line_index * line_height + vertical_offset

        if line and needs_bidi(line, base_rtl):
            yield from _iter_bidi_line(
                line,
                base_rtl,
                mode,
                font,
                fg,
                bg,
                current_line_y,
                rect,
                h_alignment,
                overflow_behavior,
                text_renderer,
            )
            continue

        # no glyph for bidi controls (e.g. the isolates around math)
        line = strip_bidi_controls(line)
        line_width = font.size(line)[0]

        offset_x_for_line, _ = calculate_alignment_offset(
            rect, line_width, 0, h_alignment, VerticalAlignment.TOP
        )
        current_line_x = rect.left + offset_x_for_line

        overflow_handler = OverflowHandler(
            font=font, rect=rect, behavior=overflow_behavior
        )

        if mode == RenderMode.CHARACTER:
            yield from _iter_chars_for_line(
                line,
                font,
                fg,
                bg,
                current_line_y,
                current_line_x,
                overflow_handler,
                text_renderer,
            )

        elif mode == RenderMode.TOKEN:
            yield from _iter_tokens_for_line(
                line,
                font,
                fg,
                bg,
                current_line_y,
                current_line_x,
                overflow_handler,
                text_renderer,
            )

        elif mode == RenderMode.LINE:
            should_render, ellipsis_char = (
                overflow_handler.handle_render_attempt(
                    current_line_x,
                    line_width,
                    current_line_y,
                    fg,
                    bg,
                    text_renderer,
                )
            )

            if ellipsis_char:
                yield ellipsis_char
                continue

            if not should_render:
                continue

            surface = text_renderer.shadow_text(line, bg=bg, fg=fg)
            update_rect = surface.get_rect(
                top=current_line_y, left=current_line_x
            )
            yield RenderedChar(rect=update_rect, surface=surface, char=line)


def tokenize_preserving_spacing(text: str) -> list[str]:
    return re.findall(r"\S+|\s+", text)


def build_line(text: str) -> Generator[str, None, None]:
    for index in range(1, len(text) + 1):
        yield text[:index]


def constrain_width(
    text: str,
    font: Font,
    width: int,
    strict_mode: bool = True,
    diagnostic: bool = False,
) -> Generator[str, None, None]:
    if not text.strip():
        yield ""
        return
    for line in iterate_word_lines(text):
        scrap = ""
        for word in line:
            test = f"{scrap} {word}" if scrap else word
            if font.size(test)[0] >= width:
                if not scrap:
                    if strict_mode:
                        raise RuntimeError(
                            "message is too large for width", text
                        )
                    else:
                        logger.error(
                            f"Layout issue: word '{word}' is too wide "
                            f"({font.size(word)[0]}px ≥ {width}px) in text: '{text[:60]}...'"
                        )
                        if diagnostic:
                            logger.debug(
                                f"[diagnostic] word overflow → '{word}' with width {font.size(word)[0]}px"
                            )
                        yield word
                        scrap = ""
                        continue
                yield scrap
                scrap = word
            else:
                scrap = test
        if scrap:
            yield scrap


def iterate_words(text: str) -> Generator[str, None, None]:
    yield from text.split(" ")


def iterate_lines(text: str) -> Generator[str, None, None]:
    yield from text.strip().split("\n")


def iterate_paragraphs(text: str) -> Generator[str, None, None]:
    # U+2028 (BILINGUAL_LINE_BREAK) is a line break that does not start a
    # new dialog page.
    yield from text.replace(BILINGUAL_LINE_BREAK, "\n").split("\n")


def iterate_word_lines(text: str) -> Generator[Iterable[str], None, None]:
    for line in iterate_lines(text):
        yield iterate_words(line)


def blit_alpha(
    target: Surface,
    source: Surface,
    location: tuple[int, int],
    opacity: int,
) -> None:
    """
    Blits a surface with alpha that can also have its overall transparency
    modified.
    Taken from http://nerdparadise.com/tech/python/pygame/blitopacity/

    Parameters:
        target: The surface to blit onto.
        source: The surface to blit.
        location: The location to blit the source surface.
        opacity: The overall transparency of the source surface, ranging
            from 0 (fully transparent) to 255 (fully opaque).

    Notes:
        This function has performance implications due to the creation of
        a temporary surface. It is recommended to use this function sparingly.
    """

    x = location[0]
    y = location[1]
    temp = Surface((source.get_width(), source.get_height())).convert()
    temp.blit(target, (-x, -y))
    temp.blit(source, (0, 0))
    temp.set_alpha(opacity)
    target.blit(temp, location)


def break_text_into_lines(
    text: str,
    font: Font,
    max_width: int,
    allow_word_overflow: bool = False,
) -> Generator[str, None, None]:
    """
    Breaks a block of *normalized* text into lines that fit within max_width.
    Yields each formatted line as a string.

    Parameters:
        text: The input text. It's assumed that any literal '\\n' sequences
              have already been converted to actual newline characters '\n'
              before being passed to this function. Actual '\n' characters
              are treated as paragraph breaks.
        font: The Pygame Font object to use for measuring text.
        max_width: The maximum width allowed for each line in pixels.
        allow_word_overflow: If True, a single word wider than max_width
            will be yielded on its own line, potentially exceeding max_width.
            If False, a warning might be logged if a word exceeds width and no
            wrapping is possible.
    """
    if not text.strip():
        yield ""
        return

    paragraphs = list(iterate_paragraphs(text))

    for i, paragraph in enumerate(paragraphs):
        if not paragraph.strip():
            if i == 0:
                continue
            yield ""
            continue

        current_line_words: list[str] = []
        words = list(iterate_words(paragraph))

        for word in words:
            if word.strip() == "":
                continue

            test_line = " ".join(current_line_words + [word])
            text_width, _ = get_text_size(test_line, font)

            if text_width > max_width and current_line_words:
                yield " ".join(current_line_words)
                current_line_words = [word]
            elif text_width > max_width and not current_line_words:
                if not allow_word_overflow:
                    logger.warning(
                        f"Word '{word}' (width: {text_width}px) is too wide for max_width ({max_width}px). "
                        "It will be displayed on its own line and might overflow visually if clipped."
                    )
                yield word
                current_line_words = []
            else:
                current_line_words.append(word)

        if current_line_words:
            yield " ".join(current_line_words)


def calculate_alignment_offset(
    container_rect: Rect,
    content_width: int,
    content_height: int,
    h_alignment: HorizontalAlignment,
    v_alignment: VerticalAlignment,
) -> tuple[int, int]:
    """
    Calculates the top-left offset (x, y) for content within a container rect
    based on horizontal and vertical alignment. Returns (0, 0) if container has no size.
    Raises ValueError for negative dimensions.

    Parameters:
        container_rect: The Rect representing the area where content will be placed.
        content_width: The total width of the content to be aligned.
        content_height: The total height of the content to be aligned.
        h_alignment: Horizontal alignment preference (LEFT, CENTER, RIGHT).
        v_alignment: Vertical alignment preference (TOP, CENTER, BOTTOM).

    Returns:
        A tuple (offset_x, offset_y) representing the pixel offset
        from the top-left of the container_rect.
    """
    if container_rect.width < 0 or container_rect.height < 0:
        raise ValueError("Container dimensions cannot be negative")
    if content_width < 0 or content_height < 0:
        raise ValueError("Content dimensions cannot be negative")

    # If container width or height is zero, offset is always (0, 0)
    if container_rect.width == 0 or container_rect.height == 0:
        return 0, 0

    # Horizontal alignment
    if h_alignment == HorizontalAlignment.CENTER:
        offset_x = max(0, (container_rect.width - content_width) // 2)
    elif h_alignment == HorizontalAlignment.RIGHT:
        offset_x = max(0, container_rect.width - content_width)
    else:
        offset_x = 0  # LEFT

    # Vertical alignment
    if v_alignment == VerticalAlignment.CENTER:
        offset_y = max(0, (container_rect.height - content_height) // 2)
    elif v_alignment == VerticalAlignment.BOTTOM:
        offset_y = max(0, container_rect.height - content_height)
    else:
        offset_y = 0  # TOP

    return offset_x, offset_y
