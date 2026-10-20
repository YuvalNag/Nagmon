"""Golden hashes of the Python generators, for the TS port's tests.

For every skill of the real content and every context in CONTEXTS, the
questions of seeds 0..SEEDS-1 are dumped as canonical JSON (sorted keys,
integral floats as ints, Fractions as text) and hashed with FNV-1a 32.
The TS test builds the same JSON from the TS generators and compares.

    python app/tests/unit/learning/golden/make_golden.py          # write generators.json
    python app/tests/unit/learning/golden/make_golden.py SKILL CTX SEED   # print one question
    python app/tests/unit/learning/golden/make_golden.py SKILL   # print all, "ctx seed json" lines

Run with the repo's Python (PyYAML installed), from any directory.
"""

from __future__ import annotations

import dataclasses
import json
import random
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
sys.path.insert(0, str(ROOT))

from nagmon.learning.content import ContentLibrary  # noqa: E402
from nagmon.learning.generators.common import GenContext  # noqa: E402

SEEDS = 40
CONTEXTS = [
    None,
    {"age": 6},
    {"age": 10},
    {"age": 10, "max_choices": 3},
    {"age": 12, "prefer_kind": "number"},
]
OUT = Path(__file__).with_name("generators.json")


def plain(x):
    if dataclasses.is_dataclass(x) and not isinstance(x, type):
        return {f.name: plain(getattr(x, f.name)) for f in dataclasses.fields(x)}
    if isinstance(x, dict):
        return {str(k): plain(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [plain(v) for v in x]
    if isinstance(x, bool) or x is None or isinstance(x, (int, str)):
        return x
    if isinstance(x, float):
        return int(x) if x.is_integer() else x
    if isinstance(x, Fraction):
        return str(x)
    raise TypeError(type(x))


def canonical(q) -> str:
    return json.dumps(plain(q), ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def fnv1a(text: str, h: int = 0x811C9DC5) -> int:
    for byte in text.encode("utf-8"):
        h ^= byte
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def question(lib, skill, ctx_i, seed):
    extra = CONTEXTS[ctx_i]
    ctx = None
    if extra is not None:
        ctx = GenContext(skill.id, skill.subject, grade=skill.grade, **extra)
    return lib.generate(skill.id, random.Random(seed), ctx)


def main() -> None:
    lib = ContentLibrary.load()
    if len(sys.argv) == 2:
        skill = lib.skill(sys.argv[1])
        for ctx_i in range(len(CONTEXTS)):
            for seed in range(SEEDS):
                print(ctx_i, seed, canonical(question(lib, skill, ctx_i, seed)))
        return
    if len(sys.argv) == 4:
        skill = lib.skill(sys.argv[1])
        print(canonical(question(lib, skill, int(sys.argv[2]), int(sys.argv[3]))))
        return
    out = {"seeds": SEEDS, "contexts": CONTEXTS, "skills": {}}
    for skill in sorted(lib.skills.values(), key=lambda s: s.id):
        hashes = []
        for ctx_i in range(len(CONTEXTS)):
            h = 0x811C9DC5
            for seed in range(SEEDS):
                h = fnv1a(canonical(question(lib, skill, ctx_i, seed)) + "\n", h)
            hashes.append(f"{h:08x}")
        out["skills"][skill.id] = {"generator": skill.generator, "hashes": hashes}
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(out['skills'])} skills -> {OUT}")


if __name__ == "__main__":
    main()
