from pathlib import Path

import pytest

from harmonia_ml.data.guitarset import parse_track_identity
from harmonia_ml.data.splits import assert_no_group_leakage, progression_family_split


def test_track_identity_groups_all_players_and_versions_of_a_composition() -> None:
    first = parse_track_identity(Path("00_BN1-129-Eb_comp.jams"))
    related = parse_track_identity(Path("05_BN1-129-Eb_solo.jams"))

    assert first.composition_id == "BN1-129-Eb"
    assert related.composition_id == first.composition_id
    assert first.performer_id == "00"
    assert related.performer_id == "05"


def test_track_identity_accepts_publisher_long_style_names() -> None:
    identity = parse_track_identity(Path("00_Funk1-114-Ab_comp.jams"))

    assert identity.style == "Funk"
    assert identity.progression_family == 1


def test_progression_family_split_is_group_disjoint() -> None:
    names = [
        Path(f"{player}_{style}{family}-120-C_{version}.jams")
        for player in ("00", "01")
        for style in ("BN", "RO")
        for family in (1, 2, 3)
        for version in ("comp", "solo")
    ]

    split = progression_family_split(names, train_family=1, validation_family=2, test_family=3)

    assert {parse_track_identity(path).progression_family for path in split["train"]} == {1}
    assert {parse_track_identity(path).progression_family for path in split["validation"]} == {2}
    assert {parse_track_identity(path).progression_family for path in split["test"]} == {3}
    assert_no_group_leakage(split)


def test_leakage_check_rejects_same_composition_across_splits() -> None:
    split = {
        "train": [Path("00_BN1-129-Eb_comp.jams")],
        "validation": [Path("05_BN1-129-Eb_solo.jams")],
        "test": [],
    }

    with pytest.raises(ValueError, match="BN1-129-Eb"):
        assert_no_group_leakage(split)
