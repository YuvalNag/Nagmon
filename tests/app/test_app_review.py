"""Text review: extract, hash, apply (tools/app/review.py, docs/app/TEXT_REVIEW.md)."""

from __future__ import annotations

import json
import unicodedata
from pathlib import Path

import pytest
import yaml

from tools.app import review
from tools.app.common import Output

NPC = """\
# the baker
id: nagmon_baker
name_he: אופיר האופה
role: baker
knows:
  topics:
    - {id: bread, label_he: "מה אופים היום?", icon: "1f35e", unlock: 0}
"""

LINES = """\
greet_first:
  - "שלום שלום! הריח של הלחם מגיע עד אליכם."   # first
  - 'בוקר, צהריים או ערב: תמיד יש משהו טרי'
  - שוב אתם
topic.bread:
  - {text: "היום אני אופה לחם חם.", when: {phase: [morning], friendship_min: 2}}
  - "היום אני אופה לחם חם."
"""

QUEST = """\
id: q_baker_double
giver: nagmon_baker
title: {he: כפול מתכון, en: Double the recipe}
board:
  goal: {he: "לעזור לאופיר", en: "Help Ofir"}
offer:
  at: nagmon_baker
  lines:
    - {he: "אני אופה הרבה היום. תעזרו לי?", en: "I am baking a lot."}
places:
  away: {he: רחוק, en: far}
steps:
  - kind: ask
    todo: {he: "לפתור את החידה", en: "Solve it"}
    say:
      - {he: "נכון! עכשיו העוגה תצא מושלמת.", en: "Right!"}
"""

MAIL = """\
senders:
  nagmon_owl: {name_he: הינשוף החכם, always: true}
letters:
  postcard_owl:
    from: nagmon_owl
    kind: postcard
    variants:
      - {text_he: "שלום {name}! הינשוף מצא משהו.", fact: owl_night}
  thanks_helped:
    from: nagmon_owl
    kind: event
    variants:
      - {text_he: "תודה {name}, עזרתם מאוד."}
"""

FACTS = """\
version: 1
facts:
  owl_night:
    subject: science
    emoji: "1f989"
    text_he: "ינשוף רואה היטב בלילה."
"""

I18N = """\
export const he = {
  // the parents
  parentsTitle: "אזור ההורים",
  quoted: "הוא אמר \\"שלום\\" והלך",
  item_berry_name: "פרי יער",
  hello: "שלום {name}!",
} as const;
"""


@pytest.fixture
def tree(tmp_path: Path) -> Path:
    nag = tmp_path / "mods" / "nagmon"
    for rel, text in {
        "npcs/nagmon_baker.yaml": NPC,
        "npcs/nagmon_baker.lines.he.yaml": LINES,
        "quests/q_baker_double.yaml": QUEST,
        "mail/letters.yaml": MAIL,
        "economy/facts.yaml": FACTS,
    }.items():
        path = nag / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    ts = tmp_path / "app" / "src" / "i18n.ts"
    ts.parent.mkdir(parents=True)
    ts.write_text(I18N, encoding="utf-8")
    return tmp_path


def by_id(items):
    return {i.id: i for i in items}


# ------------------------------------------------------------------ hash
def test_hash_is_16_hex_and_stable():
    h = review.text_hash("שלום")
    assert len(h) == 16 and int(h, 16) >= 0
    assert h == review.text_hash("שלום")
    assert h != review.text_hash("שלום!")


def test_hash_ignores_unicode_composition():
    composed = "é"
    decomposed = unicodedata.normalize("NFD", composed)
    assert composed != decomposed
    assert review.text_hash(composed) == review.text_hash(decomposed)


# --------------------------------------------------------------- extract
def test_extracts_every_type(tree):
    items = by_id(review.extract(tree))
    assert {i.type for i in items.values()} == {
        "quest",
        "npc",
        "mail",
        "fact",
        "ui",
    }
    assert items["npc:nagmon_baker:greet_first/0"].he.startswith("שלום שלום")
    assert items["npc:nagmon_baker:greet_first/2"].he == "שוב אתם"
    assert items["npc:nagmon_baker:topic.bread/0/text"].he == (
        "היום אני אופה לחם חם."
    )
    assert items[
        "mail:letters:letters/postcard_owl/variants/0/text_he"
    ].he == ("שלום {name}! הינשוף מצא משהו.")
    assert items["fact:facts:facts/owl_night/text_he"].he == (
        "ינשוף רואה היטב בלילה."
    )
    assert items["ui:i18n:parentsTitle"].he == "אזור ההורים"
    assert items["ui:i18n:quoted"].he == 'הוא אמר "שלום" והלך'


