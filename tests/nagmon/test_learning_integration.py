"""I1-I14: content integration (SDD_LEARNING section 16).

Real merged content (all subjects), the ``english.vocab`` generator, the
extra bank formats (sentences, phonics, reading, monster facts) and the
AI-studio bank loaded through ``extra_bank_dirs``.
"""

from __future__ import annotations

import random
import re
import shutil
import textwrap
from collections import Counter
from pathlib import Path

import pytest

from nagmon.learning.content import (
    DEFAULT_CONTENT_DIR,
    ContentError,
    ContentLibrary,
)
from nagmon.learning.engine import LearningEngine
from nagmon.learning.generators.common import GenContext
from nagmon.learning.learner import LearnerState
from nagmon.learning.model import CHOICE_KINDS, check_answer

NIQQUD = re.compile("[֑-ׇֽֿׁׂׅׄ]")
PICTURE_MODES = {"picture_to_word", "listen_to_picture"}
ALL_MODES = (
    "picture_to_word",
    "word_to_translation",
    "listen_to_picture",
    "spelling",
    "sentence_cloze",
)
ITEM_ID = re.compile(
    r"^eng\.vocab\.[a-z0-9_]+\.[a-z]+\."
    r"(picture_to_word|word_to_translation|translation_to_word|"
    r"listen_to_picture|spelling|sentence_cloze)$"
)


def write(root: Path, rel: str, text: str) -> Path:
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(textwrap.dedent(text), encoding="utf-8")
    return p


def assert_valid(q) -> None:
    """The answer is reachable from the choices and checks as correct."""
    ids = [c.id for c in q.choices]
    assert len(ids) == len(set(ids)), q
    if q.kind in CHOICE_KINDS:
        assert q.answer in ids, q
    elif q.kind == "order":
        assert sorted(q.answer) == sorted(ids), q
    elif q.kind == "letters":
        tiles = Counter(c.text_he for c in q.choices)
        need = Counter(q.answer)
        assert not need - tiles, q
    assert check_answer(q, q.answer).correct, q
    assert q.explanation_he, q
    for text in (q.prompt_he, q.explanation_he, *(c.text_he for c in q.choices)):
        assert not NIQQUD.search(text), (q.item_id, text)


# --------------------------------------------------------------------------
# I1: the real content loads, every subject
# --------------------------------------------------------------------------


def test_i1_real_content_counts(library):
    skills = Counter(s.subject for s in library.skills.values())
    assert skills["english"] >= 60
    assert skills["science"] >= 60
    assert skills["hebrew"] >= 11
    items = Counter()
    for sid, bank in library.banks.items():
        items[library.skill(sid).subject] += len(bank)
    assert items["english"] >= 700  # phonics + grammar + reading
    assert items["science"] >= 800
    assert items["hebrew"] >= 150
    assert len(library.words) >= 850
    assert library.warnings == []


# --------------------------------------------------------------------------
# I2-I6: english.vocab
# --------------------------------------------------------------------------


@pytest.fixture(scope="module")
def vocab_lib(tmp_path_factory):
    """Real words.yaml, one skill per mode (A1 animals + food)."""
    root = tmp_path_factory.mktemp("vocab")
    (root / "english").mkdir()
    shutil.copy(
        DEFAULT_CONTENT_DIR / "english" / "words.yaml",
        root / "english" / "words.yaml",
    )
    lines = ["subject: english", "skills:"]
    for mode in (*ALL_MODES, "all"):
        modes = list(ALL_MODES) if mode == "all" else [mode]
        lines += [
            f"  - id: english.vocab.m_{mode}",
            "    grade: 3",
            "    title_he: אוצר מילים",
            "    title_en: Vocabulary",
            "    prereq: []",
            "    generator: english.vocab",
            "    params: {topics: [animals, food], level: A1, "
            f"modes: [{', '.join(modes)}]}}",
        ]
    write(root, "skills/english.yaml", "\n".join(lines) + "\n")
    return ContentLibrary.load(root)


def words_by(lib, key):
    out = {}
    for w in lib.words:
        if w.level == "A1":
            out.setdefault(getattr(w, key), w)
    return out


