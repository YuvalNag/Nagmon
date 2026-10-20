from nagmon.family.values import DEFAULT_EMPHASIS, FamilyValues


def test_defaults_all_on():
    v = FamilyValues()
    assert v.kindness_quests is True
    assert v.gentle_battle_wording is True
    assert v.modesty_filter is True
    assert v.emphasis == list(DEFAULT_EMPHASIS)


def test_round_trip():
    v = FamilyValues(
        kindness_quests=False, modesty_filter=True, emphasis=["honesty"]
    )
    assert FamilyValues.from_dict(v.to_dict()) == v


def test_from_partial_dict_uses_defaults_and_keeps_unknown():
    v = FamilyValues.from_dict({"gentle_battle_wording": False, "new": 1})
    assert v.gentle_battle_wording is False
    assert v.kindness_quests is True
    assert v.to_dict()["new"] == 1


def test_unknown_emphasis_values_are_dropped():
    v = FamilyValues.from_dict({"emphasis": ["honesty", "bogus"]})
    assert v.emphasis == ["honesty"]


def test_bad_types_fall_back_to_defaults():
    v = FamilyValues.from_dict({"modesty_filter": "no", "emphasis": 3})
    assert v.modesty_filter is True
    assert v.emphasis == list(DEFAULT_EMPHASIS)
