"""
Set the family's AI keys on this computer (the parent runs this; keys
never go through the game screens or the chat).

Usage:
    python -m nagmon.keys_cli list
    python -m nagmon.keys_cli set groq <KEY>
    python -m nagmon.keys_cli remove groq

Keys are stored in Nagmon's data folder (secrets.json, readable only by
this user where the system supports it). Environment variables such as
GROQ_API_KEY also work and win over the file.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from nagmon.ai.config import ENV_KEYS, load_keys, save_keys
from nagmon.family.parent import redact


def default_root() -> Path:
    """The same folder the game uses: <tuxemon user dir>/nagmon."""
    from tuxemon.constants import paths

    return paths.USER_STORAGE_DIR / "nagmon"


def main(argv: list[str] | None = None, root: Path | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m nagmon.keys_cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list")
    p_set = sub.add_parser("set")
    p_set.add_argument("provider", choices=sorted(ENV_KEYS))
    p_set.add_argument("key")
    p_rm = sub.add_parser("remove")
    p_rm.add_argument("provider", choices=sorted(ENV_KEYS))
    args = parser.parse_args(argv)
    root = root or default_root()
    root.mkdir(parents=True, exist_ok=True)

    if args.cmd == "set":
        save_keys(root, {args.provider: args.key.strip()})
        print(f"saved {args.provider}: {redact(args.key)}")
    elif args.cmd == "remove":
        save_keys(root, {args.provider: None})
        print(f"removed {args.provider}")
    keys = load_keys(root)
    for name in sorted(ENV_KEYS):
        state = redact(keys[name]) if name in keys else "-"
        print(f"{name:12} {state}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
