# SPDX-License-Identifier: GPL-3.0
"""WP12: TTSService queue, fallback, consent and cache (SDD_TTS T17-T30)."""

from __future__ import annotations

import threading
import time

import pytest

from nagmon.tts.backends import NullBackend
from nagmon.tts.fakes import FakeBackend, FakePlayer
from nagmon.tts.service import TTSService
from nagmon.tts.settings import TTSSettings


class Clock:
    def __init__(self):
        self.now = 1_000.0

    def __call__(self):
        return self.now


@pytest.fixture
def services():
    made = []
    yield made
    for svc in made:
        svc.shutdown()


@pytest.fixture
def make(tmp_path, services):
    def _make(backends, player=None, clock=None, **settings):
        svc = TTSService(
            backends,
            tmp_path / "cache",
            player if player is not None else FakePlayer(),
            settings=TTSSettings(**settings),
            clock=clock or time.monotonic,
        )
        services.append(svc)
        return svc

    return _make


def _wait(predicate, timeout=3.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if predicate():
            return True
        time.sleep(0.005)
    return predicate()


# T17: online consent -------------------------------------------------------


def test_online_backend_not_used_without_consent(make):
    online = FakeBackend("edge", online=True)
    offline = FakeBackend("os")
    svc = make([online, offline, NullBackend()])
    assert svc.speak("שלום", "he")
    assert svc.wait_idle()
    assert online.calls == []
    assert offline.calls == [("שלום", "he")]


def test_online_backend_used_with_consent(make):
    online = FakeBackend("edge", online=True)
    offline = FakeBackend("os")
    svc = make([online, offline, NullBackend()], allow_online=True)
    svc.speak("שלום", "he")
    assert svc.wait_idle()
    assert online.calls == [("שלום", "he")]
    assert offline.calls == []


def test_prefetch_respects_consent(make):
    online = FakeBackend("edge", online=True)
    svc = make([online, NullBackend()])
    svc.prefetch(["שלום"], "he")
    assert svc.wait_idle()
    assert online.calls == []


def test_apply_settings_turns_online_on_at_runtime(make):
    online = FakeBackend("edge", online=True)
    svc = make([online, NullBackend()])
    svc.apply_settings(TTSSettings(allow_online=True))
    svc.speak("שלום", "he")
    assert svc.wait_idle()
    assert online.calls == [("שלום", "he")]


# T18: backend order ---------------------------------------------------------


def test_first_available_backend_per_language(make):
    online = FakeBackend("edge", online=True)
    os_voices = FakeBackend("os", langs=("en",))
    player = FakePlayer()
    svc = make([online, os_voices, NullBackend()], player, allow_online=True)
    svc.speak_bilingual("שלום", "hello")
    assert svc.wait_idle()
    assert online.calls == [("שלום", "he"), ("hello", "en")]
    assert os_voices.calls == []


def test_offline_english_only_hebrew_is_silent_with_hint(make):
    online = FakeBackend("edge", online=True)
    os_voices = FakeBackend("os", langs=("en",))
    player = FakePlayer()
    svc = make([online, os_voices, NullBackend()], player)
    svc.speak("שלום", "he")
    assert svc.wait_idle()
    assert player.played == []
    assert svc.last_error is not None
    assert svc.last_error.code == "no_voice"
    assert svc.last_error.lang == "he"
    assert "אין קול עברי במחשב" in svc.last_error.message_he
    assert svc.voice_status() == {"he": None, "en": "os"}


def test_voice_status_with_consent(make):
    online = FakeBackend("edge", online=True)
    svc = make([online, NullBackend()], allow_online=True)
    assert svc.voice_status() == {"he": "edge", "en": "edge"}


# T19-T21: robustness -------------------------------------------------------


def test_raising_backend_falls_back_to_next(make):
    broken = FakeBackend("broken", fail=RuntimeError("boom"))
    good = FakeBackend("good")
    player = FakePlayer()
    svc = make([broken, good, NullBackend()], player)
    svc.speak("שלום", "he")
    assert svc.wait_idle()
    assert good.calls == [("שלום", "he")]
    assert player.texts == ["good:he:שלום"]
    assert svc.last_error.code == "backend_error"


def test_failing_online_backend_reports_online_failed(make):
    broken = FakeBackend("edge", online=True, fail=OSError("no network"))
    good = FakeBackend("os")
    svc = make([broken, good, NullBackend()], allow_online=True)
    svc.speak("שלום", "he")
    assert svc.wait_idle()
    assert good.calls == [("שלום", "he")]
    assert svc.last_error.code == "online_failed"
    assert "אינטרנט" in svc.last_error.message_he


def test_backend_that_writes_nothing_counts_as_failure(make):
    empty = FakeBackend("empty", write=False)
    good = FakeBackend("good")
    player = FakePlayer()
    svc = make([empty, good, NullBackend()], player)
    svc.speak("שלום", "he")
    assert svc.wait_idle()
    assert player.texts == ["good:he:שלום"]


def test_available_raising_counts_as_unavailable(make):
    weird = FakeBackend("weird", available_error=RuntimeError("no engine"))
    good = FakeBackend("good")
    svc = make([weird, good, NullBackend()])
    svc.speak("שלום", "he")
    assert svc.wait_idle()
    assert weird.calls == []
    assert good.calls == [("שלום", "he")]
    assert svc.voice_status()["he"] == "good"


def test_failed_backend_is_paused_until_retry_time(make):
    clock = Clock()
    broken = FakeBackend("broken", fail=RuntimeError("boom"))
    good = FakeBackend("good")
    svc = make([broken, good, NullBackend()], clock=clock)
    svc.speak("אחת", "he")
    assert svc.wait_idle()
    svc.speak("שתיים", "he")
    assert svc.wait_idle()
    assert len(broken.calls) == 1
    clock.now += 61
    svc.speak("שלוש", "he")
    assert svc.wait_idle()
    assert len(broken.calls) == 2


def test_all_backends_failing_never_raises(make):
    broken = FakeBackend("broken", fail=RuntimeError("boom"))
    player = FakePlayer()
    svc = make([broken], player)
    svc.speak("שלום", "he")
    assert svc.wait_idle()
    assert player.played == []
    assert svc.last_error.code == "no_voice"


# T22-T26: queue and interrupt ----------------------------------------------


def test_speak_does_not_block(make):
    gate = threading.Event()
    slow = FakeBackend("slow", gate=gate)
    svc = make([slow, NullBackend()])
    start = time.monotonic()
    svc.speak("שלום", "he")
    assert time.monotonic() - start < 0.2
    assert svc.is_speaking()
    gate.set()
    assert svc.wait_idle()
    assert not svc.is_speaking()


def test_bilingual_plays_hebrew_then_english(make):
    backend = FakeBackend("fake")
    player = FakePlayer()
    svc = make([backend, NullBackend()], player)
    svc.speak_bilingual("שלום", "hello")
    assert svc.wait_idle()
    assert player.texts == ["fake:he:שלום", "fake:en:hello"]


def test_bilingual_with_missing_side(make):
    player = FakePlayer()
    svc = make([FakeBackend("fake"), NullBackend()], player)
    svc.speak_bilingual(None, "hello")
    assert svc.wait_idle()
    assert player.texts == ["fake:en:hello"]


def test_mixed_sentence_uses_english_voice_for_english_word(make):
    player = FakePlayer()
    svc = make([FakeBackend("fake"), NullBackend()], player)
    svc.speak("קיבלת 3 potions!", "he")
    assert svc.wait_idle()
    assert player.texts == ["fake:he:קיבלת 3", "fake:en:potions!"]


def test_mixed_sentence_single_voice_when_split_disabled(make):
    player = FakePlayer()
    svc = make(
        [FakeBackend("fake"), NullBackend()],
        player,
        read_english_with_english_voice=False,
    )
    svc.speak("קיבלת 3 potions!", "he")
    assert svc.wait_idle()
    assert player.texts == ["fake:he:קיבלת 3 potions!"]


def test_math_is_cleaned_before_synthesis(make):
    backend = FakeBackend("fake")
    svc = make([backend, NullBackend()])
    svc.speak("7 × 8 = ?", "he")
    assert svc.wait_idle()
    assert backend.calls == [("7 כפול 8 שווה כמה?", "he")]


def test_interrupt_stops_current_and_plays_new(make):
    player = FakePlayer(auto_finish=False)
    svc = make([FakeBackend("fake"), NullBackend()], player)
    svc.speak("אחת", "he")
    assert _wait(lambda: len(player.played) == 1)
    svc.speak("שתיים", "he")
    assert _wait(lambda: len(player.played) == 2)
    assert player.stops >= 1
    assert player.texts[-1] == "fake:he:שתיים"


def test_no_interrupt_waits_for_current_to_finish(make):
    player = FakePlayer(auto_finish=False)
    svc = make([FakeBackend("fake"), NullBackend()], player)
    svc.speak("אחת", "he")
    assert _wait(lambda: len(player.played) == 1)
    svc.speak("שתיים", "he", interrupt=False)
    time.sleep(0.1)
    assert len(player.played) == 1
    assert player.stops == 0
    player.finish()
    assert _wait(lambda: len(player.played) == 2)
    assert player.texts == ["fake:he:אחת", "fake:he:שתיים"]


def test_stop_cancels_queue_and_silences(make):
    player = FakePlayer(auto_finish=False)
    svc = make([FakeBackend("fake"), NullBackend()], player)
    svc.speak("אחת", "he")
    assert _wait(lambda: len(player.played) == 1)
    svc.speak("שתיים", "he", interrupt=False)
    svc.stop()
    assert player.stops >= 1
    assert not svc.is_speaking()
    time.sleep(0.1)
    assert len(player.played) == 1
    assert svc.wait_idle()


def test_stop_during_synthesis_drops_result(make):
    gate = threading.Event()
    slow = FakeBackend("slow", gate=gate)
    player = FakePlayer()
    svc = make([slow, NullBackend()], player)
    svc.speak("שלום", "he")
    assert _wait(lambda: len(slow.calls) == 1)
    svc.stop()
    gate.set()
    assert svc.wait_idle()
    time.sleep(0.05)
    assert player.played == []


# T27-T28: prefetch -----------------------------------------------------------


def test_prefetch_warms_cache_without_playing(make, tmp_path):
    backend = FakeBackend("fake")
    player = FakePlayer()
    svc = make([backend, NullBackend()], player)
    assert svc.prefetch(["אחת", "שתיים"], "he") == 2
    assert svc.wait_idle()
    assert player.played == []
    assert len(list((tmp_path / "cache").glob("*.wav"))) == 2
    svc.speak("אחת", "he")
    assert svc.wait_idle()
    assert len(backend.calls) == 2
    assert player.texts == ["fake:he:אחת"]


def test_cache_survives_new_service(make):
    first = FakeBackend("fake")
    svc = make([first, NullBackend()])
    svc.speak("שלום", "he")
    assert svc.wait_idle()
    second = FakeBackend("fake")
    player = FakePlayer()
    svc2 = make([second, NullBackend()], player)
    svc2.speak("שלום", "he")
    assert svc2.wait_idle()
    assert second.calls == []
    assert player.texts == ["fake:he:שלום"]


def test_speech_jumps_ahead_of_prefetch(make):
    gate = threading.Event()
    backend = FakeBackend("fake", gate=gate)
    svc = make([backend, NullBackend()])
    svc.prefetch(["אחת", "שתיים", "שלוש"], "he")
    assert _wait(lambda: len(backend.calls) == 1)
    svc.speak("דיבור", "he")
    gate.set()
    assert svc.wait_idle()
    assert [t for t, _ in backend.calls] == ["אחת", "דיבור", "שתיים", "שלוש"]


def test_stop_does_not_cancel_prefetch(make):
    backend = FakeBackend("fake")
    svc = make([backend, NullBackend()])
    svc.prefetch(["אחת"], "he")
    svc.stop()
    assert svc.wait_idle()
    assert backend.calls == [("אחת", "he")]


# T29-T30 ---------------------------------------------------------------------


def test_disabled_does_nothing(make):
    backend = FakeBackend("fake")
    svc = make([backend, NullBackend()], enabled=False)
    assert svc.speak("שלום", "he") is False
    assert svc.speak_bilingual("שלום", "hi") is False
    assert svc.wait_idle()
    assert backend.calls == []


def test_empty_text_after_cleaning_does_nothing(make):
    backend = FakeBackend("fake")
    svc = make([backend, NullBackend()])
    assert svc.speak("⭐⭐", "he") is False
    assert svc.speak("", "en") is False
    assert backend.calls == []


def test_player_error_is_reported_not_raised(make):
    player = FakePlayer(fail=RuntimeError("no audio device"))
    svc = make([FakeBackend("fake"), NullBackend()], player)
    svc.speak("שלום", "he")
    assert svc.wait_idle()
    assert svc.last_error.code == "player_error"
    assert "רמקולים" in svc.last_error.message_he


def test_unknown_language_falls_back_to_hebrew(make):
    backend = FakeBackend("fake")
    svc = make([backend, NullBackend()])
    svc.speak("שלום", "fr")
    assert svc.wait_idle()
    assert backend.calls == [("שלום", "he")]


def test_history_records_played_clips(make):
    svc = make([FakeBackend("fake"), NullBackend()])
    svc.speak("שלום", "he")
    assert svc.wait_idle()
    clip = svc.history[-1]
    assert clip.backend_id == "fake"
    assert clip.lang == "he"
    assert clip.text == "שלום"
    assert clip.path.exists()


def test_long_text_is_spoken_in_chunks(make):
    backend = FakeBackend("fake")
    player = FakePlayer()
    svc = make([backend, NullBackend()], player)
    text = "זה משפט די ארוך שחוזר על עצמו שוב ושוב. " * 12
    svc.speak(text, "he")
    assert svc.wait_idle()
    assert len(backend.calls) > 1
    assert all(len(t) <= 200 for t, _ in backend.calls)
