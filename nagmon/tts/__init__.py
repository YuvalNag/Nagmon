# SPDX-License-Identifier: GPL-3.0
"""Read questions and dialogs aloud in Hebrew and English (SDD_TTS)."""

from nagmon.tts.backends import (
    Backend,
    EdgeTTSBackend,
    NullBackend,
    Pyttsx3Backend,
)
from nagmon.tts.cache import AudioCache
from nagmon.tts.factory import build_backends, create_service
from nagmon.tts.player import NullPlayer, Player
from nagmon.tts.service import SpokenClip, TTSIssue, TTSService
from nagmon.tts.settings import Lang, TTSSettings
from nagmon.tts.text import Segment, clean_for_speech, split_by_language

__all__ = [
    "AudioCache",
    "Backend",
    "EdgeTTSBackend",
    "Lang",
    "NullBackend",
    "NullPlayer",
    "Player",
    "Pyttsx3Backend",
    "Segment",
    "SpokenClip",
    "TTSIssue",
    "TTSService",
    "TTSSettings",
    "build_backends",
    "clean_for_speech",
    "create_service",
    "split_by_language",
]
