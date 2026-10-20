# SPDX-License-Identifier: GPL-3.0
"""WP12: audio cache keyed by sha256, LRU by mtime (SDD_TTS §2.6)."""

from __future__ import annotations

import hashlib
import os

import pytest

from nagmon.tts.cache import AudioCache

BASE = ("edge", "he-IL-HilaNeural", "-10%", "שלום")


def _store(cache, text, size, mtime=None):
    key = AudioCache.key("fake", "v", "+0%", text)
    tmp = cache.tmp_path(key, ".wav")
    tmp.write_bytes(b"x" * size)
    path = cache.store(key, ".wav", tmp)
    if mtime is not None:
        os.utime(path, (mtime, mtime))
    return path


def test_key_is_sha256_of_joined_fields():
    expected = hashlib.sha256(
        "edge|he-IL-HilaNeural|-10%|שלום".encode()
    ).hexdigest()
    assert AudioCache.key(*BASE) == expected
    assert AudioCache.key(*BASE) == AudioCache.key(*BASE)


@pytest.mark.parametrize(
    "index",
    [
        pytest.param(0, id="backend"),
        pytest.param(1, id="voice"),
        pytest.param(2, id="rate"),
        pytest.param(3, id="text"),
    ],
)
def test_key_changes_with_each_field(index):
    changed = list(BASE)
    changed[index] = changed[index] + "!"
    assert AudioCache.key(*changed) != AudioCache.key(*BASE)


def test_miss_then_hit(tmp_path):
    cache = AudioCache(tmp_path, max_bytes=10_000)
    key = AudioCache.key(*BASE)
    assert cache.lookup(key, ".mp3") is None
    tmp = cache.tmp_path(key, ".mp3")
    tmp.write_bytes(b"audio")
    path = cache.store(key, ".mp3", tmp)
    assert path == cache.path_for(key, ".mp3")
    assert not tmp.exists()
    assert cache.lookup(key, ".mp3") == path
    assert path.read_bytes() == b"audio"


def test_hit_refreshes_mtime(tmp_path):
    cache = AudioCache(tmp_path, max_bytes=10_000)
    path = _store(cache, "a", 10, mtime=1_000)
    key = AudioCache.key("fake", "v", "+0%", "a")
    assert cache.lookup(key, ".wav") == path
    assert path.stat().st_mtime > 1_000


def test_empty_file_is_rejected(tmp_path):
    cache = AudioCache(tmp_path, max_bytes=10_000)
    key = AudioCache.key(*BASE)
    tmp = cache.tmp_path(key, ".mp3")
    tmp.write_bytes(b"")
    with pytest.raises(ValueError):
        cache.store(key, ".mp3", tmp)
    assert cache.lookup(key, ".mp3") is None
    assert not tmp.exists()


def test_store_evicts_oldest_over_cap(tmp_path):
    cache = AudioCache(tmp_path, max_bytes=250)
    first = _store(cache, "a", 100, mtime=1_000)
    second = _store(cache, "b", 100, mtime=2_000)
    third = _store(cache, "c", 100)
    assert not first.exists()
    assert second.exists() and third.exists()
    assert cache.total_bytes() <= 250


def test_evict_skips_protected_file(tmp_path):
    cache = AudioCache(tmp_path, max_bytes=10_000)
    oldest = _store(cache, "a", 100, mtime=1_000)
    middle = _store(cache, "b", 100, mtime=2_000)
    newest = _store(cache, "c", 100, mtime=3_000)
    cache.max_bytes = 250
    removed = cache.evict(protect={oldest})
    assert removed == 1
    assert oldest.exists() and newest.exists()
    assert not middle.exists()


def test_leftover_partial_files_are_removed_on_start(tmp_path):
    leftover = tmp_path / ("ab" * 32 + ".part123.mp3")
    leftover.write_bytes(b"half")
    keep = tmp_path / "notes.txt"
    keep.write_text("x")
    AudioCache(tmp_path, max_bytes=10_000)
    assert not leftover.exists()
    assert keep.exists()


def test_tmp_paths_are_unique(tmp_path):
    cache = AudioCache(tmp_path, max_bytes=10_000)
    key = AudioCache.key(*BASE)
    assert cache.tmp_path(key, ".mp3") != cache.tmp_path(key, ".mp3")
    assert cache.tmp_path(key, ".mp3").suffix == ".mp3"
