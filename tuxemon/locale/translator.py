# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
from __future__ import annotations

import copy
import logging
from collections.abc import Callable, Mapping
from gettext import GNUTranslations, NullTranslations, translation
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

FALLBACK_LOCALE = "en_US"


class SafeDict(dict[str, str]):
    _msgid: str

    def __missing__(self, key: str) -> str:
        logger.warning(
            f"Missing parameter '{key}' in translation for msgid: '{self._msgid}'"
        )
        return f"<{key}>"

    def set_msgid(self, msgid: str) -> None:
        self._msgid = msgid


class TranslatorPo:
    """
    A class used to translate text using a specific gettext translation
    instance. This class handles the core logic of text translation and
    caching for a given locale and domain.
    """

    def __init__(
        self,
        locale_name: str,
        domain: str,
        localedir: Path,
        fallback_locale: str = FALLBACK_LOCALE,
        extra_domains: tuple[str, ...] = (),
    ) -> None:
        self.locale_name = locale_name
        self.domain = domain
        self.localedir = localedir
        self.fallback_locale = fallback_locale
        self.extra_domains = extra_domains
        self._real_translate: GNUTranslations | NullTranslations = (
            self._load_gettext_translation()
        )
        self.translate: Callable[[str], str] = self._real_translate.gettext
        self.translate_plural: Callable[[str, str, int], str] = (
            self._real_translate.ngettext
        )

    def _load_gettext_translation(
        self,
    ) -> GNUTranslations | NullTranslations:
        """
        Loads and returns the gettext translation function for this translator.
        Handles fallback if the specific translation is not found.

        With ``extra_domains`` (strings shipped by mods in their own .po
        domain), the lookup order is: extra domains in the active locale,
        this domain in the active locale, then the same in the fallback
        locale.
        """
        if self.extra_domains:
            return self._load_chained_translation()
        return self._load_single_translation()

    def _load_chained_translation(
        self,
    ) -> GNUTranslations | NullTranslations:
        locales = [self.locale_name]
        if self.fallback_locale != self.locale_name:
            locales.append(self.fallback_locale)
        domains = [*self.extra_domains, self.domain]

        chain: list[GNUTranslations | NullTranslations] = []
        for locale_name in locales:
            for domain in domains:
                try:
                    chain.append(
                        translation(domain, self.localedir, [locale_name])
                    )
                except FileNotFoundError:
                    logger.debug(
                        f"No '{domain}' translation for '{locale_name}'"
                    )

        if not chain:
            logger.error(
                f"No translation found for domains {domains}. "
                "Using NullTranslations."
            )
            return NullTranslations()

        # gettext.translation() caches instances; copy so fallbacks added
        # here never leak into another translator's chain.
        chain = [copy.copy(t) for t in chain]
        for t in chain:
            t._fallback = None  # type: ignore[attr-defined]
        head = chain[0]
        for t in chain[1:]:
            head.add_fallback(t)
        return head

    def _load_single_translation(
        self,
    ) -> GNUTranslations | NullTranslations:
        trans: GNUTranslations | NullTranslations
        try:
            trans = translation(
                self.domain, self.localedir, [self.locale_name]
            )
            logger.debug(
                f"Loaded translation for domain '{self.domain}', locale '{self.locale_name}'"
            )
        except FileNotFoundError:
            logger.warning(
                f"Translation file not found for domain '{self.domain}',"
                f"locale '{self.locale_name}'. "
                f"Attempting to use fallback '{self.fallback_locale}'."
            )
            try:
                trans = translation(
                    self.domain, self.localedir, [self.fallback_locale]
                )
                logger.debug(
                    f"Loaded fallback translation for domain '{self.domain}',"
                    f"locale '{self.fallback_locale}'"
                )
            except FileNotFoundError:
                logger.error(
                    f"No translation found for domain '{self.domain}' in any locale."
                    " Using NullTranslations."
                )
                trans = NullTranslations()

        try:
            fallback_base_trans = translation(
                "base", self.localedir, [self.fallback_locale]
            )
            trans.add_fallback(fallback_base_trans)
            logger.debug(
                f"Added 'base' domain fallback translation for locale '{self.fallback_locale}'"
            )
        except FileNotFoundError:
            logger.error(
                f"Base fallback translation 'base' for locale '{self.fallback_locale}' not found."
                "Translations might be very incomplete."
            )

        return trans

    def get_current_language(self) -> str:
        """
        Returns the locale name this translator is configured for.

        Returns:
            The current language.
        """
        return self.locale_name

    def has_translation(self, msgid: str) -> bool:
        """
        Checks if a translation exists for a given message ID within this
        translator's context.

        Parameters:
            msgid: The msgid of the translation to check.

        Returns:
            True if the translation exists, False otherwise.
        """
        return self.translate(msgid) != msgid

    def has_plural_translation(
        self, singular_msgid: str, plural_msgid: str, n: int
    ) -> bool:
        """
        Checks if a plural translation exists for the given message IDs.

        Parameters:
            singular_msgid: The singular msgid.
            plural_msgid: The plural msgid.
            n: The number used to determine the plural form.

        Returns:
            True if a plural translation exists, False otherwise.
        """
        translated = self.translate_plural(singular_msgid, plural_msgid, n)
        return translated != singular_msgid and translated != plural_msgid

    def format(
        self,
        text: str,
        parameters: Mapping[str, Any] | None = None,
    ) -> str:
        """
        Replaces variables in a translation string with the given parameters.

        Parameters:
            text: String to format.
            parameters: Parameters to format into the string.

        Returns:
            The formatted string.
        """
        text = text.replace(r"\n", "\n")
        translated_text = self.translate(text)

        if parameters:
            safe_params = SafeDict(parameters)
            safe_params.set_msgid(text)  # original msgid before translation
            try:
                translated_text = translated_text.format_map(safe_params)
            except Exception as e:
                logger.error(
                    f"Unexpected formatting error for msgid '{text}': {e}"
                )
                raise

        return translated_text

    def maybe_translate(self, text: str | None) -> str:
        """
        Try to translate the text. If ``None``, return empty string.

        Parameters:
            text: String to translate.

        Returns:
            Translated string.
        """
        if text is None:
            return ""
        else:
            return self.translate(text)