def gen(lib, sid, seed, age=10):
    sk = lib.skill(sid)
    ctx = GenContext(sid, sk.subject, grade=age - 6, age=age)
    return lib.generate(sid, random.Random(seed), ctx)


@pytest.mark.parametrize("mode", ALL_MODES)
def test_i2_vocab_mode_valid(vocab_lib, mode):
    sid = f"english.vocab.m_{mode}"
    by_word = words_by(vocab_lib, "word")
    by_he = words_by(vocab_lib, "he")
    modes = Counter()
    for seed in range(50):
        q = gen(vocab_lib, sid, seed)
        assert_valid(q)
        modes[q.meta["mode"]] += 1
        assert q.skill_id == sid and q.subject == "english"
        target = by_word[q.meta["word"]]
        assert q.meta["topic"] == target.topic
        assert q.meta["level"] == "A1"
        if q.kind == "letters":
            continue
        texts_he = [c.text_he for c in q.choices]
        texts_en = [c.text_en for c in q.choices if c.text_en]
        images = [c.image for c in q.choices if c.image]
        assert len(set(texts_he)) == len(texts_he), q
        assert len(set(texts_en)) == len(texts_en), q
        assert len(set(images)) == len(images), q
        assert len(images) in (0, len(q.choices)), "giveaway picture"
        assert 3 <= len(q.choices) <= 4
        for c in q.choices:
            w = by_word.get(c.text_en or "") or by_he.get(c.text_he)
            assert w is not None, (q.item_id, c)
            assert w.level == "A1" and w.topic in ("animals", "food")
            if c.id != q.answer and target.emoji and w.emoji:
                assert w.emoji != target.emoji
    if mode == "word_to_translation":
        assert set(modes) == {"word_to_translation", "translation_to_word"}
    else:
        assert set(modes) == {mode}


def test_i2_distractors_same_topic(vocab_lib):
    by_word = words_by(vocab_lib, "word")
    for seed in range(40):
        q = gen(vocab_lib, "english.vocab.m_picture_to_word", seed)
        topics = {by_word[c.text_en].topic for c in q.choices}
        assert topics == {q.meta["topic"]}, q


def test_i5_mode_details(vocab_lib):
    by_word = words_by(vocab_lib, "word")
    for seed in range(30):
        q = gen(vocab_lib, "english.vocab.m_picture_to_word", seed)
        w = by_word[q.meta["word"]]
        assert q.figure is not None and q.figure.kind == "objects"
        assert q.figure.data["emoji"] == w.emoji
        assert not any(c.image for c in q.choices)
        assert {c.text_en for c in q.choices if c.id == q.answer} == {w.word}

        q = gen(vocab_lib, "english.vocab.m_listen_to_picture", seed)
        w = by_word[q.meta["word"]]
        assert q.speak["en"] == w.word
        assert all(c.image and c.image.startswith("emoji:") for c in q.choices)
        answer = next(c for c in q.choices if c.id == q.answer)
        assert answer.image == f"emoji:{w.emoji}"
        assert w.word.lower() not in (q.prompt_en or "").lower()
        assert w.word.lower() not in q.prompt_he.lower()

        q = gen(vocab_lib, "english.vocab.m_spelling", seed)
        assert q.kind == "letters"
        assert q.answer == q.meta["word"]
        assert q.speak["en"] == q.meta["word"]
        assert len(q.choices) > len(q.answer)  # extra letters to choose
        assert check_answer(q, list(q.answer)).correct
        assert not check_answer(q, q.answer[::-1] + "x").correct

        q = gen(vocab_lib, "english.vocab.m_sentence_cloze", seed)
        assert "___" in q.prompt_en
        word = q.meta["word"]
        assert not re.search(
            rf"(?<![A-Za-z]){re.escape(word)}(?![A-Za-z])",
            q.prompt_en,
            re.IGNORECASE,
        )
        answer = next(c for c in q.choices if c.id == q.answer)
        assert answer.text_en == word

        q = gen(vocab_lib, "english.vocab.m_word_to_translation", seed)
        w = by_word[q.meta["word"]]
        answer = next(c for c in q.choices if c.id == q.answer)
        if q.meta["mode"] == "word_to_translation":
            assert answer.text_he == w.he
            assert q.speak["en"] == w.word
        else:
            assert answer.text_en == w.word
            assert w.he in q.prompt_he


