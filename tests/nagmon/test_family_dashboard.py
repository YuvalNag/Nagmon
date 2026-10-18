import pytest

from nagmon.family.dashboard import WeekSummary, conversation_prompt


def test_mastered_skill_asks_child_to_teach():
    s = WeekSummary(
        mastered=("שטח של משולש",), practised=("שברים",), days_practised=3
    )
    out = conversation_prompt("נועה", s)
    assert "נועה" in out
    assert "שטח של משולש" in out
    assert "להסביר" in out


def test_struggle_is_gentle():
    s = WeekSummary(struggles=("כפל במספר דו־ספרתי",), days_practised=2)
    out = conversation_prompt("Noam", s)
    assert "כפל במספר דו־ספרתי" in out
    assert "Noam" in out
    for harsh in ("נכשל", "חלש", "גרוע"):
        assert harsh not in out


def test_practised_only():
    s = WeekSummary(practised=("מילים באנגלית",), days_practised=1)
    out = conversation_prompt("מאיה", s)
    assert "מילים באנגלית" in out


def test_quiet_week_has_no_guilt():
    out = conversation_prompt("מאיה", WeekSummary())
    assert "מאיה" in out
    assert "לא תרגל" not in out


def test_variant_rotates_but_is_deterministic():
    s = WeekSummary(mastered=("שברים",))
    a = conversation_prompt("נועה", s, variant=0)
    b = conversation_prompt("נועה", s, variant=1)
    assert a != b
    assert conversation_prompt("נועה", s, variant=0) == a


def test_from_dict():
    s = WeekSummary.from_dict(
        {
            "mastered": ["שברים"],
            "struggles": [],
            "practised": ["גאומטריה"],
            "days_practised": 4,
            "unknown": 1,
        }
    )
    assert s.mastered == ("שברים",)
    assert s.days_practised == 4


@pytest.mark.parametrize("name", ["", "   "])
def test_empty_name_rejected(name):
    with pytest.raises(ValueError):
        conversation_prompt(name, WeekSummary())