def test_every_item_has_the_fields_the_screen_needs(tree):
    for item in review.extract(tree):
        assert item.id and item.src and item.key and item.he and item.ctx
        assert item.hash == review.text_hash(item.he)
        assert (tree / item.src).is_file()


def test_ids_are_unique_and_stable_between_runs(tree):
    a = [i.id for i in review.extract(tree)]
    assert len(a) == len(set(a))
    assert a == [i.id for i in review.extract(tree)]


def test_quest_lines_have_english_and_who_says_it(tree):
    items = by_id(review.extract(tree))
    offer = items["quest:q_baker_double:offer/lines/0/he"]
    assert offer.en == "I am baking a lot."
    assert "אופיר האופה" in offer.ctx
    say = items["quest:q_baker_double:steps/0/say/0/he"]
    assert say.en == "Right!"
    assert "אופיר האופה" in say.ctx and say.ctx != offer.ctx
    assert items["quest:q_baker_double:title/he"].he == "כפול מתכון"


def test_names_and_places_are_not_review_items(tree):
    heb = {i.he for i in review.extract(tree)}
    assert "רחוק" not in heb
    assert "הינשוף החכם" not in heb
    assert "מה אופים היום?" not in heb
    assert "פרי יער" not in heb  # item_* keys belong to the economy


def test_npc_context_says_person_pool_and_condition(tree):
    items = by_id(review.extract(tree))
    first = items["npc:nagmon_baker:greet_first/0"]
    assert "אופיר האופה" in first.ctx
    topic = items["npc:nagmon_baker:topic.bread/0/text"]
    assert "מה אופים היום?" in topic.ctx
    assert "בוקר" in topic.ctx and "2" in topic.ctx


def test_mail_context_says_sender_and_kind(tree):
    items = by_id(review.extract(tree))
    post = items["mail:letters:letters/postcard_owl/variants/0/text_he"]
    event = items["mail:letters:letters/thanks_helped/variants/0/text_he"]
    assert "הינשוף החכם" in post.ctx and "הינשוף החכם" in event.ctx
    assert post.ctx != event.ctx


def test_ui_context_has_the_section_comment(tree):
    items = by_id(review.extract(tree))
    assert "the parents" in items["ui:i18n:parentsTitle"].ctx
    assert "parentsTitle" in items["ui:i18n:parentsTitle"].ctx


# ---------------------------------------------------------------- status
def test_no_status_file_means_everything_is_pending(tree):
    items = review.extract(tree)
    assert review.pending(items, review.load_status(tree)) == items


def test_approved_lines_are_not_pending_until_they_change(tree):
    items = review.extract(tree)
    one = items[0]
    review.write_status(tree, {one.id: one.hash})
    status = review.load_status(tree)
    assert one.id not in {i.id for i in review.pending(items, status)}
    # the same line, rewritten: back in the queue
    path = tree / one.src
    path.write_text(
        path.read_text(encoding="utf-8").replace(one.he, one.he + " עוד"),
        encoding="utf-8",
    )
    again = review.extract(tree)
    assert one.id in {i.id for i in review.pending(again, status)}


def test_status_file_is_sorted_quoted_and_loads_back(tree):
    review.write_status(
        tree, {"b:x": "1234567890123456", "a:y": "123456e789012345"}
    )
    path = tree / review.STATUS
    text = path.read_text(encoding="utf-8")
    assert text.index('"a:y"') < text.index('"b:x"')
    loaded = yaml.safe_load(text)
    assert (
        loaded["approved"]["a:y"] == "123456e789012345"
    )  # a string, not a float
    assert review.load_status(tree) == loaded["approved"]


# ----------------------------------------------------------------- build
def test_build_ships_only_pending_items_as_one_lazy_file(tree):
    items = review.extract(tree)
    review.write_status(tree, {items[0].id: items[0].hash})
    out = Output()
    summary = review.build(out, tree)
    assert list(out.data) == ["review.json"]
    data = json.loads(out.data["review.json"])
    assert data["version"] == 1
    assert [i["id"] for i in data["items"]] == [i.id for i in items[1:]]
    first = data["items"][0]
    assert set(first) >= {"id", "type", "src", "key", "he", "ctx", "hash"}
    assert summary["pending"] == len(items) - 1
    assert summary["total"] == len(items)


# ----------------------------------------------------------------- apply
def decision(item, action="approve", new=None):
    d = {"id": item.id, "action": action, "baseHash": item.hash}
    if new is not None:
        d["newText"] = new
    return d