@pytest.mark.parametrize("age", [5, 6, 7])
def test_i3_young_only_picture_modes(vocab_lib, age):
    for seed in range(60):
        q = gen(vocab_lib, "english.vocab.m_all", seed, age=age)
        assert q.meta["mode"] in PICTURE_MODES, q.meta
        assert_valid(q)


def test_i3_young_fallback_without_picture_modes(vocab_lib):
    q = gen(vocab_lib, "english.vocab.m_spelling", 1, age=6)
    assert q.meta["mode"] == "spelling"


def test_i3_older_get_all_modes(vocab_lib):
    modes = {
        gen(vocab_lib, "english.vocab.m_all", s, age=10).meta["mode"]
        for s in range(200)
    }
    assert modes >= set(ALL_MODES)


def test_i4_vocab_stable_ids(vocab_lib):
    seen: dict[str, tuple[str, str]] = {}
    for seed in range(300):
        q = gen(vocab_lib, "english.vocab.m_all", seed)
        assert ITEM_ID.match(q.item_id), q.item_id
        key = (q.meta["word"], q.meta["mode"])
        assert seen.setdefault(q.item_id, key) == key
        assert q.item_id.endswith("." + q.meta["mode"])
        again = gen(vocab_lib, "english.vocab.m_all", seed)
        assert again == q
    assert vocab_lib.skill("english.vocab.m_all").srs


def test_i6_hebrew_and_explanation(vocab_lib):
    by_word = words_by(vocab_lib, "word")
    singular = re.compile(r"\b(בחר|בחרי|הקשב|הקשיבי|סדר|סדרי|כתוב|כתבי)\b")
    for seed in range(120):
        q = gen(vocab_lib, "english.vocab.m_all", seed)
        w = by_word[q.meta["word"]]
        assert not singular.search(q.prompt_he), q.prompt_he
        assert len(q.prompt_he) <= 140
        assert len(q.explanation_he) <= 200
        assert w.word in q.explanation_he and w.he in q.explanation_he
        assert w.example_en in q.explanation_he or (
            w.example_en in (q.explanation_en or "")
        )


def test_vocab_skill_validation(tmp_path):
    write(tmp_path, "english/words.yaml", "[]\n")
    write(
        tmp_path,
        "skills/english.yaml",
        """
        subject: english
        skills:
          - id: english.vocab.bad
            grade: 1
            title_he: מילים
            title_en: Words
            prereq: []
            generator: english.vocab
            params: {topics: [nothing], level: A1, modes: [juggling]}
        """,
    )
    with pytest.raises(ContentError) as exc:
        ContentLibrary.load(tmp_path)
    errs = " ".join(exc.value.errors)
    assert "juggling" in errs and "nothing" in errs


# --------------------------------------------------------------------------
# I7: bank items with speak_en, emoji and English-only choices
# --------------------------------------------------------------------------

EN_SKILLS = """
subject: english
skills:
  - id: english.phonics.initial_sounds
    grade: 1
    title_he: הצליל הראשון
    title_en: Initial sounds
    prereq: []
    generator: bank
    params: {bank: english/phonics.yaml, tags: [initial_sounds]}
  - id: english.phonics.other
    grade: 1
    title_he: אחר
    title_en: Other
    prereq: []
    generator: bank
    params: {bank: english/phonics.yaml, tags: [other]}
"""

PHONICS = """
items:
  - id: eng.ph.initial_sounds.001
    skill: english.phonics.initial_sounds
    kind: choice
    grade: 1
    prompt_he: "באיזו אות מתחילה המילה?"
    prompt_en: "Which letter does the word start with?"
    emoji: "1f34e"
    speak_en: "apple"
    choices:
      - {en: "n"}
      - {en: "z"}
      - {en: "a"}
    answer: 2
    explanation_he: "apple מתחילה באות a."
    tags: [initial_sounds]
  - id: eng.ph.other.001
    skill: english.phonics.other
    kind: choice
    grade: 1
    prompt_he: "מה בתמונה?"
    choices:
      - {en: "cat", emoji: 1f408}
      - {en: "dog", emoji: 1f415}
    answer: 0
    explanation_he: "חתול הוא cat."
    tags: [other]
"""


