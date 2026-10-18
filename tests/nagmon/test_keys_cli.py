"""The parent's key tool (python -m nagmon.keys_cli)."""

from __future__ import annotations

from nagmon.ai.config import load_keys
from nagmon.keys_cli import main


def test_set_list_remove(tmp_path, capsys, monkeypatch):
    for var in ("GROQ_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"):
        monkeypatch.delenv(var, raising=False)
    assert main(["set", "groq", "gsk_secret_value_123"], root=tmp_path) == 0
    out = capsys.readouterr().out
    assert "gsk_secret_value_123" not in out  # never echo the secret
    assert load_keys(tmp_path, environ={})["groq"] == "gsk_secret_value_123"
    main(["remove", "groq"], root=tmp_path)
    assert "groq" not in load_keys(tmp_path, environ={})