def test_approve_records_status_and_changes_no_source(tree):
    item = by_id(review.extract(tree))["npc:nagmon_baker:greet_first/0"]
    before = (tree / item.src).read_text(encoding="utf-8")
    result = review.apply([decision(item)], tree)
    assert result.applied == [item.id] and not result.refused
    assert (tree / item.src).read_text(encoding="utf-8") == before
    assert review.load_status(tree) == {item.id: item.hash}


def test_edit_replaces_in_place_in_each_quoting_style(tree):
    items = by_id(review.extract(tree))
    double = items["npc:nagmon_baker:greet_first/0"]
    single = items["npc:nagmon_baker:greet_first/1"]
    plain = items["npc:nagmon_baker:greet_first/2"]
    result = review.apply(
        [
            decision(double, "edit", "שלום וברוכים הבאים!"),
            decision(single, "edit", "בוקר טוב, כאן תמיד טרי"),
            decision(plain, "edit", "שוב אתם כאן"),
        ],
        tree,
    )
    assert len(result.applied) == 3 and not result.refused
    text = (tree / double.src).read_text(encoding="utf-8")
    assert '  - "שלום וברוכים הבאים!"   # first\n' in text  # comment kept
    assert "  - 'בוקר טוב, כאן תמיד טרי'\n" in text
    assert "  - שוב אתם כאן\n" in text
    assert text.startswith('greet_first:\n  - "שלום וברוכים')
    assert "topic.bread:" in text
    new = by_id(review.extract(tree))
    assert new[double.id].he == "שלום וברוכים הבאים!"
    assert review.load_status(tree)[double.id] == review.text_hash(
        "שלום וברוכים הבאים!"
    )


def test_edit_touches_only_that_line_of_a_flow_mapping(tree):
    item = by_id(review.extract(tree))["quest:q_baker_double:offer/lines/0/he"]
    review.apply([decision(item, "edit", "תעזרו לי עם הבצק?")], tree)
    text = (tree / item.src).read_text(encoding="utf-8")
    assert '- {he: "תעזרו לי עם הבצק?", en: "I am baking a lot."}' in text
    original = QUEST.replace(
        "אני אופה הרבה היום. תעזרו לי?", "תעזרו לי עם הבצק?"
    )
    assert text == original


def test_edit_picks_the_right_one_of_two_equal_lines(tree):
    items = by_id(review.extract(tree))
    first = items["npc:nagmon_baker:topic.bread/0/text"]
    second = items["npc:nagmon_baker:topic.bread/1"]
    assert first.he == second.he
    review.apply([decision(second, "edit", "אני אופה לחם טרי.")], tree)
    new = by_id(review.extract(tree))
    assert new[second.id].he == "אני אופה לחם טרי."
    assert new[first.id].he == first.he


def test_edit_escapes_quotes_in_the_style_of_the_scalar(tree):
    items = by_id(review.extract(tree))
    double = items["npc:nagmon_baker:greet_first/0"]
    single = items["npc:nagmon_baker:greet_first/1"]
    review.apply(
        [
            decision(double, "edit", 'הוא אמר "שלום"'),
            decision(single, "edit", "זה לא 'ככה'"),
        ],
        tree,
    )
    new = by_id(review.extract(tree))
    assert new[double.id].he == 'הוא אמר "שלום"'
    assert new[single.id].he == "זה לא 'ככה'"


def test_edit_a_ui_string_in_the_ts_file(tree):
    items = by_id(review.extract(tree))
    quoted = items["ui:i18n:quoted"]
    title = items["ui:i18n:parentsTitle"]
    result = review.apply(
        [
            decision(title, "edit", "אזור ההורים שלנו"),
            decision(quoted, "edit", 'אמר "די" ועצר'),
        ],
        tree,
    )
    assert len(result.applied) == 2
    text = (tree / "app/src/i18n.ts").read_text(encoding="utf-8")
    assert '  parentsTitle: "אזור ההורים שלנו",\n' in text
    assert '  quoted: "אמר \\"די\\" ועצר",\n' in text
    assert '  item_berry_name: "פרי יער",\n' in text
    assert by_id(review.extract(tree))[quoted.id].he == 'אמר "די" ועצר'


def test_changed_line_is_refused(tree):
    item = by_id(review.extract(tree))["fact:facts:facts/owl_night/text_he"]
    stale = decision(item, "edit", "ינשוף רואה בלילה.")
    stale["baseHash"] = review.text_hash("something older")
    path = tree / item.src
    before = path.read_text(encoding="utf-8")
    result = review.apply([stale, decision(item)], tree)
    assert [r.id for r in result.refused] == [item.id]
    assert "hash" in result.refused[0].reason
    assert path.read_text(encoding="utf-8") == before
    # the good decision for the same id still went through
    assert result.applied == [item.id]