def test_i7_speak_en_emoji_and_en_choices(tmp_path):
    write(tmp_path, "skills/english.yaml", EN_SKILLS)
    write(tmp_path, "english/phonics.yaml", PHONICS)
    lib = ContentLibrary.load(tmp_path)
    q = lib.generate("english.phonics.initial_sounds", random.Random(1))
    assert q.item_id == "eng.ph.initial_sounds.001"
    assert q.speak["en"] == "apple"
    assert q.speak["he"] == q.prompt_he
    assert q.figure is not None and q.figure.kind == "objects"
    assert q.figure.data == {"emoji": "1f34e", "count": 1}
    assert sorted(c.text_he for c in q.choices) == ["a", "n", "z"]
    assert check_answer(q, "a").correct
    other = lib.generate("english.phonics.other", random.Random(1))
    assert other.item_id == "eng.ph.other.001"  # tags pick by skill
    assert all(c.image for c in other.choices)


def test_i7_partial_choice_emoji_is_an_error(tmp_path):
    write(tmp_path, "skills/english.yaml", EN_SKILLS)
    write(
        tmp_path,
        "english/phonics.yaml",
        PHONICS.replace('{en: "dog", emoji: 1f415}', '{en: "dog"}'),
    )
    with pytest.raises(ContentError) as exc:
        ContentLibrary.load(tmp_path)
    assert any("emoji" in e for e in exc.value.errors), exc.value.errors


@pytest.mark.parametrize("bad", ["eng ph 1", "שלום.1", "a/b"])
def test_item_id_charset(tmp_path, bad):
    write(tmp_path, "skills/english.yaml", EN_SKILLS)
    write(
        tmp_path,
        "english/phonics.yaml",
        PHONICS.replace("id: eng.ph.other.001", f"id: '{bad}'"),
    )
    with pytest.raises(ContentError) as exc:
        ContentLibrary.load(tmp_path)
    assert any("id" in e for e in exc.value.errors)


def test_ai_style_ids_valid_in_main_bank(tmp_path):
    write(tmp_path, "skills/english.yaml", EN_SKILLS)
    write(
        tmp_path,
        "english/phonics.yaml",
        PHONICS.replace("id: eng.ph.other.001", "id: ai.1a2b3c4d"),
    )
    lib = ContentLibrary.load(tmp_path)
    assert lib.banks["english.phonics.other"][0].id == "ai.1a2b3c4d"


# --------------------------------------------------------------------------
# I8: reading passages
# --------------------------------------------------------------------------


def test_i8_reading_passages(library):
    for level in range(1, 7):
        sid = f"english.reading.level{level}"
        bank = library.banks[sid]
        assert len(bank) >= 12, sid
        for it in bank:
            assert it.skill == sid
            assert f"level{level}" in it.tags
        for seed in range(20):
            q = library.generate(sid, random.Random(seed))
            assert_valid(q)
            meta = q.meta
            assert q.item_id.startswith(meta["passage_id"] + ".q")
            assert meta["passage_en"] and meta["passage_he"]
            assert meta["passage_title"]
            assert meta["passage_en"] not in q.prompt_he
            assert len(q.prompt_he) <= 140


# --------------------------------------------------------------------------
# I9: monster facts
# --------------------------------------------------------------------------


def test_i9_element_facts(library):
    facts = library.element_facts
    assert {"fire", "water", "cosmic", "shadow"} <= set(facts)
    ids = set()
    for element, lst in facts.items():
        assert len(lst) >= 8, element
        for f in lst:
            assert set(f) == {"id", "he", "en"}
            assert f["he"] and f["en"] and not NIQQUD.search(f["he"])
            assert f["id"] not in ids
            ids.add(f["id"])
    assert library.element_titles["fire"]["he"]
    assert len(library.banks["science.elements.cards"]) >= 20


# --------------------------------------------------------------------------
# I10: AI-studio bank
# --------------------------------------------------------------------------

