import pytest

from experiments.boundary_comparison import match_boundaries, overlap_scores, reference_intervals


def row(start, end, label, conflict=False):
    return {
        "start": start,
        "end": end,
        "normalized": {"extended": label},
        "conflict": conflict,
        "parse_errors": {},
    }


def test_reference_mask_preserves_gaps_and_filters_redundant_precise_boundaries():
    rows = [
        row(0, 1, "C:(3,5)"),
        row(1, 1.1, "C:(b3,5)"),
        row(1.1, 2, "C:(b3,5)"),
        row(2.2, 3, "D:(3,5)"),
    ]
    result = reference_intervals(rows, [1.0, 1.1])
    assert result["boundaries"] == [1.0]
    assert result["short_adjacent"] == [True]
    assert result["redundant_boundary_count"] == 1
    expected = [
        (0.1, 1),
        (1, 1.1),
        (1.1, 1.9),
        (2.3, 2.9),
    ]
    for actual, wanted in zip(result["intervals"], expected, strict=True):
        assert [actual["start"], actual["end"]] == pytest.approx(wanted)
    with pytest.raises(ValueError, match="Precise prepared"):
        reference_intervals(rows, [0.999, 1.1])


def test_exact_overlap_retains_submillisecond_intervals_and_counts_unknown_as_wrong():
    refs = [
        {"start": 0.0001, "end": 0.0003, "target": [0, 1, 0, 0, 0, 0, 0, 0]},
        {"start": 0.0003, "end": 0.0004, "target": [2, 1, 0, 2, 0, 0, 0, 0]},
    ]
    predictions = [
        {"start": 0, "end": 0.0002, "target": refs[0]["target"]},
        {"start": 0.0002, "end": 1, "target": [-1] * 8},
    ]
    result = overlap_scores(refs, predictions)
    assert result["scored_seconds"] == pytest.approx(0.0003)
    assert result["root_correct_seconds"] == pytest.approx(0.0001)
    assert result["reduced_correct_seconds"] == pytest.approx(0.0001)


def test_chronological_matching_is_one_to_one_and_empty_metrics_are_undefined():
    result = match_boundaries([1.0, 1.03], [1.015], [True, False], 0.05, 10)
    assert result["true_positives"] == 1
    assert result["false_negatives"] == 1
    assert result["missed_short_adjacent"] == 0
    assert match_boundaries([], [], [], 0.05, 10)["f1"] is None
    assert match_boundaries([1], [], [True], 0.05, 10)["precision"] is None


def test_unknown_edge_neighborhood_masks_across_a_short_valid_neighbor():
    result = reference_intervals([row(0, 1, "C:(3,5)"), row(1, 1.05, "D:(3,5)")], [1.0])
    assert result["boundaries"] == []
    assert result["excluded_unknown_margin_boundaries"] == 1
    assert len(result["intervals"]) == 1
    assert result["intervals"][0]["end"] == pytest.approx(0.95)