def test_unknown_id_and_bad_actions_are_refused(tree):
    item = review.extract(tree)[0]
    bad = [
        {"id": "nope:x:y", "action": "approve", "baseHash": "0" * 16},
        {**decision(item), "action": "delete"},
        decision(item, "edit", ""),
        decision(item, "edit", "שורה\nשתיים"),
        {"id": item.id, "action": "edit", "baseHash": item.hash},
    ]
    result = review.apply(bad, tree)
    assert len(result.refused) == 5 and not result.applied
    assert not (tree / review.STATUS).exists()


def test_edit_must_keep_the_placeholders(tree):
    item = by_id(review.extract(tree))[
        "mail:letters:letters/postcard_owl/variants/0/text_he"
    ]
    result = review.apply(
        [decision(item, "edit", "שלום! הינשוף מצא משהו.")], tree
    )
    assert result.refused and "{name}" in result.refused[0].reason
    ok = review.apply(
        [decision(item, "edit", "היי {name}! הינשוף מצא משהו.")], tree
    )
    assert ok.applied == [item.id]


def test_skip_changes_nothing(tree):
    item = review.extract(tree)[0]
    result = review.apply([decision(item, "skip")], tree)
    assert result.skipped == 1 and not result.applied and not result.refused
    assert not (tree / review.STATUS).exists()


def test_edit_to_the_same_text_is_an_approval(tree):
    item = by_id(review.extract(tree))["npc:nagmon_baker:greet_first/2"]
    before = (tree / item.src).read_text(encoding="utf-8")
    result = review.apply([decision(item, "edit", item.he)], tree)
    assert result.applied == [item.id]
    assert (tree / item.src).read_text(encoding="utf-8") == before


def test_dry_run_writes_nothing_and_shows_a_diff(tree):
    item = by_id(review.extract(tree))["npc:nagmon_baker:greet_first/2"]
    path = tree / item.src
    before = path.read_text(encoding="utf-8")
    result = review.apply(
        [decision(item, "edit", "שוב אתם כאן")], tree, dry_run=True
    )
    assert path.read_text(encoding="utf-8") == before
    assert not (tree / review.STATUS).exists()
    assert "-  - שוב אתם" in result.diff and "+  - שוב אתם כאן" in result.diff
    assert review.STATUS in result.diff


def test_block_scalars_are_refused(tree):
    path = tree / "mods/nagmon/economy/facts.yaml"
    path.write_text(
        FACTS.replace(
            'text_he: "ינשוף רואה היטב בלילה."',
            "text_he: |\n      ינשוף רואה היטב בלילה.",
        ),
        encoding="utf-8",
    )
    item = by_id(review.extract(tree))["fact:facts:facts/owl_night/text_he"]
    result = review.apply([decision(item, "edit", "ינשוף")], tree)
    assert result.refused and "block" in result.refused[0].reason


def test_decisions_file_formats(tree, tmp_path):
    item = review.extract(tree)[0]
    wrapped = tmp_path / "w.json"
    wrapped.write_text(
        json.dumps({"schema_version": 1, "decisions": [decision(item)]})
    )
    bare = tmp_path / "b.json"
    bare.write_text(json.dumps([decision(item)]))
    assert review.read_decisions(wrapped) == review.read_decisions(bare)
    bad = tmp_path / "x.json"
    bad.write_text("{}")
    with pytest.raises(ValueError):
        review.read_decisions(bad)


def test_cli_apply_dry_run_prints_diff(tree, tmp_path, capsys):
    item = by_id(review.extract(tree))["npc:nagmon_baker:greet_first/2"]
    f = tmp_path / "d.json"
    f.write_text(json.dumps([decision(item, "edit", "שוב אתם כאן")]))
    code = review.main(["apply", str(f), "--dry-run", "--root", str(tree)])
    assert code == 0
    assert "+  - שוב אתם כאן" in capsys.readouterr().out
    assert not (tree / review.STATUS).exists()


# ------------------------------------------------------ the real sources
def test_the_real_sources_extract_cleanly():
    items = review.extract()
    types = {i.type for i in items}
    assert types == {"quest", "npc", "mail", "fact", "ui"}
    assert len(items) > 1000
    assert len({i.id for i in items}) == len(items)
    for item in items:
        assert "\n" not in item.he and item.he.strip() == item.he, item.id