SCI_SKILLS = """
subject: science
skills:
  - id: science.living.basic
    grade: 1
    title_he: חי, צומח ודומם
    title_en: Living things
    prereq: []
    generator: bank
    params: {bank: science/living.yaml, tags: [living]}
"""

MATH_SKILLS = """
subject: math
skills:
  - id: math.add.a
    grade: 1
    title_he: חיבור
    title_en: Addition
    prereq: []
    generator: arithmetic.add
    params: {max_sum: 10}
"""

SCI_BANK = """
skill: science.living.basic
items:
  - id: sci.living.001
    kind: true_false
    grade: 1
    prompt_he: עץ הוא יצור חי.
    answer: true
    explanation_he: עץ גדל, ניזון ומתרבה.
    tags: [living]
"""

AI_SCIENCE = """
items:
  - id: ai.0a1b2c3d
    skill: science.living.basic
    kind: choice
    grade: 1
    difficulty: 0.0
    prompt_he: מה צריך צמח כדי לגדול?
    prompt_en: What does a plant need to grow?
    choices:
      - {he: מים ואור}
      - {he: חושך בלבד}
    answer: 0
    explanation_he: צמח צריך מים ואור כדי לייצר מזון.
    tags: [plants, ai]
  - id: ai.ffffffff
    skill: science.nope.unknown
    kind: true_false
    prompt_he: שאלה למיומנות שלא קיימת.
    answer: true
    explanation_he: הסבר.
  - id: ai.eeeeeeee
    skill: science.living.basic
    kind: choice
    prompt_he: פריט פגום
    choices: [{he: א}, {he: ב}]
    answer: 7
    explanation_he: הסבר.
  - id: sci.living.001
    skill: science.living.basic
    kind: true_false
    prompt_he: כפילות של פריט מהמאגר.
    answer: false
    explanation_he: הסבר.
"""

AI_MATH = """
items:
  - id: ai.12345678
    skill: math.add.a
    kind: choice
    grade: 1
    prompt_he: לדני 2 תפוחים ולנועה 3. כמה יחד?
    choices: [{he: '5'}, {he: '6'}, {he: '4'}]
    answer: 0
    explanation_he: 2 ועוד 3 הם 5.
"""


def ai_content(tmp_path):
    content = tmp_path / "content"
    write(content, "skills/science.yaml", SCI_SKILLS)
    write(content, "skills/math.yaml", MATH_SKILLS)
    write(content, "science/living.yaml", SCI_BANK)
    data = tmp_path / "data"
    write(data, "ai_bank/science.yaml", AI_SCIENCE)
    write(data, "ai_bank/math.yaml", AI_MATH)
    write(data, "ai_bank/english.yaml", "items: [unclosed\n")
    write(data, "ai_bank/provenance.yaml", "{ai.0a1b2c3d: {provider: x}}\n")
    return content, data


def test_i10_ai_bank_attaches_by_skill(tmp_path):
    content, data = ai_content(tmp_path)
    lib = ContentLibrary.load(content, extra_bank_dirs=[data])
    seen = {
        lib.generate("science.living.basic", random.Random(s)).item_id
        for s in range(40)
    }
    assert seen == {"sci.living.001", "ai.0a1b2c3d"}  # bypasses tags
    warn = " ".join(lib.warnings)
    assert "science.nope.unknown" in warn
    assert "ai.eeeeeeee" in warn
    assert "sci.living.001" in warn  # duplicate id
    assert "english.yaml" in warn  # broken YAML
    assert "provenance" not in warn


def test_i10_ai_items_mix_into_generator_skills(tmp_path):
    content, data = ai_content(tmp_path)
    lib = ContentLibrary.load(content, extra_bank_dirs=[data / "ai_bank"])
    sources = Counter()
    for s in range(300):
        q = lib.generate("math.add.a", random.Random(s))
        assert_valid(q)
        sources[q.item_id == "ai.12345678"] += 1
    assert 0 < sources[True] < 100


def test_i10_missing_extra_dir_is_fine(tmp_path):
    content, _ = ai_content(tmp_path)
    lib = ContentLibrary.load(content, extra_bank_dirs=[tmp_path / "nope"])
    assert lib.warnings == []


def test_i10_ai_reading_and_vocab(tmp_path):
    content = tmp_path / "content"
    write(
        content,
        "skills/english.yaml",
        """
        subject: english
        skills:
          - id: english.reading.level1
            grade: 3
            title_he: קריאה
            title_en: Reading
            prereq: []
            generator: bank
            params: {bank: english/reading.yaml, tags: [level1]}
          - id: english.vocab.a1_toys
            grade: 3
            title_he: צעצועים
            title_en: Toys
            prereq: []
            generator: english.vocab
            params: {topics: [toys], level: A1, modes: [word_to_translation]}
        """,
    )
    write(content, "english/reading.yaml", "[]\n")
    toys = [("ball", "כדור"), ("doll", "בובה"), ("kite", "עפיפון")]
    words = "".join(
        f"- {{word: {w}, he: {h}, pos: noun, topic: toys, level: A1, "
        f"grade: 3, emoji: null, example_en: 'A {w}.', "
        f"example_he: '{h}.'}}\n"
        for w, h in toys
    )
    write(content, "english/words.yaml", words)
    data = tmp_path / "data"
    write(
        data,
        "ai_bank/reading.yaml",
        """
        - id: ai.aaaaaaaa
          grade: 3
          level: A1
          skill: english.reading.level1
          tags: [level1]
          title: Tom
          text_en: Tom has a red kite.
          text_he: לתום יש עפיפון אדום.
          questions:
            - id: ai.aaaaaaaa.q1
              kind: choice
              prompt_he: מה יש לתום?
              prompt_en: What does Tom have?
              choices: [{en: a kite, he: עפיפון}, {en: a dog, he: כלב}]
              answer: 0
              explanation_he: 'כתוב: Tom has a red kite.'
        """,
    )
    write(
        data,
        "ai_bank/vocab.yaml",
        "- {word: robot, he: רובוט, pos: noun, topic: toys, level: A1, "
        "grade: 3, emoji: null, example_en: 'A robot.', "
        "example_he: 'רובוט.'}\n",
    )
    lib = ContentLibrary.load(content, extra_bank_dirs=[data])
    q = lib.generate("english.reading.level1", random.Random(0))
    assert q.item_id == "ai.aaaaaaaa.q1"
    assert q.meta["passage_en"] == "Tom has a red kite."
    words_seen = {
        lib.generate("english.vocab.a1_toys", random.Random(s)).meta["word"]
        for s in range(80)
    }
    assert "robot" in words_seen
    assert lib.words_he()["robot"] == "רובוט"


# --------------------------------------------------------------------------
# I11-I12: vocabulary tracking
# --------------------------------------------------------------------------


def test_i11_engine_records_vocab_words(library, clock):
    learner = LearnerState(learner_id="t", name="ת", grade=1, age=6)
    learner.settings["worked_examples"] = False
    eng = LearningEngine(
        library, learner, rng=random.Random(3), clock=clock
    )
    q = eng.next_question(
        skill_id="english.vocab.preA1_animals", context="practice"
    )
    word = q.meta["word"]
    wrong = next(c.id for c in q.choices if c.id != q.answer)
    eng.submit(q, wrong, elapsed_s=3.0, context="practice")
    assert word not in learner.words
    eng.submit(q, q.answer, elapsed_s=3.0, context="practice")
    assert learner.words[word] == clock.now


def test_i12_words_he(library):
    he = library.words_he()
    assert he["dog"] == "כלב"
    assert he["cat"] == "חתול"
    assert len(he) >= 850
    assert all(isinstance(v, str) and v for v in he.values())


# --------------------------------------------------------------------------
# I14: smoke test over the whole real library
# --------------------------------------------------------------------------


def test_i14_every_skill_generates_valid(library):
    problems = []
    for skill in library.skills.values():
        for seed in range(5):
            for age in (6, 10):
                ctx = GenContext(
                    skill.id, skill.subject, grade=skill.grade, age=age
                )
                try:
                    q = library.generate(skill.id, random.Random(seed), ctx)
                    assert q.skill_id == skill.id
                    assert_valid(q)
                except Exception as exc:  # collect them all
                    problems.append(f"{skill.id} seed={seed} age={age}: {exc}")
    assert not problems, "\n".join(problems[:20])
